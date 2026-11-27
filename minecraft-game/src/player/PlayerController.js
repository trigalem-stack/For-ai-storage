import * as THREE from '../../vendor/three.module.min.js';
import {
  CAMERA_MODES,
  CROUCH_SPEED,
  FLY_SPEED,
  FLY_SPRINT_SPEED,
  GRAVITY,
  JUMP_VELOCITY,
  PLAYER_CROUCH_EYE_HEIGHT,
  PLAYER_EYE_HEIGHT,
  SEA_LEVEL,
  SPRINT_SPEED,
  WALK_SPEED,
  WORLD_HEIGHT,
} from '../constants.js';

export class PlayerController {
  constructor(camera, world, playerModel, firstPersonHand, options = {}) {
    this.camera = camera;
    this.world = world;
    this.playerModel = playerModel;
    this.firstPersonHand = firstPersonHand;

    this.x = options.x ?? 0.5;
    this.y = options.y ?? 70;
    this.z = options.z ?? 0.5;
    this.vy = 0;
    this.yaw = options.yaw ?? 0;
    this.pitch = options.pitch ?? -0.12;

    this.cameraMode = options.cameraMode ?? CAMERA_MODES.FIRST_PERSON;
    this.flyMode = Boolean(options.flyMode);

    this.onGround = true;
    this.isCrouching = false;
    this.isSprinting = false;
    this.walkPhase = 0;
    this.moveBlend = 0;
    this.time = 0;

    // Input state
    this.keys = new Set();
    this.pointerLocked = false;
    this.isPaused = false;
    this.mouseSensitivity = 0.0022;
    this.lastSpaceTime = 0;

    // External mobile input bridge (updated by MobileControls)
    this.touchInput = {
      moveX: 0,
      moveZ: 0,
      jump: false,
      crouch: false,
      sprint: false,
    };

    // Action hooks for Stage 2+ mining / block placement
    this.onPrimaryAction = options.onPrimaryAction || null;
    this.onCameraModeChange = options.onCameraModeChange || null;
    this.onToggleDebug = options.onToggleDebug || null;
    this.onTogglePause = options.onTogglePause || null;
    this.onFlyModeChange = options.onFlyModeChange || null;

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
        if (now - this.lastSpaceTime < 280) {
          this.toggleFlyMode();
          this.lastSpaceTime = 0;
        } else {
          this.lastSpaceTime = now;
        }
      }
      this.keys.add(e.code);
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this._onMouseMove = (e) => {
      if (!this.pointerLocked || this.isPaused) return;
      this.applyLookDelta(e.movementX, e.movementY, this.mouseSensitivity);
    };

    this._onMouseDown = (e) => {
      if (this.isPaused) return;
      if (e.button === 0 && this.pointerLocked) {
        this.triggerPrimaryAction();
      }
    };

