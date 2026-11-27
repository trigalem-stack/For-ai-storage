import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CAMERA_MODES, CHUNK_SIZE } from '../constants.js';

const CAMERA_MODE_NAMES = [
  '1-е лицо',
  '3-е лицо (сзади)',
  '3-е лицо (спереди)',
];

export class Hud {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;

    this.crosshairEl = document.getElementById('crosshair');
    this.debugContainer = document.getElementById('debug-container');
    this.debugPanel = document.getElementById('debug-panel');
    this.timePillButtons = Array.from(document.querySelectorAll('.time-pill-btn'));
    this.sleepOverlay = document.getElementById('sleep-overlay');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.mainMenuOverlay = document.getElementById('main-menu-overlay');
    this.menuHome = document.getElementById('menu-home');
    this.menuWorlds = document.getElementById('menu-worlds');
    this.worldsListEl = document.getElementById('worlds-list');
    this.inputWorldName = document.getElementById('input-world-name');
    this.inputWorldSeed = document.getElementById('input-world-seed');

    this.settingsOverlay = document.getElementById('settings-overlay');
    this.pcHint = document.getElementById('pc-lock-hint');
    this.toastEl = document.getElementById('hud-toast');

    // Top-right HUD buttons
    this.btnCamera = document.getElementById('btn-camera');
    this.btnDebug = document.getElementById('btn-debug');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnPause = document.getElementById('btn-pause');

    // Main menu & world manager buttons
    this.btnMenuPlay = document.getElementById('btn-menu-play');
    this.btnMenuSettings = document.getElementById('btn-menu-settings');
    this.btnWorldsBack = document.getElementById('btn-worlds-back');
    this.btnCreateWorld = document.getElementById('btn-create-world');

    // Pause buttons
    this.btnResume = document.getElementById('btn-resume');
    this.btnPauseSettings = document.getElementById('btn-pause-settings');
    this.btnExitToMenu = document.getElementById('btn-exit-to-menu');

    // Settings tabs & controls
    this.tabButtons = Array.from(document.querySelectorAll('.settings-tab-btn'));
    this.tabPanels = Array.from(document.querySelectorAll('.settings-tab-panel'));
    this.btnSettingsClose = document.getElementById('btn-settings-close');

    this.btnControlMode = document.getElementById('btn-control-mode');
    this.btnGameMode = document.getElementById('btn-game-mode');
    this.btnFlyMode = document.getElementById('btn-fly-mode');
    this.btnMemoryMode = document.getElementById('btn-memory-mode');
    this.btnGraphicsMode = document.getElementById('btn-graphics-mode');
    this.btnFogMode = document.getElementById('btn-fog-mode');
    this.btnCloudsMode = document.getElementById('btn-clouds-mode');
    this.btnHintMode = document.getElementById('btn-hint-mode');

    this.rangeRenderDist = document.getElementById('range-render-dist');
    this.labelRenderDist = document.getElementById('label-render-dist');
    this.rangeSensitivity = document.getElementById('range-sensitivity');
    this.labelSensitivity = document.getElementById('label-sensitivity');

    this.debugVisible = false;
    this.isPaused = false;
    this.inMainMenu = true;
    this.settingsOrigin = 'menu'; // 'menu' | 'pause'
    this.hintsEnabled = true;
    this.iosPseudoFullscreen = false;
    this.toastTimer = null;

    this.fpsFrames = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 60;

