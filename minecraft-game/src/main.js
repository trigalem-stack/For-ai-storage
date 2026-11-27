import * as THREE from '../vendor/three.module.min.js';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_MODES,
  DEFAULT_RENDER_DISTANCE_MOBILE,
  DEFAULT_RENDER_DISTANCE_PC,
  TICK_MS,
} from './constants.js';
import { FirstPersonHand } from './player/FirstPersonHand.js';
import { PlayerController } from './player/PlayerController.js';
import { PlayerModel, createSteveSkinTexture } from './player/PlayerSkin.js';
import { SaveManager } from './storage/SaveManager.js';
import { TextureAtlas } from './textures/TextureAtlas.js';
import { Hud } from './ui/Hud.js';
import { MobileControls } from './ui/MobileControls.js';
import { World } from './world/World.js';

function randomWorldSeed() {
  return (Math.floor(Math.random() * 0x7fffffff) + 1) | 0;
}

class MinecraftGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingStatus = document.getElementById('loading-status');

    this.saveManager = new SaveManager();
    this.atlas = new TextureAtlas();
    this.skinTexture = createSteveSkinTexture();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      72,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.08,
      600
    );

    // Lighting for 3rd-person Steve model (terrain uses baked AO + directional face shade)
    const entityAmbient = new THREE.AmbientLight(0xffffff, 0.72);
    const entitySun = new THREE.DirectionalLight(0xfff6e5, 0.75);
    entitySun.position.set(1.2, 2.2, 1.0);
    this.scene.add(entityAmbient, entitySun);

    const isTouchDevice = MobileControls.detectTouchDevice();
    this.isTouchMode = isTouchDevice;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.playerModel = new PlayerModel(this.skinTexture);
    this.scene.add(this.playerModel.root);

    this.firstPersonHand = new FirstPersonHand(this.skinTexture);

    this.world = null;
    this.player = null;
    this.mobileControls = null;
    this.hud = null;

    this.worldSeed = randomWorldSeed();
    this.renderDistance = isTouchDevice ? DEFAULT_RENDER_DISTANCE_MOBILE : DEFAULT_RENDER_DISTANCE_PC;

    this.lastFrameTime = performance.now();
    this.tickAccumulator = 0;
    this.tickCount = 0;
    this.autosaveTimer = null;
    this.isRunning = false;

    // Expose debug hook for automated inspection & future stage modules
    window.__MC_GAME__ = this;
  }

  _applyPixelRatio() {
    const cap = this.isTouchMode ? 1.5 : 2.0;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  async init() {
    this._setLoadingText('Инициализация сохранений...');
    await this.saveManager.init();
    const saved = await this.saveManager.loadState();

    if (saved) {
      if (Number.isFinite(saved.worldSeed)) this.worldSeed = saved.worldSeed;
      if (saved.settings) {
        if (typeof saved.settings.touchMode === 'boolean') {
          this.isTouchMode = saved.settings.touchMode;
        }
        if (Number.isFinite(saved.settings.renderDistance)) {
          this.renderDistance = saved.settings.renderDistance;
        }
      }
    }

    this._applyPixelRatio();
    this._setLoadingText(`Генерация мира (Seed: ${this.worldSeed})...`);

    this.world = new World(this.scene, this.atlas, this.worldSeed, this.renderDistance);
    const spawn = saved?.player ?? this.world.worldGen.findSafeSpawn();

    this.player = new PlayerController(this.camera, this.world, this.playerModel, this.firstPersonHand, {
      ...spawn,
      onCameraModeChange: (mode) => this.hud?.onCameraModeChanged(mode),
      onToggleDebug: () => this.hud?.toggleDebug(),
      onTogglePause: () => this.hud?.togglePause(),
      onFlyModeChange: (active) => {
        this.hud?.setFlyModeLabel(active);
        this.mobileControls?.setFlyActive(active);
      },
    });

    // Synchronously prepare spawn chunks before hiding loading screen
    this.world.preloadSpawnArea(this.player.x, this.player.z, 2);
    if (!saved?.player) {
      this.player.y = Math.max(this.player.y, this.world.getSurfaceHeightAt(this.player.x, this.player.z));
    }

    this.hud = new Hud({
      onCycleCamera: () => this.player.cycleCameraMode(),
      onPauseChange: (paused) => {
        this.player.setPaused(paused);
        this.hud.setPointerLocked(this.player.pointerLocked);
      },
      onResume: () => {
        if (!this.isTouchMode) {
          this._requestPointerLockSafe();
        }
      },
      onToggleControlMode: () => {
        this.setTouchMode(!this.isTouchMode);
      },
      onToggleFlyMode: () => {
        const active = this.player.toggleFlyMode();
        this.hud.setFlyModeLabel(active);
        this.mobileControls.setFlyActive(active);
        this.hud.showToast(active ? 'Режим полёта: ВКЛ' : 'Режим полёта: ВЫКЛ');
      },
      onChangeRenderDistance: (dist) => {
        this.renderDistance = dist;
        this.world.setRenderDistance(dist);
        this.saveNow();
      },
      onNewWorld: () => this.regenerateNewWorld(),
    });

    this.mobileControls = new MobileControls(this.player, {
      onStatusToast: (msg) => this.hud.showToast(msg),
    });

    this.setTouchMode(this.isTouchMode, false);
    this.hud.setFlyModeLabel(this.player.flyMode);
    this.mobileControls.setFlyActive(this.player.flyMode);
    this.hud.setRenderDistanceUI(this.renderDistance);

    this._bindWindowEvents();
    this._bindPointerLock();
    this._startAutosave();

    // Save initial spawn immediately so refresh restores exact world
    await this.saveNow();

    this.loadingOverlay?.classList.add('hidden');
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _setLoadingText(text) {
    if (this.loadingStatus) this.loadingStatus.textContent = text;
  }

  setTouchMode(enabled, showNotice = true) {
    this.isTouchMode = Boolean(enabled);
    this._applyPixelRatio();
    this.mobileControls?.setEnabled(this.isTouchMode);
    this.hud?.setTouchModeLabel(this.isTouchMode);
    if (this.isTouchMode && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    if (showNotice) {
      this.hud?.showToast(this.isTouchMode ? 'Режим: Сенсорный (Телефон)' : 'Режим: ПК (Мышь + WASD)');
      this.saveNow();
    }
  }

  async regenerateNewWorld() {
    this.hud?.setPaused(false);
    this.loadingOverlay?.classList.remove('hidden');
    this._setLoadingText('Создание нового мира...');

    this.world.dispose();
    this.worldSeed = randomWorldSeed();
    this.world = new World(this.scene, this.atlas, this.worldSeed, this.renderDistance);
    this.player.world = this.world;

    const spawn = this.world.worldGen.findSafeSpawn();
    this.player.setPose({
      ...spawn,
      yaw: 0,
      pitch: -0.12,
      flyMode: false,
    });
    this.hud.setFlyModeLabel(false);
    this.mobileControls.setFlyActive(false);

    this.world.preloadSpawnArea(this.player.x, this.player.z, 2);
    this.player.y = Math.max(this.player.y, this.world.getSurfaceHeightAt(this.player.x, this.player.z));
    await this.saveNow();

    this.loadingOverlay?.classList.add('hidden');
    this.hud.showToast(`Новый мир создан (Seed: ${this.worldSeed})`);
  }

  _requestPointerLockSafe() {
    if (this.isTouchMode || this.hud?.isPaused) return;
    try {
      const promise = this.canvas.requestPointerLock?.();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {});
      }
    } catch {
      // Ignore browser pointer lock denial
    }
  }

  _bindPointerLock() {
    this.canvas.addEventListener('click', () => {
      if (!this.isTouchMode && !this.hud.isPaused && document.pointerLockElement !== this.canvas) {
        this._requestPointerLockSafe();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.player.pointerLocked = locked;
      this.hud.setPointerLocked(locked);
    });

    // Auto-switch to touch mode if user interacts by touch while in PC mode
    window.addEventListener('touchstart', () => {
      if (!this.isTouchMode) {
        this.setTouchMode(true, false);
      }
    }, { once: true, passive: true });
  }

  _bindWindowEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.firstPersonHand.resize(w, h);
      this._applyPixelRatio();
      this.renderer.setSize(w, h, false);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.saveNow();
      }
    });

    window.addEventListener('pagehide', () => {
      this.saveNow();
    });
  }

  _startAutosave() {
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = setInterval(() => {
      this.saveNow();
    }, AUTOSAVE_INTERVAL_MS);
  }

  saveNow() {
    if (!this.player) return Promise.resolve(false);
    return this.saveManager.saveState({
      worldSeed: this.worldSeed,
      player: this.player.getPose(),
      settings: {
        touchMode: this.isTouchMode,
        renderDistance: this.renderDistance,
      },
    });
  }

  /**
   * Fixed 20 TPS simulation tick (reserved cleanly for Stages 2-12: physics, fluids, mobs, redstone).
   */
  fixedTick() {
    this.tickCount++;
  }

  _loop(now) {
    if (!this.isRunning) return;
    requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    if (!this.hud.isPaused) {
      this.tickAccumulator += dt * 1000;
      while (this.tickAccumulator >= TICK_MS) {
        this.fixedTick();
        this.tickAccumulator -= TICK_MS;
      }

      this.player.update(dt);
      this.world.update(this.player.x, this.player.z);
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    if (this.player.cameraMode === CAMERA_MODES.FIRST_PERSON) {
      this.firstPersonHand.render(this.renderer);
    }

    this.hud.updateDebug({
      player: this.player,
      world: this.world,
      renderer: this.renderer,
    });
  }
}

// Register offline Service Worker only on HTTP(S) origins (safe for file:// standalone HTML)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

const game = new MinecraftGame();
game.init().catch((err) => {
  console.error('Failed to initialize Minecraft Clone:', err);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = `Ошибка запуска: ${err.message}`;
});
