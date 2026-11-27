import * as THREE from '../../vendor/three.module.min.js';

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

/**
 * Full articulated 3D Steve player model with authentic proportions & limb pivots.
 */
export class PlayerModel {
  constructor(skinTexture) {
    this.skinTexture = skinTexture;
    this.material = new THREE.MeshLambertMaterial({
      map: skinTexture,
      side: THREE.FrontSide,
    });

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
  }

  setVisible(visible) {
    this.root.visible = visible;
  }

  updatePose({ x, y, z, yaw, pitch, walkPhase, moveBlend, swingProgress, isCrouching, time }) {
    this.root.position.set(x, y, z);
    // Model front faces +Z; yaw=0 looks toward -Z -> rotate by yaw + PI
    this.root.rotation.y = yaw + Math.PI;

    // Head look pitch (+pitch looks upward -> negative X rotation tilts +Z face up)
    this.headPivot.rotation.x = -pitch;

    // Subtle idle breathing + pendulum walk cycle
    const idleSway = Math.sin(time * 2.0) * 0.035;
    const legSwing = Math.sin(walkPhase) * 0.72 * moveBlend;
    const armSwing = Math.sin(walkPhase) * 0.62 * moveBlend;

    this.rightLegPivot.rotation.x = legSwing;
    this.leftLegPivot.rotation.x = -legSwing;

    let rightArmX = -armSwing + idleSway;
    let rightArmY = 0;
    let rightArmZ = -0.05;

    // Right arm click/tap swing override
    if (swingProgress > 0) {
      const s = Math.sin(swingProgress * Math.PI);
      rightArmX -= s * 1.15;
      rightArmY += s * 0.35;
      rightArmZ += s * 0.25;
    }

    this.rightArmPivot.rotation.set(rightArmX, rightArmY, rightArmZ);
    this.leftArmPivot.rotation.set(armSwing - idleSway, 0, 0.05);

    // Subtle crouch posture
    this.bodyGroup.position.y = isCrouching ? -0.15 : 0;
    this.headPivot.position.y = (isCrouching ? 22 : 24) * SKIN_PX;
  }

  dispose() {
    this.root.traverse((obj) => {
      if (obj.isMesh && obj.geometry) obj.geometry.dispose();
    });
    this.material.dispose();
  }
}
