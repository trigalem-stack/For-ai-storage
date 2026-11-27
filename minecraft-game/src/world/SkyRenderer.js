import * as THREE from '../../vendor/three.module.min.js';
import { CLOUD_HEIGHT_MAX, CLOUD_HEIGHT_MIN, DAY_LENGTH_TICKS, DEFAULT_WORLD_TIME } from '../constants.js';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/**
 * Full 24,000-tick Minecraft Day/Night cycle renderer:
 * - Sky gradient dome with directional sunset/sunrise horizon glow
 * - Diametrically opposite pixel 3D Sun & 8-phase pixel 3D Moon
 * - Twinkling starfield during twilight & night
 * - Single-draw-call volumetric 3D voxel clouds at Y=108..112 (toggleable)
 * - Drives ChunkMesher shader lighting uniforms + Fog color with 0 ms chunk CPU overhead
 */
export class SkyRenderer {
  constructor(scene, initialTime = DEFAULT_WORLD_TIME, initialDay = 1) {
    this.scene = scene;
    this.worldTime = ((initialTime % DAY_LENGTH_TICKS) + DAY_LENGTH_TICKS) % DAY_LENGTH_TICKS;
    this.dayCount = Math.max(1, initialDay | 0);
    this.cloudsEnabled = true;
    this.cloudScroll = 0;

    this.sunIntensity = 1.0;
    this.skyTint = new THREE.Color('#ffffff');
    this.torchTint = new THREE.Color('#fff3dc');
    this.fogColor = new THREE.Color('#a4d4ff');

    this._sunDir = new THREE.Vector3(0, 1, 0);
    this._cDayTop = new THREE.Color('#4488eb');
    this._cDayHor = new THREE.Color('#a4d4ff');
    this._cSunsetTop = new THREE.Color('#3f4c8c');
    this._cSunsetHor = new THREE.Color('#f4844a');
    this._cNightTop = new THREE.Color('#091124');
    this._cNightHor = new THREE.Color('#162646');
    this._cSunTintDay = new THREE.Color('#ffffff');
    this._cSunTintSunset = new THREE.Color('#ffd3a8');
    this._cSunTintNight = new THREE.Color('#92ade8');
    this._cCloudColor = new THREE.Color('#ffffff');

    // 1. Sky Gradient Dome
    const skyGeom = new THREE.SphereGeometry(430, 24, 14);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#4488eb') },
        horizonColor: { value: new THREE.Color('#a4d4ff') },
        bottomColor: { value: new THREE.Color('#5a90cb') },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        glowColor: { value: new THREE.Color('#ff8438') },
        glowStrength: { value: 0.0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        uniform vec3 glowColor;
        uniform float glowStrength;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 base = h >= 0.0
            ? mix(horizonColor, topColor, pow(max(clamp(h, 0.0, 1.0), 0.0001), 0.52))
            : mix(horizonColor, bottomColor, clamp(-h * 3.5, 0.0, 1.0));
          float sunDot = max(dot(vDir, normalize(sunDir)), 0.0);
          float horizonMask = 1.0 - smoothstep(0.0, 0.55, abs(h));
          float glow = pow(max(sunDot, 0.0001), 3.5) * horizonMask * glowStrength;
          vec3 col = mix(base, glowColor, clamp(glow, 0.0, 0.92));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeom, this.skyMat);
    this.skyDome.renderOrder = -4;
    this.scene.add(this.skyDome);

    // 2. Twinkling Starfield (visible at night)
    this.starsGroup = this._buildStars();
    this.scene.add(this.starsGroup);

    // 3. Pixel 3D Square Sun & 8-Phase Moon
    this.sunMesh = this._buildSun();
    this.moonPhaseDrawn = -1;
    this.moonMesh = this._buildMoon();
    this._redrawMoonPhase(this._getMoonPhase());
    this.scene.add(this.sunMesh, this.moonMesh);

    // 4. Single-draw-call Volumetric 3D Voxel Clouds (Y=108..112)
    this.cloudBandWidth = 768;
    this.cloudMesh = this._buildVolumetricClouds();
    this.scene.add(this.cloudMesh);

    this._updateVisuals(0);
  }

  _getMoonPhase() {
    return ((this.dayCount - 1) % 8 + 8) % 8;
  }

  _buildSun() {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const g = c.getContext('2d');
    g.fillStyle = '#ffdf73';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#fff9d6';
    g.fillRect(2, 2, 12, 12);
    g.fillStyle = '#ffffff';
    g.fillRect(4, 4, 8, 8);

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sunTex = tex;

    const geom = new THREE.PlaneGeometry(40, 40);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = -2;
    return mesh;
  }

