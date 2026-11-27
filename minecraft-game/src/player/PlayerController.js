import * as THREE from '../../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import {
  BASE_FOV,
  CAMERA_MODES,
  CROUCH_SPEED,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
  GRAVITY,
  JUMP_COOLDOWN_SEC,
  JUMP_VELOCITY,
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
} from '../constants.js';
import { collidesWithWorld, moveAABB } from '../physics/AABBPhysics.js';

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
    this.flyMode = Boolean(options.flyMode);

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

    // External mobile input bridge (updated by MobileControls)
    this.touchInput = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      crouch: false,
      sprint: false,
      breakHeld: false,
    };

    // Action & HUD callbacks
    this.onPlaceAction = options.onPlaceAction || null;
    this.onPickBlock = options.onPickBlock || null;
    this.onCameraModeChange = options.onCameraModeChange || null;
    this.onToggleDebug = options.onToggleDebug || null;
    this.onTogglePause = options.onTogglePause || null;
    this.onFlyModeChange = options.onFlyModeChange || null;

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
      if (this.isPaused || !this.pointerLocked) return;
      if (e.button === 0) {
        this.primaryHeld = true;
        this.firstPersonHand.triggerSwing();
      } else if (e.button === 1) {
        e.preventDefault();
        this.onPickBlock?.();
      } else if (e.button === 2) {
        this.triggerPlaceAction();
      }
    };

    this._onMouseUp = (e) => {
      if (e.button === 0) {
        this.primaryHeld = false;
      }
    };

    this._onBlur = () => {
      this.keys.clear();
      this.primaryHeld = false;
      this.sprintToggled = false;
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
    return (this.primaryHeld && this.pointerLocked && !this.isPaused) || (this.touchInput.breakHeld && !this.isPaused);
  }

  triggerPlaceAction() {
    if (this.isPaused) return false;
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
    this.flyMode = !this.flyMode;
    this.vy = 0;
    if (this.flyMode) this.isSwimming = false;
    this.onFlyModeChange?.(this.flyMode);
    return this.flyMode;
  }

  _syncVisibility() {
    this.playerModel.setVisible(this.cameraMode !== CAMERA_MODES.FIRST_PERSON);
  }

  setPaused(paused) {
    this.isPaused = paused;
    if (paused) {
      this.keys.clear();
      this.primaryHeld = false;
      this.touchInput.breakHeld = false;
      this.sprintToggled = false;
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
    const wantSprint =
      this.keys.has('ControlLeft') ||
      this.keys.has('ControlRight') ||
      this.sprintToggled ||
      this.touchInput.sprint;

    // Water & ladder submersion probe
    const feetInWater = this.world.getBlock(this.x, this.y + 0.12, this.z) === BLOCK_IDS.WATER;
    const waistInWater = this.world.getBlock(this.x, this.y + 0.56, this.z) === BLOCK_IDS.WATER;
    const headInWater = this.world.getBlock(this.x, this.y + 1.38, this.z) === BLOCK_IDS.WATER;
    const inWater = feetInWater || waistInWater || headInWater;
    const onLadder = BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 0.15, this.z))
      || BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 1.0, this.z));

    // 1-block-tall swim mode activates when sprinting forward in water or crawling under a 1-block overhang in water!
    const ceilingBlocksStand = !this.flyMode && this.isSwimming
      ? collidesWithWorld(this.world, this.x, this.y, this.z, PLAYER_HALF_WIDTH, PLAYER_HEIGHT)
      : false;

    let nextSwim = false;
    if (!this.flyMode && !onLadder) {
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

    if (forward <= 0.25 || this.isCrouching) {
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

    // Smooth horizontal velocity (instant grip on normal ground, icy inertia on Ice, gentle drift in water)
    const targetVx = moveDirX * speed;
    const targetVz = moveDirZ * speed;
    if (isOnIce) {
      const iceGrip = Math.min(1, dt * 3.6);
      this.vx += (targetVx - this.vx) * iceGrip;
      this.vz += (targetVz - this.vz) * iceGrip;
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
        const subFeetWater = this.world.getBlock(this.x, this.y + 0.1, this.z) === BLOCK_IDS.WATER;
        const subWaistWater = this.world.getBlock(this.x, this.y + 0.56, this.z) === BLOCK_IDS.WATER;
        const subHeadWater = this.world.getBlock(this.x, this.y + 1.25, this.z) === BLOCK_IDS.WATER;
        const subInWater = subFeetWater || subWaistWater || subHeadWater;
        const subOnLadder = BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 0.15, this.z))
          || BlockRegistry.isClimbable(this.world.getBlock(this.x, this.y + 1.0, this.z));
        let dy;

        if (subOnLadder && !subInWater) {
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
          this.isCrouching && !subInWater
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
      this.camera.rotation.z = 0;
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
      if (b !== 0 && b !== BLOCK_IDS.WATER) {
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

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
