import * as THREE from '../vendor/three.module.min.js';
import { SoundManager } from './audio/SoundManager.js';
import { BLOCK_IDS, BlockRegistry } from './blocks/BlockRegistry.js';
import {
  AUTOSAVE_INTERVAL_MS,
  BOW_CHARGE_SEC,
  CAMERA_MODES,
  CREATIVE_BREAK_COOLDOWN,
  DEFAULT_RENDER_DISTANCE_MOBILE,
  DEFAULT_RENDER_DISTANCE_PC,
  DEFAULT_WORLD_TIME,
  EAT_DURATION_SEC,
  MELEE_REACH,
  PLAYER_HALF_WIDTH,
  REACH_DISTANCE,
  SLEEP_END_TICK,
  SLEEP_START_TICK,
  TICK_MS,
  WORLD_HEIGHT,
} from './constants.js';
import { ParticleManager } from './effects/ParticleManager.js';
import { EntityManager } from './entities/EntityManager.js';
import { FallingBlockManager } from './entities/FallingBlockEntity.js';
import { ItemEntityManager } from './entities/ItemEntity.js';
import { Inventory } from './items/Inventory.js';
import { ITEM_IDS } from './items/ItemIds.js';
import { ItemRegistry } from './items/ItemRegistry.js';
import { aabbIntersectsBlock, collidesWithWorld } from './physics/AABBPhysics.js';
import { FirstPersonHand } from './player/FirstPersonHand.js';
import { PlayerController } from './player/PlayerController.js';
import {
  InventoryPlayerPreview,
  PlayerModel,
  createSkinTextureFromSpec,
  createSteveSkinTexture,
} from './player/PlayerSkin.js';
import { SaveManager } from './storage/SaveManager.js';
import { TextureAtlas } from './textures/TextureAtlas.js';
import { Hotbar } from './ui/Hotbar.js';
import { Hud } from './ui/Hud.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { MobileControls } from './ui/MobileControls.js';
import { VirtualMouse } from './ui/VirtualMouse.js';
import { BlockEntityManager } from './world/BlockEntityManager.js';
import { MenuPanorama } from './world/MenuPanorama.js';
import { BreakCrackOverlay, SelectionBox, raycastEntities, raycastVoxel } from './world/Raycast.js';
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
    this.soundManager = new SoundManager();
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
      resolutionScale: 1.0,
      touchScale: 1.0,
      fogEnabled: false,
      cloudsEnabled: true,
      starsEnabled: true,
      fancyLeaves: true,
      smoothLighting: true,
      animatedFluids: true,
      particlesMode: isTouchDevice ? 'minimal' : 'all',
      sensitivity: 1.0,
      hintsEnabled: true,
      gameMode: 'survival',
      skin: { preset: 'steve', customDataUrl: '' },
      audio: { master: 80, music: 60, blocks: 80, hostile: 80, ui: 80 },
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
    this.particleManager = new ParticleManager(this.scene, this.atlas);
    this.itemManager = new ItemEntityManager(this.scene, this.atlas);
    this.fallingManager = new FallingBlockManager(this.scene, this.atlas);
    this.entityManager = new EntityManager(this.scene, this.atlas);
    this.entityManager.setSoundManager(this.soundManager);

    this.inventory = new Inventory({ creativeMode: false });
    this.blockEntities = new BlockEntityManager();
    this.blockEntities.onSmeltXp = (wx, wy, wz, xp) => {
      if (xp > 0) this.entityManager?.spawnXpOrbs(wx, wy, wz, xp);
    };
    this.inventoryUI = null;

    this.world = null;
    this.player = null;
    this.hotbar = null;
    this.mobileControls = null;
    this.hud = null;

    this.activeWorldId = null;
    this.activeWorldName = 'Мой Мир #1';
    this.currentWorldMode = 'survival';
    this.currentWorldType = 'default';
    this.currentWorldHardcore = false;
    this.currentBonusChest = false;
    this.bonusChestPlaced = false;
    this.hardcoreDeadSpectating = false;
    this.worldSeed = randomWorldSeed();
    this.spawnPoint = null;
    this.bedSpawnPoint = null;

    this.currentTargetHit = null;
    this.creativeBreakTimer = 0;
    this.wasMiningHeld = false;
    this.miningBlockKey = '';
    this.miningElapsed = 0;
    this.hitParticleTimer = 0;
    this.eatingElapsed = 0;
    this.eatCrumbTimer = 0;
    this.eatingSlotIndex = -1;
    this.bowChargeTime = 0;
    this.isSleeping = false;
    this._wasHeadInWater = false;
    this._stepSoundTimer = 0;
    this._guiPausedFrameDone = false;
    this.virtualMouse = null;

    this.lastFrameTime = performance.now();
    this.tickAccumulator = 0;
    this.tickCount = 0;
    this.autosaveTimer = null;
    this.debouncedSaveTimer = null;
    this.isRunning = false;

    window.__MC_GAME__ = this;
  }

  get gameMode() {
    return this.currentWorldMode === 'creative' ? 'creative' : 'survival';
  }

  _applyPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const scale = Math.max(0.5, Math.min(1.25, Number(this.settings.resolutionScale) || 1.0));
    const cap = this.settings.highQuality ? (this.settings.touchMode ? 1.65 : 2.0) : 1.15;
    const effective = Math.max(0.5, Math.min(2.25, Math.min(dpr, cap) * scale));
    this.renderer.setPixelRatio(effective);
    this._guiPausedFrameDone = false;
  }

  _applySkin(skinSpec = this.settings.skin) {
    const spec = skinSpec || { preset: 'steve', customDataUrl: '' };
    const nextTex = createSkinTextureFromSpec(spec, (loadedTex) => {
      this.skinTexture = loadedTex;
      this.playerModel?.setSkinTexture(loadedTex);
      this.playerPreview?.setSkinTexture(loadedTex);
      this.firstPersonHand?.setSkinTexture(loadedTex);
      this.hud?.setSkinMenuUI(spec, loadedTex.image);
    });
    this.skinTexture = nextTex;
    this.playerModel?.setSkinTexture(nextTex);
    this.playerPreview?.setSkinTexture(nextTex);
    this.firstPersonHand?.setSkinTexture(nextTex);
    this.hud?.setSkinMenuUI(spec, nextTex.image);
  }

  _applySensitivity() {
    const mult = this.settings.sensitivity || 1.0;
    if (this.player) this.player.mouseSensitivity = 0.0022 * mult;
    if (this.mobileControls) this.mobileControls.touchSensitivity = 0.0052 * mult;
  }

  _syncHeldAndArmorVisuals() {
    const held = this.inventory.getHeldStack();
    const heldDef = held ? ItemRegistry.get(held.id) : null;
    this.firstPersonHand.setHeldItem(held);
    this.playerModel.setHeldItem(held);
    this.playerModel.setArmor(this.inventory.armor);
    this.playerPreview?.syncEquipment(held, this.inventory.armor);
    if (this.player) this.player.selectedHotbarIndex = this.inventory.selectedSlot;
    const modeTag = heldDef?.isBow ? 'bow' : ((heldDef?.isPearl || heldDef?.isEgg) ? 'throw' : '');
    this.mobileControls?.setHeldFoodIndicator(ItemRegistry.isFood(held?.id) || Boolean(heldDef?.isMilk), modeTag);
  }

  _dropHeld(count) {
    if (this.inventoryUI?.isOpen || this.hud?.isPaused || !this.player || this.player.isDead) return;
    const dropped = this.inventory.dropFromSlot(this.inventory.selectedSlot, count);
    if (dropped) {
      this._dropStackFromPlayer(dropped);
      this.hotbar.render();
      this._syncHeldAndArmorVisuals();
    }
  }

  _dropStackFromPlayer(stack) {
    if (!stack || !stack.id || stack.count <= 0 || !this.player) return;
    const eye = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    this.itemManager.spawnPlayerDrop(stack, eye.x, eye.y - 0.25, eye.z, dir);
    this._scheduleSave();
  }

  openInventoryModal(mode = 'inventory', blockPos = null) {
    if (!this.inventoryUI || !this.player || this.player.isDead || this.hardcoreDeadSpectating || this.hud?.inMainMenu || this.hud?.isPaused) return;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this._guiPausedFrameDone = false;
    this.player.setGuiOpen(true);
    this.inventoryUI.open(mode, blockPos);
    this.virtualMouse?.setGuiOpen(true);
  }

  togglePlayerInventory() {
    if (!this.inventoryUI || !this.player || this.player.isDead || this.hardcoreDeadSpectating || this.hud?.inMainMenu) return;
    if (this.inventoryUI.isOpen) {
      this.inventoryUI.close();
      return;
    }
    if (this.hud?.isPaused) return;
    this.openInventoryModal('inventory');
  }

  async init() {
    this._setLoadingText('Загрузка настроек и списка миров...');
    await this.saveManager.init();
    const savedSettings = await this.saveManager.loadSettings();
    if (savedSettings) {
      const mergedAudio = { ...this.settings.audio, ...(savedSettings.audio || {}) };
      const mergedSkin = { ...this.settings.skin, ...(savedSettings.skin || {}) };
      Object.assign(this.settings, savedSettings);
      this.settings.audio = mergedAudio;
      this.settings.skin = mergedSkin;
    }

    this.soundManager.setVolumes(this.settings.audio);
    this._applySkin(this.settings.skin);
    this.inventory.creativeMode = this.gameMode === 'creative';
    this._applyPixelRatio();
    this.skyRenderer.setCloudsEnabled(this.settings.cloudsEnabled);
    this.skyRenderer.setStarsEnabled(this.settings.starsEnabled);
    this.particleManager.setMode(this.settings.particlesMode);

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

    this.virtualMouse = new VirtualMouse({
      isTouchDevice: this.settings.touchMode,
      onPointerDown: (button, x, y, shiftKey, target) =>
        this.inventoryUI?.handleVirtualPointerDown(button, x, y, shiftKey, target),
      onPointerMove: (x, y, hoveredEl, activeButton) =>
        this.inventoryUI?.handleVirtualPointerMove(x, y, hoveredEl, activeButton),
      onPointerUp: (button, x, y, shiftKey, target) =>
        this.inventoryUI?.handleVirtualPointerUp(button, x, y, shiftKey, target),
      onSlotVirtualClick: (zone, index, button, shiftKey, x, y) =>
        this.inventoryUI?.handleVirtualSlotClick(zone, index, button, shiftKey, x, y),
      onVirtualDrop: (zone, index) => this.inventoryUI?.handleVirtualDrop(zone, index),
      onStatusToast: (msg) => this.hud?.showToast(msg),
    });

    this.inventoryUI = new InventoryUI(this.atlas, this.inventory, this.blockEntities, {
      playerPreview: this.playerPreview,
      onDropStack: (stack) => this._dropStackFromPlayer(stack),
      onCollectFurnaceXp: (xp) => {
        if (xp > 0) this.player?.addXp(xp);
      },
      onClose: () => {
        this._guiPausedFrameDone = false;
        this.virtualMouse?.setGuiOpen(false);
        this.player?.setGuiOpen(false);
        this.hotbar?.render();
        this._syncHeldAndArmorVisuals();
        if (this.activeWorldId) this._scheduleSave();
        if (!this.settings.touchMode && !this.hud?.isPaused && !this.hud?.inMainMenu && !this.player?.isDead) {
          this._requestPointerLockSafe();
        }
      },
    });

    this.hud = new Hud({
      onCycleCamera: () => this.player?.cycleCameraMode(),
      onPauseChange: (paused) => {
        this._guiPausedFrameDone = false;
        if (paused && this.inventoryUI?.isOpen) {
          this.inventoryUI.close();
        }
        this.player?.setPaused(paused);
        this.hud.setPointerLocked(Boolean(this.player?.pointerLocked));
      },
      onResume: () => {
        this._guiPausedFrameDone = false;
        this.soundManager.playUiClick();
        if (!this.settings.touchMode && !this.player?.isDead) {
          this._requestPointerLockSafe();
        }
      },
      onRespawn: () => {
        this.soundManager.playUiClick();
        this.respawnPlayer();
      },
      onSpectateWorld: () => {
        this.soundManager.playUiClick();
        this._enterHardcoreSpectateMode();
      },
      onOpenWorldsManager: async () => {
        this.soundManager.playUiClick();
        const list = await this.saveManager.listWorlds();
        this.hud.renderWorldsList(list, this.activeWorldId);
      },
      onOpenSkinsMenu: () => {
        this.soundManager.playUiClick();
        this.hud.setSkinMenuUI(this.settings.skin, this.skinTexture?.image);
      },
      onSelectSkinPreset: (preset) => {
        this.soundManager.playUiClick();
        this.settings.skin = { preset: preset || 'steve', customDataUrl: '' };
        this._applySkin(this.settings.skin);
        this.saveSettingsOnly();
        this.hud.showToast(`Скин выбран: ${preset === 'alex' ? 'Алекс' : preset === 'knight' ? 'Рыцарь' : 'Стив'}`);
      },
      onUploadCustomSkin: (dataUrl) => {
        this.soundManager.playUiClick();
        this.settings.skin = { preset: 'custom', customDataUrl: dataUrl };
        this._applySkin(this.settings.skin);
        this.saveSettingsOnly();
        this.hud.showToast('Собственный PNG-скин установлен!');
      },
      onCreateWorld: async ({ name, seed, gameMode, worldType, hardcore, bonusChest }) => {
        this.soundManager.playUiClick();
        const meta = await this.saveManager.createWorld({
          name,
          seed,
          gameMode,
          worldType,
          hardcore,
          bonusChest,
        });
        await this.enterWorld(meta.id);
      },
      onSelectWorld: async (worldId) => {
        this.soundManager.playUiClick();
        await this.enterWorld(worldId);
      },
      onRenameWorld: async (worldId, newName) => {
        this.soundManager.playUiClick();
        await this.saveManager.renameWorld(worldId, newName);
        const nextList = await this.saveManager.listWorlds();
        if (this.activeWorldId === worldId) {
          this.activeWorldName = newName;
        }
        this.hud.renderWorldsList(nextList, this.activeWorldId);
        this.hud.showToast(`Переименовано: ${newName}`);
      },
      onExportWorld: async (worldId) => {
        this.soundManager.playUiClick();
        const json = await this.saveManager.exportWorldJson(worldId);
        if (!json) {
          this.hud.showToast('Не удалось экспортировать мир');
          return;
        }
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `minecraft-${worldId}.mcworld.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.hud.showToast('Файл .mcworld.json скачан');
      },
      onImportWorldJson: async (jsonText) => {
        this.soundManager.playUiClick();
        try {
          const meta = await this.saveManager.importWorldJson(jsonText);
          const list = await this.saveManager.listWorlds();
          this.hud.renderWorldsList(list, this.activeWorldId);
          this.hud.showToast(`Импортирован мир: ${meta.name}`);
        } catch (err) {
          this.hud.showToast(`Ошибка импорта: ${err?.message || 'неверный формат'}`);
        }
      },
      onDeleteWorld: async (worldId) => {
        this.soundManager.playUiClick();
        const nextList = await this.saveManager.deleteWorld(worldId);
        if (this.activeWorldId === worldId) {
          this.activeWorldId = null;
        }
        this.hud.renderWorldsList(nextList, this.activeWorldId);
        this.hud.showToast('Мир удалён');
      },
      onExitToMenu: async () => {
        this.soundManager.playUiClick();
        if (this.inventoryUI?.isOpen) this.inventoryUI.close();
        this.virtualMouse?.setGuiOpen(false);
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
      onToggleStarsMode: () => {
        this.settings.starsEnabled = !this.settings.starsEnabled;
        this.skyRenderer.setStarsEnabled(this.settings.starsEnabled);
        this.hud.setStarsEnabledLabel(this.settings.starsEnabled);
        this.saveSettingsOnly();
      },
      onToggleLeavesMode: () => {
        this.settings.fancyLeaves = !this.settings.fancyLeaves;
        this.world?.applyGraphicsSettings({ fancyLeaves: this.settings.fancyLeaves });
        this.hud.setFancyLeavesLabel(this.settings.fancyLeaves);
        this.saveSettingsOnly();
      },
      onToggleSmoothLightMode: () => {
        this.settings.smoothLighting = !this.settings.smoothLighting;
        this.world?.applyGraphicsSettings({ smoothLighting: this.settings.smoothLighting });
        this.hud.setSmoothLightingLabel(this.settings.smoothLighting);
        this.saveSettingsOnly();
      },
      onToggleAnimFluidMode: () => {
        this.settings.animatedFluids = !this.settings.animatedFluids;
        this.world?.applyGraphicsSettings({ animatedFluids: this.settings.animatedFluids });
        this.hud.setAnimatedFluidsLabel(this.settings.animatedFluids);
        this.saveSettingsOnly();
      },
      onCycleParticlesMode: () => {
        const order = ['all', 'minimal', 'off'];
        const cur = order.indexOf(this.settings.particlesMode);
        this.settings.particlesMode = order[(cur + 1) % order.length];
        this.particleManager.setMode(this.settings.particlesMode);
        this.hud.setParticlesModeLabel(this.settings.particlesMode);
        this.saveSettingsOnly();
      },
      onToggleHints: (enabled) => {
        this.settings.hintsEnabled = enabled;
        this.saveSettingsOnly();
      },
      onChangeRenderDistance: (dist) => {
        this.settings.renderDistance = dist;
        this.world?.setRenderDistance(dist);
        this._guiPausedFrameDone = false;
        this.saveSettingsOnly();
      },
      onChangeResolutionScale: (scale) => {
        this.settings.resolutionScale = Math.max(0.5, Math.min(1.25, Number(scale) || 1.0));
        this._applyPixelRatio();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        this.saveSettingsOnly();
      },
      onChangeSensitivity: (mult) => {
        this.settings.sensitivity = mult;
        this._applySensitivity();
        this.saveSettingsOnly();
      },
      onChangeTouchScale: (scale) => {
        this.settings.touchScale = Math.max(0.75, Math.min(1.35, Number(scale) || 1.0));
        this.mobileControls?.setTouchScale(this.settings.touchScale);
        this.saveSettingsOnly();
      },
      onChangeAudioVolume: (channel, val) => {
        if (!this.settings.audio) this.settings.audio = {};
        this.settings.audio[channel] = val;
        this.soundManager.setChannelVolume(channel, val);
        this.saveSettingsOnly();
      },
    });

    let worlds = await this.saveManager.listWorlds();
    if (worlds.length === 0) {
      const first = await this.saveManager.createWorld({ name: 'Мой Мир #1', seed: randomWorldSeed() });
      worlds = [first];
    }

    this.mobileControls = new MobileControls(null, {
      onStatusToast: (msg) => this.hud.showToast(msg),
      onPrimaryAttack: () => this._handlePrimaryAttack(),
      onDropOne: () => this._dropHeld(1),
      onDropAll: () => this._dropHeld(64),
    });

    this.mobileControls.setTouchScale(this.settings.touchScale);
    this.setTouchMode(this.settings.touchMode, false);
    document.body.classList.add('webgl-crosshair');
    this._syncSettingsUI();
    this._applySensitivity();
    this._bindWindowEvents();
    this._bindKeyboardShortcuts();
    this._bindPointerLock();
    this._startAutosave();

    this.loadingOverlay?.classList.add('hidden');
    this.hud.showMainMenu(false);
    this.hud.setSkinMenuUI(this.settings.skin, this.skinTexture?.image);
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
        if (this.inventoryUI?.isOpen || this.hud?.isPaused || !this.player || this.player.isDead) return;
        const dropCount = (e.ctrlKey || e.metaKey || e.shiftKey) ? 64 : 1;
        this._dropHeld(dropCount);
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
    this.hud.setStarsEnabledLabel(this.settings.starsEnabled);
    this.hud.setFancyLeavesLabel(this.settings.fancyLeaves);
    this.hud.setSmoothLightingLabel(this.settings.smoothLighting);
    this.hud.setAnimatedFluidsLabel(this.settings.animatedFluids);
    this.hud.setParticlesModeLabel(this.settings.particlesMode);
    this.hud.setHintsEnabledLabel(this.settings.hintsEnabled);
    this.hud.setRenderDistanceUI(this.settings.renderDistance);
    this.hud.setResolutionScaleUI(this.settings.resolutionScale);
    this.hud.setSensitivityUI(this.settings.sensitivity);
    this.hud.setTouchScaleUI(this.settings.touchScale);
    this.hud.setAudioVolumesUI(this.settings.audio);
    this.hud.setSkinMenuUI(this.settings.skin, this.skinTexture?.image);
  }

  _unloadWorldFromEngine() {
    if (this.inventoryUI?.isOpen) this.inventoryUI.close();
    this.blockEntities.clear();
    this.itemManager.clear();
    this.fallingManager.clear();
    this.entityManager.clear();
    this.particleManager.clear();
    this.selectionBox.update(null);
    this.breakOverlay.update(null, 0);
    this.currentTargetHit = null;
    this.creativeBreakTimer = 0;
    this.miningBlockKey = '';
    this.miningElapsed = 0;
    this.bowChargeTime = 0;
    this.firstPersonHand.setBowCharge(0);
    this.isSleeping = false;
    this.hardcoreDeadSpectating = false;
    this._guiPausedFrameDone = false;

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

    // 1. Falling sand/gravel 6-neighbor stability cascade
    this.fallingManager.scheduleAround(wx, wy, wz);

    // 2. If block was removed, detach any torches/ladders/crops/plants supported by this block (drops in BOTH modes)
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

      const aboveId = this.world.getBlock(wx, wy + 1, wz);
      if (aboveId !== 0 && (BlockRegistry.isCrop(aboveId) || BlockRegistry.isCross(aboveId))) {
        const drops = BlockRegistry.getHarvestDrops(aboveId, null);
        this.world.setBlock(wx, wy + 1, wz, 0, true, false);
        for (const d of drops) {
          this.itemManager.spawnDrop(d.id, wx + 0.5, wy + 1.25, wz + 0.5, d.count);
        }
      }

      // 3. Spill chest/furnace contents and close modal if currently viewing it
      this.blockEntities.onBlockRemoved(wx, wy, wz, this.itemManager);
      if (this.inventoryUI?.isOpen && this.inventoryUI.activeBlockPos &&
          this.inventoryUI.activeBlockPos.x === wx &&
          this.inventoryUI.activeBlockPos.y === wy &&
          this.inventoryUI.activeBlockPos.z === wz) {
        this.inventoryUI.close();
      }
    } else if (newId !== 0 && BlockRegistry.isSolid(newId) && wy > 0) {
      // Placing a solid block directly onto farmland turns it back to dirt
      if (this.world.getBlock(wx, wy - 1, wz) === BLOCK_IDS.FARMLAND) {
        this.world.setBlock(wx, wy - 1, wz, BLOCK_IDS.DIRT, true, false);
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

  _handlePlayerDeath(sourceType, score, deathXp = 0) {
    if (!this.player) return;
    if (this.inventoryUI?.isOpen) {
      this.inventoryUI.close();
    }
    this.virtualMouse?.setGuiOpen(false);
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    this.eatingElapsed = 0;
    this.eatCrumbTimer = 0;
    this.bowChargeTime = 0;
    this.firstPersonHand?.setEatingActive(false);
    this.firstPersonHand?.setBowCharge(0);

    if (this.gameMode !== 'creative') {
      const dropped = this.inventory.extractAllForDeath();
      for (const stack of dropped) {
        this.itemManager.spawnDeathDrop(stack, this.player.x, this.player.y, this.player.z);
      }
      if (deathXp > 0) {
        this.entityManager.spawnXpOrbs(this.player.x, this.player.y + 0.5, this.player.z, deathXp);
      }
      this.hotbar?.render();
      this._syncHeldAndArmorVisuals();
    }

    this.hud?.updateSurvivalVitals(this.player, this.inventory.getArmorDefense());
    this.hud?.showDeathScreen(sourceType, score, this.currentWorldHardcore);
    this.saveNow();
  }

  _enterHardcoreSpectateMode() {
    if (!this.player) return;
    this.hardcoreDeadSpectating = true;
    this.player.isDead = false;
    this.player.creativeMode = true;
    this.player.flyMode = true;
    this.player.y = Math.max(this.player.y + 1.5, 4);
    this.playerModel.setDead?.(false);
    this.hud?.hideDeathScreen();
    this.hud?.showToast('Режим наблюдателя (Хардкор)');
    if (!this.settings.touchMode) {
      this._requestPointerLockSafe();
    }
  }

  _trySpawnBonusChest() {
    if (!this.currentBonusChest || this.bonusChestPlaced || !this.world || !this.player) return;
    const cx = Math.floor(this.player.x) + 2;
    const cz = Math.floor(this.player.z) + 2;
    const cy = Math.max(1, Math.min(WORLD_HEIGHT - 4, this.world.getSurfaceHeightAt(cx, cz)));
    this.world.setBlock(cx, cy, cz, BLOCK_IDS.CHEST, true, true, 2);
    const chest = this.blockEntities.getOrCreateChest(cx, cy, cz);
    if (chest && Array.isArray(chest.slots)) {
      const loot = [
        ItemRegistry.createStack(ITEM_IDS.WOODEN_PICKAXE, 1),
        ItemRegistry.createStack(ITEM_IDS.WOODEN_AXE, 1),
        ItemRegistry.createStack(ITEM_IDS.APPLE, 4),
        ItemRegistry.createStack(ITEM_IDS.BREAD, 3),
        ItemRegistry.createStack(BLOCK_IDS.OAK_LOG, 6),
        ItemRegistry.createStack(ITEM_IDS.STICK, 6),
      ];
      for (let i = 0; i < loot.length && i < chest.slots.length; i++) {
        chest.slots[i] = loot[i];
      }
    }
    const torchDirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of torchDirs) {
      const tx = cx + dx;
      const tz = cz + dz;
      const ty = Math.max(1, this.world.getSurfaceHeightAt(tx, tz));
      if (this.world.getBlock(tx, ty, tz) === 0 && BlockRegistry.isSolid(this.world.getBlock(tx, ty - 1, tz))) {
        this.world.setBlock(tx, ty, tz, BLOCK_IDS.TORCH, true, true, 0);
      }
    }
    this.bonusChestPlaced = true;
  }

  _isBedSpotValid(spot) {
    if (!spot || !this.world) return false;
    const bx = Math.floor(spot.x);
    const by = Math.floor(spot.y);
    const bz = Math.floor(spot.z);
    for (let dy = -1; dy <= 1; dy++) {
      const id = this.world.getBlock(bx, by + dy, bz);
      if (BlockRegistry.get(id).isBed) {
        return true;
      }
    }
    return false;
  }

  respawnPlayer() {
    if (!this.player || !this.world) return;
    let target = null;
    if (this.bedSpawnPoint) {
      if (this._isBedSpotValid(this.bedSpawnPoint)) {
        target = { ...this.bedSpawnPoint };
      } else {
        this.hud?.showToast('Ваша кровать отсутствует или заблокирована');
        this.bedSpawnPoint = null;
      }
    }
    if (!target) {
      target = this.spawnPoint
        ? { ...this.spawnPoint }
        : this.world.worldGen.findSafeSpawn();
    }

    this.world.preloadSpawnArea(target.x, target.z, 2);
    let ry = Number.isFinite(target.y) ? target.y : this.world.getSurfaceHeightAt(target.x, target.z);
    while (
      ry < WORLD_HEIGHT - 3 &&
      collidesWithWorld(this.world, target.x, ry, target.z, PLAYER_HALF_WIDTH, 1.8)
    ) {
      ry += 1;
    }

    this.player.respawn({ x: target.x, y: ry, z: target.z });
    this.playerModel.setDead?.(false);
    this.hud?.hideDeathScreen();
    this.hud?.updateSurvivalVitals(this.player, this.inventory.getTotalArmorPoints());
    this._syncHeldAndArmorVisuals();
    if (!this.settings.touchMode) {
      this._requestPointerLockSafe();
    }
    this.saveNow();
  }

  async loadWorldIntoEngine(worldId) {
    this._unloadWorldFromEngine();

    const saved = await this.saveManager.loadWorld(worldId);
    this.activeWorldId = worldId;
    this.activeWorldName = saved?.name || 'Мой Мир #1';
    this.currentWorldMode = saved?.gameMode === 'creative' ? 'creative' : 'survival';
    this.currentWorldType = saved?.worldType === 'superflat' ? 'superflat' : 'default';
    this.currentWorldHardcore = Boolean(saved?.hardcore);
    if (this.currentWorldHardcore) this.currentWorldMode = 'survival';
    this.currentBonusChest = Boolean(saved?.bonusChest);
    this.bonusChestPlaced = Boolean(saved?.bonusChestPlaced);
    this.hardcoreDeadSpectating = Boolean(this.currentWorldHardcore && saved?.dead);
    this.worldSeed = Number.isFinite(saved?.worldSeed) ? saved.worldSeed : randomWorldSeed();
    this.spawnPoint = saved?.spawnPoint || null;
    this.bedSpawnPoint = saved?.bedSpawnPoint || null;

    this.skyRenderer.setTime(
      Number.isFinite(saved?.worldTime) ? saved.worldTime : DEFAULT_WORLD_TIME,
      Number.isFinite(saved?.dayCount) ? saved.dayCount : 1
    );

    this.world = new World(this.scene, this.atlas, this.worldSeed, this.settings.renderDistance, {
      worldType: this.currentWorldType,
      unlimitedMemory: this.settings.unlimitedMemory,
      fogEnabled: this.settings.fogEnabled,
      fancyLeaves: this.settings.fancyLeaves,
      smoothLighting: this.settings.smoothLighting,
      animatedFluids: this.settings.animatedFluids,
      onBlockChanged: (wx, wy, wz, id, oldId, oldMeta) => {
        this._handleBlockSideEffects(wx, wy, wz, id, oldId, oldMeta);
      },
      onWashBlock: (wx, wy, wz, washedId) => {
        const drops = BlockRegistry.getHarvestDrops(washedId, null);
        for (const d of drops) {
          this.itemManager.spawnDrop(d.id, wx + 0.5, wy + 0.3, wz + 0.5, d.count);
        }
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

    if (saved?.entities) {
      this.entityManager.restore(saved.entities);
    } else {
      this.entityManager.clear();
    }

    const spawn = saved?.player ?? this.world.worldGen.findSafeSpawn();
    const isCreative = this.currentWorldMode === 'creative';

    this.player = new PlayerController(this.camera, this.world, this.playerModel, this.firstPersonHand, {
      ...spawn,
      ...(saved?.survival || {}),
      creativeMode: isCreative,
      flyMode: isCreative ? Boolean(saved?.player?.flyMode) : false,
      sensitivity: 0.0022 * (this.settings.sensitivity || 1.0),
      inventory: this.inventory,
      onGetHeldStack: () => this.inventory.getHeldStack(),
      onConsumeHeld: (n) => this.inventory.consumeHeld(n),
      getArmorPoints: () => this.inventory.getTotalArmorPoints(),
      onPrimaryAttack: () => this._handlePrimaryAttack(),
      onEatTick: (itemId) => {
        this.particleManager.spawnFoodCrumbs(this.player, itemId, 3);
        this.soundManager.playEat();
      },
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
      onArmorDamage: (wear) => {
        if (this.inventory.damageArmor(wear)) {
          this.hotbar?.render();
          this._syncHeldAndArmorVisuals();
        }
      },
      onDamage: (info) => {
        const amt = typeof info === 'object' ? (info?.finalDmg ?? info?.amount ?? 0) : Number(info || 0);
        const src = typeof info === 'object' ? info?.sourceType : 'generic';
        this.soundManager.playHurt(src === 'fall' || amt >= 6);
        this.hud?.triggerDamageFlash();
        this.hud?.updateSurvivalVitals(this.player, this.inventory.getTotalArmorPoints());
      },
      onDeath: (sourceType, deathXp = 0) => {
        this._handlePlayerDeath(sourceType, this.player?.score || 0, deathXp);
      },
    });

    if (this.mobileControls) {
      this.mobileControls.player = this.player;
      this.mobileControls.setCreativeMode(isCreative);
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
      this._trySpawnBonusChest();
    }

    this.inventory.creativeMode = isCreative;
    if (saved?.inventory) {
      this.inventory.loadState(saved.inventory);
    } else if (saved?.hotbar) {
      this.inventory.clearAll();
      this.hotbar.loadState(saved.hotbar);
    } else if (isCreative) {
      this.hotbar.resetStarterKit();
    } else {
      this.inventory.clearAll();
    }
    this.hotbar.setCreativeMode(isCreative);
    this.hotbar.render();
    this._syncHeldAndArmorVisuals();

    this.skyRenderer.update(0.001, this.player.x, this.player.y, this.player.z, this.world);
    this.player.update(0.001);
    this.hud?.updateSurvivalVitals(this.player, this.inventory.getArmorDefense());
    if (this.currentWorldHardcore && saved?.dead) {
      this.player.isDead = true;
      this.hud?.showDeathScreen(this.player.lastDamageSource || 'generic', this.player.score || 0, true);
    } else if (this.player.isDead) {
      this.hud?.showDeathScreen(this.player.lastDamageSource || 'generic', this.player.score || 0, this.currentWorldHardcore);
    }
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
    this.virtualMouse?.setTouchDevice(this.settings.touchMode);
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
    const bx = hit.x + 0.5;
    const by = hit.y + 0.6;
    const bz = hit.z + 0.5;
    this.bedSpawnPoint = { x: bx, y: by, z: bz };
    this.spawnPoint = { x: bx, y: by, z: bz };
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
      this.hud.showToast('Точка возрождения установлена (спать можно ночью)');
      this._scheduleSave();
    }
    return true;
  }

  _hasAnyArrow() {
    if (this.gameMode === 'creative') return true;
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const s = this.inventory.slots[i];
      if (s && s.id === ITEM_IDS.ARROW && s.count > 0) return true;
    }
    return false;
  }

  _consumeAnyArrow() {
    if (this.gameMode === 'creative') return true;
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const s = this.inventory.slots[i];
      if (s && s.id === ITEM_IDS.ARROW && s.count > 0) {
        return this.inventory.consumeFromSlot(i, 1);
      }
    }
    return false;
  }

  _handlePrimaryAttack() {
    if (!this.world || !this.player || this.player.isDead || this.hardcoreDeadSpectating || this.player.isPaused || this.player.guiOpen) return false;
    const eye = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    const reach = this.gameMode === 'creative' ? REACH_DISTANCE : MELEE_REACH;
    const blockDist = this.currentTargetHit ? this.currentTargetHit.distance : reach;
    const mobHit = raycastEntities(eye, dir, Math.min(reach, blockDist), this.entityManager.mobs);
    if (!mobHit) return false;

    const ok = this.entityManager.tryMeleeAttack(this.player, mobHit.entity, this.particleManager);
    if (ok) {
      this.soundManager.playHit();
      this.hotbar.render();
      this._syncHeldAndArmorVisuals();
      this.miningElapsed = 0;
      this.breakOverlay.update(null, 0);
      this._scheduleSave();
    }
    return ok;
  }

  _handlePlaceBlock() {
    const hit = this.currentTargetHit;
    if (!this.world || !this.player || this.player.isDead || this.hardcoreDeadSpectating) return false;

    const eye = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    const blockDist = hit ? hit.distance : REACH_DISTANCE;
    const mobHit = raycastEntities(eye, dir, Math.min(REACH_DISTANCE, blockDist), this.entityManager.mobs);
    if (mobHit) {
      const usedOnMob = this.entityManager.tryInteractMob(
        this.player,
        mobHit.entity,
        this.particleManager,
        this.itemManager
      );
      if (usedOnMob) {
        this.hotbar.render();
        this._syncHeldAndArmorVisuals();
        this.firstPersonHand.triggerSwing();
        this._scheduleSave();
        return true;
      }
    }

    const slot = this.hotbar.getSelectedSlot();
    if (slot && slot.id > 0) {
      // Throw Ender Pearl or Egg into the world
      if (slot.id === ITEM_IDS.ENDER_PEARL) {
        this.entityManager.throwPlayerProjectile(this.player, 'ender_pearl');
        if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
        this.firstPersonHand.triggerSwing();
        this._scheduleSave();
        return true;
      }
      if (slot.id === ITEM_IDS.EGG) {
        this.entityManager.throwPlayerProjectile(this.player, 'egg');
        if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
        this.firstPersonHand.triggerSwing();
        this._scheduleSave();
        return true;
      }
    }

    if (hit) {
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

      if (slot && slot.id > 0) {
        const heldDef = ItemRegistry.get(slot.id);

        // 2a. Hoe tilling Dirt / Grass into Farmland
        if (heldDef?.toolType === 'hoe') {
          if (hit.blockId === BLOCK_IDS.GRASS || hit.blockId === BLOCK_IDS.DIRT) {
            if (hit.y + 1 < WORLD_HEIGHT && this.world.getBlock(hit.x, hit.y + 1, hit.z) === 0) {
              this.world.setBlock(hit.x, hit.y, hit.z, BLOCK_IDS.FARMLAND, true, true, 0);
              if (this.gameMode !== 'creative') {
                this.inventory.damageHeldTool(1);
                this.hotbar.render();
                this._syncHeldAndArmorVisuals();
              }
              this.firstPersonHand.triggerSwing();
              this._scheduleSave();
              return true;
            }
          }
          return false;
        }

        // 2b. Planting Wheat Seeds on Farmland
        if (slot.id === ITEM_IDS.WHEAT_SEEDS) {
          if (hit.blockId === BLOCK_IDS.FARMLAND && hit.normal?.y === 1) {
            const py = hit.y + 1;
            if (py < WORLD_HEIGHT && this.world.getBlock(hit.x, py, hit.z) === 0) {
              this.world.setBlock(hit.x, py, hit.z, BLOCK_IDS.WHEAT_0, true, true, 0);
              if (this.gameMode !== 'creative') {
                this.hotbar.consumeSelected(1);
              }
              this.firstPersonHand.triggerSwing();
              this._scheduleSave();
              return true;
            }
          }
          return false;
        }

        // 2b-2. Flint & Steel igniting TNT!
        if (slot.id === ITEM_IDS.FLINT_AND_STEEL && hit.blockId === BLOCK_IDS.TNT) {
          this.world.setBlock(hit.x, hit.y, hit.z, BLOCK_IDS.AIR, true, true, 0);
          this.entityManager.spawnPrimedTnt(hit.x + 0.5, hit.y, hit.z + 0.5);
          if (this.gameMode !== 'creative') {
            this.inventory.damageHeldTool(1);
            this.hotbar.render();
            this._syncHeldAndArmorVisuals();
          }
          this.firstPersonHand.triggerSwing();
          this._scheduleSave();
          return true;
        }

        // 2b-3. Bone Meal fertilizing crops or sprouting flowers/tall grass on Grass
        if (slot.id === ITEM_IDS.BONE_MEAL) {
          if (hit.blockId >= BLOCK_IDS.WHEAT_0 && hit.blockId < BLOCK_IDS.WHEAT_7) {
            const boost = 2 + Math.floor(Math.random() * 3);
            const nextCrop = Math.min(BLOCK_IDS.WHEAT_7, hit.blockId + boost);
            this.world.setBlock(hit.x, hit.y, hit.z, nextCrop, true, true, 0);
            this.particleManager.spawnHappy(hit.x + 0.5, hit.y + 0.6, hit.z + 0.5, 10);
            if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
            this.firstPersonHand.triggerSwing();
            this._scheduleSave();
            return true;
          }
          if (hit.blockId === BLOCK_IDS.GRASS && hit.normal?.y === 1) {
            let sprouted = false;
            const choices = [BLOCK_IDS.TALL_GRASS, BLOCK_IDS.TALL_GRASS, BLOCK_IDS.POPPY, BLOCK_IDS.DANDELION, BLOCK_IDS.BLUE_ORCHID];
            for (let ox = -2; ox <= 2; ox++) {
              for (let oz = -2; oz <= 2; oz++) {
                if (Math.random() > 0.45) continue;
                const gx = hit.x + ox;
                const gz = hit.z + oz;
                if (this.world.getBlock(gx, hit.y, gz) === BLOCK_IDS.GRASS &&
                    this.world.getBlock(gx, hit.y + 1, gz) === BLOCK_IDS.AIR) {
                  const plant = choices[(Math.random() * choices.length) | 0];
                  this.world.setBlock(gx, hit.y + 1, gz, plant, true, true, 0);
                  sprouted = true;
                }
              }
            }
            if (sprouted) {
              this.particleManager.spawnHappy(hit.x + 0.5, hit.y + 1.1, hit.z + 0.5, 12);
              if (this.gameMode !== 'creative') this.hotbar.consumeSelected(1);
              this.firstPersonHand.triggerSwing();
              this._scheduleSave();
              return true;
            }
          }
          return false;
        }
      }
    }

    // 2c. Empty Bucket: scoop Water or Lava source block (meta === 0)
    if (slot && slot.id === ITEM_IDS.BUCKET) {
      const fluidHit = raycastVoxel(
        this.world,
        this.player.getEyeOrigin(),
        this.player.getLookDirection(),
        REACH_DISTANCE,
        { includeFluids: true }
      );
      if (
        fluidHit &&
        (fluidHit.blockId === BLOCK_IDS.WATER || fluidHit.blockId === BLOCK_IDS.LAVA) &&
        this.world.getBlockMeta(fluidHit.x, fluidHit.y, fluidHit.z) === 0
      ) {
        const filledId = fluidHit.blockId === BLOCK_IDS.LAVA ? ITEM_IDS.LAVA_BUCKET : ITEM_IDS.WATER_BUCKET;
        this.world.setBlock(fluidHit.x, fluidHit.y, fluidHit.z, 0, true, true, 0);
        if (this.gameMode !== 'creative') {
          if (slot.count <= 1) {
            this.inventory.setSlot(this.inventory.selectedSlot, ItemRegistry.createStack(filledId, 1));
          } else {
            this.hotbar.consumeSelected(1);
            const rem = this.inventory.addItem(filledId, 1);
            if (rem > 0) this._dropStackFromPlayer(ItemRegistry.createStack(filledId, rem));
          }
          this.hotbar.render();
          this._syncHeldAndArmorVisuals();
        }
        this.firstPersonHand.triggerSwing();
        this._scheduleSave();
        return true;
      }
      return false;
    }

    // 2d. Filled Water/Lava Bucket: place fluid source block (meta === 0)
    if (slot && (slot.id === ITEM_IDS.WATER_BUCKET || slot.id === ITEM_IDS.LAVA_BUCKET)) {
      if (!hit || !hit.normal || (hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 0)) {
        return false;
      }
      const targetDef = BlockRegistry.get(hit.blockId);
      const px = targetDef.isCross ? hit.x : hit.x + hit.normal.x;
      const py = targetDef.isCross ? hit.y : hit.y + hit.normal.y;
      const pz = targetDef.isCross ? hit.z : hit.z + hit.normal.z;
      if (py < 0 || py >= WORLD_HEIGHT) return false;

      const existing = this.world.getBlock(px, py, pz);
      const existingDef = BlockRegistry.get(existing);
      if (existing !== 0 && !existingDef.isLiquid && !existingDef.isWashable) return false;

      if (existing !== 0 && existingDef.isWashable) {
        const drops = BlockRegistry.getHarvestDrops(existing, null);
        for (const d of drops) {
          this.itemManager.spawnDrop(d.id, px + 0.5, py + 0.3, pz + 0.5, d.count);
        }
      }

      const fluidId = ItemRegistry.get(slot.id)?.fluidId || BLOCK_IDS.WATER;
      if (!this.world.setBlock(px, py, pz, fluidId, true, true, 0)) return false;

      if (this.gameMode !== 'creative') {
        this.inventory.setSlot(this.inventory.selectedSlot, ItemRegistry.createStack(ITEM_IDS.BUCKET, 1));
        this.hotbar.render();
        this._syncHeldAndArmorVisuals();
      }
      this.firstPersonHand.triggerSwing();
      this._scheduleSave();
      return true;
    }

    if (!slot || slot.id <= 0) return false;
    if (ItemRegistry.isFood(slot.id) || slot.id === ITEM_IDS.MILK_BUCKET || slot.id === ITEM_IDS.BOW) {
      // Eating, drinking milk & bow charging are sustained while holding secondary action
      return false;
    }

    if (!hit || !hit.normal || (hit.normal.x === 0 && hit.normal.y === 0 && hit.normal.z === 0)) {
      return false;
    }

    // Non-placeable items (tools, swords, armor, coal, sticks, ingots...) cannot be placed as blocks
    if (!ItemRegistry.isBlockId(slot.id)) return false;

    const targetDef = BlockRegistry.get(hit.blockId);

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
    this.soundManager.playBlockPlace(slot.id);
    if (this.gameMode !== 'creative') {
      this.hotbar.consumeSelected(1);
    }
    this._scheduleSave();
    return true;
  }

  _updateBow(dt) {
    if (!this.player || this.player.isDead || this.hardcoreDeadSpectating) {
      this.bowChargeTime = 0;
      this.firstPersonHand.setBowCharge(0);
      return;
    }

    const secondaryHeld = this.player.isSecondaryHeld();
    const heldStack = this.inventory.getHeldStack();
    const holdingBow = Boolean(heldStack && heldStack.id === ITEM_IDS.BOW);

    if (holdingBow && secondaryHeld && this._hasAnyArrow()) {
      this.bowChargeTime += dt;
      const charge = Math.min(1.0, this.bowChargeTime / BOW_CHARGE_SEC);
      this.firstPersonHand.setBowCharge(charge);
      return;
    }

    if (this.bowChargeTime > 0) {
      if (holdingBow && this.bowChargeTime >= 0.14 && this._consumeAnyArrow()) {
        const charge = Math.min(1.0, this.bowChargeTime / BOW_CHARGE_SEC);
        this.entityManager.shootPlayerArrow(this.player, charge);
        this.soundManager.playBowShoot();
        if (this.gameMode !== 'creative') {
          this.inventory.damageHeldTool(1);
          this.hotbar.render();
          this._syncHeldAndArmorVisuals();
        }
        this.firstPersonHand.triggerSwing();
        this._scheduleSave();
      }
      this.bowChargeTime = 0;
      this.firstPersonHand.setBowCharge(0);
    }
  }

  _updateEating(dt) {
    if (!this.player || this.player.isDead) {
      this.eatingElapsed = 0;
      this.firstPersonHand.setEatingActive(false);
      return;
    }

    const secondaryHeld = this.player.isSecondaryHeld();
    const heldStack = this.inventory.getHeldStack();
    const slotIdx = this.inventory.selectedSlot;
    const isMilk = Boolean(heldStack && heldStack.id === ITEM_IDS.MILK_BUCKET);
    const foodStats = isMilk
      ? { hunger: 0, saturation: 0, canAlwaysEat: true, isMilk: true }
      : (heldStack && ItemRegistry.isFood(heldStack.id)
        ? ItemRegistry.getFoodStats(heldStack.id)
        : null);

    if (
      !secondaryHeld ||
      !foodStats ||
      !this.player.canEatFood(foodStats)
    ) {
      this.eatingElapsed = 0;
      this.eatingSlotIndex = -1;
      this.firstPersonHand.setEatingActive(false);
      return;
    }

    if (this.eatingSlotIndex !== slotIdx) {
      this.eatingSlotIndex = slotIdx;
      this.eatingElapsed = 0;
      this.eatCrumbTimer = 0;
    }

    this.firstPersonHand.setEatingActive(true);
    this.eatingElapsed += dt;
    this.eatCrumbTimer += dt;
    if (this.eatCrumbTimer >= 0.22) {
      this.eatCrumbTimer = 0;
      this.particleManager.spawnFoodCrumbs(this.player, heldStack.id, 3);
    }

    if (this.eatingElapsed >= EAT_DURATION_SEC) {
      const consumedId = heldStack.id;
      if (isMilk) {
        this.player.clearEffects();
        if (this.gameMode !== 'creative') {
          this.inventory.setSlot(slotIdx, ItemRegistry.createStack(ITEM_IDS.BUCKET, 1));
          this.hotbar.render();
          this._syncHeldAndArmorVisuals();
        }
      } else {
        this.player.applyFoodEffects(foodStats);
        if (this.gameMode !== 'creative') {
          this.inventory.consumeOneHeld();
          if (consumedId === ITEM_IDS.MUSHROOM_STEW) {
            this.inventory.addItem(ITEM_IDS.BOWL, 1);
          }
          this.hotbar.render();
          this._syncHeldAndArmorVisuals();
        }
      }

      this.hud?.updateSurvivalVitals(this.player, this.inventory.getTotalArmorPoints());
      this.soundManager.playBurp();
      this.eatingElapsed = 0;
      this.eatingSlotIndex = -1;
      this.firstPersonHand.setEatingActive(false);
      this.player.stopEating();
      this._scheduleSave();
    }
  }

  _updateInteraction(dt) {
    if (!this.player || !this.world) return;

    if (this.player.isDead || this.hardcoreDeadSpectating) {
      this.selectionBox.update(null, this.world);
      this.breakOverlay.update(null, 0);
      this.firstPersonHand.setMiningActive(false);
      this.firstPersonHand.setEatingActive(false);
      this.firstPersonHand.setBowCharge(0);
      return;
    }

    if (this.creativeBreakTimer > 0) {
      this.creativeBreakTimer = Math.max(0, this.creativeBreakTimer - dt);
    }

    const origin = this.player.getEyeOrigin();
    const dir = this.player.getLookDirection();
    const hit = raycastVoxel(this.world, origin, dir);
    this.currentTargetHit = hit;
    this.selectionBox.update(hit, this.world);

    this._updateBow(dt);
    this._updateEating(dt);

    const miningHeld = this.player.isMiningHeld();
    if (!miningHeld || !hit) {
      this.wasMiningHeld = false;
      this.creativeBreakTimer = 0;
      this.miningBlockKey = '';
      this.miningElapsed = 0;
      this.hitParticleTimer = 0;
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
        this.particleManager.spawnBlockBreak(hit.x, hit.y, hit.z, hit.blockId, 12);
        this.soundManager.playBlockBreak(hit.blockId);
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
      this.hitParticleTimer = 0;
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
    this.hitParticleTimer += dt;
    if (this.hitParticleTimer >= 0.16) {
      this.hitParticleTimer = 0;
      this.particleManager.spawnBlockHit(hit.x, hit.y, hit.z, hit.blockId, hit.normal, 3);
    }

    const progress = breakDuration <= 0.001 ? 1.0 : Math.min(1.0, this.miningElapsed / breakDuration);
    this.breakOverlay.update(hit, progress);

    if (progress >= 1.0) {
      const drops = BlockRegistry.getHarvestDrops(hit.blockId, heldDef);
      this.particleManager.spawnBlockBreak(hit.x, hit.y, hit.z, hit.blockId, 14);
      this.soundManager.playBlockBreak(hit.blockId);
      this.world.setBlock(hit.x, hit.y, hit.z, 0, true, true);
      for (const drop of drops) {
        this.itemManager.spawnDrop(drop.id, hit.x + 0.5, hit.y + 0.35, hit.z + 0.5, drop.count);
      }

      // Ore mining XP rewards
      if (drops.length > 0) {
        const oreXpMap = {
          [BLOCK_IDS.COAL_ORE]: 1,
          [BLOCK_IDS.REDSTONE_ORE]: 2,
          [BLOCK_IDS.LAPIS_ORE]: 3,
          [BLOCK_IDS.DIAMOND_ORE]: 4,
          [BLOCK_IDS.EMERALD_ORE]: 5,
        };
        const oreXp = oreXpMap[hit.blockId] || 0;
        if (oreXp > 0) {
          this.entityManager.spawnXpOrbs(hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, oreXp);
        }
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
    if (this.settings.touchMode || this.hud?.isPaused || this.hud?.inMainMenu || this.inventoryUI?.isOpen || this.player?.isDead) return;
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
    const unlockAudio = () => {
      this.soundManager?.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.menuPanorama.resize(w, h);
      this.firstPersonHand.resize(w, h);
      this._applyPixelRatio();
      this.renderer.setSize(w, h, false);
      this._guiPausedFrameDone = false;
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
      gameMode: this.currentWorldMode,
      worldType: this.currentWorldType,
      hardcore: this.currentWorldHardcore,
      bonusChest: this.currentBonusChest,
      bonusChestPlaced: this.bonusChestPlaced,
      dead: Boolean(this.player.isDead || this.hardcoreDeadSpectating),
      worldSeed: this.worldSeed,
      worldTime: this.skyRenderer.worldTime,
      dayCount: this.skyRenderer.dayCount,
      spawnPoint: this.spawnPoint,
      bedSpawnPoint: this.bedSpawnPoint,
      biomeName: this.world.getBiomeNameAt(this.player.x, this.player.z),
      player: this.player.getPose(),
      survival: this.player.getSurvivalState(),
      hotbar: this.hotbar.exportState(),
      inventory: this.inventory.exportState(),
      blockEntities: this.blockEntities.exportState(),
      entities: this.entityManager.serialize(),
      modifiedBlocks: this.world.exportModifiedBlocks(),
      settings: this.settings,
    });
  }

  fixedTick() {
    this.tickCount++;
    if (!this.hud.inMainMenu && !this.hud.isPaused && !this.isSleeping) {
      this.skyRenderer.advanceTicks(1);
      if (this.world) {
        this.world.stepFluids();
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
      this.soundManager.updateMusic(dt, false);
      this.menuPanorama.render(this.renderer, dt);
      return;
    }

    this.soundManager.updateMusic(dt, true);

    const guiFrozen = Boolean(this.hud.isPaused || this.inventoryUI?.isOpen);

    if (!this.hud.isPaused && this.player && this.world) {
      this.tickAccumulator += dt * 1000;
      while (this.tickAccumulator >= TICK_MS) {
        this.fixedTick();
        this.tickAccumulator -= TICK_MS;
      }

      if (!this.isSleeping) {
        this.player.update(dt);
        if (!this.inventoryUI?.isOpen) {
          this._updateInteraction(dt);
        } else {
          this.breakOverlay.update(null, 0);
          this.firstPersonHand.setEatingActive(false);
          this.firstPersonHand.setBowCharge(0);
        }
      }

      // Footsteps & water splash audio feedback
      if (this.player.inWater && !this._wasHeadInWater) {
        this.soundManager.playSplash();
      }
      this._wasHeadInWater = Boolean(this.player.inWater);

      const hSpeed = Math.hypot(this.player.vx || 0, this.player.vz || 0);
      if (this.player.onGround && !this.player.flyMode && hSpeed > 1.2 && !this.player.isDead) {
        this._stepSoundTimer += dt * (hSpeed / 4.3);
        if (this._stepSoundTimer >= 0.42) {
          this._stepSoundTimer = 0;
          const groundBlock = this.world.getBlock(
            Math.floor(this.player.x),
            Math.floor(this.player.y - 0.12),
            Math.floor(this.player.z)
          );
          if (groundBlock > 0) this.soundManager.playStep(groundBlock);
        }
      } else {
        this._stepSoundTimer = 0.25;
      }

      this.hud.updateSurvivalVitals(this.player, this.inventory.getArmorDefense());

      const skyInfo = {
        sunIntensity: this.skyRenderer.sunIntensity,
        skyTint: this.skyRenderer.skyTint,
        torchTint: this.skyRenderer.torchTint,
      };

      this.fallingManager.update(dt, this.world, this.itemManager, true);
      this.itemManager.update(dt, this.world, this.player, this.inventory, skyInfo);
      this.entityManager.update(dt, {
        world: this.world,
        player: this.player,
        skyInfo,
        itemManager: this.itemManager,
        particleManager: this.particleManager,
        fallingManager: this.fallingManager,
        blockEntityManager: this.blockEntities,
      });
      this.particleManager.update(dt, this.world);
      this.world.update(this.player.x, this.player.z, dt);
      this.skyRenderer.update(dt, this.player.x, this.player.y, this.player.z, this.world);
      this.skyRenderer.updateFluidCameraEffect(this.player.headInWater, this.player.headInLava, this.world);

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

    // Throttle world rendering while Pause or Inventory modal is open to eliminate GUI lag
    if (guiFrozen) {
      if (this.inventoryUI?.isOpen && this.inventoryUI.mode === 'inventory') {
        this.playerPreview.renderToTarget(this.renderer, this.player?.time || now * 0.001);
      }
      const interval = this.inventoryUI?.isOpen ? 100 : 250;
      if (this._guiPausedFrameDone && now - (this._lastGuiRenderTime || 0) < interval) {
        return;
      }
      this._guiPausedFrameDone = true;
      this._lastGuiRenderTime = now;
    } else {
      this._guiPausedFrameDone = false;
    }

    this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    if (this.player && this.player.cameraMode === CAMERA_MODES.FIRST_PERSON) {
      this.firstPersonHand.render(this.renderer);
      if (!this.hud.inMainMenu && !this.hud.isPaused && !this.inventoryUI?.isOpen && !this.player.isDead && !this.isSleeping && !this.hardcoreDeadSpectating) {
        this.firstPersonHand.renderCrosshair(this.renderer);
      }
    }

    this.hud.updateDebug({
      player: this.player,
      world: this.world,
      sky: this.skyRenderer,
      targetHit: this.currentTargetHit,
      mobCount: this.entityManager?.mobs?.length || 0,
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
