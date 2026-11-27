import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { buildBlockItemGeometry } from '../entities/ItemEntity.js';
import { createRightArmGeometry } from './PlayerSkin.js';

/**
 * Dedicated first-person right-arm / held-block overlay rendered in a depth-cleared pass
 * so the player's arm or held block never clips into nearby terrain.
 */
export class FirstPersonHand {
  constructor(skinTexture, atlas) {
    this.atlas = atlas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 10);

    const ambient = new THREE.AmbientLight(0xffffff, 0.78);
    const dir = new THREE.DirectionalLight(0xfff8eb, 0.72);
    dir.position.set(1.2, 2.0, 1.4);
    this.scene.add(ambient, dir);

    this.armMaterial = new THREE.MeshLambertMaterial({
      map: skinTexture,
      side: THREE.FrontSide,
    });

    this.blockMaterial = new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    // Orient Steve's right arm so shoulder/sleeve (+Y) sits near camera (+Z, bottom-right)
    // and bare forearm/fist (-Y) points forward (-Z) into the world.
    this.armHolder = new THREE.Group();
    const armGeom = createRightArmGeometry();
    this.armMesh = new THREE.Mesh(armGeom, this.armMaterial);
    this.armMesh.rotation.x = Math.PI * 0.5;
    this.armMesh.scale.set(1.28, 1.35, 1.28);
    this.armHolder.add(this.armMesh);
    this.pivot.add(this.armHolder);

    // Held 3D block mount (shown instead of bare arm when a block is selected in hotbar)
    this.heldItemMount = new THREE.Group();
    this.heldItemMount.visible = false;
    this.pivot.add(this.heldItemMount);

    this.heldBlockCache = new Map();
    this.currentHeldBlockId = 0;

    // Animation & inertia state
    this.swayX = 0;
    this.swayY = 0;
    this.swingTime = 0;
    this.swingDuration = 0.24;
    this.isSwinging = false;
    this.isMining = false;
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  setHeldBlock(blockId) {
    const id = blockId || 0;
    if (id === this.currentHeldBlockId) return;
    this.currentHeldBlockId = id;

    while (this.heldItemMount.children.length > 0) {
      this.heldItemMount.remove(this.heldItemMount.children[0]);
    }

    if (id <= 0) {
      this.armHolder.visible = true;
      this.heldItemMount.visible = false;
      return;
    }

    let mesh = this.heldBlockCache.get(id);
    if (!mesh) {
      const geom = buildBlockItemGeometry(this.atlas, id, 0.36);
      if (!geom) {
        this.armHolder.visible = true;
        this.heldItemMount.visible = false;
        return;
      }
      mesh = new THREE.Mesh(geom, this.blockMaterial);
      const def = BlockRegistry.get(id);
      if (def.isCross) {
        mesh.rotation.set(0.06, -0.22, -0.06);
      } else if (def.isTorch) {
        mesh.rotation.set(-0.22, 0.12, -0.14);
      } else if (def.isBed) {
        mesh.rotation.set(0.28, Math.PI * 0.35, 0.08);
      } else {
        mesh.rotation.set(0.18, Math.PI * 0.25, 0.08);
      }
      this.heldBlockCache.set(id, mesh);
    }

    this.heldItemMount.add(mesh);
    this.armHolder.visible = false;
    this.heldItemMount.visible = true;
  }

  /**
   * Dynamically tints the 1st-person arm & held item from surrounding voxel sky/block light.
   * Emissive held items (torch, glowstone, jack o'lantern) stay bright even inside dark caves.
   */
  setEnvironmentLight(skyLevel, blockLevel, sunIntensity, skyTint, torchTint) {
    const def = BlockRegistry.get(this.currentHeldBlockId);
    const heldEmit = def?.lightEmission || 0;

    const skyEff = Math.min(1, Math.max(0, (skyLevel / 15) * sunIntensity));
    const blkEff = Math.min(1, Math.max(0, Math.max(blockLevel, heldEmit * 0.6) / 15));
    const skyCurve = Math.pow(0.8, (1 - skyEff) * 15);
    const blkCurve = Math.pow(0.8, (1 - blkEff) * 15);

    const sr = Math.pow(skyCurve, 2.2) * (skyTint ? skyTint.r : 1);
    const sg = Math.pow(skyCurve, 2.2) * (skyTint ? skyTint.g : 1);
    const sb = Math.pow(skyCurve, 2.2) * (skyTint ? skyTint.b : 1);

    const br = Math.pow(blkCurve, 2.2) * (torchTint ? torchTint.r : 1);
    const bg = Math.pow(blkCurve, 2.2) * (torchTint ? torchTint.g : 0.78);
    const bb = Math.pow(blkCurve, 2.2) * (torchTint ? torchTint.b : 0.48);

    const minL = 0.06;
    const ar = Math.min(1, Math.max(minL, sr, br));
    const ag = Math.min(1, Math.max(minL, sg, bg));
    const ab = Math.min(1, Math.max(minL, sb, bb));

    this.armMaterial.color.setRGB(ar, ag, ab);
    if (heldEmit > 0) {
      this.blockMaterial.color.setRGB(1, 0.96, 0.90);
    } else {
      this.blockMaterial.color.setRGB(ar, ag, ab);
    }
  }

  setMiningActive(active) {
    this.isMining = Boolean(active);
    if (this.isMining && !this.isSwinging) {
      this.triggerSwing();
    }
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
    const decay = Math.exp(-12 * dt);
    this.swayX *= decay;
    this.swayY *= decay;

    if (this.isSwinging) {
      this.swingTime += dt;
      if (this.swingTime >= this.swingDuration) {
        if (this.isMining) {
          this.swingTime %= this.swingDuration;
        } else {
          this.isSwinging = false;
          this.swingTime = 0;
        }
      }
    } else if (this.isMining) {
      this.triggerSwing();
    }

    const p = this.getSwingProgress();
    const swingWave = Math.sin(p * Math.PI);
    const swingDip = Math.sin(p * Math.PI * 2) * 0.035;

    const bobX = Math.cos(walkPhase) * 0.032 * moveBlend;
    const bobY = -Math.abs(Math.sin(walkPhase)) * 0.038 * moveBlend;
    const crouchDrop = isCrouching ? -0.045 : 0;

    if (this.currentHeldBlockId > 0) {
      // Held 3D block pose in bottom-right corner
      this.pivot.position.set(
        0.52 + bobX + this.swayX - swingWave * 0.24,
        -0.44 + bobY + crouchDrop + this.swayY - swingWave * 0.14 + swingDip,
        -0.76 - swingWave * 0.18
      );
      this.pivot.rotation.set(
        -swingWave * 0.72 + this.swayY * 0.7,
        swingWave * 0.42 + this.swayX * 0.7,
        swingWave * 0.22
      );
    } else {
      // Bare right arm pose: sleeve back-right, forearm extending forward-left-up
      this.pivot.position.set(
        0.54 + bobX + this.swayX - swingWave * 0.24,
        -0.44 + bobY + crouchDrop + this.swayY - swingWave * 0.12 + swingDip,
        -0.70 - swingWave * 0.18
      );
      this.pivot.rotation.set(
        0.24 - swingWave * 0.72 + this.swayY * 0.75,
        0.44 + swingWave * 0.44 + this.swayX * 0.75,
        -0.18 + swingWave * 0.26
      );
    }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.armMesh.geometry.dispose();
    this.armMaterial.dispose();
    for (const mesh of this.heldBlockCache.values()) {
      mesh.geometry.dispose();
    }
    this.heldBlockCache.clear();
    this.blockMaterial.dispose();
  }
}
