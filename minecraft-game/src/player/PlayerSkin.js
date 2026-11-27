import * as THREE from '../../vendor/three.module.min.js';
import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { getExtrudedTileGeometry } from '../textures/ExtrudedItemMesh.js';
import { buildBlockItemGeometry } from '../entities/ItemEntity.js';

// Classic Steve model pixel scale: 32px height = 1.80 blocks -> 0.05625 blocks/px
export const SKIN_PX = 1.8 / 32;

function setRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function pxNoise(seed, x, y) {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shadeHex(hex, delta) {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + delta));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + delta));
  const b = Math.max(0, Math.min(255, (num & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

/**
 * Generates an authentic 64x64 classic Steve skin canvas texture.
 */
export function createSteveSkinCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 64, 64);

  const fillTextured = (rx, ry, rw, rh, baseHex, variance = 10, seed = 1) => {
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const d = Math.round((pxNoise(seed, rx + x, ry + y) - 0.5) * variance * 2);
        setRect(ctx, rx + x, ry + y, 1, 1, shadeHex(baseHex, d));
      }
    }
  };

  // --- HEAD (8x8x8) ---
  // Top (8,0)-(16,8), Bottom (16,0)-(24,8), Right (0,8)-(8,16), Front (8,8)-(16,16), Left (16,8)-(24,16), Back (24,8)-(32,16)
  fillTextured(8, 0, 8, 8, '#3d2817', 12, 11);   // Top hair
  fillTextured(16, 0, 8, 8, '#c6906b', 8, 12);   // Bottom chin
  fillTextured(0, 8, 8, 8, '#cf9973', 8, 13);    // Right face side
  fillTextured(8, 8, 8, 8, '#d49d76', 8, 14);    // Front face
  fillTextured(16, 8, 8, 8, '#cf9973', 8, 15);   // Left face side
  fillTextured(24, 8, 8, 8, '#3b2615', 12, 16);  // Back hair

  // Hair bangs & sideburns
  fillTextured(8, 8, 8, 2, '#3d2817', 10, 21);   // Forehead hair
  setRect(ctx, 8, 10, 1, 1, '#3d2817');
  setRect(ctx, 15, 10, 1, 1, '#3d2817');
  // Side hair on Right & Left head faces
  fillTextured(0, 8, 8, 2, '#3b2615', 10, 22);
  fillTextured(0, 10, 5, 2, '#3b2615', 10, 23);
  setRect(ctx, 0, 12, 3, 1, '#3b2615');
  fillTextured(16, 8, 8, 2, '#3b2615', 10, 24);
  fillTextured(19, 10, 5, 2, '#3b2615', 10, 25);
  setRect(ctx, 21, 12, 3, 1, '#3b2615');

  // Iconic Steve eyes (row y=12, cols 9..10 and 13..14)
  setRect(ctx, 9, 12, 1, 1, '#ffffff');
  setRect(ctx, 10, 12, 1, 1, '#493899');
  setRect(ctx, 13, 12, 1, 1, '#493899');
  setRect(ctx, 14, 12, 1, 1, '#ffffff');
  // Subtle eyebrows
  setRect(ctx, 9, 11, 2, 1, '#543824');
  setRect(ctx, 13, 11, 2, 1, '#543824');
  // Nose & classic Steve beard/smile
  setRect(ctx, 11, 13, 2, 1, '#b67d59');
  setRect(ctx, 10, 14, 1, 2, '#5a3b26');
  setRect(ctx, 13, 14, 1, 2, '#5a3b26');
  setRect(ctx, 11, 14, 2, 1, '#945e47');
  setRect(ctx, 11, 15, 2, 1, '#5a3b26');

  // --- TORSO (8x12x4) ---
  // Top (20,16)-(28,20), Bottom (28,16)-(36,20), Right (16,20)-(20,32), Front (20,20)-(28,32), Left (28,20)-(32,32), Back (32,20)-(40,32)
  fillTextured(20, 16, 8, 4, '#00a5a9', 9, 31);
  fillTextured(28, 16, 8, 4, '#27278f', 8, 32);
  fillTextured(16, 20, 4, 12, '#009397', 9, 33);
  fillTextured(20, 20, 8, 12, '#00a9ad', 10, 34);
  fillTextured(28, 20, 4, 12, '#009397', 9, 35);
  fillTextured(32, 20, 8, 12, '#009c9f', 10, 36);

  // V-neck collar & tucked shirt pixel edge
  setRect(ctx, 22, 20, 4, 1, '#cf9973');
  setRect(ctx, 23, 21, 2, 1, '#cf9973');
  setRect(ctx, 20, 31, 8, 1, '#008185');
  setRect(ctx, 32, 31, 8, 1, '#008185');

  // --- RIGHT ARM (4x12x4) & LEFT ARM (4x12x4) ---
  const paintArm = (baseX, baseY, seedBase) => {
    // Top / Bottom
    fillTextured(baseX + 4, baseY, 4, 4, '#00a9ad', 8, seedBase);
    fillTextured(baseX + 8, baseY, 4, 4, '#c78f6a', 8, seedBase + 1);
    // Sleeve (top 4px of sides: y+4 .. y+8)
    fillTextured(baseX, baseY + 4, 16, 4, '#009fa3', 10, seedBase + 2);
    // Sleeve hem
    fillTextured(baseX, baseY + 8, 16, 1, '#008387', 5, seedBase + 3);
    // Bare forearm & hand (y+9 .. y+16)
    fillTextured(baseX, baseY + 9, 16, 7, '#d19973', 9, seedBase + 4);
  };
  paintArm(40, 16, 50); // Right Arm (1.8 spec: base at 40,16)
  paintArm(32, 48, 60); // Left Arm (1.8 spec: base at 32,48)

  // --- RIGHT LEG (4x12x4) & LEFT LEG (4x12x4) ---
  const paintLeg = (baseX, baseY, seedBase) => {
    fillTextured(baseX + 4, baseY, 4, 4, '#2a2aa0', 7, seedBase);      // Top
    fillTextured(baseX + 8, baseY, 4, 4, '#4b4b4b', 6, seedBase + 1);  // Sole
    fillTextured(baseX, baseY + 4, 16, 10, '#2e2ea8', 10, seedBase + 2); // Trousers
    fillTextured(baseX, baseY + 14, 16, 2, '#595959', 8, seedBase + 3); // Shoes
  };
  paintLeg(0, 16, 70);  // Right Leg (base at 0,16)
  paintLeg(16, 48, 80); // Left Leg (base at 16,48)

  return canvas;
}