  _buildMoon() {
    this.moonCanvas = document.createElement('canvas');
    this.moonCanvas.width = 24;
    this.moonCanvas.height = 24;
    this.moonCtx = this.moonCanvas.getContext('2d');
    this.moonTex = new THREE.CanvasTexture(this.moonCanvas);
    this.moonTex.magFilter = THREE.NearestFilter;
    this.moonTex.minFilter = THREE.NearestFilter;
    this.moonTex.colorSpace = THREE.SRGBColorSpace;

    const geom = new THREE.PlaneGeometry(34, 34);
    const mat = new THREE.MeshBasicMaterial({
      map: this.moonTex,
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = -2;
    return mesh;
  }

  _redrawMoonPhase(phase) {
    if (this.moonPhaseDrawn === phase) return;
    this.moonPhaseDrawn = phase;
    const g = this.moonCtx;
    const S = 24;
    g.clearRect(0, 0, S, S);

    // Draw 8 authentic Minecraft moon phases inside 16x16 core of 24x24 sprite
    // Phase 0: Full, 1: Waning Gibbous, 2: Third Quarter, 3: Waning Crescent,
    // 4: New, 5: Waxing Crescent, 6: First Quarter, 7: Waxing Gibbous
    const ox = 4;
    const oy = 4;
    const w = 16;

    // Faint dark lunar silhouette
    g.fillStyle = 'rgba(26, 34, 58, 0.72)';
    g.fillRect(ox, oy, w, w);

    const litBounds = [
      [0, 16],  // 0: Full
      [4, 16],  // 1: Waning Gibbous
      [8, 16],  // 2: Last Quarter
      [12, 16], // 3: Waning Crescent
      [0, 0],   // 4: New Moon (tiny faint rim)
      [0, 4],   // 5: Waxing Crescent
      [0, 8],   // 6: First Quarter
      [0, 12],  // 7: Waxing Gibbous
    ][phase];

    const [lx0, lx1] = litBounds;
    for (let py = 0; py < w; py++) {
      for (let px = 0; px < w; px++) {
        const isLit = px >= lx0 && px < lx1;
        if (!isLit) continue;
        const crater = ((px * 13 + py * 29) % 17 === 0) || ((px * 7 + py * 11) % 23 === 0);
        g.fillStyle = crater ? '#b9c4de' : ((px === lx0 || px === lx1 - 1 || py === 0 || py === 15) ? '#d0daef' : '#edf2ff');
        g.fillRect(ox + px, oy + py, 1, 1);
      }
    }

    if (phase === 4) {
      g.strokeStyle = 'rgba(130, 150, 195, 0.55)';
      g.lineWidth = 1;
      g.strokeRect(ox + 0.5, oy + 0.5, w - 1, w - 1);
    }

    this.moonTex.needsUpdate = true;
  }

  _buildStars() {
    const count = 420;
    const positions = new Float32Array(count * 3);
    let s = 421973;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const dist = 395;
      positions[i * 3] = dist * r * Math.cos(theta);
      positions[i * 3 + 1] = dist * u;
      positions[i * 3 + 2] = dist * r * Math.sin(theta);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xe6eeff,
      size: 2.3,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const pts = new THREE.Points(geom, this.starMat);
    pts.renderOrder = -3;
    return pts;
  }

  /**
   * Builds a single batched 3D voxel cloud BufferGeometry spanning Y=108..112.
   */
  _buildVolumetricClouds() {
    const cell = 12;
    const grid = 32; // 32 * 12 = 384 units tileable block
    const span = cell * grid;
    this.cloudSpan = span;

    // Procedural organic voxel cloud map
    const map = new Uint8Array(grid * grid);
    let s = 881723;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 34; i++) {
      const cx = Math.floor(rand() * grid);
      const cz = Math.floor(rand() * grid);
      const rw = 2 + Math.floor(rand() * 4);
      const rh = 2 + Math.floor(rand() * 3);
      for (let dz = 0; dz < rh; dz++) {
        for (let dx = 0; dx < rw; dx++) {
          map[((cz + dz) % grid) * grid + ((cx + dx) % grid)] = 1;
        }
      }
    }

    const pos = [];
    const col = [];
    const idx = [];
    const y0 = CLOUD_HEIGHT_MIN;
    const y1 = CLOUD_HEIGHT_MAX;
    const half = span * 0.5;

    const pushBoxFace = (x0, yy0, z0, x1, yy1, z1, shade, nx, ny, nz) => {
      const base = pos.length / 3;
      if (ny > 0) {
        pos.push(x0, yy1, z1, x1, yy1, z1, x1, yy1, z0, x0, yy1, z0);
      } else if (ny < 0) {
        pos.push(x0, yy0, z0, x1, yy0, z0, x1, yy0, z1, x0, yy0, z1);
      } else if (nz > 0) {
        pos.push(x0, yy0, z1, x1, yy0, z1, x1, yy1, z1, x0, yy1, z1);
      } else if (nz < 0) {
        pos.push(x1, yy0, z0, x0, yy0, z0, x0, yy1, z0, x1, yy1, z0);
      } else if (nx > 0) {
        pos.push(x1, yy0, z1, x1, yy0, z0, x1, yy1, z0, x1, yy1, z1);
      } else {
        pos.push(x0, yy0, z0, x0, yy0, z1, x0, yy1, z1, x0, yy1, z0);
      }
      for (let i = 0; i < 4; i++) col.push(shade, shade, shade);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    // Build 2x2 tiled footprint around player so clouds seamlessly wrap forever
    for (let tz = -1; tz <= 0; tz++) {
      for (let tx = -1; tx <= 0; tx++) {
        const offX = tx * span;
        const offZ = tz * span;
        for (let gz = 0; gz < grid; gz++) {
          for (let gx = 0; gx < grid; gx++) {
            if (!map[gz * grid + gx]) continue;
            const x0 = offX + gx * cell;
            const x1 = x0 + cell;
            const z0 = offZ + gz * cell;
            const z1 = z0 + cell;
            pushBoxFace(x0, y0, z0, x1, y1, z1, 1.0, 0, 1, 0);
            pushBoxFace(x0, y0, z0, x1, y1, z1, 0.78, 0, -1, 0);
            if (!map[((gz + 1) % grid) * grid + gx]) pushBoxFace(x0, y0, z0, x1, y1, z1, 0.90, 0, 0, 1);
            if (!map[((gz - 1 + grid) % grid) * grid + gx]) pushBoxFace(x0, y0, z0, x1, y1, z1, 0.88, 0, 0, -1);
            if (!map[gz * grid + ((gx + 1) % grid)]) pushBoxFace(x0, y0, z0, x1, y1, z1, 0.84, 1, 0, 0);
            if (!map[gz * grid + ((gx - 1 + grid) % grid)]) pushBoxFace(x0, y0, z0, x1, y1, z1, 0.82, -1, 0, 0);
          }
        }
      }
    }

    // Center mesh around (0, 0)
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += half * 0.5;
      pos[i + 2] += half * 0.5;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geom.setIndex(idx);

    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      fog: true,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geom, this.cloudMat);
    mesh.renderOrder = -1;
    return mesh;
  }

  setCloudsEnabled(enabled) {
    this.cloudsEnabled = Boolean(enabled);
    this.cloudMesh.visible = this.cloudsEnabled;
  }

  setTime(ticks, dayCount = null) {
    const wrapped = ((ticks % DAY_LENGTH_TICKS) + DAY_LENGTH_TICKS) % DAY_LENGTH_TICKS;
    this.worldTime = wrapped;
    if (Number.isFinite(dayCount) && dayCount >= 1) {
      this.dayCount = Math.floor(dayCount);
    }
    this._redrawMoonPhase(this._getMoonPhase());
    this._updateVisuals(0);
  }

  advanceTicks(tickDelta) {
    const total = this.worldTime + tickDelta;
    if (total >= DAY_LENGTH_TICKS) {
      this.dayCount += Math.floor(total / DAY_LENGTH_TICKS);
      this.worldTime = total % DAY_LENGTH_TICKS;
      this._redrawMoonPhase(this._getMoonPhase());
    } else {
      this.worldTime = total;
    }
  }

  sleepToMorning() {
    this.dayCount += 1;
    this.worldTime = 0;
    this._redrawMoonPhase(this._getMoonPhase());
    this._updateVisuals(0);
  }

  getFormattedClock() {
    // Tick 0 = 06:00, 6000 = 12:00, 12000 = 18:00, 18000 = 00:00
    const shifted = (this.worldTime + 6000) % DAY_LENGTH_TICKS;
    const totalMinutes = Math.floor((shifted / DAY_LENGTH_TICKS) * 1440);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  _updateVisuals(dt) {
    // Sun angle: 0 at sunrise (east +X), PI/2 at noon (+Y), PI at sunset (-X), 3PI/2 at midnight (-Y)
    const angle = (this.worldTime / DAY_LENGTH_TICKS) * Math.PI * 2;
    const sunX = Math.cos(angle);
    const sunY = Math.sin(angle);
    const sunZ = -0.18;
    this._sunDir.set(sunX, sunY, sunZ).normalize();

    // Daylight factor: 1.0 in full day, 0.0 at night, smooth curve around horizon
    const dayFactor = smoothstep(-0.22, 0.28, sunY);
    const twilightFactor = Math.exp(-Math.pow((sunY - 0.02) / 0.16, 2));
    const nightFactor = 1.0 - dayFactor;

    // Sky gradient colors
    const topCol = this.skyMat.uniforms.topColor.value;
    const horCol = this.skyMat.uniforms.horizonColor.value;
    const botCol = this.skyMat.uniforms.bottomColor.value;

    topCol.copy(this._cNightTop).lerp(this._cDayTop, dayFactor).lerp(this._cSunsetTop, twilightFactor * 0.55);
    horCol.copy(this._cNightHor).lerp(this._cDayHor, dayFactor).lerp(this._cSunsetHor, twilightFactor * 0.72);
    botCol.copy(horCol).multiplyScalar(0.62);

    this.skyMat.uniforms.sunDir.value.copy(this._sunDir);
    this.skyMat.uniforms.glowStrength.value = twilightFactor * 1.15;

    this.fogColor.copy(horCol);

    // Chunk shader sun intensity (1.0 day -> 0.24 moonlight night) & ambient tint
    this.sunIntensity = lerp(0.24, 1.0, dayFactor);
    this.skyTint.copy(this._cSunTintNight).lerp(this._cSunTintDay, dayFactor).lerp(this._cSunTintSunset, twilightFactor * 0.45);

    // Stars fade in gently at dusk
    this.starMat.opacity = clamp01((nightFactor - 0.28) * 1.45);
    this.starsGroup.rotation.z = angle;

    // Clouds tint & slow drift
    this._cCloudColor.setRGB(
      lerp(0.28, 1.0, dayFactor) + twilightFactor * 0.16,
      lerp(0.32, 1.0, dayFactor) + twilightFactor * 0.05,
      lerp(0.45, 1.0, dayFactor)
    );
    this.cloudMat.color.copy(this._cCloudColor);
    this.cloudMat.opacity = lerp(0.45, 0.84, dayFactor);
    this.cloudScroll = (this.cloudScroll + dt * 1.6) % this.cloudSpan;
  }

  update(dt, playerX, playerY, playerZ, world = null) {
    this._updateVisuals(dt);

    const orbitDist = 340;
    this.skyDome.position.set(playerX, playerY, playerZ);
    this.starsGroup.position.set(playerX, playerY, playerZ);

    this.sunMesh.position.set(
      playerX + this._sunDir.x * orbitDist,
      playerY + this._sunDir.y * orbitDist,
      playerZ + this._sunDir.z * orbitDist
    );
    this.sunMesh.lookAt(playerX, playerY, playerZ);
    this.sunMesh.visible = this._sunDir.y > -0.25;

    this.moonMesh.position.set(
      playerX - this._sunDir.x * orbitDist,
      playerY - this._sunDir.y * orbitDist,
      playerZ - this._sunDir.z * orbitDist
    );
    this.moonMesh.lookAt(playerX, playerY, playerZ);
    this.moonMesh.visible = -this._sunDir.y > -0.25;

    if (this.cloudsEnabled) {
      const snapX = Math.floor((playerX + this.cloudScroll) / this.cloudSpan) * this.cloudSpan;
      const snapZ = Math.floor(playerZ / this.cloudSpan) * this.cloudSpan;
      this.cloudMesh.position.set(snapX - this.cloudScroll, 0, snapZ);
    }

    if (world) {
      world.mesher.setLightingUniforms(this.sunIntensity, this.skyTint, this.torchTint);
      world.setSkyColor(this.fogColor);
    }
  }

  dispose() {
    this.scene.remove(this.skyDome, this.starsGroup, this.sunMesh, this.moonMesh, this.cloudMesh);
    this.skyDome.geometry.dispose();
    this.skyMat.dispose();
    this.starsGroup.geometry.dispose();
    this.starMat.dispose();
    this.sunMesh.geometry.dispose();
    this.sunMesh.material.dispose();
    this.sunTex?.dispose();
    this.moonMesh.geometry.dispose();
    this.moonMesh.material.dispose();
    this.moonTex?.dispose();
    this.cloudMesh.geometry.dispose();
    this.cloudMat.dispose();
  }
}