    this._onBlur = () => {
      this.keys.clear();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
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

  triggerPrimaryAction() {
    this.firstPersonHand.triggerSwing();
    this.onPrimaryAction?.();
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
    this.vy = 0;
  }

  getFacingCardinal() {
    // yaw=0 looks along -Z (North)
    const dirX = -Math.sin(this.yaw);
    const dirZ = -Math.cos(this.yaw);
    if (Math.abs(dirZ) >= Math.abs(dirX)) {
      return dirZ < 0 ? 'North (-Z)' : 'South (+Z)';
    }
    return dirX > 0 ? 'East (+X)' : 'West (-X)';
  }

  update(dt) {
    this.time += dt;
    if (this.isPaused) return;

    // Combine keyboard & touch inputs
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
    const wantSprint = this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.touchInput.sprint;

    this.isCrouching = !this.flyMode && wantCrouch;
    this.isSprinting = wantSprint && forward > 0.25 && !this.isCrouching;

    // Horizontal direction vectors on XZ plane (yaw=0 -> forward=(0, -1), right=(1, 0))
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const moveDirX = -sinY * forward + cosY * strafe;
    const moveDirZ = -cosY * forward - sinY * strafe;

    let speed = WALK_SPEED;
    if (this.flyMode) {
      speed = this.isSprinting ? FLY_SPRINT_SPEED : FLY_SPEED;
    } else if (this.isCrouching) {
      speed = CROUCH_SPEED;
    } else if (this.isSprinting) {
      speed = SPRINT_SPEED;
    }

    const nextX = this.x + moveDirX * speed * dt;
    const nextZ = this.z + moveDirZ * speed * dt;

    if (this.flyMode) {
      this.x = nextX;
      this.z = nextZ;
      let vert = 0;
      if (wantJump) vert += 1;
      if (wantCrouch) vert -= 1;
      this.y = Math.max(1.5, Math.min(WORLD_HEIGHT + 24, this.y + vert * speed * dt));
      this.onGround = false;
    } else {
      // Stage 1 smooth ground-following & step-up (Stage 2 upgrades to full 3D AABB collision)
      const curSurface = this.world.getSurfaceHeightAt(this.x, this.z);
      const targetSurfaceX = this.world.getSurfaceHeightAt(nextX, this.z);
      if (targetSurfaceX <= this.y + 1.25 || targetSurfaceX <= curSurface + 1.1) {
        this.x = nextX;
      }

      const targetSurfaceZ = this.world.getSurfaceHeightAt(this.x, nextZ);
      if (targetSurfaceZ <= this.y + 1.25 || targetSurfaceZ <= curSurface + 1.1) {
        this.z = nextZ;
      }

      const groundY = this.world.getSurfaceHeightAt(this.x, this.z);
      const inWater = this.y < SEA_LEVEL + 0.35 && this.world.getBlock(this.x, this.y + 0.3, this.z) === 12;

      if (inWater) {
        if (wantJump) {
          this.vy = 4.2;
        } else {
          this.vy = Math.max(-2.6, this.vy - GRAVITY * 0.25 * dt);
        }
      } else {
        if (this.onGround && wantJump) {
          this.vy = JUMP_VELOCITY;
          this.onGround = false;
        } else {
          this.vy -= GRAVITY * dt;
        }
      }

      this.y += this.vy * dt;

      if (this.y <= groundY) {
        // Smooth step-up when climbing 1-block slope
        this.y = groundY;
        this.vy = 0;
        this.onGround = true;
      } else if (this.y - groundY < 0.08 && this.vy <= 0) {
        this.y = groundY;
        this.vy = 0;
        this.onGround = true;
      } else {
        this.onGround = false;
      }
    }

    // Update animation phase
    const horizontalSpeed = Math.hypot(moveDirX, moveDirZ) * speed;
    const isMoving = len > 0.05;
    const targetBlend = isMoving && (this.onGround || this.flyMode) ? Math.min(1, len) : 0;
    this.moveBlend += (targetBlend - this.moveBlend) * Math.min(1, dt * 12);
    if (isMoving) {
      this.walkPhase += dt * (4.2 + horizontalSpeed * 1.15);
    }

    // Update 1st-person hand & 3rd-person Steve model
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
      time: this.time,
    });

    this._updateCamera();
  }

  _updateCamera() {
    const eyeH = this.isCrouching ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT;
    const eyeX = this.x;
    const eyeY = this.y + eyeH;
    const eyeZ = this.z;

    if (this.cameraMode === CAMERA_MODES.FIRST_PERSON) {
      this.camera.position.set(eyeX, eyeY, eyeZ);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;
      return;
    }

    // Third-person camera orbit vector
    const cosP = Math.cos(this.pitch);
    const sinP = Math.sin(this.pitch);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    // Forward look vector of player
    const lookX = -sinY * cosP;
    const lookY = sinP;
    const lookZ = -cosY * cosP;

    const sign = this.cameraMode === CAMERA_MODES.THIRD_PERSON_BACK ? -1 : 1;
    const maxDist = 3.8;
    let dist = maxDist;

    // Simple ray step to avoid camera going inside terrain blocks
    for (let step = 0.4; step <= maxDist; step += 0.25) {
      const cx = eyeX + lookX * sign * step;
      const cy = eyeY + lookY * sign * step;
      const cz = eyeZ + lookZ * sign * step;
      const b = this.world.getBlock(cx, cy, cz);
      if (b !== 0 && b !== 12) {
        dist = Math.max(0.6, step - 0.3);
        break;
      }
    }

    const camX = eyeX + lookX * sign * dist;
    const camY = Math.max(this.world.getSurfaceHeightAt(eyeX + lookX * sign * dist, eyeZ + lookZ * sign * dist) + 0.35, eyeY + lookY * sign * dist);
    const camZ = eyeZ + lookZ * sign * dist;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(eyeX, eyeY - 0.1, eyeZ);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('blur', this._onBlur);
  }
}