export function createSteveSkinTexture() {
  const canvas = createSteveSkinCanvas();
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds a cuboid BufferGeometry centered on X/Z with Y spanning [yMin, yMax]
 * relative to its joint pivot, mapped cleanly to 64x64 Minecraft skin UV rects.
 * Local front faces +Z, Right side is -X, Left side is +X.
 */
function createSkinCuboid(wPx, hPx, dPx, yMinPx, yMaxPx, faceRects) {
  const hw = (wPx * SKIN_PX) * 0.5;
  const hd = (dPx * SKIN_PX) * 0.5;
  const yMin = yMinPx * SKIN_PX;
  const yMax = yMaxPx * SKIN_PX;

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  const pushFace = (p0, p1, p2, p3, normal, rect) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    for (let i = 0; i < 4; i++) normals.push(...normal);

    const [x1, y1, x2, y2] = rect;
    const eps = 0.01;
    const u0 = (x1 + eps) / 64;
    const u1 = (x2 - eps) / 64;
    const vTop = 1 - (y1 + eps) / 64;
    const vBottom = 1 - (y2 - eps) / 64;

    uvs.push(u0, vBottom, u1, vBottom, u1, vTop, u0, vTop);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // Front (+Z)
  pushFace(
    [-hw, yMin, hd], [hw, yMin, hd], [hw, yMax, hd], [-hw, yMax, hd],
    [0, 0, 1], faceRects.front
  );
  // Back (-Z)
  pushFace(
    [hw, yMin, -hd], [-hw, yMin, -hd], [-hw, yMax, -hd], [hw, yMax, -hd],
    [0, 0, -1], faceRects.back
  );
  // Character Right (-X)
  pushFace(
    [-hw, yMin, -hd], [-hw, yMin, hd], [-hw, yMax, hd], [-hw, yMax, -hd],
    [-1, 0, 0], faceRects.right
  );
  // Character Left (+X)
  pushFace(
    [hw, yMin, hd], [hw, yMin, -hd], [hw, yMax, -hd], [hw, yMax, hd],
    [1, 0, 0], faceRects.left
  );
  // Top (+Y)
  pushFace(
    [-hw, yMax, hd], [hw, yMax, hd], [hw, yMax, -hd], [-hw, yMax, -hd],
    [0, 1, 0], faceRects.top
  );
  // Bottom (-Y)
  pushFace(
    [-hw, yMin, -hd], [hw, yMin, -hd], [hw, yMin, hd], [-hw, yMin, hd],
    [0, -1, 0], faceRects.bottom
  );

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

export const RIGHT_ARM_UV = Object.freeze({
  top: [44, 16, 48, 20],
  bottom: [48, 16, 52, 20],
  right: [40, 20, 44, 32],
  front: [44, 20, 48, 32],
  left: [48, 20, 52, 32],
  back: [52, 20, 56, 32],
});

export function createRightArmGeometry() {
  return createSkinCuboid(4, 12, 4, -6, 6, RIGHT_ARM_UV);
}

const ARMOR_TIER_COLORS = {
  leather: { base: 0xa46238, rim: 0x6c3d1e },
  iron: { base: 0xd0d4dc, rim: 0x9aa2b0 },
  gold: { base: 0xf4cc36, rim: 0xd29c1c },
  diamond: { base: 0x42dcd0, rim: 0x24a8a2 },
};

/**
 * Full articulated 3D Steve player model with authentic proportions, 3D armor pieces,
 * 3D extruded tools in hand, and smooth walk/crouch/swim animation.
 */
export class PlayerModel {
  constructor(skinTexture, atlas = null) {
    this.skinTexture = skinTexture;
    this.atlas = atlas;
    this.material = new THREE.MeshLambertMaterial({
      map: skinTexture,
      side: THREE.FrontSide,
    });

    this.heldBlockMat = atlas ? new THREE.MeshBasicMaterial({
      map: atlas.texture,
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    }) : null;

    this.heldExtrudedMat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.FrontSide,
    });

    this.armorMaterials = {
      leather: new THREE.MeshLambertMaterial({ color: ARMOR_TIER_COLORS.leather.base }),
      iron: new THREE.MeshLambertMaterial({ color: ARMOR_TIER_COLORS.iron.base }),
      gold: new THREE.MeshLambertMaterial({ color: ARMOR_TIER_COLORS.gold.base }),
      diamond: new THREE.MeshLambertMaterial({ color: ARMOR_TIER_COLORS.diamond.base }),
    };
    this.hurtFlashTimer = 0;
    this.isDead = false;
    this._lastPoseTime = 0;

    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);

    // Head pivot at neck y = 24px (head spans 0..8px above pivot)
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 24 * SKIN_PX, 0);
    const headMesh = new THREE.Mesh(
      createSkinCuboid(8, 8, 8, 0, 8, {
        top: [8, 0, 16, 8],
        bottom: [16, 0, 24, 8],
        right: [0, 8, 8, 16],
        front: [8, 8, 16, 16],
        left: [16, 8, 24, 16],
        back: [24, 8, 32, 16],
      }),
      this.material
    );
    this.headPivot.add(headMesh);
    this.bodyGroup.add(this.headPivot);

    // Torso (spans 12..24px)
    const torsoMesh = new THREE.Mesh(
      createSkinCuboid(8, 12, 4, 12, 24, {
        top: [20, 16, 28, 20],
        bottom: [28, 16, 36, 20],
        right: [16, 20, 20, 32],
        front: [20, 20, 28, 32],
        left: [28, 20, 32, 32],
        back: [32, 20, 40, 32],
      }),
      this.material
    );
    this.bodyGroup.add(torsoMesh);

    // Right Arm (pivot at shoulder x=-6px, y=22px; mesh spans -10..2px around pivot)
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(-6 * SKIN_PX, 22 * SKIN_PX, 0);
    const rightArmMesh = new THREE.Mesh(
      createSkinCuboid(4, 12, 4, -10, 2, RIGHT_ARM_UV),
      this.material
    );
    this.rightArmPivot.add(rightArmMesh);

    // Right-hand 3D held item mount
    this.heldMount = new THREE.Group();
    this.heldMount.position.set(0, -9.2 * SKIN_PX, 2.2 * SKIN_PX);
    this.rightArmPivot.add(this.heldMount);
    this._heldCache = new Map();
    this._currentHeldId = 0;

    this.bodyGroup.add(this.rightArmPivot);

    // Left Arm (pivot at shoulder x=+6px, y=22px)
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(6 * SKIN_PX, 22 * SKIN_PX, 0);
    const leftArmMesh = new THREE.Mesh(
      createSkinCuboid(4, 12, 4, -10, 2, {
        top: [36, 48, 40, 52],
        bottom: [40, 48, 44, 52],
        right: [32, 52, 36, 64],
        front: [36, 52, 40, 64],
        left: [40, 52, 44, 64],
        back: [44, 52, 48, 64],
      }),
      this.material
    );
    this.leftArmPivot.add(leftArmMesh);
    this.bodyGroup.add(this.leftArmPivot);

    // Right Leg (pivot at hip x=-2px, y=12px; mesh spans -12..0px)
    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(-2 * SKIN_PX, 12 * SKIN_PX, 0);
    const rightLegMesh = new THREE.Mesh(
      createSkinCuboid(4, 12, 4, -12, 0, {
        top: [4, 16, 8, 20],
        bottom: [8, 16, 12, 20],
        right: [0, 20, 4, 32],
        front: [4, 20, 8, 32],
        left: [8, 20, 12, 32],
        back: [12, 20, 16, 32],
      }),
      this.material
    );
    this.rightLegPivot.add(rightLegMesh);
    this.bodyGroup.add(this.rightLegPivot);

    // Left Leg (pivot at hip x=+2px, y=12px; mesh spans -12..0px)
    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(2 * SKIN_PX, 12 * SKIN_PX, 0);
    const leftLegMesh = new THREE.Mesh(
      createSkinCuboid(4, 12, 4, -12, 0, {
        top: [20, 48, 24, 52],
        bottom: [24, 48, 28, 52],
        right: [16, 52, 20, 64],
        front: [20, 52, 24, 64],
        left: [24, 52, 28, 64],
        back: [28, 52, 32, 64],
      }),
      this.material
    );
    this.leftLegPivot.add(leftLegMesh);
    this.bodyGroup.add(this.leftLegPivot);

    // Lazy-attached 3D Armor overlays (keeps initial Steve mesh count === 6 until armor is equipped)
    this._armorBuilt = false;
    this._armorMounts = null;
    this._armorTiers = { helmet: null, chestplate: null, leggings: null, boots: null };
  }

  _ensureArmorPieces() {
    if (this._armorBuilt) return;
    this._armorBuilt = true;
    const mat = this.armorMaterials.iron;
    // Helmet: open-face dome + side/back plates + nose guard so Steve's eyes & smile remain visible
    this.helmetGroup = new THREE.Group();
    const hTop = new THREE.Mesh(new THREE.BoxGeometry(9.2 * SKIN_PX, 2.6 * SKIN_PX, 9.2 * SKIN_PX), mat);
    hTop.position.set(0, 7.3 * SKIN_PX, 0);
    const hBack = new THREE.Mesh(new THREE.BoxGeometry(9.2 * SKIN_PX, 6.2 * SKIN_PX, 1.4 * SKIN_PX), mat);
    hBack.position.set(0, 4.1 * SKIN_PX, -3.9 * SKIN_PX);
    const hRight = new THREE.Mesh(new THREE.BoxGeometry(1.2 * SKIN_PX, 6.2 * SKIN_PX, 8.2 * SKIN_PX), mat);
    hRight.position.set(-4.0 * SKIN_PX, 4.1 * SKIN_PX, -0.3 * SKIN_PX);
    const hLeft = new THREE.Mesh(new THREE.BoxGeometry(1.2 * SKIN_PX, 6.2 * SKIN_PX, 8.2 * SKIN_PX), mat);
    hLeft.position.set(4.0 * SKIN_PX, 4.1 * SKIN_PX, -0.3 * SKIN_PX);
    const hNose = new THREE.Mesh(new THREE.BoxGeometry(2.0 * SKIN_PX, 2.2 * SKIN_PX, 1.2 * SKIN_PX), mat);
    hNose.position.set(0, 5.5 * SKIN_PX, 4.2 * SKIN_PX);
    this.helmetGroup.add(hTop, hBack, hRight, hLeft, hNose);

    // Chestplate: torso vest + arm pauldrons
    this.chestTorso = new THREE.Mesh(new THREE.BoxGeometry(8.9 * SKIN_PX, 11.4 * SKIN_PX, 4.9 * SKIN_PX), mat);
    this.chestTorso.position.set(0, 18.2 * SKIN_PX, 0);

    this.chestArmR = new THREE.Mesh(new THREE.BoxGeometry(4.8 * SKIN_PX, 5.2 * SKIN_PX, 4.8 * SKIN_PX), mat);
    this.chestArmR.position.set(0, -0.4 * SKIN_PX, 0);

    this.chestArmL = new THREE.Mesh(new THREE.BoxGeometry(4.8 * SKIN_PX, 5.2 * SKIN_PX, 4.8 * SKIN_PX), mat);
    this.chestArmL.position.set(0, -0.4 * SKIN_PX, 0);

    // Leggings: waist belt + upper leg sleeves
    this.legBelt = new THREE.Mesh(new THREE.BoxGeometry(8.7 * SKIN_PX, 3.2 * SKIN_PX, 4.7 * SKIN_PX), mat);
    this.legBelt.position.set(0, 13.0 * SKIN_PX, 0);

    this.legArmorR = new THREE.Mesh(new THREE.BoxGeometry(4.65 * SKIN_PX, 7.8 * SKIN_PX, 4.65 * SKIN_PX), mat);
    this.legArmorR.position.set(0, -3.9 * SKIN_PX, 0);

    this.legArmorL = new THREE.Mesh(new THREE.BoxGeometry(4.65 * SKIN_PX, 7.8 * SKIN_PX, 4.65 * SKIN_PX), mat);
    this.legArmorL.position.set(0, -3.9 * SKIN_PX, 0);

    // Boots: lower leg/foot caps
    this.bootR = new THREE.Mesh(new THREE.BoxGeometry(4.95 * SKIN_PX, 4.6 * SKIN_PX, 5.0 * SKIN_PX), mat);
    this.bootR.position.set(0, -9.8 * SKIN_PX, 0);

    this.bootL = new THREE.Mesh(new THREE.BoxGeometry(4.95 * SKIN_PX, 4.6 * SKIN_PX, 5.0 * SKIN_PX), mat);
    this.bootL.position.set(0, -9.8 * SKIN_PX, 0);

    this._armorMounts = {
      helmet: [[this.headPivot, this.helmetGroup]],
      chestplate: [
        [this.bodyGroup, this.chestTorso],
        [this.rightArmPivot, this.chestArmR],
        [this.leftArmPivot, this.chestArmL],
      ],
      leggings: [
        [this.bodyGroup, this.legBelt],
        [this.rightLegPivot, this.legArmorR],
        [this.leftLegPivot, this.legArmorL],
      ],
      boots: [
        [this.rightLegPivot, this.bootR],
        [this.leftLegPivot, this.bootL],
      ],
    };
  }

  setArmor(armorSlots = {}) {
    const hasAny = Boolean(
      armorSlots?.helmet?.id ||
      armorSlots?.chestplate?.id ||
      armorSlots?.leggings?.id ||
      armorSlots?.boots?.id
    );
    if (!hasAny && !this._armorBuilt) return;
    this._ensureArmorPieces();

    const applyPiece = (slotKey) => {
      const stack = armorSlots?.[slotKey];
      const def = stack?.id ? ItemRegistry.get(stack.id) : null;
      const tier = def?.armorTier || null;
      const pairs = this._armorMounts[slotKey];

      if (!tier || !this.armorMaterials[tier]) {
        for (const [parent, obj] of pairs) {
          if (obj.parent === parent) parent.remove(obj);
        }
        this._armorTiers[slotKey] = null;
        return;
      }

      const mat = this.armorMaterials[tier];
      for (const [parent, obj] of pairs) {
        if (obj.parent !== parent) parent.add(obj);
        if (obj.isMesh) {
          obj.material = mat;
        } else {
          obj.traverse((ch) => { if (ch.isMesh) ch.material = mat; });
        }
      }
      this._armorTiers[slotKey] = tier;
    };

    applyPiece('helmet');
    applyPiece('chestplate');
    applyPiece('leggings');
    applyPiece('boots');
  }

  setHeldItem(itemOrId) {
    if (!this.atlas) return;
    const id = typeof itemOrId === 'object' && itemOrId !== null ? (itemOrId.id || 0) : (itemOrId || 0);
    if (id === this._currentHeldId) return;
    this._currentHeldId = id;

    while (this.heldMount.children.length > 0) {
      this.heldMount.remove(this.heldMount.children[0]);
    }
    if (!id || id <= 0) return;

    let mesh = this._heldCache.get(id);
    if (!mesh) {
      if (id >= 256) {
        const def = ItemRegistry.get(id);
        if (!def || !def.sprite) return;
        const geom = getExtrudedTileGeometry(this.atlas, def.sprite, { scale: 0.56 });
        mesh = new THREE.Mesh(geom, this.heldExtrudedMat);
        mesh.rotation.set(Math.PI * 0.18, Math.PI * 0.5, -Math.PI * 0.15);
        mesh.position.set(0, -0.05, 0.18);
      } else if (this.heldBlockMat) {
        const geom = buildBlockItemGeometry(this.atlas, id, 0.28);
        if (!geom) return;
        mesh = new THREE.Mesh(geom, this.heldBlockMat);
        const def = BlockRegistry.get(id);
        if (def.isTorch) {
          mesh.rotation.set(0.35, 0, 0);
          mesh.position.set(0, 0.04, 0.10);
        } else {
          mesh.rotation.set(0.25, 0.45, 0.1);
          mesh.position.set(0, -0.02, 0.14);
        }
      }
      if (mesh) this._heldCache.set(id, mesh);
    }
    if (mesh) this.heldMount.add(mesh);
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  triggerHurtFlash(duration = 0.4) {
    this.hurtFlashTimer = duration;
  }

  setDead(dead) {
    this.isDead = Boolean(dead);
    if (!this.isDead) {
      this.bodyGroup.rotation.z = 0;
    }
  }

  setEnvironmentLight(skyLevel, blockLevel, sunIntensity, skyTint, torchTint) {
    const skyCurve = Math.pow(0.82, (1 - Math.min(1, Math.max(0, skyLevel / 15))) * 15);
    const sunCurve = Math.pow(Math.max(0.001, sunIntensity), 0.92);
    const blkEff = Math.min(1, Math.max(0, blockLevel / 15));
    const blkCurve = Math.pow(0.87, (1 - blkEff) * 15);

    const sr = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.r : 1);
    const sg = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.g : 1);
    const sb = Math.pow(Math.max(0.001, skyCurve), 1.8) * sunCurve * (skyTint ? skyTint.b : 1);

    const br = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.r : 1);
    const bg = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.g : 0.90);
    const bb = Math.pow(Math.max(0.001, blkCurve), 1.32) * (torchTint ? torchTint.b : 0.72);

    const cr = Math.min(1, Math.max(0.07, sr, br));
    const cg = Math.min(1, Math.max(0.07, sg, bg));
    const cb = Math.min(1, Math.max(0.07, sb, bb));

    if (this.hurtFlashTimer > 0) {
      this.material.color.setRGB(Math.min(1, cr + 0.45), cg * 0.35, cb * 0.35);
      this.material.emissive.setRGB(0.55, 0.04, 0.04);
    } else {
      this.material.color.setRGB(cr, cg, cb);
      this.material.emissive.setRGB(0, 0, 0);
    }
    this.heldExtrudedMat.color.setRGB(cr, cg, cb);
    if (this.heldBlockMat) this.heldBlockMat.color.setRGB(cr, cg, cb);
    for (const [tier, mat] of Object.entries(this.armorMaterials)) {
      const col = new THREE.Color(ARMOR_TIER_COLORS[tier].base);
      if (this.hurtFlashTimer > 0) {
        mat.color.setRGB(Math.min(1, col.r * cr + 0.35), col.g * cg * 0.45, col.b * cb * 0.45);
      } else {
        mat.color.setRGB(col.r * cr, col.g * cg, col.b * cb);
      }
    }
  }

  updatePose({ x, y, z, yaw, pitch, walkPhase, moveBlend, swingProgress, isCrouching, isSwimming = false, isDead = false, time }) {
    const dt = Math.max(0, Math.min(0.1, time - this._lastPoseTime));
    this._lastPoseTime = time;
    this.isDead = Boolean(isDead);
    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
    }

    this.root.position.set(x, y, z);
    this.root.rotation.y = yaw + Math.PI;

    if (isDead) {
      this.bodyGroup.rotation.x = 0;
      this.bodyGroup.rotation.z = -Math.PI * 0.48;
      this.bodyGroup.position.set(0, 0.22, 0);
      return;
    }
    this.bodyGroup.rotation.z = 0;

    const idleSway = Math.sin(time * 2.0) * 0.035;

    if (isSwimming) {
      // Horizontal swimming posture facing forward with fluttering kicks & strokes
      this.bodyGroup.rotation.x = Math.PI * 0.43;
      this.bodyGroup.position.set(0, 0.34, -0.45);
      this.headPivot.position.y = 24 * SKIN_PX;
      this.headPivot.rotation.x = -Math.PI * 0.36 - pitch * 0.6;
      const stroke = Math.sin(time * 8.5);
      this.rightLegPivot.rotation.x = stroke * 0.48;
      this.leftLegPivot.rotation.x = -stroke * 0.48;
      this.rightArmPivot.rotation.set(-2.35 + stroke * 0.55, 0, -0.35);
      this.leftArmPivot.rotation.set(-2.35 - stroke * 0.55, 0, 0.35);
      return;
    }

    this.bodyGroup.rotation.x = 0;
    this.headPivot.rotation.x = -pitch;

    const legSwing = Math.sin(walkPhase) * 0.72 * moveBlend;
    const armSwing = Math.sin(walkPhase) * 0.62 * moveBlend;

    this.rightLegPivot.rotation.x = legSwing;
    this.leftLegPivot.rotation.x = -legSwing;

    let rightArmX = -armSwing + idleSway;
    let rightArmY = 0;
    let rightArmZ = -0.05;

    if (swingProgress > 0) {
      const s = Math.sin(swingProgress * Math.PI);
      rightArmX -= s * 1.15;
      rightArmY += s * 0.35;
      rightArmZ += s * 0.25;
    }

    this.rightArmPivot.rotation.set(rightArmX, rightArmY, rightArmZ);
    this.leftArmPivot.rotation.set(armSwing - idleSway, 0, 0.05);

    this.bodyGroup.position.set(0, isCrouching ? -0.15 : 0, 0);
    this.headPivot.position.y = (isCrouching ? 22 : 24) * SKIN_PX;
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj.isMesh && obj.geometry && obj.userData?.shared !== true) {
        // Keep extruded geometries managed by ExtrudedItemMesh cache
      }
    });
    for (const [id, mesh] of this._heldCache.entries()) {
      if (id < 256 && mesh.geometry) mesh.geometry.dispose();
    }
    this._heldCache.clear();
    if (this._armorMounts) {
      for (const pairs of Object.values(this._armorMounts)) {
        for (const [, obj] of pairs) {
          obj.traverse((ch) => { if (ch.isMesh && ch.geometry) ch.geometry.dispose(); });
        }
      }
    }
    this.material.dispose();
    this.heldExtrudedMat.dispose();
    if (this.heldBlockMat) this.heldBlockMat.dispose();
    for (const mat of Object.values(this.armorMaterials)) {
      mat.dispose();
    }
  }
}

