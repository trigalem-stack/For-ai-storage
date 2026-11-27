import * as THREE from '../vendor/three.module.min.js';
import { BlockRegistry } from './blocks/BlockRegistry.js';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_MODES,
  CREATIVE_BREAK_COOLDOWN,
  DEFAULT_RENDER_DISTANCE_MOBILE,
  DEFAULT_RENDER_DISTANCE_PC,
  PLAYER_HALF_WIDTH,
  TICK_MS,
  WORLD_HEIGHT,
} from './constants.js';
import { FallingBlockManager } from './entities/FallingBlockEntity.js';
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
import { SelectionBox, raycastVoxel } from './world/Raycast.js';
import { SkyEnvironment } from './world/SkyEnvironment.js';
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
      720
    );

    const entityAmbient = new THREE.AmbientLight(0xffffff, 0.78);
    const entitySun = new THREE.DirectionalLight(0xfff6e5, 0.78);
    entitySun.position.set(1.2, 2.2, 1.0);
    this.scene.add(entityAmbient, entitySun);

    this.skyEnv = new SkyEnvironment(this.scene);

    const isTouchDevice = MobileControls.detectTouchDevice();
    this.settings = {
      touchMode: isTouchDevice,
      renderDistance: isTouchDevice ? DEFAULT_RENDER_DISTANCE_MOBILE : DEFAULT_RENDER_DISTANCE_PC,
      unlimitedMemory: true,
      highQuality: !isTouchDevice,
      fogEnabled: false,
      cloudsEnabled: true,
      sensitivity: 1.0,
      hintsEnabled: true,
    };

    this.gameMode = 'creative';

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
    this.itemManager = new ItemEntityManager(this.scene, this.atlas);
    this.fallingManager = new FallingBlockManager(this.scene, this.atlas);

    this.world = null;
    this.player = null;
    this.hotbar = null;
    this.mobileControls = null;
    this.hud = null;

    this.activeWorldId = null;
    this.activeWorldName = 'Мой мир';
    this.worldSeed = randomWorldSeed();

    this.currentTargetHit = null;
    this.creativeBreakTimer = 0;
    this.wasMiningHeld = false;

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
    const cap = this.settings.highQuality ? (this.settings.touchMode ? 2.0 : 2.5) : 1.15;
    this.renderer.setPixelRatio(Math.min(dpr, cap));
  }

  _applySensitivity() {
    const mult = this.settings.sensitivity || 1.0;
    if (this.player) this.player.mouseSensitivity = 0.0022 * mult;
    if (this.mobileControls) this.mobileControls.touchSensitivity = 0.0052 * mult;
  }

  async init() {
    this._setLoadingText('Загрузка настроек и миров...');
    await this.saveManager.init();
    const savedSettings = await this.saveManager.loadSettings();
    if (savedSettings) {
      Object.assign(this.settings, savedSettings);
    }

    this._applyPixelRatio();
    this.skyEnv.setCloudsEnabled(this.settings.cloudsEnabled);

    this.hotbar = new Hotbar(this.atlas, {
      creativeMode: this.gameMode === 'creative',
      onChange: (slot, shouldSave) => {
        this.firstPersonHand.setHeldBlock(slot ? slot.id : 0);
        if (shouldSave && this.activeWorldId) this._scheduleSave();
      },
      onPaletteToggle: (open) => {
        if (!this.hud?.inMainMenu) {
          this.player?.setPaused(open);
          if (!open && !this.settings.touchMode) {
            this._requestPointerLockSafe();
          }
        }
      },
    });

    this.hud = new Hud({
      onCycleCamera: () => this.player?.cycleCameraMode(),
      onPauseChange: (paused) => {
        this.player?.setPaused(paused);
        this.hud.setPointerLocked(Boolean(this.player?.pointerLocked));
      },
      onResume: () => {
        if (!this.settings.touchMode) {
          this._requestPointerLockSafe();
        }
      },
      onOpenWorldsManager: async () => {
        const list = await this.saveManager.listWorlds();
        this.hud.renderWorldsList(list, this.activeWorldId);
      },
      onCreateWorld: async ({ name, seed }) => {
        const meta = await this.saveManager.createWorld({ name, seed });
        await this.enterWorld(meta.id);
      },
      onSelectWorld: async (worldId) => {
        await this.enterWorld(worldId);
      },
      onDeleteWorld: async (worldId) => {
        const nextList = await this.saveManager.deleteWorld(worldId);
        if (this.activeWorldId === worldId) {
          this.activeWorldId = null;
        }
        this.hud.renderWorldsList(nextList, this.activeWorldId);
        this.hud.showToast('Мир удалён');
      },
      onExitToMenu: async () => {
        await this.saveNow();
        this.hud.showMainMenu(true);
        const list = await this.saveManager.listWorlds();
        this.hud.renderWorldsList(list, this.activeWorldId);
      },
      onToggleControlMode: () => {
        this.setTouchMode(!this.settings.touchMode);
      },
      onToggleFlyMode: () => {
        this.player?.toggleFlyMode();
      },
      onToggleMemoryMode: () => {
        this.settings.unlimitedMemory = !this.settings.unlimitedMemory;
        this.world?.setUnlimitedMemory(this.settings.unlimitedMemory);
        this.hud.setMemoryModeLabel(this.settings.unlimitedMemory);
        this.saveSettingsOnly();
      },
      onToggleGraphicsMode: () => {
        this.settings.highQuality = !this.settings.highQuality;
        this._applyPixelRatio();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.hud.setGraphicsModeLabel(this.settings.highQuality);
        this.saveSettingsOnly();
      },
      onToggleFogMode: () => {
        this.settings.fogEnabled = !this.settings.fogEnabled;
        this.world?.setFogEnabled(this.settings.fogEnabled);
        this.hud.setFogEnabledLabel(this.settings.fogEnabled);
        this.saveSettingsOnly();
      },
      onToggleCloudsMode: () => {
        this.settings.cloudsEnabled = !this.settings.cloudsEnabled;
        this.skyEnv.setCloudsEnabled(this.settings.cloudsEnabled);
        this.hud.setCloudsEnabledLabel(this.settings.cloudsEnabled);
        this.saveSettingsOnly();
      },
      onToggleHints: (enabled) => {
        this.settings.hintsEnabled = enabled;
        this.saveSettingsOnly();
      },
      onChangeRenderDistance: (dist) => {
        this.settings.renderDistance = dist;
        this.world?.setRenderDistance(dist);
        this.saveSettingsOnly();
      },
      onChangeSensitivity: (mult) => {
        this.settings.sensitivity = mult;
        this._applySensitivity();
        this.saveSettingsOnly();
      },
    });

    // Ensure at least one starter backdrop world or load saved list for Main Menu
    let worlds = await this.saveManager.listWorlds();
    if (worlds.length === 0) {
      const first = await this.saveManager.createWorld({ name: 'Новый мир', seed: randomWorldSeed() });
      worlds = [first];
    }

    // Load the latest world into background scene so Main Menu has a rich live 3D backdrop!
    await this.loadWorldIntoEngine(worlds[0].id);

    this.mobileControls = new MobileControls(this.player, {
      onStatusToast: (msg) => this.hud.showToast(msg),
    });

    this.setTouchMode(this.settings.touchMode, false);
    this._syncSettingsUI();
    this._applySensitivity();
    this._bindWindowEvents();
    this._bindPointerLock();
    this._startAutosave();

    this.loadingOverlay?.classList.add('hidden');
    this.hud.showMainMenu(false);
    this.hud.renderWorldsList(worlds, this.activeWorldId);

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _syncSettingsUI() {
    this.hud.setFlyModeLabel(Boolean(this.player?.flyMode));
    this.mobileControls?.setFlyActive(Boolean(this.player?.flyMode));
    this.hud.setMemoryModeLabel(this.settings.unlimitedMemory);
    this.hud.setGraphicsModeLabel(this.settings.highQuality);
    this.hud.setFogEnabledLabel(this.settings.fogEnabled);
    this.hud.setCloudsEnabledLabel(this.settings.cloudsEnabled);
    this.hud.setHintsEnabledLabel(this.settings.hintsEnabled);
    this.hud.setRenderDistanceUI(this.settings.renderDistance);
    this.hud.setSensitivityUI(this.settings.sensitivity);
  }

  async loadWorldIntoEngine(worldId) {
    this.itemManager.clear();
    this.fallingManager.clear();
    this.currentTargetHit = null;
    this.creativeBreakTimer = 0;

    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }

    const saved = await this.saveManager.loadWorld(worldId);
    this.activeWorldId = worldId;
    this.activeWorldName = saved?.name || 'Мой мир';
    this.worldSeed = Number.isFinite(saved?.worldSeed) ? saved.worldSeed : randomWorldSeed();

    this.world = new World(this.scene, this.atlas, this.worldSeed, this.settings.renderDistance, {
      unlimitedMemory: this.settings.unlimitedMemory,
      fogEnabled: this.settings.fogEnabled,
      onBlockChanged: (wx, wy, wz, id) => {
        if (BlockRegistry.fallsWithGravity(id)) {
          this.fallingManager.scheduleStabilityCheck(wx, wy, wz);
        } else {
          this.fallingManager.scheduleStabilityCheck(wx, wy + 1, wz);
        }
      },
    });

    if (saved?.modifiedBlocks) {
      this.world.loadModifiedBlocks(saved.modifiedBlocks);
    }

    const spawn = saved?.player ?? this.world.worldGen.findSafeSpawn();

    this.player = new PlayerController(this.camera, this.world, this.playerModel, this.firstPersonHand, {
      ...spawn,
      sensitivity: 0.0022 * (this.settings.sensitivity || 1.0),
      onPlaceAction: () => this._handlePlaceBlock(),
      onPickBlock: () => this._handlePickBlock(),
      onCameraModeChange: (mode) => this.hud?.onCameraModeChanged(mode),
      onToggleDebug: () => this.hud?.toggleDebug(),
      onTogglePause: () => this.hud?.togglePause(),
      onFlyModeChange: (active) => {
        this.hud?.setFlyModeLabel(active);
        this.mobileControls?.setFlyActive(active);
        this.hud?.showToast(active ? 'Режим полёта: ВКЛ' : 'Режим полёта: ВЫКЛ');
      },
    });

    if (this.mobileControls) {
      this.mobileControls.player = this.player;
      this.mobileControls.setFlyActive(this.player.flyMode);
    }

    this.world.preloadSpawnArea(this.player.x, this.player.z, 2);

    if (!saved?.player) {
      this.player.y = this.world.getSurfaceHeightAt(this.player.x, this.player.z);
      while (
        this.player.y < WORLD_HEIGHT - 3 &&
        collidesWithWorld(this.world, this.player.x, this.player.y, this.player.z, PLAYER_HALF_WIDTH, 1.8)
      ) {
        this.player.y += 1;
      }
    }

    if (saved?.hotbar) {
      this.hotbar.loadState(saved.hotbar);
    } else {
      this.hotbar.resetStarterKit();
    }
    const initSlot = this.hotbar.getSelectedSlot();
    this.firstPersonHand.setHeldBlock(initSlot ? initSlot.id : 0);
    this.player.update(0.001);
  }

  async enterWorld(worldId) {
    this.loadingOverlay?.classList.remove('hidden');
    this._setLoadingText('Генерация биомов, пещер и руд...');
    await this.loadWorldIntoEngine(worldId);
    await this.saveNow();
    this._syncSettingsUI();
    this.loadingOverlay?.classList.add('hidden');
    this.hud.hideMainMenu(this.player.cameraMode);
    if (!this.settings.touchMode) {
      this._requestPointerLockSafe();
    }
    this.hud.showToast(`Мир: ${this.activeWorldName}`);
  }

  _setLoadingText(text) {
    if (this.loadingStatus) this.loadingStatus.textContent = text;
  }

  setTouchMode(enabled, showNotice = true) {
    this.settings.touchMode = Boolean(enabled);
    this._applyPixelRatio();
    this.mobileControls?.setEnabled(this.settings.touchMode);
    this.hud?.setTouchModeLabel(this.settings.touchMode);
    if (this.settings.touchMode && document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    if (showNotice) {
      this.hud?.showToast(this.settings.touchMode ? 'Режим: Телефон (Touch)' : 'Режим: ПК (Мышь + WASD)');
      this.saveSettingsOnly();
    }
  }

  _handlePickBlock() {
    const hit = this.currentTargetHit;
    if (!hit || hit.blockId <= 0) return;
    const def = BlockRegistry.get(hit.blockId);
    if (!def || def.isLiquid) return;
    this.hotbar.pickBlock(def.id);
    this.hud.showToast(`Выбран блок: ${def.name}`);
  }

  _handlePlaceBlock() {
    const hit = this.currentTargetHit;
    if (!hit) return false;
    if (!hit.normal || (hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 0)) {
      return false;
    }

    const slot = this.hotbar.getSelectedSlot();
    if (!slot || slot.id <= 0) return false;

    const targetDef = BlockRegistry.get(hit.blockId);
    // Clicking on replaceable tall grass replaces it in-place
    const px = targetDef.isCross ? hit.x : hit.x + hit.normal.x;
    const py = targetDef.isCross ? hit.y : hit.y + hit.normal.y;
    const pz = targetDef.isCross ? hit.z : hit.z + hit.normal.z;

    if (py < 0 || py >= WORLD_HEIGHT) return false;

    const existing = this.world.getBlock(px, py, pz);
    const existingDef = BlockRegistry.get(existing);
    if (existing !== 0 && !existingDef.isLiquid && !existingDef.isCross) return false;

    const placedDef = BlockRegistry.get(slot.id);
    if (
      placedDef.isSolid &&
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

    if (!this.world.setBlock(px, py, pz, slot.id, true, true)) return false;

    // Creative mode does NOT consume blocks
    if (this.gameMode !== 'creative') {
      this.hotbar.consumeSelected(1);
    }
    this._scheduleSave();
    return true;
  }

  _updateInteraction(dt) {
    if (!this.player || !this.world) return;

    if (this.creativeBreakTimer > 0) {
      this.creativeBreakTimer = Math.max(0, this.creativeBreakTimer - dt);
    }

    const origin = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    const hit = raycastVoxel(this.world, origin, dir);
    this.currentTargetHit = hit;
    this.selectionBox.update(this.player.cameraMode === 0 ? hit : hit);

    const miningHeld = this.player.isMiningHeld();
    if (!miningHeld) {
      this.wasMiningHeld = false;
      this.creativeBreakTimer = 0;
      this.firstPersonHand.setMiningActive(false);
      return;
    }

    this.firstPersonHand.setMiningActive(true);
    if (!hit) return;

    // Creative Mode: instant break on first click, anti-spam repeat cooldown while held
    const justPressed = !this.wasMiningHeld;
    this.wasMiningHeld = true;

    if (justPressed || this.creativeBreakTimer <= 0) {
      const brokenDef = BlockRegistry.get(hit.blockId);
      if (brokenDef.redstoneGlow) {
        this.hud.showToast('Редстоуновая руда светится!');
      }
      this.world.setBlock(hit.x, hit.y, hit.z, 0, true, true);
      this.firstPersonHand.triggerSwing();
      this.creativeBreakTimer = CREATIVE_BREAK_COOLDOWN;
      this._scheduleSave();
    }
  }

  _requestPointerLockSafe() {
    if (this.settings.touchMode || this.hud?.isPaused || this.hud?.inMainMenu) return;
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
      if (!this.settings.touchMode && !this.hud.isPaused && !this.hud.inMainMenu && document.pointerLockElement !== this.canvas) {
        this._requestPointerLockSafe();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.player) this.player.pointerLocked = locked;
      this.hud.setPointerLocked(locked);
    });

    window.addEventListener('touchstart', () => {
      if (!this.settings.touchMode) {
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

  saveSettingsOnly() {
    return this.saveManager.saveSettings(this.settings);
  }

  saveNow() {
    this.saveSettingsOnly();
    if (!this.activeWorldId || !this.player || !this.world || !this.hotbar) {
      return Promise.resolve(false);
    }
    return this.saveManager.saveWorld(this.activeWorldId, {
      worldName: this.activeWorldName,
      worldSeed: this.worldSeed,
      biomeName: this.world.getBiomeNameAt(this.player.x, this.player.z),
      player: this.player.getPose(),
      hotbar: this.hotbar.exportState(),
      modifiedBlocks: this.world.exportModifiedBlocks(),
      settings: this.settings,
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

    if (this.hud.inMainMenu) {
      // Gentle scenic camera orbit while in Main Menu
      if (this.player && this.world) {
        this.player.yaw += dt * 0.08;
        this.player._updateCamera();
        this.world.update(this.player.x, this.player.z);
        this.skyEnv.update(dt, this.player.x, this.player.y, this.player.z);
      }
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!this.hud.isPaused && this.player && this.world) {
      this.tickAccumulator += dt * 1000;
      while (this.tickAccumulator >= TICK_MS) {
        this.fixedTick();
        this.tickAccumulator -= TICK_MS;
      }

      this.player.update(dt);
      this._updateInteraction(dt);
      this.fallingManager.update(dt, this.world, this.itemManager, this.gameMode !== 'creative');
      this.itemManager.update(dt, this.world, this.player, this.hotbar);
      this.world.update(this.player.x, this.player.z);
      this.skyEnv.update(dt, this.player.x, this.player.y, this.player.z);
    }

    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    if (this.player && this.player.cameraMode === CAMERA_MODES.FIRST_PERSON) {
      this.firstPersonHand.render(this.renderer);
    }

    this.hud.updateDebug({
      player: this.player,
      world: this.world,
      targetHit: this.currentTargetHit,
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