    this._bindButtons();
    this._bindFullscreenEvents();
  }

  _bindButtons() {
    this.btnCamera?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onCycleCamera?.();
    });

    this.btnDebug?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDebug();
    });

    for (const btn of this.timePillButtons) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ticks = parseInt(btn.dataset.time, 10);
        if (Number.isFinite(ticks)) {
          this.callbacks.onSetWorldTime?.(ticks);
        }
      });
    }

    this.btnFullscreen?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    this.btnPause?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.inMainMenu) this.togglePause();
    });

    // Main Menu navigation
    this.btnMenuPlay?.addEventListener('click', async (e) => {
      e.stopPropagation();
      this.menuHome?.classList.add('hidden');
      this.menuWorlds?.classList.remove('hidden');
      await this.callbacks.onOpenWorldsManager?.();
    });

    this.btnMenuSettings?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openSettings('menu');
    });

    this.btnWorldsBack?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.menuWorlds?.classList.add('hidden');
      this.menuHome?.classList.remove('hidden');
    });

    this.btnCreateWorld?.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = this.inputWorldName?.value || '';
      const rawSeed = (this.inputWorldSeed?.value || '').trim();
      let parsedSeed = 0;
      if (rawSeed.length > 0) {
        const num = Number(rawSeed);
        if (Number.isFinite(num) && num !== 0) {
          parsedSeed = num | 0;
        } else {
          // String seed hash
          let h = 2166136261 >>> 0;
          for (let i = 0; i < rawSeed.length; i++) {
            h ^= rawSeed.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          parsedSeed = (h | 0) || 133742;
        }
      }
      this.callbacks.onCreateWorld?.({ name, seed: parsedSeed });
    });

    // Pause menu
    this.btnResume?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPaused(false);
      this.callbacks.onResume?.();
    });

    this.btnPauseSettings?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pauseOverlay?.classList.add('hidden');
      this.openSettings('pause');
    });

    this.btnExitToMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onExitToMenu?.();
    });

    // Settings Tabs
    for (const tabBtn of this.tabButtons) {
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = tabBtn.dataset.tab;
        for (const b of this.tabButtons) b.classList.toggle('active', b === tabBtn);
        for (const p of this.tabPanels) p.classList.toggle('hidden', p.dataset.tabPanel !== target);
      });
    }

    this.btnSettingsClose?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeSettings();
    });

    // Settings controls
    this.btnControlMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleControlMode?.();
    });

    this.btnGameMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleGameMode?.();
    });

    this.btnFlyMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleFlyMode?.();
    });

    this.btnMemoryMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleMemoryMode?.();
    });

    this.btnGraphicsMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleGraphicsMode?.();
    });

    this.btnFogMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleFogMode?.();
    });

    this.btnCloudsMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleCloudsMode?.();
    });

    this.btnHintMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hintsEnabled = !this.hintsEnabled;
      this.setHintsEnabledLabel(this.hintsEnabled);
      this.callbacks.onToggleHints?.(this.hintsEnabled);
    });

    this.rangeRenderDist?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (this.labelRenderDist) this.labelRenderDist.textContent = `${val} чанков`;
      this.callbacks.onChangeRenderDistance?.(val);
    });

    this.rangeSensitivity?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      if (this.labelSensitivity) this.labelSensitivity.textContent = `${Math.round(val * 100)}%`;
      this.callbacks.onChangeSensitivity?.(val);
    });
  }

  openSettings(origin = 'menu') {
    this.settingsOrigin = origin;
    this.settingsOverlay?.classList.remove('hidden');
    if (origin === 'menu') {
      this.mainMenuOverlay?.classList.add('hidden');
    }
  }

  closeSettings() {
    this.settingsOverlay?.classList.add('hidden');
    if (this.settingsOrigin === 'menu') {
      this.mainMenuOverlay?.classList.remove('hidden');
    } else if (this.isPaused) {
      this.pauseOverlay?.classList.remove('hidden');
    }
  }

  showMainMenu(showWorlds = false) {
    this.inMainMenu = true;
    this.setPaused(true);
    this.pauseOverlay?.classList.add('hidden');
    this.settingsOverlay?.classList.add('hidden');
    this.mainMenuOverlay?.classList.remove('hidden');
    this.menuHome?.classList.toggle('hidden', showWorlds);
    this.menuWorlds?.classList.toggle('hidden', !showWorlds);
    this._updateCrosshairVisibility(false);
  }

  hideMainMenu(cameraMode = CAMERA_MODES.FIRST_PERSON) {
    this.inMainMenu = false;
    this.mainMenuOverlay?.classList.add('hidden');
    this.settingsOverlay?.classList.add('hidden');
    this.setPaused(false);
    this._updateCrosshairVisibility(cameraMode === CAMERA_MODES.FIRST_PERSON);
  }

  renderWorldsList(worlds, activeWorldId) {
    if (!this.worldsListEl) return;
    this.worldsListEl.innerHTML = '';

    if (!worlds || worlds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'world-empty-note';
      empty.textContent = 'Сохранённых миров пока нет. Создайте новый мир выше!';
      this.worldsListEl.appendChild(empty);
      return;
    }

    for (const w of worlds) {
      const card = document.createElement('div');
      card.className = 'world-card';
      if (w.id === activeWorldId) card.classList.add('current');

      const info = document.createElement('div');
      info.className = 'world-card-info';

      const title = document.createElement('div');
      title.className = 'world-card-title';
      title.textContent = w.name || 'Безымянный мир';

      const meta = document.createElement('div');
      meta.className = 'world-card-meta';
      const dateStr = w.updatedAt ? new Date(w.updatedAt).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }) : 'новый';
      const biomePart = w.biomeName ? ` · ${w.biomeName}` : '';
      meta.textContent = `Сид: ${w.seed}${biomePart} · Блоков изм.: ${w.modifiedCount ?? 0} · ${dateStr}`;

      info.append(title, meta);

      const actions = document.createElement('div');
      actions.className = 'world-card-actions';

      const playBtn = document.createElement('button');
      playBtn.type = 'button';
      playBtn.className = 'mc-menu-btn mc-menu-primary mc-world-btn';
      playBtn.textContent = 'Войти';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onSelectWorld?.(w.id);
      });

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'mc-menu-btn mc-menu-danger mc-world-btn';
      delBtn.textContent = '✕';
      delBtn.title = 'Удалить мир';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.callbacks.onDeleteWorld?.(w.id);
      });

      actions.append(playBtn, delBtn);
      card.append(info, actions);
      this.worldsListEl.appendChild(card);
    }
  }

  _bindFullscreenEvents() {
    const updateFsState = () => {
      const active = this.isFullscreenActive();
      this.btnFullscreen?.classList.toggle('active', active);
      const label = this.btnFullscreen?.querySelector('.fs-label');
      if (label) {
        label.textContent = active ? 'Выйти' : 'На весь экран';
      }
      document.body.classList.toggle('pseudo-fullscreen', this.iosPseudoFullscreen);
    };

    document.addEventListener('fullscreenchange', updateFsState);
    document.addEventListener('webkitfullscreenchange', updateFsState);
    this._updateFsState = updateFsState;
  }

  isFullscreenActive() {
    return Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      this.iosPseudoFullscreen
    );
  }

  async toggleFullscreen() {
    const docEl = document.documentElement;
    const fsActive = Boolean(document.fullscreenElement || document.webkitFullscreenElement);

    if (fsActive) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch {
        // Ignore exit error
      }
      this.iosPseudoFullscreen = false;
      this._updateFsState?.();
      return;
    }

    if (this.iosPseudoFullscreen) {
      this.iosPseudoFullscreen = false;
      this._updateFsState?.();
      return;
    }

    const reqFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
    if (reqFs) {
      try {
        await reqFs.call(docEl, { navigationUI: 'hide' });
        screen.orientation?.lock?.('landscape').catch(() => {});
        this._updateFsState?.();
        return;
      } catch {
        // Fallback for iOS Safari / embedded WebViews
      }
    }

    this.iosPseudoFullscreen = true;
    window.scrollTo(0, 1);
    this._updateFsState?.();
    this.showToast('Полноэкранный режим развёрнут');
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugContainer?.classList.toggle('hidden', !this.debugVisible);
    this.btnDebug?.classList.toggle('active', this.debugVisible);
    return this.debugVisible;
  }

  playSleepTransition(onWakeCallback) {
    if (!this.sleepOverlay) {
      onWakeCallback?.();
      return;
    }
    this.sleepOverlay.classList.remove('hidden');
    requestAnimationFrame(() => {
      this.sleepOverlay?.classList.add('active');
    });
    setTimeout(() => {
      onWakeCallback?.();
      this.sleepOverlay?.classList.remove('active');
      setTimeout(() => {
        this.sleepOverlay?.classList.add('hidden');
      }, 450);
    }, 1050);
  }

  setPaused(paused) {
    this.isPaused = Boolean(paused);
    if (!this.inMainMenu) {
      this.pauseOverlay?.classList.toggle('hidden', !this.isPaused);
    }
    this.callbacks.onPauseChange?.(this.isPaused);
  }

  togglePause() {
    if (this.inMainMenu) return;
    if (!this.settingsOverlay?.classList.contains('hidden')) {
      this.closeSettings();
      return;
    }
    this.setPaused(!this.isPaused);
  }

  setTouchModeLabel(isTouch) {
    if (this.btnControlMode) {
      this.btnControlMode.textContent = isTouch ? 'Управление: Телефон (Touch)' : 'Управление: ПК (Мышь + WASD)';
    }
    this._refreshHintVisibility();
  }

  setFlyModeLabel(isFly) {
    if (this.btnFlyMode) {
      this.btnFlyMode.textContent = isFly ? 'Полёт (2×Space / F): ВКЛ' : 'Полёт (2×Space / F): ВЫКЛ';
    }
  }

  setGameModeLabel(creativeMode) {
    if (this.btnGameMode) {
      this.btnGameMode.textContent = creativeMode
        ? 'Режим игры: Креатив (∞ блоки)'
        : 'Режим игры: Выживание (Крафт)';
    }
  }

  setMemoryModeLabel(unlimited) {
    if (this.btnMemoryMode) {
      this.btnMemoryMode.textContent = unlimited
        ? 'Память мира: Бесконечная (∞)'
        : 'Память мира: Экономная';
    }
  }

  setGraphicsModeLabel(highQuality) {
    if (this.btnGraphicsMode) {
      this.btnGraphicsMode.textContent = highQuality
        ? 'Графика: Улучшенная (чёткий PixelRatio)'
        : 'Графика: Производительная (макс. FPS)';
    }
  }

  setFogEnabledLabel(enabled) {
    if (this.btnFogMode) {
      this.btnFogMode.textContent = enabled ? 'Туман: ВКЛ' : 'Туман: ВЫКЛ';
    }
  }

  setCloudsEnabledLabel(enabled) {
    if (this.btnCloudsMode) {
      this.btnCloudsMode.textContent = enabled ? 'Облака и небо: ВКЛ' : 'Облака: ВЫКЛ';
    }
  }

  setHintsEnabledLabel(enabled) {
    this.hintsEnabled = Boolean(enabled);
    if (this.btnHintMode) {
      this.btnHintMode.textContent = this.hintsEnabled ? 'Подсказки управления: ВКЛ' : 'Подсказки управления: ВЫКЛ';
    }
    this._refreshHintVisibility();
  }

  setRenderDistanceUI(dist) {
    if (this.rangeRenderDist) this.rangeRenderDist.value = String(dist);
    if (this.labelRenderDist) this.labelRenderDist.textContent = `${dist} чанков`;
  }

  setSensitivityUI(mult) {
    if (this.rangeSensitivity) this.rangeSensitivity.value = String(mult);
    if (this.labelSensitivity) this.labelSensitivity.textContent = `${Math.round(mult * 100)}%`;
  }

  setPointerLocked(locked) {
    this._pointerLocked = Boolean(locked);
    this._refreshHintVisibility();
  }

  _refreshHintVisibility() {
    if (!this.pcHint) return;
    const isTouch = document.body.classList.contains('touch-mode');
    const hide = !this.hintsEnabled || isTouch || this._pointerLocked || this.isPaused || this.inMainMenu;
    this.pcHint.classList.toggle('hidden', hide);
  }

  _updateCrosshairVisibility(visible) {
    if (!this.crosshairEl) return;
    this.crosshairEl.classList.toggle('hidden', !visible);
  }

  onCameraModeChanged(mode) {
    this._updateCrosshairVisibility(!this.inMainMenu && mode === CAMERA_MODES.FIRST_PERSON);
    const name = CAMERA_MODE_NAMES[mode] || CAMERA_MODE_NAMES[CAMERA_MODES.FIRST_PERSON];
    this.showToast(`Камера: ${name}`);
  }

  showToast(message, durationMs = 1900) {
    if (!this.toastEl) return;
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl?.classList.add('hidden');
    }, durationMs);
  }

  updateDebug({ player, world, sky, targetHit }) {
    this.fpsFrames++;
    const now = performance.now();
    const elapsed = now - this.fpsLastTime;
    if (elapsed >= 500) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / elapsed);
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }

    if (!this.debugVisible || !this.debugPanel || !world || !player) return;

    const cx = Math.floor(player.x / CHUNK_SIZE);
    const cz = Math.floor(player.z / CHUNK_SIZE);
    const biomeName = world.getBiomeNameAt(player.x, player.z);
    const light = world.getLightAt(player.x, player.y + 0.5, player.z);
    const timePart = sky ? `Day ${sky.dayCount} (${sky.getFormattedClock()})` : 'Day 1';
    const modeLabel = player.flyMode
      ? 'Полёт'
      : player.isSwimming
        ? 'Плавание'
        : player.isCrouching
          ? 'Присед'
          : player.isSprinting
            ? 'Бег'
            : 'Ходьба';
    const hitDesc = targetHit
      ? `${BlockRegistry.get(targetHit.blockId).name} (${targetHit.x}, ${targetHit.y}, ${targetHit.z})`
      : '—';

    this.debugPanel.textContent = [
      `FPS: ${this.currentFps} | XYZ: ${player.x.toFixed(1)}, ${player.y.toFixed(1)}, ${player.z.toFixed(1)}`,
      `${timePart} | Light: Sky ${light.sky} / Block ${light.block}`,
      `Biome: ${biomeName}`,
      `Chunk: ${cx}, ${cz} | ${player.getFacingCardinal()} | ${modeLabel} | Chunks: ${world.chunks.size}`,
      `Target: ${hitDesc}`,
    ].join('\n');
  }
}
