import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CAMERA_MODES, CHUNK_SIZE, MAX_AIR_TICKS, MAX_FOOD, MAX_HEALTH } from '../constants.js';

const CAMERA_MODE_NAMES = [
  '1-е лицо',
  '3-е лицо (сзади)',
  '3-е лицо (спереди)',
];

const DEATH_REASON_TEXT = {
  fall: 'Разбился при падении',
  drown: 'Захлебнулся под водой',
  inWall: 'Задохнулся в блоках',
  cactus: 'Укололся насмерть о кактус',
  lava: 'Попытался поплавать в лаве',
  fire: 'Сгорел в пламени',
  starve: 'Умер от голода',
  void: 'Провалился в бездну',
  zombie: 'Был съеден Зомби',
  skeleton: 'Застрелен Скелетом',
  arrow: 'Пронзён стрелой',
  spider: 'Растерзан Пауком',
  creeper: 'Взорван Крипером',
  explosion: 'Погиб при взрыве',
  enderman: 'Пал от руки Эндермена',
  ender_pearl: 'Ударился о землю при телепортации',
  generic: 'Погиб в мире',
};

function makeHeartSvg(state, gold = false) {
  // state: 'empty' | 'half' | 'full'
  const fillColor = gold ? '#f8d028' : '#e42424';
  const hiColor = gold ? '#fff6a8' : '#ff8a8a';
  const darkFill = '#2a1616';
  const outline = '#120808';
  const leftFill = state === 'empty' ? darkFill : fillColor;
  const rightFill = state === 'full' ? fillColor : darkFill;
  const leftHi = state !== 'empty';
  return `<svg viewBox="0 0 9 9" width="14" height="14" shape-rendering="crispEdges">
    <path d="M1,1h2v1h1v1h1V2h1V1h2v1h1v3H8v1H7v1H6v1H5v1H4V8H3V7H2V6H1V5H0V2h1V1z" fill="${outline}"/>
    <path d="M1,2h2v1h1v1h1v4H4V7H3V6H2V5H1V2z" fill="${leftFill}"/>
    <path d="M5,4h1V3h1V2h1v3H7v1H6v1H5V4z" fill="${rightFill}"/>
    ${leftHi ? `<rect x="1" y="2" width="1" height="1" fill="${hiColor}"/>` : ''}
  </svg>`;
}

function makeArmorSvg(state) {
  // state: 'empty' | 'half' | 'full'
  const fullCol = '#d2d8e4';
  const emptyCol = '#353842';
  const hiCol = '#ffffff';
  const leftCol = state === 'empty' ? emptyCol : fullCol;
  const rightCol = state === 'full' ? fullCol : emptyCol;
  return `<svg viewBox="0 0 9 9" width="13" height="13" shape-rendering="crispEdges">
    <path d="M1,1h2v1h3V1h2v3H7v4H2V4H1V1z" fill="#12141a"/>
    <path d="M1.5,1.5h1.5v1h1.5v5h-2V4h-1v-2.5z" fill="${leftCol}"/>
    <path d="M4.5,2.5h1.5v-1h1.5V4h-1v3.5h-2v-5z" fill="${rightCol}"/>
    ${state !== 'empty' ? `<rect x="2" y="2" width="1" height="1" fill="${hiCol}"/>` : ''}
  </svg>`;
}

function makeDrumstickSvg(state, poisoned = false) {
  // state: 'empty' | 'half' | 'full' (fills right-to-left or standard icon look)
  const meatFull = poisoned ? '#6fa83b' : '#c66838';
  const meatEmpty = '#362720';
  const rim = '#18100c';
  const bone = '#ece4d4';
  const leftCol = state === 'full' ? meatFull : meatEmpty;
  const rightCol = state === 'empty' ? meatEmpty : meatFull;
  return `<svg viewBox="0 0 9 9" width="13" height="13" shape-rendering="crispEdges">
    <path d="M3,1h4v1h1v3H7v1H5v1H3V6H2V3h1V1z" fill="${rim}"/>
    <rect x="3" y="2" width="2" height="3" fill="${leftCol}"/>
    <rect x="5" y="2" width="2" height="3" fill="${rightCol}"/>
    ${state !== 'empty' ? `<rect x="5" y="2" width="1" height="1" fill="${poisoned ? '#a8de68' : '#ebb28c'}"/>` : ''}
    <path d="M1,6h2v2H1V6z" fill="${rim}"/>
    <rect x="1" y="6" width="1.5" height="1.5" fill="${bone}"/>
  </svg>`;
}

