import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import {
  BASE_FOV,
  CAMERA_MODES,
  CROUCH_SPEED,
  EAT_DURATION_SEC,
  EXHAUSTION_THRESHOLD,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
  GRAVITY,
  HURT_INVULN_TICKS,
  JUMP_COOLDOWN_SEC,
  JUMP_VELOCITY,
  MAX_AIR_TICKS,
  MAX_FOOD,
  MAX_HEALTH,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_CROUCH_HEIGHT,
  PLAYER_EYE_HEIGHT,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SWIM_EYE_HEIGHT,
  PLAYER_SWIM_HEIGHT,
  SPRINT_FOV_BOOST,
  SPRINT_SPEED,
  SWIM_SPEED,
  SWIM_SPRINT_SPEED,
  TERMINAL_VELOCITY,
  WALK_SPEED,
  WORLD_HEIGHT,
  DEFAULT_SATURATION,
} from '../constants.js';
import { collidesWithWorld, moveAABB } from '../physics/AABBPhysics.js';
import { FluidSimulator } from '../world/FluidSimulator.js';

export class PlayerController {
  constructor(camera, world, playerModel, firstPersonHand, options = {}) {
    this.camera = camera;
    this.world = world;
    this.playerModel = playerModel;
    this.firstPersonHand = firstPersonHand;

    this.x = options.x ?? 0.5;
    this.y = options.y ?? 70;
    this.z = options.z ?? 0.5;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.yaw = options.yaw ?? 0;
    this.pitch = options.pitch ?? -0.12;

    this.cameraMode = options.cameraMode ?? CAMERA_MODES.FIRST_PERSON;
    this.creativeMode = options.creativeMode !== undefined ? Boolean(options.creativeMode) : Boolean(options.flyMode);
    this.flyMode = this.creativeMode ? Boolean(options.flyMode) : false;

    // Stage 6 Survival Vitals
    this.maxHealth = MAX_HEALTH;
    this.health = options.health ?? MAX_HEALTH;
    this.absorption = options.absorption ?? 0;
    this.foodLevel = options.foodLevel ?? MAX_FOOD;
    this.saturation = options.saturation ?? DEFAULT_SATURATION;
    this.exhaustion = options.exhaustion ?? 0;
    this.airTicks = options.airTicks ?? MAX_AIR_TICKS;
    this.score = options.score ?? 0;

    this.hurtTimer = 0; // seconds of invulnerability frames (0.5s)
    this.hurtTilt = 0;  // camera roll tilt on hit
    this.hungerDebuffTimer = 0;
    this.goldenRegenTimer = 0;
    this.goldenRegenStep = 0;
    this.regenFoodTimer = 0;
    this.regenFastTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
    this.inWallTimer = 0;
    this.cactusTimer = 0;
    this.voidTimer = 0;
    this.lavaTimer = 0;
    this.fireTimer = 0;
    this.fireTicks = options.fireTicks ?? 0;
    this.fallDistance = 0;
    this.isDead = this.health <= 0 && !this.creativeMode;
    this.deathTilt = 0;
    this.inWallSuffocating = false;
    this.inWater = false;
    this.headInWater = false;
    this.inLava = false;
    this.headInLava = false;
    this.lastDamageSource = options.lastDamageSource || null;

    // Eating progress state (1.6s hold)
    this.eatActive = false;
    this.eatElapsed = 0;
    this.eatDuration = EAT_DURATION_SEC;
    this.eatItemId = 0;

    this.onGround = false;
    this.isCrouching = false;
    this.isSprinting = false;
    this.isSwimming = false;
    this.sprintToggled = false;
    this.jumpCooldown = 0;
    this.currentFov = BASE_FOV;
    this.currentEyeHeight = PLAYER_EYE_HEIGHT;

    this.walkPhase = 0;
    this.moveBlend = 0;
    this.time = 0;

    // Input state
    this.keys = new Set();
    this.pointerLocked = false;
    this.isPaused = false;
    this.mouseSensitivity = options.sensitivity ?? 0.0022;
    this.lastSpaceTime = 0;
    this.lastWDownTime = 0;
    this.wTapReleased = false;
    this.primaryHeld = false;
    this.secondaryHeld = false;

    // External mobile input bridge (updated by MobileControls)
    this.touchInput = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      crouch: false,
      sprint: false,
      breakHeld: false,
      useHeld: false,
    };

    // Action & HUD callbacks
    this.onPlaceAction = options.onPlaceAction || null;
    this.onPickBlock = options.onPickBlock || null;
    this.onCameraModeChange = options.onCameraModeChange || null;
    this.onToggleDebug = options.onToggleDebug || null;
    this.onTogglePause = options.onTogglePause || null;
    this.onFlyModeChange = options.onFlyModeChange || null;
    this.getArmorPoints = options.getArmorPoints || null;
    this.onArmorDamage = options.onArmorDamage || null;
    this.onDamage = options.onDamage || null;
    this.onDeath = options.onDeath || null;
    this.onEatComplete = options.onEatComplete || null;
    this.onVitalsChange = options.onVitalsChange || null;

    this._lookVec = new THREE.Vector3();
    this._eyeOrigin = new THREE.Vector3();

