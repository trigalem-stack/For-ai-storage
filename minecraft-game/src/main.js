import * as THREE from '../vendor/three.module.min.js';
import { BLOCK_IDS, BlockRegistry } from './blocks/BlockRegistry.js';
import {
  AUTOSAVE_INTERVAL_MS,
  CAMERA_MODES,
  CREATIVE_BREAK_COOLDOWN,
  DEFAULT_RENDER_DISTANCE_MOBILE,
  DEFAULT_RENDER_DISTANCE_PC,
  DEFAULT_WORLD_TIME,
  PLAYER_HALF_WIDTH,
  SLEEP_END_TICK,
  SLEEP_START_TICK,
  TICK_MS,
  WORLD_HEIGHT,
} from './constants.js';
import { FallingBlockManager } from './entities/FallingBlockEntity.js';
import { ItemEntityManager } from './entities/ItemEntity.js';
import { Inventory } from './items/Inventory.js';
import { ItemRegistry } from './items/ItemRegistry.js';
import { aabbIntersectsBlock, collidesWithWorld } from './physics/AABBPhysics.js';
import { FirstPersonHand } from './player/FirstPersonHand.js';
import { PlayerController } from './player/PlayerController.js';
import { InventoryPlayerPreview, PlayerModel, createSteveSkinTexture } from './player/PlayerSkin.js';
import { SaveManager } from './storage/SaveManager.js';
import { TextureAtlas } from './textures/TextureAtlas.js';
import { Hotbar } from './ui/Hotbar.js';
import { Hud } from './ui/Hud.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { MobileControls } from './ui/MobileControls.js';
import { BlockEntityManager } from './world/BlockEntityManager.js';
import { MenuPanorama } from './world/MenuPanorama.js';
import { BreakCrackOverlay, SelectionBox, raycastVoxel } from './world/Raycast.js';
import { SkyRenderer } from './world/SkyRenderer.js';
import { World } from './world/World.js';

function randomWorldSeed() {
  return (Math.floor(Math.random() * 0x7fffffff) + 1) | 0;
}

