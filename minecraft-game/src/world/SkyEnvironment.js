import * as THREE from '../../vendor/three.module.min.js';

/**
 * Lightweight Sky Dome + Sun + drifting Minecraft-style pixel Cloud layer
 * for rich atmosphere without impacting chunk/frame budget.
 */
export class SkyEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;

    // 1. Gradient Sky Dome (horizon bright azure -> zenith deep sky blue)
    const skyGeom = new THREE.SphereGeometry(420, 20, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#4789eb') },
        horizonColor: { value: new THREE.Color('#a4d4ff') },
        bottomColor: { value: new THREE.Color('#6ea8e6') },
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vLocalPos;
        void main() {
          float h = normalize(vLocalPos).y;
          vec3 col = h >= 0.0
            ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
            : mix(horizonColor, bottomColor, clamp(-h * 3.0, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeom, skyMat);
    this.skyDome.renderOrder = -2;
    this.scene.add(this.skyDome);

    // 2. Classic square Minecraft Sun high in sky
    const sunGeom = new THREE.PlaneGeometry(34, 34);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff5c0,
      fog: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.sunMesh = new THREE.Mesh(sunGeom, sunMat);
    this.sunOffset = new THREE.Vector3(140, 230, -160);
    this.sunMesh.renderOrder = -1;
    this.scene.add(this.sunMesh);

    // 3. Drifting voxel-style cloud layer
    this.cloudGroup = this._buildClouds();
    this.scene.add(this.cloudGroup);
    this.cloudDrift = 0;
  }

  _buildClouds() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);

    let s = 918273;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    for (let i = 0; i < 42; i++) {
      const cx = Math.floor(rand() * 64);
      const cz = Math.floor(rand() * 64);
      const rw = 2 + Math.floor(rand() * 5);
      const rh = 2 + Math.floor(rand() * 4);
      g.fillStyle = rand() > 0.3 ? 'rgba(255,255,255,0.88)' : 'rgba(235,244,255,0.78)';
      for (let dz = 0; dz < rh; dz++) {
        for (let dx = 0; dx < rw; dx++) {
          g.fillRect((cx + dx) & 63, (cz + dz) & 63, 1, 1);
        }
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);

    const geom = new THREE.PlaneGeometry(760, 760);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = 132;
    this.cloudTex = tex;
    return mesh;
  }

  setCloudsEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.cloudGroup.visible = this.enabled;
  }

  update(dt, playerX, playerY, playerZ) {
    this.skyDome.position.set(playerX, playerY, playerZ);
    this.sunMesh.position.set(
      playerX + this.sunOffset.x,
      playerY + this.sunOffset.y,
      playerZ + this.sunOffset.z
    );
    this.sunMesh.lookAt(playerX, playerY, playerZ);

    if (this.enabled) {
      this.cloudDrift += dt * 0.0025;
      this.cloudTex.offset.set(this.cloudDrift, this.cloudDrift * 0.35);
      this.cloudGroup.position.set(playerX, 132, playerZ);
    }
  }

  dispose() {
    this.scene.remove(this.skyDome, this.sunMesh, this.cloudGroup);
    this.skyDome.geometry.dispose();
    this.skyDome.material.dispose();
    this.sunMesh.geometry.dispose();
    this.sunMesh.material.dispose();
    this.cloudGroup.geometry.dispose();
    this.cloudGroup.material.dispose();
    this.cloudTex?.dispose();
  }
}
