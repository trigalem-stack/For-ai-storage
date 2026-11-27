import * as THREE from '../../vendor/three.module.min.js';

/**
 * Lightweight animated 3D panorama backdrop for the Main Menu (inspired by Minecraft's
 * classic rotating panorama). Uses a single 6-face procedural skybox cube with zero chunk
 * generation or streaming so the menu stays ultra-smooth (60 FPS) on every phone and PC.
 */
export class MenuPanorama {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      76,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      50
    );
    this.yaw = 0;
    this.pitch = -0.06;

    const materials = [];
    const faces = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
    this.textures = [];

    for (const face of faces) {
      const tex = this._paintPanoramaFace(face);
      this.textures.push(tex);
      materials.push(new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        depthWrite: false,
      }));
    }

    const geom = new THREE.BoxGeometry(20, 20, 20);
    this.boxMesh = new THREE.Mesh(geom, materials);
    this.scene.add(this.boxMesh);
  }

  _paintPanoramaFace(face) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    if (face === 'py') {
      // Bright azure zenith with blocky clouds matching side-top #69a9f6 seamlessly
      g.fillStyle = '#69a9f6';
      g.fillRect(0, 0, size, size);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(14, 22, 34, 14);
      g.fillRect(72, 48, 40, 18);
      g.fillRect(28, 86, 36, 12);
    } else if (face === 'ny') {
      // Deep lake floor matching lower horizon #3372bc seamlessly
      g.fillStyle = '#3372bc';
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#487d2e';
      g.fillRect(0, 0, 32, 32);
      g.fillRect(96, 80, 32, 48);
    } else {
      // Side horizon faces: sky -> mountains -> forests -> water -> grass hills
      const sky = g.createLinearGradient(0, 0, 0, size * 0.56);
      sky.addColorStop(0, '#69a9f6');
      sky.addColorStop(1, '#bce0ff');
      g.fillStyle = sky;
      g.fillRect(0, 0, size, Math.floor(size * 0.56));

      // Sun on +Z face
      if (face === 'pz') {
        g.fillStyle = '#fff5b8';
        g.fillRect(42, 16, 16, 16);
        g.fillStyle = '#ffffff';
        g.fillRect(46, 20, 8, 8);
      }

      // Clouds
      g.fillStyle = 'rgba(255, 255, 255, 0.85)';
      g.fillRect(8, 22, 26, 6);
      g.fillRect(74, 18, 34, 7);

      // Distant pixel mountains
      const seedOff = face.charCodeAt(0) * 19 + face.charCodeAt(1) * 7;
      for (let x = 0; x < size; x += 4) {
        const mh = 12 + Math.floor(Math.abs(Math.sin((x + seedOff) * 0.065)) * 24);
        const topY = 66 - mh;
        g.fillStyle = '#6f8096';
        g.fillRect(x, topY, 4, mh);
        if (mh > 25) {
          g.fillStyle = '#f2f7fc';
          g.fillRect(x, topY, 4, 5);
        }
      }

      // Lake & sunlit plains foreground
      g.fillStyle = '#3372bc';
      g.fillRect(0, 68, size, 60);

      for (let x = 0; x < size; x += 4) {
        const gh = 68 + Math.floor(Math.sin((x + seedOff * 2) * 0.09) * 8);
        if (x % 24 < 16) {
          g.fillStyle = '#5fa440';
          g.fillRect(x, gh, 4, 60);
          g.fillStyle = '#487d2e';
          g.fillRect(x, gh + 6, 4, 54);
          // Pixel trees
          if ((x + seedOff) % 20 === 0) {
            g.fillStyle = '#6b4a2b';
            g.fillRect(x + 1, gh - 8, 2, 8);
            g.fillStyle = '#3f7c2a';
            g.fillRect(x - 3, gh - 15, 10, 8);
          }
        }
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

  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  render(renderer, dt) {
    this.yaw += dt * 0.085;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + Math.sin(this.yaw * 0.7) * 0.035;
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
  }
}
