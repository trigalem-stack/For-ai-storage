import * as THREE from '../../vendor/three.module.min.js';
import { createRightArmGeometry } from './PlayerSkin.js';

/**
 * Dedicated first-person right-arm overlay rendered in a depth-cleared pass
 * so the player's arm never clips into nearby blocks/walls.
 * Includes view bobbing, camera-inertia sway, swing animation, and held-item mount hook.
 */
export class FirstPersonHand {
  constructor(skinTexture) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 10);

    // Match sunlit Minecraft look inside overlay scene
    const ambient = new THREE.AmbientLight(0xffffff, 0.72);
    const dir = new THREE.DirectionalLight(0xfff8eb, 0.78);
    dir.position.set(1.2, 2.0, 1.4);
    this.scene.add(ambient, dir);

    this.material = new THREE.MeshLambertMaterial({
      map: skinTexture,
      side: THREE.FrontSide,
    });

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    // Classic Steve right arm geometry scaled ergonomically for first-person viewport
    const armGeom = createRightArmGeometry();
    this.armMesh = new THREE.Mesh(armGeom, this.material);
    this.armMesh.scale.set(1.28, 1.32, 1.28);
    this.pivot.add(this.armMesh);

    // Extension point for Stage 2+ held blocks and Stage 5+ tools/items
    this.heldItemMount = new THREE.Group();
    this.heldItemMount.position.set(-0.04, -0.34, -0.18);
    this.pivot.add(this.heldItemMount);

    // Animation & inertia state
    this.swayX = 0;
    this.swayY = 0;
    this.swingTime = 0;
    this.swingDuration = 0.26;
    this.isSwinging = false;
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  triggerSwing() {
    this.isSwinging = true;
    this.swingTime = 0;
  }

  addLookInertia(deltaYaw, deltaPitch) {
    this.swayX = Math.max(-0.14, Math.min(0.14, this.swayX - deltaYaw * 0.28));
    this.swayY = Math.max(-0.12, Math.min(0.12, this.swayY + deltaPitch * 0.24));
  }

  getSwingProgress() {
    return this.isSwinging ? Math.min(1, this.swingTime / this.swingDuration) : 0;
  }

  update(dt, walkPhase, moveBlend, isCrouching) {
    // Damped spring return for look inertia
    const decay = Math.exp(-12 * dt);
    this.swayX *= decay;
    this.swayY *= decay;

    if (this.isSwinging) {
      this.swingTime += dt;
      if (this.swingTime >= this.swingDuration) {
        this.isSwinging = false;
        this.swingTime = 0;
      }
    }

    const p = this.getSwingProgress();
    const swingWave = Math.sin(p * Math.PI);
    const swingDip = Math.sin(p * Math.PI * 2) * 0.04;

    // View bobbing
    const bobX = Math.cos(walkPhase) * 0.032 * moveBlend;
    const bobY = -Math.abs(Math.sin(walkPhase)) * 0.038 * moveBlend;
    const crouchDrop = isCrouching ? -0.045 : 0;

    // Base rest position in lower-right screen corner
    this.pivot.position.set(
      0.56 + bobX + this.swayX - swingWave * 0.28,
      -0.46 + bobY + crouchDrop + this.swayY - swingWave * 0.14 + swingDip,
      -0.78 - swingWave * 0.22
    );

    // Natural tilted forearm angle pointing forward-upward into scene
    this.pivot.rotation.set(
      -0.62 - swingWave * 0.95 + this.swayY * 0.8,
      -0.38 + swingWave * 0.55 + this.swayX * 0.8,
      0.32 + swingWave * 0.42
    );
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.armMesh.geometry.dispose();
    this.material.dispose();
  }
}