/**
 * Live 3D Inventory Paper-Doll renderer using the SINGLE main WebGLRenderer via scissor viewport
 * (zero extra WebGL contexts!), projecting onto the inventory's 2D <canvas> and tracking cursor/touch.
 */
export class InventoryPlayerPreview {
  constructor(skinTexture, atlas) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 140 / 190, 0.1, 20);
    this.camera.position.set(0, 1.05, 4.15);
    this.camera.lookAt(0, 0.92, 0);

    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    const key = new THREE.DirectionalLight(0xfff8ec, 0.72);
    key.position.set(1.8, 3.0, 2.5);
    this.scene.add(amb, key);

    this.model = new PlayerModel(skinTexture, atlas);
    this.model.setEnvironmentLight(15, 0, 1.0, new THREE.Color(1, 1, 1), new THREE.Color(1, 0.85, 0.65));
    this.scene.add(this.model.root);

    this.lookX = 0; // -1..1
    this.lookY = 0; // -1..1
    this.targetCanvas = null;
    this.targetCtx = null;
    this._dirty = true;
    this._lastRenderAt = 0;
  }

  bindCanvas(canvasEl) {
    this.targetCanvas = canvasEl;
    this.targetCtx = canvasEl ? canvasEl.getContext('2d') : null;
    this._dirty = true;
  }

  setLookTarget(normX, normY) {
    const nx = Math.max(-1, Math.min(1, normX));
    const ny = Math.max(-1, Math.min(1, normY));
    if (Math.abs(nx - this.lookX) > 0.005 || Math.abs(ny - this.lookY) > 0.005) {
      this.lookX = nx;
      this.lookY = ny;
      this._dirty = true;
    }
  }

  syncEquipment(heldStack, armorSlots) {
    this.model.setHeldItem(heldStack);
    this.model.setArmor(armorSlots);
    this._dirty = true;
  }

  renderToTarget(renderer, time) {
    if (!this.targetCanvas || !this.targetCtx || !renderer?.domElement) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Throttle Paper-Doll 3D re-renders to <=20Hz unless look/equipment just changed (zero lag!)
    if (!this._dirty && now - this._lastRenderAt < 50) return;
    if (this._dirty && now - this._lastRenderAt < 28) return;
    this._dirty = false;
    this._lastRenderAt = now;
    const pw = this.targetCanvas.width || 132;
    const ph = this.targetCanvas.height || 176;
    const dpr = renderer.getPixelRatio ? renderer.getPixelRatio() : 1;
    const srcW = Math.round(pw * dpr);
    const srcH = Math.round(ph * dpr);
    const domW = renderer.domElement.width;
    const domH = renderer.domElement.height;
    if (domW < srcW || domH < srcH) return;

    // Face camera (+Z -> yaw = PI), follow cursor smoothly
    const bodyYaw = Math.PI + this.lookX * 0.45;
    const headPitch = -this.lookY * 0.42;

    this.model.updatePose({
      x: 0,
      y: 0,
      z: 0,
      yaw: bodyYaw,
      pitch: headPitch,
      walkPhase: 0,
      moveBlend: 0,
      swingProgress: 0,
      isCrouching: false,
      isSwimming: false,
      time,
    });
    this.model.headPivot.rotation.y = this.lookX * 0.35;

    const prevAutoClear = renderer.autoClear;
    const prevClearAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
    const prevBg = renderer.getClearColor ? renderer.getClearColor(new THREE.Color()) : null;

    this.camera.aspect = pw / ph;
    this.camera.updateProjectionMatrix();

    renderer.autoClear = false;
    renderer.setViewport(0, 0, pw, ph);
    renderer.setScissor(0, 0, pw, ph);
    renderer.setScissorTest(true);
    renderer.setClearColor(0x0b0d14, 1);
    renderer.clear(true, true, true);
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    if (prevBg) renderer.setClearColor(prevBg, prevClearAlpha);
    renderer.autoClear = prevAutoClear;

    this.targetCtx.clearRect(0, 0, pw, ph);
    this.targetCtx.drawImage(
      renderer.domElement,
      0,
      domH - srcH,
      srcW,
      srcH,
      0,
      0,
      pw,
      ph
    );
  }

  dispose() {
    this.model.dispose();
  }
}

