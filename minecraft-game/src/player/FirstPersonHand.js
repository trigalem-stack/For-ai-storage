import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { buildBlockItemGeometry } from '../entities/ItemEntity.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { getExtrudedTileGeometry } from '../textures/ExtrudedItemMesh.js';
import { createRightArmGeometry } from './PlayerSkin.js';

/**
 * Dedicated first-person right-arm / held-item overlay rendered in a depth-cleared pass
 * so the player's arm or held 3D tool/block never clips into nearby terrain.
 */
export class FirstPersonHand {
  constructor(skinTexture, atlas) {
    this.atlas = atlas;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 10);

    const ambient = new THREE.AmbientLight(0xffffff, 0.82);
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

    this.extrudedMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
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

    // Held 3D block or 1-px extruded tool mount
    this.heldItemMount = new THREE.Group();
    this.heldItemMount.visible = false;
    this.pivot.add(this.heldItemMount);

    this.heldCache = new Map();
    this.bowStageCache = new Map();
    this.currentHeldId = 0;
    this.currentHeldIsTool = false;
    this.currentBowStage = -1;
    this.bowCharge = 0;

    // Animation & inertia state
    this.swayX = 0;
    this.swayY = 0;
    this.swingTime = 0;
    this.swingDuration = 0.24;
    this.isSwinging = false;
    this.isMining = false;
    this.isEating = false;
    this.eatTime = 0;

