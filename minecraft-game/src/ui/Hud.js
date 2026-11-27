import { CAMERA_MODES, CHUNK_SIZE } from '../constants.js';

const CAMERA_MODE_NAMES = [
  '1-е лицо',
  '3-е лицо (сзади)',
  '3-е лицо (спереди)',
];

export class Hud {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;

    this.debugPanel = document.getElementById('debug-panel');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.pcHint = document.getElementById('pc-lock-hint');
    this.toastEl = document.getElementById('hud-toast');

    this.btnCamera = document.getElementById('btn-camera');
    this.btnDebug = document.getElementById('btn-debug');
    this.btnFullscreen = document.getElementById('btn-fullscreen');
    this.btnPause = document.getElementById('btn-pause');

    this.btnResume = document.getElementById('btn-resume');
    this.btnControlMode = document.getElementById('btn-control-mode');
    this.btnFlyMode = document.getElementById('btn-fly-mode');
    this.btnNewWorld = document.getElementById('btn-new-world');
    this.rangeRenderDist = document.getElementById('range-render-dist');
    this.labelRenderDist = document.getElementById('label-render-dist');

    this.debugVisible = false;
    this.isPaused = false;
    this.iosPseudoFullscreen = false;
    this.toastTimer = null;

    // FPS tracking
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

    this.btnFullscreen?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });

    this.btnPause?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePause();
    });

    this.btnResume?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setPaused(false);
      this.callbacks.onResume?.();
    });

    this.btnControlMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleControlMode?.();
    });

    this.btnFlyMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onToggleFlyMode?.();
    });

    this.btnNewWorld?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onNewWorld?.();
    });

    this.rangeRenderDist?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (this.labelRenderDist) this.labelRenderDist.textContent = `${val} чанков`;
      this.callbacks.onChangeRenderDistance?.(val);
    });
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

    // iOS Safari / restricted WebView full-viewport fallback
    this.iosPseudoFullscreen = true;
    window.scrollTo(0, 1);
    this._updateFsState?.();
    this.showToast('Полноэкранный режим развёрнут');
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugPanel?.classList.toggle('hidden', !this.debugVisible);
    this.btnDebug?.classList.toggle('active', this.debugVisible);
    return this.debugVisible;
  }

  setPaused(paused) {
    this.isPaused = Boolean(paused);
    this.pauseOverlay?.classList.toggle('hidden', !this.isPaused);
    this.callbacks.onPauseChange?.(this.isPaused);
  }

  togglePause() {
    this.setPaused(!this.isPaused);
  }

  setTouchModeLabel(isTouch) {
    if (this.btnControlMode) {
      this.btnControlMode.textContent = isTouch ? 'Управление: Телефон (Touch)' : 'Управление: ПК (Мышь + WASD)';
    }
    if (this.pcHint) {
      this.pcHint.classList.toggle('touch-hidden', isTouch);
    }
  }

  setFlyModeLabel(isFly) {
    if (this.btnFlyMode) {
      this.btnFlyMode.textContent = isFly ? 'Полёт (F): ВКЛ' : 'Полёт (F): ВЫКЛ';
    }
  }

  setRenderDistanceUI(dist) {
    if (this.rangeRenderDist) this.rangeRenderDist.value = String(dist);
    if (this.labelRenderDist) this.labelRenderDist.textContent = `${dist} чанков`;
  }

  setPointerLocked(locked) {
    if (this.pcHint) {
      this.pcHint.classList.toggle('hidden', locked || this.isPaused);
    }
  }

  onCameraModeChanged(mode) {
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

  updateDebug({ player, world, renderer }) {
    this.fpsFrames++;
    const now = performance.now();
    const elapsed = now - this.fpsLastTime;
    if (elapsed >= 500) {
      this.currentFps = Math.round((this.fpsFrames * 1000) / elapsed);
      this.fpsFrames = 0;
      this.fpsLastTime = now;
    }

    if (!this.debugVisible || !this.debugPanel) return;

    const cx = Math.floor(player.x / CHUNK_SIZE);
    const cz = Math.floor(player.z / CHUNK_SIZE);
    const lx = ((Math.floor(player.x) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((Math.floor(player.z) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const info = renderer.info;
    const mem = performance.memory
      ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} / ${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB`
      : 'n/a';

    this.debugPanel.textContent = [
      `Minecraft Clone Stage 1 | FPS: ${this.currentFps}`,
      `XYZ: ${player.x.toFixed(2)} / ${player.y.toFixed(2)} / ${player.z.toFixed(2)}`,
      `Chunk: ${cx}, ${cz} (local ${lx}, ${Math.floor(player.y)}, ${lz})`,
      `Facing: ${player.getFacingCardinal()} (${((player.yaw * 180 / Math.PI) % 360).toFixed(1)}° / ${(player.pitch * 180 / Math.PI).toFixed(1)}°)`,
      `Chunks: ${world.chunks.size} (R=${world.renderDistance}) | Triangles: ${info.render.triangles} | Calls: ${info.render.calls}`,
      `Memory: ${mem} | Seed: ${world.seed} | Mode: ${player.flyMode ? 'Fly' : 'Walk'}`,
    ].join('\n');
  }
}