function makeBubbleSvg(filled) {
  if (!filled) {
    return `<svg viewBox="0 0 9 9" width="12" height="12" shape-rendering="crispEdges"><circle cx="4.5" cy="4.5" r="3" fill="none" stroke="rgba(160,210,255,0.28)" stroke-width="1"/></svg>`;
  }
  return `<svg viewBox="0 0 9 9" width="12" height="12" shape-rendering="crispEdges">
    <circle cx="4.5" cy="4.5" r="3.4" fill="rgba(54,158,255,0.52)" stroke="#164684" stroke-width="1"/>
    <rect x="2.5" y="2.2" width="1.5" height="1.5" fill="#ffffff"/>
  </svg>`;
}

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
    this.btnNewModeSurvival = document.getElementById('btn-new-mode-survival');
    this.btnNewModeCreative = document.getElementById('btn-new-mode-creative');
    this.selectedNewWorldMode = 'survival';

    // Survival HUD & Vignettes & Death Screen
    this.survivalHudEl = document.getElementById('survival-hud');
    this.armorRowEl = document.getElementById('hud-armor-row');
    this.heartsRowEl = document.getElementById('hud-hearts-row');
    this.oxygenRowEl = document.getElementById('hud-oxygen-row');
    this.hungerRowEl = document.getElementById('hud-hunger-row');
    this.xpFillEl = document.getElementById('hud-xp-fill');
    this.xpLevelEl = document.getElementById('hud-xp-level');
    this.damageVignetteEl = document.getElementById('damage-vignette');
    this.suffocationVignetteEl = document.getElementById('suffocation-vignette');
    this.fluidOverlayEl = document.getElementById('fluid-overlay');

    this.deathOverlayEl = document.getElementById('death-overlay');
    this.deathReasonEl = document.getElementById('death-reason');
    this.deathScoreEl = document.getElementById('death-score');
    this.btnRespawn = document.getElementById('btn-respawn');
    this.btnDeathMenu = document.getElementById('btn-death-menu');

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
    this.btnMemoryMode = document.getElementById('btn-memory-mode');
    this.btnGraphicsMode = document.getElementById('btn-graphics-mode');
    this.btnFogMode = document.getElementById('btn-fog-mode');
    this.btnCloudsMode = document.getElementById('btn-clouds-mode');
    this.btnStarsMode = document.getElementById('btn-stars-mode');
    this.btnLeavesMode = document.getElementById('btn-leaves-mode');
    this.btnSmoothLightMode = document.getElementById('btn-smooth-light-mode');
    this.btnAnimFluidMode = document.getElementById('btn-anim-fluid-mode');
    this.btnParticlesMode = document.getElementById('btn-particles-mode');
    this.btnHintMode = document.getElementById('btn-hint-mode');

    this.rangeRenderDist = document.getElementById('range-render-dist');
    this.labelRenderDist = document.getElementById('label-render-dist');
    this.rangeSensitivity = document.getElementById('range-sensitivity');
    this.labelSensitivity = document.getElementById('label-sensitivity');

    this.debugVisible = false;
    this.isPaused = false;
    this.inMainMenu = true;
    this.settingsOrigin = 'menu';
    this.hintsEnabled = true;
    this.iosPseudoFullscreen = false;
    this.toastTimer = null;
    this._damageFlashTimeout = null;
    this._lastVitalsSig = '';

    this.fpsFrames = 0;
    this.fpsLastTime = performance.now();
    this.currentFps = 60;

    this._bindButtons();
    this._bindFullscreenEvents();
  }

  _bindInstantHudTap(el, handler) {
    if (!el) return;
    let lastTrigger = -99999;
    const fire = (e) => {
      e.stopPropagation();
      if (e.type === 'touchstart') e.preventDefault();
      const now = performance.now();
      if (now - lastTrigger < 120) return;
      lastTrigger = now;
      handler(e);
    };
    el.addEventListener('touchstart', fire, { passive: false });
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') fire(e);
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (performance.now() - lastTrigger < 320) return;
      lastTrigger = performance.now();
      handler(e);
    });
  }

  _bindButtons() {
    this._bindInstantHudTap(this.btnCamera, () => {
      this.callbacks.onCycleCamera?.();
    });

    this._bindInstantHudTap(this.btnDebug, () => {
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

    this._bindInstantHudTap(this.btnFullscreen, () => {
      this.toggleFullscreen();
    });

    this._bindInstantHudTap(this.btnPause, () => {
      if (!this.inMainMenu) this.togglePause();
    });

    // Death screen buttons
    this.btnRespawn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideDeathScreen();
      this.callbacks.onRespawn?.();
    });

    this.btnDeathMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideDeathScreen();
      this.callbacks.onExitToMenu?.();
    });

    // New World gameMode selector
    const selectNewMode = (mode) => {
      this.selectedNewWorldMode = mode === 'creative' ? 'creative' : 'survival';
      this.btnNewModeSurvival?.classList.toggle('active', this.selectedNewWorldMode === 'survival');
      this.btnNewModeCreative?.classList.toggle('active', this.selectedNewWorldMode === 'creative');
    };
    this.btnNewModeSurvival?.addEventListener('click', (e) => { e.stopPropagation(); selectNewMode('survival'); });
    this.btnNewModeCreative?.addEventListener('click', (e) => { e.stopPropagation(); selectNewMode('creative'); });

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
          let h = 2166136261 >>> 0;
          for (let i = 0; i < rawSeed.length; i++) {
            h ^= rawSeed.charCodeAt(i);
            h = Math.imul(h, 16777619);
          }
          parsedSeed = (h | 0) || 133742;
        }
      }
      this.callbacks.onCreateWorld?.({
        name,
        seed: parsedSeed,
        gameMode: this.selectedNewWorldMode,
      });
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

    // Settings controls (no Survival/Creative or Fly toggles here!)
    this.btnControlMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleControlMode?.();
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

    this.btnStarsMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleStarsMode?.();
    });

    this.btnLeavesMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleLeavesMode?.();
    });

    this.btnSmoothLightMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleSmoothLightMode?.();
    });

    this.btnAnimFluidMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleAnimFluidMode?.();
    });

    this.btnParticlesMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onCycleParticlesMode?.();
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

  triggerDamageFlash() {
    if (!this.damageVignetteEl) return;
    this.damageVignetteEl.classList.add('flash');
    clearTimeout(this._damageFlashTimeout);
    this._damageFlashTimeout = setTimeout(() => {
      this.damageVignetteEl?.classList.remove('flash');
    }, 260);
  }

  showDeathScreen(sourceType = 'generic', score = 0) {
    if (!this.deathOverlayEl) return;
    if (this.deathReasonEl) {
      this.deathReasonEl.textContent = DEATH_REASON_TEXT[sourceType] || DEATH_REASON_TEXT.generic;
    }
    if (this.deathScoreEl) {
      this.deathScoreEl.textContent = `Счёт: ${score | 0}`;
    }
    this.deathOverlayEl.classList.remove('hidden');
    this._updateCrosshairVisibility(false);
  }

  hideDeathScreen() {
    this.deathOverlayEl?.classList.add('hidden');
  }

  updateFluidOverlay(player) {
    if (!this.fluidOverlayEl) return;
    if (!player || this.inMainMenu || player.isDead) {
      this.fluidOverlayEl.classList.remove('water', 'lava', 'burning');
      return;
    }
    this.fluidOverlayEl.classList.toggle('lava', Boolean(player.headInLava));
    this.fluidOverlayEl.classList.toggle('water', Boolean(player.headInWater && !player.headInLava));
    this.fluidOverlayEl.classList.toggle('burning', Boolean(!player.creativeMode && player.fireTicks > 0));
  }

  updateSurvivalVitals(player, armorPoints = 0) {
    this.updateFluidOverlay(player);
    if (!this.survivalHudEl) return;
    const hide = !player || this.inMainMenu || player.creativeMode;
    this.survivalHudEl.classList.toggle('hidden', hide);

    if (hide) {
      this.damageVignetteEl?.classList.remove('low-health');
      this.suffocationVignetteEl?.classList.add('hidden');
      return;
    }

    const hp = Math.ceil(Math.max(0, Math.min(MAX_HEALTH, player.health)));
    const abs = Math.ceil(Math.max(0, player.absorption || 0));
    const food = Math.max(0, Math.min(MAX_FOOD, Math.round(player.foodLevel)));
    const sat = player.saturation || 0;
    const armor = Math.max(0, Math.min(20, armorPoints | 0));
    const hurting = (player.hurtTimer || 0) > 0;
    const poisoned = (player.hungerDebuffTimer || 0) > 0;
    const showOxygen = player.headInWater || player.airTicks < MAX_AIR_TICKS;
    const bubbles = showOxygen ? Math.ceil((Math.max(0, player.airTicks) / MAX_AIR_TICKS) * 10) : 10;
    const xpLvl = Math.max(0, player.xpLevel | 0);
    const xpPct = Math.round(Math.max(0, Math.min(1, player.xpProgress || 0)) * 100);

    // Update XP bar & level immediately
    if (this.xpFillEl) {
      this.xpFillEl.style.width = `${xpPct}%`;
    }
    if (this.xpLevelEl) {
      this.xpLevelEl.textContent = String(xpLvl);
      this.xpLevelEl.classList.toggle('hidden', xpLvl <= 0);
    }

    // Low-health pulsing red edge & sand/wall suffocation overlay
    this.damageVignetteEl?.classList.toggle('low-health', hp > 0 && hp <= 4);
    this.suffocationVignetteEl?.classList.toggle('hidden', !player.inWallSuffocating);

    const sig = `${hp}|${abs}|${food}|${sat <= 0 ? 1 : 0}|${armor}|${hurting ? 1 : 0}|${poisoned ? 1 : 0}|${showOxygen ? 1 : 0}|${bubbles}`;
    if (sig === this._lastVitalsSig) return;
    this._lastVitalsSig = sig;

    // 1. Armor Row (hidden when armor === 0)
    if (this.armorRowEl) {
      this.armorRowEl.classList.toggle('hidden', armor <= 0);
      if (armor > 0) {
        let html = '';
        for (let i = 0; i < 10; i++) {
          const pts = armor - i * 2;
          const st = pts >= 2 ? 'full' : pts === 1 ? 'half' : 'empty';
          html += `<span class="v-icon">${makeArmorSvg(st)}</span>`;
        }
        this.armorRowEl.innerHTML = html;
      }
    }

    // 2. Hearts Row (10 base hearts + optional golden absorption hearts)
    if (this.heartsRowEl) {
      this.heartsRowEl.classList.toggle('vitals-shake', hp > 0 && hp <= 4);
      this.heartsRowEl.classList.toggle('vitals-hurting', hurting);
      let html = '';
      for (let i = 0; i < 10; i++) {
        const pts = hp - i * 2;
        const st = pts >= 2 ? 'full' : pts === 1 ? 'half' : 'empty';
        html += `<span class="v-icon">${makeHeartSvg(st, false)}</span>`;
      }
      if (abs > 0) {
        const extraHearts = Math.ceil(abs / 2);
        for (let i = 0; i < extraHearts; i++) {
          const pts = abs - i * 2;
          const st = pts >= 2 ? 'full' : 'half';
          html += `<span class="v-icon">${makeHeartSvg(st, true)}</span>`;
        }
      }
      this.heartsRowEl.innerHTML = html;
    }

    // 3. Oxygen Row (shown when underwater or regenerating air)
    if (this.oxygenRowEl) {
      this.oxygenRowEl.classList.toggle('hidden', !showOxygen);
      if (showOxygen) {
        let html = '';
        for (let i = 0; i < 10; i++) {
          const filled = i >= (10 - bubbles);
          html += `<span class="v-icon">${makeBubbleSvg(filled)}</span>`;
        }
        this.oxygenRowEl.innerHTML = html;
      }
    }

    // 4. Hunger Drumsticks Row (right-to-left)
    if (this.hungerRowEl) {
      this.hungerRowEl.classList.toggle('vitals-hunger-shake', sat <= 0 && food < 20);
      let html = '';
      for (let i = 9; i >= 0; i--) {
        const pts = food - i * 2;
        const st = pts >= 2 ? 'full' : pts === 1 ? 'half' : 'empty';
        html += `<span class="v-icon">${makeDrumstickSvg(st, poisoned)}</span>`;
      }
      this.hungerRowEl.innerHTML = html;
    }
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
    this.hideDeathScreen();
    this.setPaused(true);
    this.pauseOverlay?.classList.add('hidden');
    this.settingsOverlay?.classList.add('hidden');
    this.mainMenuOverlay?.classList.remove('hidden');
    this.menuHome?.classList.toggle('hidden', showWorlds);
    this.menuWorlds?.classList.toggle('hidden', !showWorlds);
    this.survivalHudEl?.classList.add('hidden');
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
      const modeTag = w.gameMode === 'creative' ? '🧱 Креатив' : '⚔️ Выживание';
      title.textContent = `${w.name || 'Безымянный мир'} · ${modeTag}`;

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

  setFlyModeLabel() {}
  setGameModeLabel() {}

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
        ? 'Разрешение: Улучшенное (чёткий PixelRatio)'
        : 'Разрешение: Производительное (макс. FPS)';
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

  setStarsEnabledLabel(enabled) {
    if (this.btnStarsMode) {
      this.btnStarsMode.textContent = enabled ? 'Звёзды ночью: ВКЛ' : 'Звёзды ночью: ВЫКЛ';
    }
  }

  setFancyLeavesLabel(enabled) {
    if (this.btnLeavesMode) {
      this.btnLeavesMode.textContent = enabled ? 'Листва: Детальная (Fancy)' : 'Листва: Быстрая (Fast)';
    }
  }

  setSmoothLightingLabel(enabled) {
    if (this.btnSmoothLightMode) {
      this.btnSmoothLightMode.textContent = enabled ? 'Мягкое освещение (AO): ВКЛ' : 'Мягкое освещение (AO): ВЫКЛ';
    }
  }

  setAnimatedFluidsLabel(enabled) {
    if (this.btnAnimFluidMode) {
      this.btnAnimFluidMode.textContent = enabled ? 'Анимация воды и лавы: ВКЛ' : 'Анимация воды и лавы: ВЫКЛ';
    }
  }

  setParticlesModeLabel(mode) {
    if (this.btnParticlesMode) {
      const label = mode === 'off' ? 'Выкл' : mode === 'minimal' ? 'Минимум' : 'Все';
      this.btnParticlesMode.textContent = `Частицы: ${label}`;
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

  updateDebug({ player, world, sky, targetHit, mobCount = 0 }) {
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
      `HP: ${player.health.toFixed(1)}/20 | Food: ${player.foodLevel}/20 | XP Lv ${player.xpLevel || 0} | Mobs: ${mobCount}`,
      `${timePart} | Light: Sky ${light.sky} / Block ${light.block}`,
      `Biome: ${biomeName}`,
      `Chunk: ${cx}, ${cz} | ${player.getFacingCardinal()} | ${modeLabel} | Chunks: ${world.chunks.size}`,
      `Target: ${hitDesc}`,
    ].join('\n');
  }
}