    // Pure-white WebGL crosshair overlay (immune to Android/MIUI Force Dark CSS inversion)
    const initW = Math.max(1, window.innerWidth || 1280);
    const initH = Math.max(1, window.innerHeight || 720);
    this.crosshairScene = new THREE.Scene();
    this.crosshairCamera = new THREE.OrthographicCamera(0, initW, initH, 0, -1, 1);
    this.crosshairMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.crosshairV = new THREE.Mesh(new THREE.PlaneGeometry(2, 18), this.crosshairMat);
    this.crosshairH = new THREE.Mesh(new THREE.PlaneGeometry(18, 2), this.crosshairMat);
    const cx = Math.round(initW * 0.5);
    const cy = Math.round(initH * 0.5);
    this.crosshairV.position.set(cx, cy, 0);
    this.crosshairH.position.set(cx, cy, 0);
    this.crosshairScene.add(this.crosshairV, this.crosshairH);
  }

  // Alias preserved for Stage 2/4 tests
  get currentHeldBlockId() {
    return this.currentHeldId;
  }

  resize(width, height) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.crosshairCamera.left = 0;
    this.crosshairCamera.right = w;
    this.crosshairCamera.top = h;
    this.crosshairCamera.bottom = 0;
    this.crosshairCamera.updateProjectionMatrix();
    const cx = Math.round(w * 0.5);
    const cy = Math.round(h * 0.5);
    this.crosshairV.position.set(cx, cy, 0);
    this.crosshairH.position.set(cx, cy, 0);
  }

  setHeldBlock(itemOrId) {
    this.setHeldItem(itemOrId);
  }

  setHeldItem(itemOrId) {
    const id = typeof itemOrId === 'object' && itemOrId !== null ? (itemOrId.id || 0) : (itemOrId || 0);
    if (id === this.currentHeldId) return;
    this.currentHeldId = id;

    while (this.heldItemMount.children.length > 0) {
      this.heldItemMount.remove(this.heldItemMount.children[0]);
    }

    if (id <= 0) {
      this.currentHeldIsTool = false;
      this.armHolder.visible = true;
      this.heldItemMount.visible = false;
      return;
    }

    const itemDef = ItemRegistry.get(id);
    const isExtrudedItem = id >= 256;
    this.currentHeldIsTool = isExtrudedItem && Boolean(itemDef?.toolType);
    this.currentBowStage = -1;

    let mesh = this.heldCache.get(id);
    if (!mesh) {
      if (isExtrudedItem) {
        if (!itemDef || !itemDef.sprite) {
          this.armHolder.visible = true;
          this.heldItemMount.visible = false;
          return;
        }
        const geom = getExtrudedTileGeometry(this.atlas, itemDef.sprite, { scale: 0.54 });
        mesh = new THREE.Mesh(geom, this.extrudedMaterial);
        if (itemDef.toolType === 'bow') {
          mesh.rotation.set(-0.08, -Math.PI * 0.44, 0.14);
        } else if (itemDef.toolType && itemDef.toolType !== 'bucket') {
          // Authentic diagonal grip pointing forward-upward into the view
          mesh.rotation.set(-0.20, -Math.PI * 0.42, 0.24);
        } else {
          mesh.rotation.set(0.10, -0.32, -0.06);
        }
      } else {
        const geom = buildBlockItemGeometry(this.atlas, id, 0.36);
        if (!geom) {
          this.armHolder.visible = true;
          this.heldItemMount.visible = false;
          return;
        }
        mesh = new THREE.Mesh(geom, this.blockMaterial);
        const def = BlockRegistry.get(id);
        if (def.isCross || def.isLadder || def.isCrop) {
          mesh.rotation.set(0.06, -0.22, -0.06);
        } else if (def.isTorch) {
          mesh.rotation.set(-0.22, 0.12, -0.14);
        } else if (def.isBed) {
          mesh.rotation.set(0.28, Math.PI * 0.35, 0.08);
        } else {
          mesh.rotation.set(0.18, Math.PI * 0.25, 0.08);
        }
      }
      this.heldCache.set(id, mesh);
    }

    this.heldItemMount.add(mesh);
    this.armHolder.visible = false;
    this.heldItemMount.visible = true;
  }

  setBowCharge(charge01) {
    const c = Math.max(0, Math.min(1, charge01 || 0));
    this.bowCharge = c;
    const itemDef = ItemRegistry.get(this.currentHeldId);
    if (!itemDef || itemDef.toolType !== 'bow') return;

    const stage = c <= 0.01 ? 0 : c < 0.45 ? 1 : c < 0.88 ? 2 : 3;
    if (stage === this.currentBowStage) return;
    this.currentBowStage = stage;

    const spriteName = stage === 0 ? 'item_bow' : `item_bow_pull_${stage - 1}`;
    let mesh = this.bowStageCache.get(spriteName);
    if (!mesh) {
      const geom = getExtrudedTileGeometry(this.atlas, spriteName, { scale: 0.56 });
      mesh = new THREE.Mesh(geom, this.extrudedMaterial);
      mesh.rotation.set(-0.08, -Math.PI * 0.44, 0.14);
      this.bowStageCache.set(spriteName, mesh);
    }
    while (this.heldItemMount.children.length > 0) {
      this.heldItemMount.remove(this.heldItemMount.children[0]);
    }
    this.heldItemMount.add(mesh);
  }

  /**
   * Dynamically tints the 1st-person arm & held item from surrounding voxel sky/block light.
   * Emissive held items stay warmly bright even inside dark caves.
   */
  setEnvironmentLight(skyLevel, blockLevel, sunIntensity, skyTint, torchTint) {
    const def = ItemRegistry.get(this.currentHeldId);
    const heldEmit = def?.lightEmission || 0;

    const skyCurve = Math.pow(0.82, (1 - Math.min(1, Math.max(0, skyLevel / 15))) * 15);
    const sunCurve = Math.pow(Math.max(0.001, sunIntensity), 0.92);
    const blkEff = Math.min(1, Math.max(0, Math.max(blockLevel, heldEmit * 0.6) / 15));
    const blkCurve = Math.pow(0.87, (1 - blkEff) * 15);

    const sr = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.r : 1);
    const sg = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.g : 1);
    const sb = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.b : 1);

    const br = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.r : 1);
    const bg = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.g : 0.90);
    const bb = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.b : 0.72);

    const minL = 0.07;
    const ar = Math.min(1, Math.max(minL, sr, br));
    const ag = Math.min(1, Math.max(minL, sg, bg));
    const ab = Math.min(1, Math.max(minL, sb, bb));

    this.armMaterial.color.setRGB(ar, ag, ab);
    if (heldEmit > 0) {
      this.blockMaterial.color.setRGB(1, 0.96, 0.90);
      this.extrudedMaterial.color.setRGB(1, 0.96, 0.90);
    } else {
      this.blockMaterial.color.setRGB(ar, ag, ab);
      this.extrudedMaterial.color.setRGB(ar, ag, ab);
    }
  }

  setMiningActive(active) {
    this.isMining = Boolean(active);
    if (this.isMining && !this.isSwinging) {
      this.triggerSwing();
    }
  }

  setEatingActive(active) {
    const next = Boolean(active);
    if (next && !this.isEating) {
      this.eatTime = 0;
    }
    this.isEating = next;
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

    if (this.isEating && this.currentHeldId > 0) {
      this.eatTime += dt;
      const chew = Math.sin(this.eatTime * 28.0);
      const chewAlt = Math.cos(this.eatTime * 14.0);
      this.pivot.position.set(
        0.24 + this.swayX * 0.5 + chewAlt * 0.015,
        -0.25 + this.swayY * 0.5 + chew * 0.042,
        -0.58 - Math.abs(chew) * 0.03
      );
      this.pivot.rotation.set(
        0.18 + chew * 0.22,
        -0.38 + chewAlt * 0.12,
        0.22
      );
      return;
    }

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

    if (this.currentHeldId > 0) {
      if (this.bowCharge > 0.01) {
        const shake = this.bowCharge >= 0.9 ? Math.sin(performance.now() * 0.055) * 0.008 : 0;
        this.pivot.position.set(
          0.32 - this.bowCharge * 0.08 + shake + this.swayX * 0.5,
          -0.28 + this.bowCharge * 0.05 + shake * 0.5 + this.swayY * 0.5,
          -0.66 + this.bowCharge * 0.14
        );
        this.pivot.rotation.set(0.08, -0.16 * this.bowCharge, 0.10);
        return;
      }
      if (this.currentHeldIsTool) {
        // Extruded 3D tool with energetic forward chop swing
        this.pivot.position.set(
          0.48 + bobX + this.swayX - swingWave * 0.28,
          -0.36 + bobY + crouchDrop + this.swayY - swingWave * 0.16 + swingDip,
          -0.72 - swingWave * 0.14
        );
        this.pivot.rotation.set(
          -swingWave * 0.96 + this.swayY * 0.7,
          swingWave * 0.56 + this.swayX * 0.7,
          swingWave * 0.34
        );
      } else {
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
      }
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

  renderCrosshair(renderer, width = window.innerWidth, height = window.innerHeight) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    if (this.crosshairCamera.right !== w || this.crosshairCamera.top !== h) {
      this.crosshairCamera.right = w;
      this.crosshairCamera.top = h;
      this.crosshairCamera.updateProjectionMatrix();
      const cx = Math.round(w * 0.5);
      const cy = Math.round(h * 0.5);
      this.crosshairV.position.set(cx, cy, 0);
      this.crosshairH.position.set(cx, cy, 0);
    }
    renderer.clearDepth();
    renderer.render(this.crosshairScene, this.crosshairCamera);
  }

  dispose() {
    this.armMesh.geometry.dispose();
    this.armMaterial.dispose();
    this.crosshairV.geometry.dispose();
    this.crosshairH.geometry.dispose();
    this.crosshairMat.dispose();
    for (const [id, mesh] of this.heldCache.entries()) {
      if (id < 256) mesh.geometry.dispose();
    }
    this.heldCache.clear();
    this.blockMaterial.dispose();
    this.extrudedMaterial.dispose();
  }
}