    this._bindEvents();
    this._syncVisibility();
  }

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.onToggleDebug?.();
        return;
      }
      if (e.code === 'F5') {
        e.preventDefault();
        this.cycleCameraMode();
        return;
      }
      if (e.code === 'Escape') {
        if (!this.pointerLocked && this.onTogglePause) {
          this.onTogglePause();
        }
        return;
      }
      if (this.isPaused) return;

      if (e.code === 'KeyF' && !e.repeat) {
        this.toggleFlyMode();
      }
      if (e.code === 'Space' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpaceTime < 300) {
          this.toggleFlyMode();
          this.lastSpaceTime = 0;
        } else {
          this.lastSpaceTime = now;
        }
      }
      if (e.code === 'KeyW' && !e.repeat) {
        const now = performance.now();
        if (this.wTapReleased && now - this.lastWDownTime < 340) {
          this.sprintToggled = true;
          this.wTapReleased = false;
        }
        this.lastWDownTime = now;
      }
      this.keys.add(e.code);
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW') {
        this.sprintToggled = false;
        if (performance.now() - this.lastWDownTime < 340) {
          this.wTapReleased = true;
        } else {
          this.wTapReleased = false;
        }
      }
    };

    this._onMouseMove = (e) => {
      if (!this.pointerLocked || this.isPaused) return;
      this.applyLookDelta(e.movementX, e.movementY, this.mouseSensitivity);
    };

    this._onMouseDown = (e) => {
      if (this.isPaused || !this.pointerLocked || this.isDead) return;
      if (e.button === 0) {
        this.primaryHeld = true;
        this.firstPersonHand.triggerSwing();
      } else if (e.button === 1) {
        e.preventDefault();
        this.onPickBlock?.();
      } else if (e.button === 2) {
        this.secondaryHeld = true;
        this.triggerPlaceAction();
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) {
        this.primaryHeld = false;
      } else if (e.button === 2) {
        this.secondaryHeld = false;
        this.stopEating();
      }
    };

    this._onBlur = () => {
      this.keys.clear();
      this.primaryHeld = false;
      this.secondaryHeld = false;
      this.sprintToggled = false;
      this.stopEating();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('blur', this._onBlur);
  }

  applyLookDelta(dx, dy, sensitivity = this.mouseSensitivity) {
    const dYaw = -dx * sensitivity;
    const dPitch = -dy * sensitivity;
    this.yaw += dYaw;
    const maxPitch = Math.PI * 0.495;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch + dPitch));
    this.firstPersonHand.addLookInertia(dYaw, dPitch);
  }

  isMiningHeld() {
    return !this.isDead && ((this.primaryHeld && this.pointerLocked && !this.isPaused) || (this.touchInput.breakHeld && !this.isPaused));
  }

  isSecondaryHeld() {
    return !this.isDead && ((this.secondaryHeld && this.pointerLocked && !this.isPaused) || (this.touchInput.useHeld && !this.isPaused));
  }

  triggerPlaceAction() {
    if (this.isPaused || this.isDead) return false;
    const placed = this.onPlaceAction?.();
    if (placed) {
      this.firstPersonHand.triggerSwing();
    }
    return Boolean(placed);
  }

  getEyeOrigin() {
    this._eyeOrigin.set(this.x, this.y + this.currentEyeHeight, this.z);
    return this._eyeOrigin;
  }

  getLookDirection() {
    const cosP = Math.cos(this.pitch);
    this._lookVec.set(
      -Math.sin(this.yaw) * cosP,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosP
    );
    return this._lookVec;
  }

  getCurrentHitboxHeight() {
    if (this.isSwimming) return PLAYER_SWIM_HEIGHT;
    if (this.isCrouching) return PLAYER_CROUCH_HEIGHT;
    return PLAYER_HEIGHT;
  }

  cycleCameraMode() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    this._syncVisibility();
    this.onCameraModeChange?.(this.cameraMode);
    return this.cameraMode;
  }

  setCameraMode(mode) {
    this.cameraMode = ((mode % 3) + 3) % 3;
    this._syncVisibility();
    this.onCameraModeChange?.(this.cameraMode);
  }

  toggleFlyMode() {
    if (!this.creativeMode) {
      this.flyMode = false;
      return false;
    }
    this.flyMode = !this.flyMode;
    this.vy = 0;
    if (this.flyMode) {
      this.isSwimming = false;
      this.fallDistance = 0;
    }
    this.onFlyModeChange?.(this.flyMode);
    return this.flyMode;
  }

  setCreativeMode(enabled) {
    this.creativeMode = Boolean(enabled);
    if (!this.creativeMode && this.flyMode) {
      this.flyMode = false;
      this.vy = 0;
      this.onFlyModeChange?.(false);
    }
    this.fallDistance = 0;
    this.inWallSuffocating = false;
    this.stopEating();
    this.onVitalsChange?.();
  }

  addExhaustion(amount) {
    if (this.creativeMode || this.isDead || amount <= 0) return;
    this.exhaustion += amount;
    while (this.exhaustion >= EXHAUSTION_THRESHOLD) {
      this.exhaustion -= EXHAUSTION_THRESHOLD;
      if (this.saturation > 0) {
        this.saturation = Math.max(0, this.saturation - 1.0);
      } else if (this.foodLevel > 0) {
        this.foodLevel = Math.max(0, this.foodLevel - 1);
      }
    }
  }

  heal(amount) {
    if (this.isDead || amount <= 0) return false;
    const prev = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (this.health !== prev) {
      this.onVitalsChange?.();
      return true;
    }
    return false;
  }

  canEatFood(foodStats) {
    if (!foodStats || this.isDead) return false;
    if (this.creativeMode) return true;
    return Boolean(foodStats.canAlwaysEat) || this.foodLevel < MAX_FOOD;
  }

  canEat(foodStats) {
    return this.canEatFood(foodStats);
  }

  startEating(itemId) {
    if (this.isDead || this.isPaused) return false;
    this.eatActive = true;
    this.eatItemId = itemId;
    this.firstPersonHand.setEatingActive(true);
    return true;
  }

  stopEating() {
    if (!this.eatActive && this.eatElapsed === 0) return;
    this.eatActive = false;
    this.eatElapsed = 0;
    this.eatItemId = 0;
    this.firstPersonHand.setEatingActive(false);
  }

  getEatProgress() {
    return this.eatActive ? Math.min(1, this.eatElapsed / this.eatDuration) : 0;
  }

  applyFood(foodStats) {
    return this.applyFoodEffects(foodStats);
  }

  applyFoodEffects(foodStats) {
    if (!foodStats) return;
    this.foodLevel = Math.min(MAX_FOOD, this.foodLevel + (foodStats.hunger || 0));
    this.saturation = Math.min(this.foodLevel, this.saturation + (foodStats.saturation || 0));
    if (foodStats.absorption > 0) {
      this.absorption = Math.max(this.absorption, foodStats.absorption);
    }
    if (foodStats.regenTicks > 0) {
      this.goldenRegenTimer = Math.max(this.goldenRegenTimer, foodStats.regenTicks / 20);
    }
    if (foodStats.hungerDebuffChance && Math.random() < foodStats.hungerDebuffChance) {
      this.hungerDebuffTimer = Math.max(this.hungerDebuffTimer, (foodStats.hungerDebuffTicks || 600) / 20);
    }
    this.onVitalsChange?.();
  }

  damage(amount, sourceType = 'generic') {
    if (this.creativeMode || this.isDead || amount <= 0) return false;
    if (sourceType !== 'void' && sourceType !== 'starve' && this.hurtTimer > 0) {
      return false;
    }

    // Armor mitigates physical/contact hits (up to 80% at 20 points), bypassing fall/drown/inWall/starve/void
    const armorBypass = sourceType === 'fall' || sourceType === 'drown' || sourceType === 'inWall' || sourceType === 'starve' || sourceType === 'void';
    let finalDmg = amount;
    if (!armorBypass && this.getArmorPoints) {
      const armorPts = Math.max(0, Math.min(20, this.getArmorPoints()));
      if (armorPts > 0) {
        const eff = Math.min(20, Math.max(armorPts / 5, armorPts - amount / 2));
        finalDmg = amount * (1 - eff / 25);
        this.onArmorDamage?.(1);
      }
    }

    if (finalDmg <= 0) return false;

    // Absorption gold hearts absorb damage first
    let remaining = finalDmg;
    if (this.absorption > 0) {
      const absorbed = Math.min(this.absorption, remaining);
      this.absorption -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      this.health = Math.max(0, this.health - remaining);
    }

    this.hurtTimer = HURT_INVULN_TICKS / 20; // 0.5s i-frames
    this.hurtTilt = (Math.random() < 0.5 ? -1 : 1) * 0.14; // ~8 deg roll kick
    this.lastDamageSource = sourceType;
    this.playerModel.triggerHurtFlash(0.4);
    this.addExhaustion(0.1);
    this.onDamage?.({ amount, finalDmg, sourceType, health: this.health });
    this.onVitalsChange?.();

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.stopEating();
      this.primaryHeld = false;
      this.touchInput.breakHeld = false;
      this.keys.clear();
      this.onDeath?.(sourceType);
    }
    return true;
  }

  respawn(spawnPose) {
    this.isDead = false;
    this.deathTilt = 0;
    this.health = this.maxHealth;
    this.absorption = 0;
    this.foodLevel = MAX_FOOD;
    this.saturation = DEFAULT_SATURATION;
    this.exhaustion = 0;
    this.airTicks = MAX_AIR_TICKS;
    this.hurtTimer = 0;
    this.hurtTilt = 0;
    this.hungerDebuffTimer = 0;
    this.goldenRegenTimer = 0;
    this.regenFoodTimer = 0;
    this.regenFastTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
    this.inWallTimer = 0;
    this.cactusTimer = 0;
    this.voidTimer = 0;
    this.lavaTimer = 0;
    this.fireTimer = 0;
    this.fireTicks = 0;
    this.fallDistance = 0;
    this.inWallSuffocating = false;
    this.inWater = false;
    this.headInWater = false;
    this.inLava = false;
    this.headInLava = false;
    this.lastDamageSource = null;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.stopEating();
    if (spawnPose) {
      this.x = spawnPose.x;
      this.y = spawnPose.y;
      this.z = spawnPose.z;
    }
    this.onVitalsChange?.();
  }

  respawnAt(x, y, z) {
    this.respawn({ x, y, z });
  }

  getSurvivalState() {
    return {
      health: this.health,
      absorption: this.absorption,
      foodLevel: this.foodLevel,
      saturation: this.saturation,
      exhaustion: this.exhaustion,
      airTicks: this.airTicks,
      score: this.score,
      hungerDebuffTimer: this.hungerDebuffTimer,
      fireTicks: this.fireTicks,
    };
  }

  setSurvivalState(s) {
    if (!s) return;
    if (Number.isFinite(s.health)) this.health = Math.max(0, Math.min(this.maxHealth, s.health));
    if (Number.isFinite(s.absorption)) this.absorption = Math.max(0, s.absorption);
    if (Number.isFinite(s.foodLevel)) this.foodLevel = Math.max(0, Math.min(MAX_FOOD, s.foodLevel));
    if (Number.isFinite(s.saturation)) this.saturation = Math.max(0, Math.min(MAX_FOOD, s.saturation));
    if (Number.isFinite(s.exhaustion)) this.exhaustion = Math.max(0, s.exhaustion);
    if (Number.isFinite(s.airTicks)) this.airTicks = Math.max(0, Math.min(MAX_AIR_TICKS, s.airTicks));
    if (Number.isFinite(s.score)) this.score = Math.max(0, s.score | 0);
    if (Number.isFinite(s.hungerDebuffTimer)) this.hungerDebuffTimer = Math.max(0, s.hungerDebuffTimer);
    if (Number.isFinite(s.fireTicks)) this.fireTicks = Math.max(0, s.fireTicks);
    this.isDead = this.health <= 0 && !this.creativeMode;
    this.onVitalsChange?.();
  }

  _syncVisibility() {
    this.playerModel.setVisible(this.cameraMode !== CAMERA_MODES.FIRST_PERSON);
  }

  setPaused(paused) {
    this.isPaused = paused;
    if (paused) {
      this.keys.clear();
      this.primaryHeld = false;
      this.secondaryHeld = false;
      this.touchInput.breakHeld = false;
      this.touchInput.useHeld = false;
      this.sprintToggled = false;
      this.stopEating();
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    }
  }

  getPose() {
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      cameraMode: this.cameraMode,
      flyMode: this.flyMode,
    };
  }

  setPose(pose) {
    if (!pose) return;
    if (Number.isFinite(pose.x)) this.x = pose.x;
    if (Number.isFinite(pose.y)) this.y = pose.y;
    if (Number.isFinite(pose.z)) this.z = pose.z;
    if (Number.isFinite(pose.yaw)) this.yaw = pose.yaw;
    if (Number.isFinite(pose.pitch)) this.pitch = pose.pitch;
    if (Number.isFinite(pose.cameraMode)) this.setCameraMode(pose.cameraMode);
    if (typeof pose.flyMode === 'boolean') this.flyMode = pose.flyMode;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
  }

  getFacingCardinal() {
    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);
    if (Math.abs(dirZ) >= Math.abs(dirX)) {
      return dirZ < 0 ? 'N (-Z)' : 'S (+Z)';
    }
    return dirX > 0 ? 'E (+X)' : 'W (-X)';
  }

  update(dt) {
    this.time += dt;
    if (this.isPaused) return;

    if (this.isDead) {
      this.deathTilt += (-1.45 - this.deathTilt) * Math.min(1, dt * 10);
      this.firstPersonHand.setEatingActive(false);
      this.firstPersonHand.update(dt, this.walkPhase, 0, false);
      this.playerModel.updatePose({
        x: this.x,
        y: this.y,
        z: this.z,
        yaw: this.yaw,
        pitch: this.pitch,
        walkPhase: this.walkPhase,
        moveBlend: 0,
        swingProgress: 0,
        isCrouching: false,
        isSwimming: false,
        isDead: true,
        time: this.time,
      });
      this._updateCamera();
      return;
    }

    if (this.hurtTimer > 0) this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    if (Math.abs(this.hurtTilt) > 0.001) {
      this.hurtTilt *= Math.exp(-10 * dt);
    } else {
      this.hurtTilt = 0;
    }

    // Eating progress tick
    if (this.eatActive) {
      this.eatElapsed += dt;
      if (this.eatElapsed >= this.eatDuration) {
        const finishedId = this.eatItemId;
        this.stopEating();
        this.onEatComplete?.(finishedId);
      }
    }

    const prevX = this.x;
    const prevY = this.y;
    const prevZ = this.z;
    const wasOnGround = this.onGround;

    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

    forward += this.touchInput.moveZ;
    strafe += this.touchInput.moveX;

    const len = Math.hypot(forward, strafe);
    if (len > 1) {
      forward /= len;
      strafe /= len;
    }

    const wantJump = this.keys.has('Space') || this.touchInput.jump;
    const wantCrouch = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchInput.crouch;
    const rawSprint =
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight') ||
      this.sprintToggled ||
      this.touchInput.sprint;
    const wantSprint = (this.creativeMode || this.foodLevel > 6) && !this.eatActive && rawSprint;

    // Water, Lava & Ladder submersion probe
    const feetBlock = this.world.getBlock(this.x, this.y + 0.12, this.z);
    const waistBlock = this.world.getBlock(this.x, this.y + 0.56, this.z);
    const headBlock = this.world.getBlock(this.x, this.y + 1.38, this.z);
    const feetInWater = feetBlock === BLOCK_IDS.WATER;
    const waistInWater = waistBlock === BLOCK_IDS.WATER;
    const headInWater = headBlock === BLOCK_IDS.WATER;
    const inWater = feetInWater || waistInWater || headInWater;
    const inLava = feetBlock === BLOCK_IDS.LAVA || waistBlock === BLOCK_IDS.LAVA || headBlock === BLOCK_IDS.LAVA;
    this.inWater = inWater;
    this.inLava = inLava;
    const onLadder = BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 0.15, this.z))
      || BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 1.0, this.z));

    // 1-block-tall swim mode activates when sprinting forward in water or crawling under a 1-block overhang in water!
    const ceilingBlocksStand = !this.flyMode && this.isSwimming
      ? collidesWithWorld(this.world, this.x, this.y, this.z, PLAYER_HALF_WIDTH, PLAYER_HEIGHT)
      : false;

    let nextSwim = false;
    if (!this.flyMode && !onLadder && !inLava) {
      if (inWater && wantSprint && forward > 0.25 && (waistInWater || headInWater || this.isSwimming)) {
        nextSwim = true;
      } else if (this.isSwimming && ceilingBlocksStand) {
        nextSwim = true;
      }
    }
    this.isSwimming = nextSwim;

    // Crouch ceiling check: cannot uncrouch if standing height (1.8) collides overhead
    let nextCrouch = !this.flyMode && !this.isSwimming && wantCrouch;
    if (!nextCrouch && !this.isSwimming && this.isCrouching && !this.flyMode) {
      if (collidesWithWorld(this.world, this.x, this.y, this.z, PLAYER_HALF_WIDTH, PLAYER_HEIGHT)) {
        nextCrouch = true;
      }
    }
    this.isCrouching = nextCrouch;

    if (forward <= 0.25 || this.isCrouching || inLava) {
      this.isSprinting = false;
    } else if (wantSprint) {
      this.isSprinting = true;
    } else {
      this.isSprinting = false;
    }

    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const moveDirX = -sinY * forward + cosY * strafe;
    const moveDirZ = -cosY * forward - sinY * strafe;

    let speed = WALK_SPEED;
    if (this.flyMode) {
      speed = this.isSprinting ? FLY_SPRINT_SPEED : FLY_SPEED;
    } else if (inLava) {
      speed = CROUCH_SPEED * 1.15;
    } else if (this.eatActive) {
      speed = CROUCH_SPEED;
    } else if (this.isSwimming) {
      speed = this.isSprinting ? SWIM_SPRINT_SPEED : SWIM_SPEED;
    } else if (inWater) {
      speed = this.isSprinting ? SWIM_SPEED * 1.1 : SWIM_SPEED * 0.85;
    } else if (this.isCrouching) {
      speed = CROUCH_SPEED;
    } else if (this.isSprinting) {
      speed = SPRINT_SPEED;
    }

    // Check ice slipperiness below feet
    const belowBlockId = this.onGround ? this.world.getBlock(this.x, this.y - 0.12, this.z) : 0;
    const belowDef = BlockRegistry.get(belowBlockId);
    const isOnIce = !this.flyMode && this.onGround && belowDef.slipperiness > 0;

    const activeHeight = this.getCurrentHitboxHeight();
    if (this.jumpCooldown > 0) this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);

    // Fluid current drift force (water pushes noticeably; lava pushes sluggishly)
    let flowVx = 0;
    let flowVz = 0;
    if (!this.flyMode && (inWater || inLava)) {
      const fId = inWater ? BLOCK_IDS.WATER : BLOCK_IDS.LAVA;
      const flow = FluidSimulator.getFlowVector(this.world, this.x, this.y + 0.2, this.z, fId);
      const strength = inWater ? 1.55 : 0.45;
      flowVx = flow.x * strength;
      flowVz = flow.z * strength;
    }

    // Smooth horizontal velocity (instant grip on normal ground, icy inertia on Ice, gentle drift in fluid)
    const targetVx = moveDirX * speed + flowVx;
    const targetVz = moveDirZ * speed + flowVz;
    if (isOnIce) {
      const iceGrip = Math.min(1, dt * 3.6);
      this.vx += (targetVx - this.vx) * iceGrip;
      this.vz += (targetVz - this.vz) * iceGrip;
    } else if (inLava && !this.flyMode) {
      const lavaGrip = Math.min(1, dt * 6.0);
      this.vx += (targetVx - this.vx) * lavaGrip;
      this.vz += (targetVz - this.vz) * lavaGrip;
    } else if (inWater && !this.flyMode) {
      const waterGrip = Math.min(1, dt * 9.5);
      this.vx += (targetVx - this.vx) * waterGrip;
      this.vz += (targetVz - this.vz) * waterGrip;
    } else {
      this.vx = targetVx;
      this.vz = targetVz;
    }

    const substeps = Math.max(1, Math.ceil(dt / 0.016));
    const subDt = dt / substeps;
    let anyWallHit = false;
    let jumpedThisFrame = false;

    for (let s = 0; s < substeps; s++) {
      if (this.flyMode) {
        let vert = 0;
        if (wantJump) vert += 1;
        if (wantCrouch) vert -= 1;

        const res = moveAABB(
          this.world,
          this,
          this.vx * subDt,
          vert * speed * subDt,
          this.vz * subDt,
          PLAYER_HALF_WIDTH,
          PLAYER_HEIGHT,
          false
        );
        this.x = res.x;
        this.y = Math.max(1.0, Math.min(WORLD_HEIGHT + 32, res.y));
        this.z = res.z;
        this.onGround = false;
        this.vy = 0;
        if (res.hitWall) anyWallHit = true;
      } else {
        const subFeet = this.world.getBlock(this.x, this.y + 0.1, this.z);
        const subWaist = this.world.getBlock(this.x, this.y + 0.56, this.z);
        const subHead = this.world.getBlock(this.x, this.y + 1.25, this.z);
        const subFeetWater = subFeet === BLOCK_IDS.WATER;
        const subWaistWater = subWaist === BLOCK_IDS.WATER;
        const subHeadWater = subHead === BLOCK_IDS.WATER;
        const subInWater = subFeetWater || subWaistWater || subHeadWater;
        const subInLava = subFeet === BLOCK_IDS.LAVA || subWaist === BLOCK_IDS.LAVA || subHead === BLOCK_IDS.LAVA;
        const subOnLadder = BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 0.15, this.z))
          || BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 1.0, this.z));
        let dy;

        if (subOnLadder && !subInWater && !subInLava) {
          if (wantJump || (forward > 0.25 && this.pitch > 0.25)) {
            this.vy = 3.4;
          } else if (wantCrouch) {
            this.vy = 0;
          } else if (forward > 0.25 && this.pitch < -0.35) {
            this.vy = -3.2;
          } else {
            this.vy = -2.2;
          }
          dy = this.vy * subDt;
        } else if (subInLava) {
          // Thick lava buoyancy: slow vertical motion & heavy drag
          if (wantJump) {
            this.vy = Math.min(1.85, Math.max(this.vy + 9.0 * subDt, 1.35));
          } else {
            this.vy = Math.max(-1.6, this.vy - GRAVITY * 0.12 * subDt);
          }
          dy = this.vy * subDt;
        } else if (subInWater) {
          // Smooth, natural Minecraft-style swimming & gentle buoyancy (no sky-rocketing!)
          if (wantJump) {
            const nearShoreWall = len > 0.05 && collidesWithWorld(
              this.world,
              this.x + moveDirX * 0.42,
              this.y + 0.22,
              this.z + moveDirZ * 0.42,
              PLAYER_HALF_WIDTH,
              0.85
            );
            if (!subHeadWater && nearShoreWall) {
              // Controlled hop onto 1-block bank when pushing against shore
              this.vy = Math.max(this.vy, 6.8);
            } else if (!subHeadWater && subWaistWater) {
              // Gentle surface float bob without flying above water
              this.vy = Math.min(1.45, Math.max(this.vy + 10.0 * subDt, 0.35));
            } else if (!subHeadWater && !subWaistWater) {
              // Shallow ankle-deep puddle: normal modest water hop
              this.vy = Math.max(this.vy, 5.8);
            } else {
              // Submerged: smooth steady upward swim toward surface
              this.vy = Math.min(2.6, Math.max(this.vy + 14.0 * subDt, 1.9));
            }
          } else if (wantCrouch) {
            this.vy = Math.max(-3.0, this.vy - 15.0 * subDt);
          } else if (this.isSwimming && forward > 0.25) {
            const aboveEyeWater = this.world.getBlock(this.x, this.y + 0.85, this.z) === BLOCK_IDS.WATER;
            let swimVertTarget = Math.sin(this.pitch) * speed * 0.72;
            if (!aboveEyeWater && swimVertTarget > 0) {
              swimVertTarget = Math.min(swimVertTarget, 0.4);
            }
            this.vy += (swimVertTarget - this.vy) * Math.min(1, subDt * 7.5);
          } else {
            // Very gentle sinking when idle in deep water
            this.vy = Math.max(-1.35, this.vy - GRAVITY * 0.08 * subDt);
          }
          dy = this.vy * subDt;
        } else {
          let prevVy = this.vy;
          if (this.onGround && wantJump && this.jumpCooldown <= 0) {
            prevVy = JUMP_VELOCITY;
            this.onGround = false;
            this.jumpCooldown = JUMP_COOLDOWN_SEC;
            jumpedThisFrame = true;
          }
          this.vy = Math.max(-TERMINAL_VELOCITY, prevVy - GRAVITY * subDt);
          dy = 0.5 * (prevVy + this.vy) * subDt;
        }

        const res = moveAABB(
          this.world,
          this,
          this.vx * subDt,
          dy,
          this.vz * subDt,
          PLAYER_HALF_WIDTH,
          activeHeight,
          this.isCrouching && !subInWater && !subInLava
        );

        this.x = res.x;
        this.y = res.y;
        this.z = res.z;
        this.onGround = res.onGround;
        if (res.onGround && this.vy < 0) this.vy = 0;
        if (res.hitCeiling && this.vy > 0) this.vy = 0;
        if (res.hitWall) anyWallHit = true;
      }
    }

    if (anyWallHit && !this.flyMode && !inWater) {
      this.isSprinting = false;
      this.sprintToggled = false;
    }

    // --- Stage 6 & 7 Survival Physics, Exhaustion, Fluids, Fire & Hazards ---
    const eyeBlockId = this.world.getBlock(this.x, this.y + this.currentEyeHeight, this.z);
    this.headInWater = eyeBlockId === BLOCK_IDS.WATER;
    this.headInLava = eyeBlockId === BLOCK_IDS.LAVA;
    this.inWallSuffocating = !this.creativeMode && !this.flyMode && BlockRegistry.isOpaque(eyeBlockId);

    if (inWater) {
      this.fireTicks = 0;
    }

    if (!this.creativeMode) {
      // 1. Distance & jump exhaustion
      const horizMoved = Math.hypot(this.x - prevX, this.z - prevZ);
      if (inWater && horizMoved > 0.001) {
        this.addExhaustion(horizMoved * 0.015);
      } else if (this.isSprinting && horizMoved > 0.001) {
        this.addExhaustion(horizMoved * 0.1);
      }
      if (jumpedThisFrame) {
        this.addExhaustion(this.isSprinting ? 0.2 : 0.05);
      }

      // 2. Fall distance tracking & landing damage (exact Minecraft floor(fallDistance - 3.0))
      if (this.flyMode || inWater || onLadder) {
        this.fallDistance = 0;
      } else {
        if (inLava) {
          this.fallDistance *= Math.max(0, 1 - dt * 10);
        }
        const dyMoved = this.y - prevY;
        if (!this.onGround && dyMoved < 0) {
          this.fallDistance += -dyMoved;
        }
        if (this.onGround && !wasOnGround) {
          if (this.fallDistance > 3.0) {
            const standId = this.world.getBlock(this.x, this.y - 0.15, this.z);
            const standDef = BlockRegistry.get(standId);
            let fallDmg = 0;
            if (standDef.isBed) {
              fallDmg = Math.floor((this.fallDistance - 3.0 + 1e-4) * 0.5);
              this.vy = Math.max(this.vy, 4.2);
              this.onGround = false;
            } else if (standId === BLOCK_IDS.HAY_BALE) {
              fallDmg = Math.floor((this.fallDistance - 3.0 + 1e-4) * 0.2);
            } else {
              fallDmg = Math.floor(this.fallDistance - 3.0 + 1e-4);
            }
            if (fallDmg > 0) this.damage(fallDmg, 'fall');
          }
          this.fallDistance = 0;
        } else if (this.onGround) {
          this.fallDistance = 0;
        }
      }

      // 3. Oxygen / Drowning
      if (this.headInWater) {
        this.airTicks = Math.max(0, this.airTicks - dt * 20);
        if (this.airTicks <= 0) {
          this.drownTimer += dt;
          if (this.drownTimer >= 1.0) {
            this.drownTimer -= 1.0;
            this.damage(2, 'drown');
          }
        }
      } else {
        this.airTicks = Math.min(MAX_AIR_TICKS, this.airTicks + dt * 100);
        this.drownTimer = 0;
      }

      // 3.5 Lava contact damage (4 HP / 0.5s) & burning (160 ticks = 8s; 1 HP / 1.0s)
      if (inLava) {
        this.fireTicks = Math.max(this.fireTicks, 160);
        this.lavaTimer += dt;
        if (this.lavaTimer >= 0.5) {
          this.lavaTimer = 0;
          this.damage(4, 'lava');
        }
      } else {
        this.lavaTimer = 0.5;
        if (this.fireTicks > 0) {
          this.fireTicks = Math.max(0, this.fireTicks - dt * 20);
          this.fireTimer += dt;
          if (this.fireTimer >= 1.0) {
            this.fireTimer = 0;
            this.damage(1, 'fire');
          }
        } else {
          this.fireTimer = 0;
        }
      }

      // 4. Cactus contact damage
      if (this._touchesBlockId(BLOCK_IDS.CACTUS, 0.06)) {
        this.cactusTimer += dt;
        if (this.cactusTimer >= 0.5) {
          this.cactusTimer = 0;
          this.damage(1, 'cactus');
        }
      } else {
        this.cactusTimer = 0.5;
      }

      // 5. Wall / Falling Sand suffocation
      if (this.inWallSuffocating) {
        this.inWallTimer += dt;
        if (this.inWallTimer >= 0.5) {
          this.inWallTimer = 0;
          this.damage(1, 'inWall');
        }
      } else {
        this.inWallTimer = 0.5;
      }

      // 6. Void damage (Y < -10)
      if (this.y < -10) {
        this.voidTimer += dt;
        if (this.voidTimer >= 0.5) {
          this.voidTimer = 0;
          this.damage(4, 'void');
        }
      } else {
        this.voidTimer = 0.5;
      }

      // 7. Hunger debuff, Regeneration & Starvation
      if (this.hungerDebuffTimer > 0) {
        this.hungerDebuffTimer = Math.max(0, this.hungerDebuffTimer - dt);
        this.addExhaustion(0.5 * dt);
      }
      if (this.goldenRegenTimer > 0) {
        this.goldenRegenTimer = Math.max(0, this.goldenRegenTimer - dt);
        this.goldenRegenStep += dt;
        if (this.goldenRegenStep >= 0.5) {
          this.goldenRegenStep -= 0.5;
          this.heal(1);
        }
      }

      if (!this.isDead && this.health < this.maxHealth) {
        if (this.foodLevel >= MAX_FOOD && this.saturation > 0) {
          this.regenFastTimer += dt;
          if (this.regenFastTimer >= 0.5) {
            this.regenFastTimer = 0;
            if (this.heal(1)) this.addExhaustion(6.0);
          }
        } else if (this.foodLevel >= 18) {
          this.regenFoodTimer += dt;
          if (this.regenFoodTimer >= 4.0) {
            this.regenFoodTimer = 0;
            if (this.heal(1)) this.addExhaustion(6.0);
          }
        } else {
          this.regenFoodTimer = 0;
          this.regenFastTimer = 0;
        }
      } else {
        this.regenFoodTimer = 0;
        this.regenFastTimer = 0;
      }

      if (!this.isDead && this.foodLevel <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4.0) {
          this.starveTimer = 0;
          this.damage(1, 'starve');
        }
      } else {
        this.starveTimer = 0;
      }
    } else {
      this.airTicks = MAX_AIR_TICKS;
      this.fallDistance = 0;
      this.fireTicks = 0;
    }

    // Smooth camera eye-height transition
    const targetEye = this.isSwimming
      ? PLAYER_SWIM_EYE_HEIGHT
      : this.isCrouching
        ? PLAYER_CROUCH_EYE_HEIGHT
        : PLAYER_EYE_HEIGHT;
    this.currentEyeHeight += (targetEye - this.currentEyeHeight) * Math.min(1, dt * 16);

    // Smooth sprint FOV boost (+10 deg)
    const targetFov = this.isSprinting ? BASE_FOV + SPRINT_FOV_BOOST : BASE_FOV;
    if (Math.abs(this.currentFov - targetFov) > 0.05) {
      this.currentFov += (targetFov - this.currentFov) * Math.min(1, dt * 10);
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    } else if (this.currentFov !== targetFov) {
      this.currentFov = targetFov;
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
    }

    // Walk animation phase
    const horizontalSpeed = Math.hypot(this.vx, this.vz);
    const isMoving = len > 0.05;
    const targetBlend = isMoving && (this.onGround || this.flyMode || inWater) ? Math.min(1, len) : 0;
    this.moveBlend += (targetBlend - this.moveBlend) * Math.min(1, dt * 12);
    if (isMoving) {
      this.walkPhase += dt * (4.2 + horizontalSpeed * 1.15);
    }

    this.firstPersonHand.update(dt, this.walkPhase, this.moveBlend, this.isCrouching);
    this.playerModel.updatePose({
      x: this.x,
      y: this.y,
      z: this.z,
      yaw: this.yaw,
      pitch: this.pitch,
      walkPhase: this.walkPhase,
      moveBlend: this.moveBlend,
      swingProgress: this.firstPersonHand.getSwingProgress(),
      isCrouching: this.isCrouching,
      isSwimming: this.isSwimming,
      time: this.time,
    });

    this._updateCamera();
  }

  _updateCamera() {
    const eyeX = this.x;
    const eyeY = this.y + this.currentEyeHeight;
    const eyeZ = this.z;

    if (this.cameraMode === CAMERA_MODES.FIRST_PERSON) {
      this.camera.position.set(eyeX, eyeY, eyeZ);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = this.hurtTilt + this.deathTilt;
      return;
    }

    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    const lookX = -sinY * cosP;
    const lookY = sinP;
    const lookZ = -cosY * cosP;

    const sign = this.cameraMode === CAMERA_MODES.THIRD_PERSON_BACK ? -1 : 1;
    const maxDist = 3.8;
    let dist = maxDist;

    for (let step = 0.35; step <= maxDist; step += 0.2) {
      const cx = eyeX + lookX * sign * step;
      const cy = eyeY + lookY * sign * step;
      const cz = eyeZ + lookZ * sign * step;
      const b = this.world.getBlock(cx, cy, cz);
      if (b !== 0 && !BlockRegistry.isFluid(b)) {
        dist = Math.max(0.5, step - 0.25);
        break;
      }
    }

    const camX = eyeX + lookX * sign * dist;
    const camY = eyeY + lookY * sign * dist;
    const camZ = eyeZ + lookZ * sign * dist;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(eyeX, eyeY - 0.08, eyeZ);
  }

  _touchesBlockId(targetId, pad = 0.06) {
    const h = this.getCurrentHitboxHeight();
    const minX = Math.floor(this.x - PLAYER_HALF_WIDTH - pad);
    const maxX = Math.floor(this.x + PLAYER_HALF_WIDTH + pad);
    const minY = Math.floor(this.y + 0.02);
    const maxY = Math.floor(this.y + h - 0.02);
    const minZ = Math.floor(this.z - PLAYER_HALF_WIDTH - pad);
    const maxZ = Math.floor(this.z + PLAYER_HALF_WIDTH + pad);
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          if (this.world.getBlock(bx, by, bz) === targetId) {
            return true;
          }
        }
      }
    }
    return false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
