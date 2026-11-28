import * as THREE from '../../vendor/three.module.min.js';

/**
 * Authentic 3D voxel panorama backdrop for the Main Menu.
 * Keeps the 24-vertex skybox cube (`this.boxMesh`) while rendering a lightweight static
 * 3D voxel valley (hills, oak/birch trees, waterfall, lake & drifting clouds) with zero chunk streaming.
 */
export class MenuPanorama {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#9cd0ff', 18, 44);
    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      90
    );
    this.yaw = 0.6;
    this.pitch = -0.14;
    this.elapsed = 0;

    // 1. Skybox cube (24 vertices, pure daylight gradient + sun)
    const materials = [];
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    this.textures = [];
    for (const face of faces) {
      const tex = this._paintSkyFace(face);
      this.textures.push(tex);
      materials.push(new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }));
    }
    const geom = new THREE.BoxGeometry(70, 70, 70);
    this.boxMesh = new THREE.Mesh(geom, materials);
    this.scene.add(this.boxMesh);

    // 2. Build static 3D voxel valley around camera (zero chunks, ~1200 culled faces = 1 draw call)
    this.disposables = [];
    this._buildVoxelValley();
  }

  _paintSkyFace(face) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    if (face === 'py') {
      g.fillStyle = '#68abfb';
      g.fillRect(0, 0, size, size);
    } else if (face === 'ny') {
      g.fillStyle = '#a8d7ff';
      g.fillRect(0, 0, size, size);
    } else {
      const sky = g.createLinearGradient(0, 0, 0, size);
      sky.addColorStop(0, '#68abfb');
      sky.addColorStop(0.55, '#a8d7ff');
      sky.addColorStop(1, '#9cd0ff');
      g.fillStyle = sky;
      g.fillRect(0, 0, size, size);

      if (face === 'pz') {
        g.fillStyle = '#fff5b8';
        g.fillRect(22, 10, 10, 10);
        g.fillStyle = '#ffffff';
        g.fillRect(24, 12, 6, 6);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildVoxelValley() {
    const R = 24;
    const W = R * 2 + 1;
    const H = 22;
    const grid = new Uint8Array(W * H * W);
    const AIR = 0;
    const GRASS = 1;
    const DIRT = 2;
    const STONE = 3;
    const WATER = 4;
    const LOG = 5;
    const LEAVES = 6;
    const SAND = 7;
    const BIRCH_LOG = 8;
    const FLOWER = 9;

    const setB = (x, y, z, id) => {
      const gx = x + R;
      const gz = z + R;
      if (gx < 0 || gx >= W || gz < 0 || gz >= W || y < 0 || y >= H) return;
      grid[(y * W + gz) * W + gx] = id;
    };
    const getB = (x, y, z) => {
      const gx = x + R;
      const gz = z + R;
      if (gx < 0 || gx >= W || gz < 0 || gz >= W || y < 0 || y >= H) return AIR;
      return grid[(y * W + gz) * W + gx];
    };

    const waterLevel = 5;
    // Terrain heightfield: scenic central lake + surrounding hills + cliff on -Z/+X for waterfall
    for (let z = -R; z <= R; z++) {
      for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x * 0.9, z * 1.05);
        const ridge = Math.sin(x * 0.19) * 2.2 + Math.cos(z * 0.21) * 2.1 + Math.sin((x + z) * 0.14) * 1.8;
        let h = Math.round(5.0 + Math.max(0, (d - 6.5) * 0.42) + ridge);
        if (x > 6 && z < -6) {
          h = Math.max(h, 11 + Math.round(Math.sin(x * 0.4 + z * 0.3) * 1.4));
        }
        h = Math.max(2, Math.min(H - 5, h));

        for (let y = 0; y <= h; y++) {
          if (y === h) {
            setB(x, y, z, h <= waterLevel ? SAND : (h >= 12 ? STONE : GRASS));
          } else if (y >= h - 2) {
            setB(x, y, z, h <= waterLevel ? SAND : DIRT);
          } else {
            setB(x, y, z, STONE);
          }
        }
        if (h < waterLevel) {
          for (let y = h + 1; y <= waterLevel; y++) {
            setB(x, y, z, WATER);
          }
        }
      }
    }

    // Waterfall cascading from cliff (9, 12, -9) into the lake
    for (let y = waterLevel; y <= 13; y++) {
      setB(8, y, -8, WATER);
      setB(9, y, -8, WATER);
      if (y === 13) setB(9, y, -9, WATER);
    }

    // Add trees & wildflowers
    const placeTree = (tx, tz, birch = false) => {
      let groundY = -1;
      for (let y = H - 2; y >= 1; y--) {
        if (getB(tx, y, tz) === GRASS) { groundY = y; break; }
      }
      if (groundY < 0 || groundY >= H - 7) return;
      const trunk = 4;
      for (let y = 1; y <= trunk; y++) setB(tx, groundY + y, tz, birch ? BIRCH_LOG : LOG);
      for (let ly = groundY + trunk - 1; ly <= groundY + trunk + 2; ly++) {
        const rad = ly >= groundY + trunk + 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) {
          for (let dx = -rad; dx <= rad; dx++) {
            if (Math.abs(dx) === rad && Math.abs(dz) === rad && ((dx + dz + ly) & 1)) continue;
            if (getB(tx + dx, ly, tz + dz) === AIR) {
              setB(tx + dx, ly, tz + dz, LEAVES);
            }
          }
        }
      }
    };

    const treeCoords = [
      [-11, -9, false], [-15, 2, true], [-9, 11, false], [12, 10, true],
      [15, -1, false], [-5, -14, true], [3, 14, false], [-17, -12, false], [17, 13, true],
    ];
    for (const [tx, tz, isBirch] of treeCoords) placeTree(tx, tz, isBirch);

    // Scatter tiny warm flowers
    for (let z = -R + 2; z <= R - 2; z += 3) {
      for (let x = -R + 2; x <= R - 2; x += 3) {
        if (((x * 13 + z * 7) & 3) !== 0) continue;
        for (let y = H - 2; y >= 5; y--) {
          if (getB(x, y, z) === GRASS && getB(x, y + 1, z) === AIR) {
            setB(x, y + 1, z, FLOWER);
            break;
          }
        }
      }
    }

    const PALETTE = {
      [GRASS]: [0.39, 0.72, 0.25],
      [DIRT]: [0.53, 0.37, 0.24],
      [STONE]: [0.50, 0.52, 0.55],
      [WATER]: [0.19, 0.48, 0.85],
      [LOG]: [0.42, 0.29, 0.17],
      [BIRCH_LOG]: [0.85, 0.84, 0.80],
      [LEAVES]: [0.27, 0.58, 0.19],
      [SAND]: [0.85, 0.80, 0.58],
      [FLOWER]: [0.95, 0.82, 0.18],
    };

    const FACES = [
      { dir: [0, 1, 0], shade: 1.0, v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
      { dir: [0, -1, 0], shade: 0.56, v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { dir: [1, 0, 0], shade: 0.78, v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
      { dir: [-1, 0, 0], shade: 0.72, v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      { dir: [0, 0, 1], shade: 0.86, v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      { dir: [0, 0, -1], shade: 0.82, v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
    ];

    const solidPos = [];
    const solidCol = [];
    const solidIdx = [];
    const waterPos = [];
    const waterCol = [];
    const waterIdx = [];

    const pushCubeFace = (posArr, colArr, idxArr, wx, y, wz, f, rgb) => {
      const baseV = posArr.length / 3;
      const hash = (((wx * 73856093) ^ (y * 19349663) ^ (wz * 83492791)) & 15) / 15 - 0.5;
      const tint = 1 + hash * 0.08;
      for (let i = 0; i < 4; i++) {
        posArr.push(wx + f.v[i][0], y + f.v[i][1], wz + f.v[i][2]);
        colArr.push(
          Math.min(1, Math.max(0, rgb[0] * f.shade * tint)),
          Math.min(1, Math.max(0, rgb[1] * f.shade * tint)),
          Math.min(1, Math.max(0, rgb[2] * f.shade * tint))
        );
      }
      idxArr.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
    };

    for (let y = 0; y < H; y++) {
      for (let z = -R; z <= R; z++) {
        for (let x = -R; x <= R; x++) {
          const id = getB(x, y, z);
          if (id === AIR) continue;
          const isWater = id === WATER;
          const rgb = PALETTE[id] || PALETTE[STONE];
          for (const f of FACES) {
            const nid = getB(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
            if (isWater) {
              if (nid !== AIR) continue;
              const topShrink = f.dir[1] === 1 ? -0.12 : 0;
              const baseV = waterPos.length / 3;
              for (let i = 0; i < 4; i++) {
                const vy = f.v[i][1] === 1 ? y + 1 + topShrink : y;
                waterPos.push(x + f.v[i][0], vy, z + f.v[i][2]);
                waterCol.push(rgb[0] * f.shade, rgb[1] * f.shade, rgb[2] * f.shade);
              }
              waterIdx.push(baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3);
            } else {
              if (nid !== AIR && nid !== WATER && nid !== FLOWER) continue;
              // Grass side uses dirt tint
              const useRgb = (id === GRASS && f.dir[1] !== 1) ? PALETTE[DIRT] : rgb;
              if (id === FLOWER) {
                if (f.dir[1] !== 1) continue;
                pushCubeFace(solidPos, solidCol, solidIdx, x, y - 0.85, z, f, rgb);
              } else {
                pushCubeFace(solidPos, solidCol, solidIdx, x, y, z, f, useRgb);
              }
            }
          }
        }
      }
    }

    const solidGeom = new THREE.BufferGeometry();
    solidGeom.setAttribute('position', new THREE.Float32BufferAttribute(solidPos, 3));
    solidGeom.setAttribute('color', new THREE.Float32BufferAttribute(solidCol, 3));
    solidGeom.setIndex(solidIdx);
    const solidMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
    this.voxelMesh = new THREE.Mesh(solidGeom, solidMat);
    this.scene.add(this.voxelMesh);
    this.disposables.push(solidGeom, solidMat);

    if (waterIdx.length > 0) {
      const waterGeom = new THREE.BufferGeometry();
      waterGeom.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3));
      waterGeom.setAttribute('color', new THREE.Float32BufferAttribute(waterCol, 3));
      waterGeom.setIndex(waterIdx);
      const waterMat = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.82,
        fog: true,
      });
      this.waterMesh = new THREE.Mesh(waterGeom, waterMat);
      this.scene.add(this.waterMesh);
      this.disposables.push(waterGeom, waterMat);
    }

    // 3. Drifting voxel cloud strip
    this.cloudGroup = new THREE.Group();
    const cloudGeom = new THREE.BoxGeometry(6.5, 1.0, 4.2);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.86, fog: true });
    this.disposables.push(cloudGeom, cloudMat);
    const cloudOffsets = [[-14, 19, -12], [6, 20, -16], [16, 18, 9], [-12, 20, 14], [0, 21, 18]];
    for (const [cx, cy, cz] of cloudOffsets) {
      const cm = new THREE.Mesh(cloudGeom, cloudMat);
      cm.position.set(cx, cy, cz);
      this.cloudGroup.add(cm);
    }
    this.scene.add(this.cloudGroup);
  }

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(renderer, dt) {
    this.elapsed += dt;
    this.yaw += dt * 0.068;
    const bob = Math.sin(this.elapsed * 0.4) * 0.35;
    this.camera.position.set(Math.sin(this.yaw * 0.5) * 2.5, 11.2 + bob, Math.cos(this.yaw * 0.5) * 2.5);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + Math.sin(this.yaw * 0.6) * 0.04;
    if (this.cloudGroup) {
      this.cloudGroup.rotation.y = this.elapsed * 0.015;
    }
    renderer.clear();
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.remove(this.boxMesh);
    this.boxMesh.geometry.dispose();
    if (Array.isArray(this.boxMesh.material)) {
      for (const m of this.boxMesh.material) m.dispose();
    }
    for (const t of this.textures) t.dispose();
    if (this.voxelMesh) this.scene.remove(this.voxelMesh);
    if (this.waterMesh) this.scene.remove(this.waterMesh);
    if (this.cloudGroup) this.scene.remove(this.cloudGroup);
    for (const d of this.disposables) d.dispose?.();
  }
}