const DIR_OFFSETS = [
  [0, -1], // 0: North (-Z)
  [1, 0],  // 1: East (+X)
  [0, 1],  // 2: South (+Z)
  [-1, 0], // 3: West (-X)
];

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

    const entityAmbient = new THREE.AmbientLight(0xffffff, 0.85);
    const entitySun = new THREE.DirectionalLight(0xfff6e5, 0.72);
    entitySun.position.set(1.2, 2.2, 1.0);
    this.scene.add(entityAmbient, entitySun);

    this.skyRenderer = new SkyRenderer(this.scene, DEFAULT_WORLD_TIME, 1);
    this.menuPanorama = new MenuPanorama();

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
      gameMode: 'survival',
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this._applyPixelRatio();
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.playerModel = new PlayerModel(this.skinTexture, this.atlas);
    this.scene.add(this.playerModel.root);

    this.playerPreview = new InventoryPlayerPreview(this.skinTexture, this.atlas);
    this.firstPersonHand = new FirstPersonHand(this.skinTexture, this.atlas);
    this.selectionBox = new SelectionBox(this.scene);
    this.breakOverlay = new BreakCrackOverlay(this.scene, this.atlas);
    this.itemManager = new ItemEntityManager(this.scene, this.atlas);
    this.fallingManager = new FallingBlockManager(this.scene, this.atlas);

    this.inventory = new Inventory({ creativeMode: false });
    this.blockEntities = new BlockEntityManager();
    this.inventoryUI = null;

    this.world = null;
    this.player = null;
    this.hotbar = null;
    this.mobileControls = null;
    this.hud = null;

    this.activeWorldId = null;
    this.activeWorldName = 'Мой мир';
    this.worldSeed = randomWorldSeed();
    this.spawnPoint = null;

    this.currentTargetHit = null;
    this.creativeBreakTimer = 0;
    this.wasMiningHeld = false;
    this.miningBlockKey = '';
    this.miningElapsed = 0;
    this.isSleeping = false;

    this.lastFrameTime = performance.now();
    this.tickAccumulator = 0;
    this.tickCount = 0;
    this.autosaveTimer = null;
    this.debouncedSaveTimer = null;
    this.isRunning = false;

    window.__MC_GAME__ = this;
  }

  get gameMode() {
    return this.settings.gameMode === 'creative' ? 'creative' : 'survival';
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

  _syncHeldAndArmorVisuals() {
    const held = this.inventory.getHeldStack();
    this.firstPersonHand.setHeldItem(held);
    this.playerModel.setHeldItem(held);
    this.playerModel.setArmor(this.inventory.armor);
    this.playerPreview?.syncEquipment(held, this.inventory.armor);
  }

  _dropStackFromPlayer(stack) {
    if (!stack || !stack.id || stack.count <= 0 || !this.player) return;
    const eye = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    this.itemManager.spawnPlayerDrop(stack, eye.x, eye.y - 0.25, eye.z, dir);
    this._scheduleSave();
  }

  openInventoryModal(mode = 'inventory', blockPos = null) {
    if (!this.inventoryUI || !this.player || this.hud?.inMainMenu || this.hud?.isPaused) return;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.player.setPaused(true);
    this.inventoryUI.open(mode, blockPos);
  }

  togglePlayerInventory() {
    if (!this.inventoryUI || !this.player || this.hud?.inMainMenu) return;
    if (this.inventoryUI.isOpen) {
      this.inventoryUI.close();
      return;
    }
    if (this.hud?.isPaused) return;
    this.openInventoryModal(this.gameMode === 'creative' ? 'inventory' : 'inventory');
  }

  async init() {
    this._setLoadingText('Загрузка настроек и списка миров...');
    await this.saveManager.init();
    const savedSettings = await this.saveManager.loadSettings();
    if (savedSettings) {
      Object.assign(this.settings, savedSettings);
    }

    this.inventory.creativeMode = this.gameMode === 'creative';
    this._applyPixelRatio();
    this.skyRenderer.setCloudsEnabled(this.settings.cloudsEnabled);

    this.hotbar = new Hotbar(this.atlas, {
      inventory: this.inventory,
      creativeMode: this.gameMode === 'creative',
      initStarter: false,
      disableHotbarKeyE: true,
      onChange: (_slot, shouldSave) => {
        this._syncHeldAndArmorVisuals();
        if (this.inventoryUI?.isOpen) {
          this.inventoryUI.render();
        }
        if (shouldSave && this.activeWorldId) this._scheduleSave();
      },
      onInventoryToggle: () => {
        this.togglePlayerInventory();
      },
    });

    this.inventoryUI = new InventoryUI(this.atlas, this.inventory, this.blockEntities, {
      playerPreview: this.playerPreview,
      onDropStack: (stack) => this._dropStackFromPlayer(stack),
      onClose: () => {
        this.player?.setPaused(false);
        this.hotbar?.render();
        this._syncHeldAndArmorVisuals();
        if (this.activeWorldId) this._scheduleSave();
        if (!this.settings.touchMode && !this.hud?.isPaused && !this.hud?.inMainMenu) {
          this._requestPointerLockSafe();
        }
      },
    });

    this.hud = new Hud({
      onCycleCamera: () => this.player?.cycleCameraMode(),
      onPauseChange: (paused) => {
        if (paused && this.inventoryUI?.isOpen) {
          this.inventoryUI.close();
        }
        this.player?.setPaused(paused || Boolean(this.inventoryUI?.isOpen));
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
        if (this.inventoryUI?.isOpen) this.inventoryUI.close();
        await this.saveNow();
        this._unloadWorldFromEngine();
        this.hud.showMainMenu(true);
        const list = await this.saveManager.listWorlds();
        this.hud.renderWorldsList(list, this.activeWorldId);
      },
      onSetWorldTime: (ticks) => {
        this.skyRenderer.setTime(ticks);
        this.hud.showToast(`Время: ${this.skyRenderer.getFormattedClock()}`);
        this._scheduleSave();
      },
      onToggleControlMode: () => {
        this.setTouchMode(!this.settings.touchMode);
      },
      onToggleGameMode: () => {
        const nextCreative = this.gameMode !== 'creative';
        this.settings.gameMode = nextCreative ? 'creative' : 'survival';
        this.inventory.creativeMode = nextCreative;
        this.hotbar.setCreativeMode(nextCreative);
        this.hud.setGameModeLabel(nextCreative);
        this.hud.showToast(nextCreative ? 'Режим: Креатив' : 'Режим: Выживание');
        this.saveSettingsOnly();
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
        this.skyRenderer.setCloudsEnabled(this.settings.cloudsEnabled);
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

    let worlds = await this.saveManager.listWorlds();
    if (worlds.length === 0) {
      const first = await this.saveManager.createWorld({ name: 'Новый мир', seed: randomWorldSeed() });
      worlds = [first];
    }

    this.mobileControls = new MobileControls(null, {
      onStatusToast: (msg) => this.hud.showToast(msg),
    });

    this.setTouchMode(this.settings.touchMode, false);
    this._syncSettingsUI();
    this._applySensitivity();
    this._bindWindowEvents();
    this._bindKeyboardShortcuts();
    this._bindPointerLock();
    this._startAutosave();

    this.loadingOverlay?.classList.add('hidden');
    this.hud.showMainMenu(false);
    this.hud.renderWorldsList(worlds, this.activeWorldId);

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this._loop(t));
  }

  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (this.hud?.inMainMenu) return;

      if (e.code === 'KeyE' && !e.repeat) {
        if (!this.hud?.isPaused) {
          e.preventDefault();
          this.togglePlayerInventory();
        }
        return;
      }

      if (e.code === 'KeyQ' && !e.repeat) {
        if (this.inventoryUI?.isOpen || this.hud?.isPaused || !this.player) return;
        const dropCount = (e.ctrlKey || e.metaKey || e.shiftKey) ? 64 : 1;
        const dropped = this.inventory.dropFromSlot(this.inventory.selectedSlot, dropCount);
        if (dropped) {
          this._dropStackFromPlayer(dropped);
          this.hotbar.render();
          this._syncHeldAndArmorVisuals();
        }
      }
    });
  }

  _syncSettingsUI() {
    this.hud.setGameModeLabel(this.gameMode === 'creative');
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

  _unloadWorldFromEngine() {
    if (this.inventoryUI?.isOpen) this.inventoryUI.close();
    this.blockEntities.clear();
    this.itemManager.clear();
    this.fallingManager.clear();
    this.selectionBox.update(null);
    this.breakOverlay.update(null, 0);
    this.currentTargetHit = null;
    this.creativeBreakTimer = 0;
    this.miningBlockKey = '';
    this.miningElapsed = 0;
    this.isSleeping = false;

    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
    if (this.mobileControls) {
      this.mobileControls.player = null;
    }
  }

  _handleBlockSideEffects(wx, wy, wz, newId, oldId, oldMeta) {
    if (!this.world) return;

    // 1. Falling sand/gravel stability cascade
    if (BlockRegistry.fallsWithGravity(newId)) {
      this.fallingManager.scheduleStabilityCheck(wx, wy, wz);
    } else {
      this.fallingManager.scheduleStabilityCheck(wx, wy + 1, wz);
    }

    // 2. If block was removed, detach any torches/ladders supported by this block (drops in BOTH modes)
    if (newId === 0 && oldId !== 0) {
      const checkSupportAttach = (tx, ty, tz, expectedMeta, targetBlockId) => {
        if (this.world.getBlock(tx, ty, tz) === targetBlockId &&
            this.world.getBlockMeta(tx, ty, tz) === expectedMeta) {
          this.world.setBlock(tx, ty, tz, 0, true, false);
          this.itemManager.spawnDrop(targetBlockId, tx + 0.5, ty + 0.3, tz + 0.5, 1);
        }
      };
      checkSupportAttach(wx, wy + 1, wz, 0, BLOCK_IDS.TORCH);
      checkSupportAttach(wx + 1, wy, wz, 1, BLOCK_IDS.TORCH);
      checkSupportAttach(wx - 1, wy, wz, 2, BLOCK_IDS.TORCH);
      checkSupportAttach(wx, wy, wz + 1, 3, BLOCK_IDS.TORCH);
      checkSupportAttach(wx, wy, wz - 1, 4, BLOCK_IDS.TORCH);

      checkSupportAttach(wx + 1, wy, wz, 1, BLOCK_IDS.LADDER);
      checkSupportAttach(wx - 1, wy, wz, 2, BLOCK_IDS.LADDER);
      checkSupportAttach(wx, wy, wz + 1, 3, BLOCK_IDS.LADDER);
      checkSupportAttach(wx, wy, wz - 1, 4, BLOCK_IDS.LADDER);

      // 3. Spill chest/furnace contents and close modal if currently viewing it
      this.blockEntities.onBlockRemoved(wx, wy, wz, this.itemManager);
      if (this.inventoryUI?.isOpen && this.inventoryUI.activeBlockPos &&
          this.inventoryUI.activeBlockPos.x === wx &&
          this.inventoryUI.activeBlockPos.y === wy &&
          this.inventoryUI.activeBlockPos.z === wz) {
        this.inventoryUI.close();
      }
    }

    // 4. Paired 2-block Bed cleanup when either half is broken
    if (newId === 0 && (oldId === BLOCK_IDS.BED_FOOT || oldId === BLOCK_IDS.BED_HEAD)) {
      const dir = oldMeta & 3;
      const [dx, dz] = DIR_OFFSETS[dir] || DIR_OFFSETS[0];
      if (oldId === BLOCK_IDS.BED_FOOT) {
        if (this.world.getBlock(wx + dx, wy, wz + dz) === BLOCK_IDS.BED_HEAD) {
          this.world.setBlock(wx + dx, wy, wz + dz, 0, true, false);
        }
      } else if (this.world.getBlock(wx - dx, wy, wz - dz) === BLOCK_IDS.BED_FOOT) {
        this.world.setBlock(wx - dx, wy, wz - dz, 0, true, false);
      }
    }
  }

  async loadWorldIntoEngine(worldId) {
    this._unloadWorldFromEngine();

    const saved = await this.saveManager.loadWorld(worldId);
    this.activeWorldId = worldId;
    this.activeWorldName = saved?.name || 'Мой мир';
    this.worldSeed = Number.isFinite(saved?.worldSeed) ? saved.worldSeed : randomWorldSeed();
    this.spawnPoint = saved?.spawnPoint || null;

    this.skyRenderer.setTime(
      Number.isFinite(saved?.worldTime) ? saved.worldTime : DEFAULT_WORLD_TIME,
      Number.isFinite(saved?.dayCount) ? saved.dayCount : 1
    );

    this.world = new World(this.scene, this.atlas, this.worldSeed, this.settings.renderDistance, {
      unlimitedMemory: this.settings.unlimitedMemory,
      fogEnabled: this.settings.fogEnabled,
      onBlockChanged: (wx, wy, wz, id, oldId, oldMeta) => {
        this._handleBlockSideEffects(wx, wy, wz, id, oldId, oldMeta);
      },
    });

    if (saved?.modifiedBlocks) {
      this.world.loadModifiedBlocks(saved.modifiedBlocks);
    }

    if (saved?.blockEntities) {
      this.blockEntities.loadState(saved.blockEntities);
    } else {
      this.blockEntities.clear();
    }

    const spawn = saved?.player ?? this.world.worldGen.findSafeSpawn();

    this.player = new PlayerController(this.camera, this.world, this.playerModel, this.firstPersonHand, {
      ...spawn,
      sensitivity: 0.0022 * (this.settings.sensitivity || 1.0),
      onPlaceAction: () => this._handlePlaceBlock(),
      onPickBlock: () => this._handlePickBlock(),
      onCameraModeChange: (mode) => this.hud?.onCameraModeChanged(mode),
      onToggleDebug: () => this.hud?.toggleDebug(),
      onTogglePause: () => {
        if (this.inventoryUI?.isOpen) {
          this.inventoryUI.close();
          return;
        }
        this.hud?.togglePause();
      },
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
      if (!this.spawnPoint) {
        this.spawnPoint = { x: this.player.x, y: this.player.y, z: this.player.z };
      }
    }

    this.inventory.creativeMode = this.gameMode === 'creative';
    if (saved?.inventory) {
      this.inventory.loadState(saved.inventory);
    } else if (saved?.hotbar) {
      this.inventory.clearAll();
      this.hotbar.loadState(saved.hotbar);
    } else if (this.gameMode === 'creative') {
      this.hotbar.resetStarterKit();
    } else {
      this.inventory.clearAll();
    }
    this.hotbar.render();
    this._syncHeldAndArmorVisuals();

    this.skyRenderer.update(0.001, this.player.x, this.player.y, this.player.z, this.world);
    this.player.update(0.001);
  }

  async enterWorld(worldId) {
    this.loadingOverlay?.classList.remove('hidden');
    this._setLoadingText('Генерация биомов, пещер и воксельного света...');
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

  _getPlayerHorizontalDir() {
    const lookX = -Math.sin(this.player.yaw);
    const lookZ = -Math.cos(this.player.yaw);
    if (Math.abs(lookZ) >= Math.abs(lookX)) {
      return lookZ < 0 ? 0 : 2; // 0: North (-Z), 2: South (+Z)
    }
    return lookX > 0 ? 1 : 3; // 1: East (+X), 3: West (-X)
  }

  _handlePickBlock() {
    const hit = this.currentTargetHit;
    if (!hit || hit.blockId <= 0) return;
    let pickId = hit.blockId;
    if (pickId === BLOCK_IDS.BED_HEAD) pickId = BLOCK_IDS.BED_FOOT;
    if (pickId === BLOCK_IDS.FURNACE_LIT) pickId = BLOCK_IDS.FURNACE;
    const def = BlockRegistry.get(pickId);
    if (!def || def.isLiquid) return;
    this.hotbar.pickBlock(def.id);
    this.hud.showToast(`Выбран блок: ${def.name}`);
  }

  _interactWithBed(hit) {
    if (this.isSleeping) return true;
    this.spawnPoint = { x: hit.x + 0.5, y: hit.y + 0.6, z: hit.z + 0.5 };
    const t = this.skyRenderer.worldTime;

    if (t >= SLEEP_START_TICK && t <= SLEEP_END_TICK) {
      this.isSleeping = true;
      this.hud.playSleepTransition(() => {
        this.skyRenderer.sleepToMorning();
        this.skyRenderer.update(0.001, this.player.x, this.player.y, this.player.z, this.world);
        this.isSleeping = false;
        this.hud.showToast('Точка возрождения установлена');
        this._scheduleSave();
      });
    } else {
      this.hud.showToast('Спать можно только ночью');
      this._scheduleSave();
    }
    return true;
  }

  _handlePlaceBlock() {
    const hit = this.currentTargetHit;
    if (!hit || !this.world || !this.player) return false;

    const targetDef = BlockRegistry.get(hit.blockId);

    // 1. Block interactions when NOT crouching (Bed, Crafting Table, Furnace, Chest)
    if (!this.player.isCrouching) {
      if (targetDef.isBed) {
        return this._interactWithBed(hit);
      }
      if (hit.blockId === BLOCK_IDS.CRAFTING_TABLE) {
        this.openInventoryModal('crafting', hit);
        return true;
      }
      if (hit.blockId === BLOCK_IDS.FURNACE || hit.blockId === BLOCK_IDS.FURNACE_LIT) {
        this.openInventoryModal('furnace', hit);
        return true;
      }
      if (hit.blockId === BLOCK_IDS.CHEST) {
        this.openInventoryModal('chest', hit);
        return true;
      }
    }

    // 2. Touching Redstone Ore activates its glow
    if (targetDef.redstoneGlow) {
      this.world.triggerRedstoneGlow(hit.x, hit.y, hit.z);
    }

    if (!hit.normal || (hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 0)) {
      return false;
    }

    const slot = this.hotbar.getSelectedSlot();
    if (!slot || slot.id <= 0) return false;

    // Non-placeable items (tools, swords, armor, coal, sticks, ingots...) cannot be placed as blocks
    if (!ItemRegistry.isBlockId(slot.id)) return false;

    const px = targetDef.isCross ? hit.x : hit.x + hit.normal.x;
    const py = targetDef.isCross ? hit.y : hit.y + hit.normal.y;
    const pz = targetDef.isCross ? hit.z : hit.z + hit.normal.z;
    if (py < 0 || py >= WORLD_HEIGHT) return false;

    const existing = this.world.getBlock(px, py, pz);
    const existingDef = BlockRegistry.get(existing);
    if (existing !== 0 && !existingDef.isLiquid && !existingDef.isCross) return false;

    const placedDef = BlockRegistry.get(slot.id);

    // 3. Torch placement validation & orientation (floor meta=0, wall meta=1..4, ceiling forbidden)
    if (placedDef.isTorch) {
      if (hit.normal.y === -1) return false;
      let torchMeta = 0;
      if (targetDef.isCross) {
        if (!BlockRegistry.isSolid(this.world.getBlock(px, py - 1, pz))) return false;
      } else if (hit.normal.y === 1) {
        if (!BlockRegistry.isSolid(this.world.getBlock(hit.x, hit.y, hit.z))) return false;
        torchMeta = 0;
      } else {
        if (!BlockRegistry.isSolid(this.world.getBlock(hit.x, hit.y, hit.z))) return false;
        if (hit.normal.x === 1) torchMeta = 1;
        else if (hit.normal.x === -1) torchMeta = 2;
        else if (hit.normal.z === 1) torchMeta = 3;
        else if (hit.normal.z === -1) torchMeta = 4;
      }
      if (!this.world.setBlock(px, py, pz, BLOCK_IDS.TORCH, true, true, torchMeta)) return false;
      if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
      this._scheduleSave();
      return true;
    }

    // 4. Ladder placement validation (horizontal wall face only)
    if (placedDef.isLadder) {
      if (hit.normal.y !== 0) return false;
      if (!BlockRegistry.isSolid(this.world.getBlock(hit.x, hit.y, hit.z))) return false;
      let ladderMeta = 3;
      if (hit.normal.x === 1) ladderMeta = 1;
      else if (hit.normal.x === -1) ladderMeta = 2;
      else if (hit.normal.z === 1) ladderMeta = 3;
      else if (hit.normal.z === -1) ladderMeta = 4;
      if (!this.world.setBlock(px, py, pz, BLOCK_IDS.LADDER, true, true, ladderMeta)) return false;
      if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
      this._scheduleSave();
      return true;
    }

    // 5. Two-block Bed placement (BED_FOOT + BED_HEAD along player horizontal look)
    if (placedDef.isBed) {
      const dir = this._getPlayerHorizontalDir();
      const [dx, dz] = DIR_OFFSETS[dir];
      const hx = px + dx;
      const hz = pz + dz;
      const headExisting = this.world.getBlock(hx, py, hz);
      const headDef = BlockRegistry.get(headExisting);
      if (headExisting !== 0 && !headDef.isLiquid && !headDef.isCross) return false;

      const playerH = this.player.getCurrentHitboxHeight();
      if (
        aabbIntersectsBlock(this.player.x, this.player.y, this.player.z, PLAYER_HALF_WIDTH, playerH, px, py, pz) ||
        aabbIntersectsBlock(this.player.x, this.player.y, this.player.z, PLAYER_HALF_WIDTH, playerH, hx, py, hz)
      ) {
        return false;
      }

      this.world.setBlock(px, py, pz, BLOCK_IDS.BED_FOOT, false, false, dir);
      this.world.setBlock(hx, py, hz, BLOCK_IDS.BED_HEAD, true, true, dir);
      if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
      this._scheduleSave();
      return true;
    }

    // 6. Standard & directional blocks (Furnace, Chest, Pumpkin, Jack o'Lantern)
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

    let placeMeta = 0;
    if (placedDef.directional) {
      placeMeta = (this._getPlayerHorizontalDir() + 2) & 3;
    }

    if (!this.world.setBlock(px, py, pz, slot.id, true, true, placeMeta)) return false;
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
    this.selectionBox.update(hit, this.world);

    const miningHeld = this.player.isMiningHeld();
    if (!miningHeld || !hit) {
      this.wasMiningHeld = false;
      this.creativeBreakTimer = 0;
      this.miningBlockKey = '';
      this.miningElapsed = 0;
      this.breakOverlay.update(null, 0);
      this.firstPersonHand.setMiningActive(Boolean(miningHeld));
      return;
    }

    this.firstPersonHand.setMiningActive(true);
    const hitKey = `${hit.x},${hit.y},${hit.z}`;
    const brokenDef = BlockRegistry.get(hit.blockId);

    // Creative Mode: instant break with cooldown
    if (this.gameMode === 'creative') {
      this.breakOverlay.update(null, 0);
      const justPressed = !this.wasMiningHeld;
      this.wasMiningHeld = true;
      if (justPressed || this.creativeBreakTimer <= 0) {
        if (brokenDef.redstoneGlow) {
          this.world.triggerRedstoneGlow(hit.x, hit.y, hit.z);
          this.hud.showToast('Редстоуновая руда светится!');
        }
        this.world.setBlock(hit.x, hit.y, hit.z, 0, true, true);
        this.firstPersonHand.triggerSwing();
        this.creativeBreakTimer = CREATIVE_BREAK_COOLDOWN;
        this._scheduleSave();
      }
      return;
    }

    // Survival Mode: progressive mining time + crack stages + drops + tool wear
    if (brokenDef.hardness < 0) {
      // Unbreakable (Bedrock)
      this.miningBlockKey = hitKey;
      this.miningElapsed = 0;
      this.breakOverlay.update(null, 0);
      return;
    }

    if (hitKey !== this.miningBlockKey) {
      this.miningBlockKey = hitKey;
      this.miningElapsed = 0;
    }

    const heldStack = this.inventory.getHeldStack();
    const heldDef = heldStack ? ItemRegistry.get(heldStack.id) : null;

    if (brokenDef.redstoneGlow && this.miningElapsed === 0) {
      this.world.triggerRedstoneGlow(hit.x, hit.y, hit.z);
    }

    const breakDuration = BlockRegistry.getBreakTime(hit.blockId, heldDef, {
      inWater: this.player.inWater,
      onGround: this.player.onGround || this.player.flyMode,
    });

    this.miningElapsed += dt;
    const progress = breakDuration <= 0.001 ? 1.0 : Math.min(1.0, this.miningElapsed / breakDuration);
    this.breakOverlay.update(hit, progress);

    if (progress >= 1.0) {
      const drops = BlockRegistry.getHarvestDrops(hit.blockId, heldDef);
      this.world.setBlock(hit.x, hit.y, hit.z, 0, true, true);
      for (const drop of drops) {
        this.itemManager.spawnDrop(drop.id, hit.x + 0.5, hit.y + 0.35, hit.z + 0.5, drop.count);
      }

      if (heldDef && heldDef.maxDurability > 0 && brokenDef.hardness > 0) {
        const wear = heldDef.toolType === 'sword' ? 2 : 1;
        this.inventory.damageHeldTool(wear);
        this.hotbar.render();
        this._syncHeldAndArmorVisuals();
      }

      this.firstPersonHand.triggerSwing();
      this.miningBlockKey = '';
      this.miningElapsed = 0;
      this.breakOverlay.update(null, 0);
      this._scheduleSave();
    }
  }

  _requestPointerLockSafe() {
    if (this.settings.touchMode || this.hud?.isPaused || this.hud?.inMainMenu || this.inventoryUI?.isOpen) return;
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
      if (
        !this.settings.touchMode &&
        !this.hud.isPaused &&
        !this.hud.inMainMenu &&
        !this.inventoryUI?.isOpen &&
        document.pointerLockElement !== this.canvas
      ) {
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
      this.menuPanorama.resize(w, h);
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
      worldTime: this.skyRenderer.worldTime,
      dayCount: this.skyRenderer.dayCount,
      spawnPoint: this.spawnPoint,
      biomeName: this.world.getBiomeNameAt(this.player.x, this.player.z),
      player: this.player.getPose(),
      hotbar: this.hotbar.exportState(),
      inventory: this.inventory.exportState(),
      blockEntities: this.blockEntities.exportState(),
      modifiedBlocks: this.world.exportModifiedBlocks(),
      settings: this.settings,
    });
  }

  fixedTick() {
    this.tickCount++;
    if (!this.hud.inMainMenu && !this.hud.isPaused && !this.isSleeping) {
      this.skyRenderer.advanceTicks(1);
      if (this.world) {
        const changed = this.blockEntities.tick(1, this.world);
        if (changed && this.inventoryUI?.isOpen && this.inventoryUI.mode === 'furnace') {
          this.inventoryUI.updateFurnaceProgress();
        } else if (this.inventoryUI?.isOpen && this.inventoryUI.mode === 'furnace') {
          this.inventoryUI.updateFurnaceProgress();
        }
      }
    }
  }

  _loop(now) {
    if (!this.isRunning) return;
    requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    if (this.hud.inMainMenu) {
      this.menuPanorama.render(this.renderer, dt);
      return;
    }

    if (!this.hud.isPaused && this.player && this.world) {
      this.tickAccumulator += dt * 1000;
      while (this.tickAccumulator >= TICK_MS) {
        this.fixedTick();
        this.tickAccumulator -= TICK_MS;
      }

      if (!this.isSleeping) {
        if (!this.inventoryUI?.isOpen) {
          this.player.update(dt);
          this._updateInteraction(dt);
        } else {
          this.breakOverlay.update(null, 0);
        }
      }

      this.fallingManager.update(dt, this.world, this.itemManager, true);
      this.itemManager.update(dt, this.world, this.player, this.inventory);
      this.world.update(this.player.x, this.player.z, dt);
      this.skyRenderer.update(dt, this.player.x, this.player.y, this.player.z, this.world);

      const heldStack = this.inventory.getHeldStack();
      const heldLight = ItemRegistry.getHeldLightEmission(heldStack);
      this.world.setHeldLight(this.player.x, this.player.y + 1.15, this.player.z, heldLight);

      const pLight = this.world.getLightAt(this.player.x, this.player.y + 1.0, this.player.z);
      const effBlockLight = Math.max(pLight.block, heldLight);
      this.firstPersonHand.setEnvironmentLight(
        pLight.sky,
        effBlockLight,
        this.skyRenderer.sunIntensity,
        this.skyRenderer.skyTint,
        this.skyRenderer.torchTint
      );
      this.playerModel.setEnvironmentLight(
        pLight.sky,
        effBlockLight,
        this.skyRenderer.sunIntensity,
        this.skyRenderer.skyTint,
        this.skyRenderer.torchTint
      );
    }

    // Render live 3D paper-doll Steve inside open Inventory (uses main WebGLRenderer)
    if (this.inventoryUI?.isOpen && this.inventoryUI.mode === 'inventory') {
      this.playerPreview.renderToTarget(this.renderer, this.player?.time || now * 0.001);
    }

    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    if (this.player && this.player.cameraMode === CAMERA_MODES.FIRST_PERSON) {
      this.firstPersonHand.render(this.renderer);
    }

    this.hud.updateDebug({
      player: this.player,
      world: this.world,
      sky: this.skyRenderer,
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
