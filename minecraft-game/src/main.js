import * as THREE from '../vendor/three.module.min.js';
import { BlockRegistry } from './blocks/BlockRegistry.js';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_MODES,
  DEFAULT_RENDER_DISTANCE_MOBILE,
  DEFAULT_RENDER_DISTANCE_PC,
  PLAYER_HALF_WIDTH,
  TICK_MS,
  WORLD_HEIGHT,
} from './constants.js';
import { ItemEntityManager } from './entities/ItemEntity.js';
import { aabbIntersectsBlock, collidesWithWorld } from './physics/AABBPhysics.js';
import { FirstPersonHand } from './player/FirstPersonHand.js';
import { PlayerController } from './player/PlayerController.js';
import { PlayerModel, createSteveSkinTexture } from './player/PlayerSkin.js';
import { SaveManager } from './storage/SaveManager.js';
import { TextureAtlas } from './textures/TextureAtlas.js';
import { Hotbar } from './ui/Hotbar.js';
import { Hud } from './ui/Hud.js';
import { MobileControls } from './ui/MobileControls.js';
import { BreakCrackOverlay, SelectionBox, raycastVoxel } from './world/Raycast.js';
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
      700
    );

    // Lighting for 3rd-person Steve model (terrain uses baked AO + directional face shade)
    const entityAmbient = new THREE.AmbientLight(0xffffff, 0.75);
    const entitySun = new THREE.DirectionalLight(0xfff6e5, 0.75);
    entitySun.position.set(1.2, 2.2, 1.0);
    this.scene.add(entityAmbient, entitySun);

    const isTouchDevice = MobileControls.detectTouchDevice();
    this.isTouchMode = isTouchDevice;
    this.unlimitedMemory = true;
    this.highQuality = !isTouchDevice;

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

    this.firstPersonHand = new FirstPersonHand(this.skinTexture, this.atlas);
    this.selectionBox = new SelectionBox(this.scene);
    this.breakOverlay = new BreakCrackOverlay(this.scene, this.atlas);
    this.itemManager = new ItemEntityManager(this.scene, this.atlas);

    this.world = null;
    this.player = null;
    this.hotbar = null;
    this.mobileControls = null;
    this.hud = null;

    this.worldSeed = randomWorldSeed();
    this.renderDistance = isTouchDevice ? DEFAULT_RENDER_DISTANCE_MOBILE : DEFAULT_RENDER_DISTANCE_PC;

    this.currentTargetHit = null;
    this.miningState = null;
    this.miningCooldown = 0;

    this.lastFrameTime = performance.now();
    this.tickAccumulator = 0;
    this.tickCount = 0;
    this.autosaveTimer = null;
    this.debouncedSaveTimer = null;
    this.isRunning = false;

    window.__MC_GAME__ = this;
  }

  _applyPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.highQuality ? (this.isTouchMode ? 2.0 : 2.5) : 1.25;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
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
        if (typeof saved.settings.unlimitedMemory === 'boolean') {
          this.unlimitedMemory = saved.settings.unlimitedMemory;
        }
        if (typeof saved.settings.highQuality === 'boolean') {
          this.highQuality = saved.settings.highQuality;
        }
      }
    }

    this._applyPixelRatio();
    this._setLoadingText(`Генерация мира (Seed: ${this.worldSeed})...`);

    this.world = new World(this.scene, this.atlas, this.worldSeed, this.renderDistance, {
      unlimitedMemory: this.unlimitedMemory,
    });
    if (saved?.modifiedBlocks) {
      this.world.loadModifiedBlocks(saved.modifiedBlocks);
    }

    const spawn = saved?.player ?? this.world.worldGen.findSafeSpawn();

    this.player = new PlayerController(this.camera, this.world, this.playerModel, this.firstPersonHand, {
      ...spawn,
      onPlaceAction: () => this._handlePlaceBlock(),
      onCameraModeChange: (mode) => this.hud?.onCameraModeChanged(mode),
      onToggleDebug: () => this.hud?.toggleDebug(),
      onTogglePause: () => this.hud?.togglePause(),
      onFlyModeChange: (active) => {
        this.hud?.setFlyModeLabel(active);
        this.mobileControls?.setFlyActive(active);
        this.hud?.showToast(active ? 'Режим полёта: ВКЛ' : 'Режим полёта: ВЫКЛ');
      },
    });

    this.world.preloadSpawnArea(this.player.x, this.player.z, 2);

    // Ensure initial spawn stands cleanly on top surface and is never inside a block
    if (!saved?.player) {
      this.player.y = this.world.getSurfaceHeightAt(this.player.x, this.player.z);
      while (
        this.player.y < WORLD_HEIGHT - 3 &&
        collidesWithWorld(this.world, this.player.x, this.player.y, this.player.z, PLAYER_HALF_WIDTH, 1.8)
      ) {
        this.player.y += 1;
      }
    }

    this.hotbar = new Hotbar(this.atlas, {
      onChange: (slot, shouldSave) => {
        this.firstPersonHand.setHeldBlock(slot ? slot.id : 0);
        if (shouldSave) this._scheduleSave();
      },
    });
    if (saved?.hotbar) {
      this.hotbar.loadState(saved.hotbar);
    }
    const initSlot = this.hotbar.getSelectedSlot();
    this.firstPersonHand.setHeldBlock(initSlot ? initSlot.id : 0);

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
        this.player.toggleFlyMode();
      },
      onToggleMemoryMode: () => {
        this.unlimitedMemory = !this.unlimitedMemory;
        this.world.setUnlimitedMemory(this.unlimitedMemory);
        this.hud.setMemoryModeLabel(this.unlimitedMemory);
        this.hud.showToast(this.unlimitedMemory ? 'Память мира: Бесконечная (∞)' : 'Память мира: Экономная');
        this.saveNow();
      },
      onToggleGraphicsMode: () => {
        this.highQuality = !this.highQuality;
        this._applyPixelRatio();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.hud.setGraphicsModeLabel(this.highQuality);
        this.hud.showToast(this.highQuality ? 'Графика: Высокая' : 'Графика: Производительная');
        this.saveNow();
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
    this.hud.setMemoryModeLabel(this.unlimitedMemory);
    this.hud.setGraphicsModeLabel(this.highQuality);
    this.hud.setRenderDistanceUI(this.renderDistance);

    this._bindWindowEvents();
    this._bindPointerLock();
    this._startAutosave();

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

    this.itemManager.clear();
    this.miningState = null;
    this.breakOverlay.update(null, 0);
    this.hud.setBreakProgress(0);

    this.world.dispose();
    this.worldSeed = randomWorldSeed();
    this.world = new World(this.scene, this.atlas, this.worldSeed, this.renderDistance, {
      unlimitedMemory: this.unlimitedMemory,
    });
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
    this.player.y = this.world.getSurfaceHeightAt(this.player.x, this.player.z);
    this.hotbar.resetStarterKit();
    await this.saveNow();

    this.loadingOverlay?.classList.add('hidden');
    this.hud.showToast(`Новый мир создан (Seed: ${this.worldSeed})`);
  }

  _handlePlaceBlock() {
    const hit = this.currentTargetHit;
    if (!hit) return false;
    if (!hit.normal || (hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 0)) {
      return false;
    }

    const slot = this.hotbar.getSelectedSlot();
    if (!slot || slot.id <= 0 || slot.count <= 0) return false;

    const px = hit.x + hit.normal.x;
    const py = hit.y + hit.normal.y;
    const pz = hit.z + hit.normal.z;

    if (py < 0 || py >= WORLD_HEIGHT) return false;

    const existing = this.world.getBlock(px, py, pz);
    if (existing !== 0 && existing !== 12) return false;

    // Prevent placing block inside the player's own AABB, while allowing pillar jumping
    if (
      aabbIntersectsBlock(
        this.player.x,
        this.player.y,
        this.player.z,
        PLAYER_HALF_WIDTH,
        this.player.getCurrentHitboxHeight(),
        px,
        py,
        pz
      )
    ) {
      return false;
    }

    if (!this.world.setBlock(px, py, pz, slot.id, true)) return false;

    this.hotbar.consumeSelected(1);
    this._scheduleSave();
    return true;
  }

  _updateInteraction(dt) {
    if (this.miningCooldown > 0) {
      this.miningCooldown = Math.max(0, this.miningCooldown - dt);
    }

    const origin = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    const hit = raycastVoxel(this.world, origin, dir);
    this.currentTargetHit = hit;
    this.selectionBox.update(hit);

    if (!hit || !this.player.isMiningHeld()) {
      this.miningState = null;
      this.breakOverlay.update(null, 0);
      this.hud.setBreakProgress(0);
      this.firstPersonHand.setMiningActive(false);
      return;
    }

    const hitKey = `${hit.x},${hit.y},${hit.z}`;
    const breakTime = BlockRegistry.getBreakTime(hit.blockId, null, {
      onGround: this.player.onGround || this.player.flyMode,
      inWater: this.world.getBlock(this.player.x, this.player.y + 1.4, this.player.z) === 12,
    });

    if (!Number.isFinite(breakTime)) {
      // Unbreakable (e.g. Bedrock): swing hand but no cracks
      this.miningState = null;
      this.breakOverlay.update(null, 0);
      this.hud.setBreakProgress(0);
      this.firstPersonHand.setMiningActive(true);
      return;
    }

    if (this.miningCooldown > 0) {
      this.firstPersonHand.setMiningActive(true);
      return;
    }

    if (!this.miningState || this.miningState.key !== hitKey || this.miningState.blockId !== hit.blockId) {
      this.miningState = {
        key: hitKey,
        x: hit.x,
        y: hit.y,
        z: hit.z,
        blockId: hit.blockId,
        elapsed: 0,
        totalTime: breakTime,
      };
    }

    this.firstPersonHand.setMiningActive(true);
    this.miningState.elapsed += dt;
    const progress = Math.min(1, this.miningState.elapsed / this.miningState.totalTime);
    this.breakOverlay.update(hit, progress);
    this.hud.setBreakProgress(progress);

    if (progress >= 1) {
      const brokenId = hit.blockId;
      this.world.setBlock(hit.x, hit.y, hit.z, 0, true);
      const dropId = BlockRegistry.getDrop(brokenId);
      if (dropId > 0) {
        this.itemManager.spawnDrop(dropId, hit.x + 0.5, hit.y + 0.35, hit.z + 0.5, 1);
      }

      this.miningState = null;
      this.miningCooldown = 0.16;
      this.breakOverlay.update(null, 0);
      this.hud.setBreakProgress(0);
      this._scheduleSave();
    }
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

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.player.pointerLocked = locked;
      this.hud.setPointerLocked(locked);
    });

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

  _scheduleSave() {
    clearTimeout(this.debouncedSaveTimer);
    this.debouncedSaveTimer = setTimeout(() => {
      this.saveNow();
    }, 600);
  }

  saveNow() {
    if (!this.player || !this.world || !this.hotbar) return Promise.resolve(false);
    return this.saveManager.saveState({
      worldSeed: this.worldSeed,
      player: this.player.getPose(),
      hotbar: this.hotbar.exportState(),
      modifiedBlocks: this.world.exportModifiedBlocks(),
      settings: {
        touchMode: this.isTouchMode,
        renderDistance: this.renderDistance,
        unlimitedMemory: this.unlimitedMemory,
        highQuality: this.highQuality,
      },
    });
  }

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
      this._updateInteraction(dt);
      this.itemManager.update(dt, this.world, this.player, this.hotbar);
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
      targetHit: this.currentTargetHit,
      itemCount: this.itemManager.entities.length,
    });
  }
}

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
