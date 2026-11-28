import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { CHEST_SIZE, HOTBAR_SIZE, INVENTORY_SIZE } from '../constants.js';
import { ItemRegistry } from '../items/ItemRegistry.js';
import { RecipeRegistry } from '../items/RecipeRegistry.js';
import { getDurabilityColor } from './Hotbar.js';

export class InventoryUI {
  constructor(atlas, inventory, blockEntities, options = {}) {
    this.atlas = atlas;
    this.inventory = inventory;
    this.blockEntities = blockEntities;
    this.onClose = options.onClose || null;
    this.onDropStack = options.onDropStack || null;
    this.onOpen = options.onOpen || null;
    this.onCollectFurnaceXp = options.onCollectFurnaceXp || null;
    this.playerPreview = options.playerPreview || null;

    this.isOpen = false;
    this.mode = 'inventory'; // 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative'
    this.activeBlockPos = null;
    this.cursorStack = null;
    this.selectedTouchRef = null;
    this.recipeBookOpen = false;
    this.onlyCraftableFilter = false;
    this.recipePage = 0;
    this.recipesPerPage = 10;
    this.previewRecipe = null;
    this.creativeCategory = 'all';
    this.craftGrid = new Array(9).fill(null);
    this.craftResult = null;
    this.craftMatchedRecipe = null;

    this._slotElements = new Map();
    this._recipeDomCache = { gridSize: 0, entries: [] };
    this._longPressTimer = null;
    this._longPressTriggered = false;
    this._touchStartPos = { x: 0, y: 0 };
    this._touchMoved = false;
    this._lastTouchEventAt = -99999;

    // Java 1.21 Drag-Distribution & Double-Click Collect state
    this._drag = null;
    this._lastClick = { time: 0, zone: null, index: -1, itemId: 0, meta: 0 };
    this._scrollbarDrag = null;
    this._creativeCatalogEl = null;
    this._creativeScrollbarEl = null;
    this._creativeThumbEl = null;
    this.creativeSearch = '';
    this._dollRect = null;
    this._dollRectAt = 0;

    this.overlay = document.getElementById('inventory-overlay');
    this.windowEl = document.getElementById('inventory-window');
    this.titleEl = document.getElementById('inv-title');
    this.topSectionEl = document.getElementById('inv-top-section');
    this.mainGridEl = document.getElementById('inv-main-grid');
    this.hotbarGridEl = document.getElementById('inv-hotbar-grid');
    this.recipeDrawerEl = document.getElementById('inv-recipe-drawer');
    this.recipeListEl = document.getElementById('inv-recipe-list');
    this.recipeFilterBtn = document.getElementById('btn-recipe-filter');
    this.recipePrevBtn = document.getElementById('btn-recipe-prev');
    this.recipeNextBtn = document.getElementById('btn-recipe-next');
    this.recipePageLabel = document.getElementById('recipe-page-label');
    this.recipePreviewEl = document.getElementById('inv-recipe-preview');
    this.cursorGhostEl = document.getElementById('inv-cursor-ghost');
    this.tooltipEl = document.getElementById('inv-tooltip');

    this.recipeToggleBtn = document.getElementById('btn-inv-recipes');
    this.creativeTabBtn = document.getElementById('btn-inv-creative');
    this.dropSelectedBtn = document.getElementById('btn-inv-drop');
    this.closeBtn = document.getElementById('btn-inv-close');

    this.furnaceFlameFill = null;
    this.furnaceArrowFill = null;
    this.playerCanvas = null;

    this._bindGlobalEvents();
  }

  _bindGlobalEvents() {
    this.closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    this.overlay?.addEventListener('mousedown', (e) => {
      if (performance.now() - this._lastTouchEventAt < 950) return;
      if (e.target === this.overlay) {
        if (this.cursorStack) {
          const dropS = ItemRegistry.cloneStack(this.cursorStack);
          this.cursorStack = null;
          this.onDropStack?.(dropS);
          this.render();
        } else {
          this.close();
        }
      }
    });

    this.overlay?.addEventListener('contextmenu', (e) => e.preventDefault());

    this.overlay?.addEventListener('mousemove', (e) => {
      this._updateCursorGhost(e.clientX, e.clientY);
      this._updateTooltipPos(e.clientX, e.clientY);
      this._updatePaperDollLook(e.clientX, e.clientY);
      if (this._scrollbarDrag) {
        this._updateCreativeScrollbarDrag(e.clientY);
      }
      if (this._drag?.active) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.inv-slot');
        if (el) {
          this._handleDragOverSlot(el.dataset.zone, Number(el.dataset.index));
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this._scrollbarDrag) {
        this._scrollbarDrag = null;
      }
      if (this._drag?.active && (e.button === this._drag.button || e.button === undefined)) {
        this._finishDrag();
      }
    });

    this.overlay?.addEventListener('touchmove', (e) => {
      if (e.touches[0]) {
        this._updatePaperDollLook(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    this.recipeToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.recipeBookOpen = !this.recipeBookOpen;
      this.renderRecipeBook();
    });

    this.recipeFilterBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onlyCraftableFilter = !this.onlyCraftableFilter;
      this.recipePage = 0;
      this.recipeFilterBtn.classList.toggle('active', this.onlyCraftableFilter);
      this.recipeFilterBtn.textContent = this.onlyCraftableFilter ? '✓ Доступные' : 'Все';
      this.renderRecipeBook();
    });

    this.recipePrevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.recipePage > 0) {
        this.recipePage--;
        this.renderRecipeBook();
      }
    });

    this.recipeNextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.recipePage++;
      this.renderRecipeBook();
    });

    this.creativeTabBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.mode === 'creative') {
        this.open('inventory');
      } else {
        this._returnCraftGridToInventory();
        this.mode = 'creative';
        this.renderLayout();
        this.render();
      }
    });

    this.dropSelectedBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleVirtualDrop(
        this.selectedTouchRef?.zone || null,
        this.selectedTouchRef ? this.selectedTouchRef.index : -1
      );
    });
  }

  _updatePaperDollLook(clientX, clientY) {
    if (this.playerPreview && this.playerCanvas && this.mode === 'inventory') {
      const now = performance.now();
      if (!this._dollRect || now - this._dollRectAt > 400) {
        this._dollRect = this.playerCanvas.getBoundingClientRect();
        this._dollRectAt = now;
      }
      const rect = this._dollRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
        this.playerPreview.setLookTarget(nx, ny);
      }
    }
  }

  // VirtualMouse full pointer lifecycle (supports hold-drag across slots + creative scrollbar!)
  handleVirtualPointerDown(button, vx, vy, shiftKey = false, targetEl = null) {
    if (!this.isOpen) return false;
    const raw = targetEl || document.elementFromPoint(vx, vy);
    const scrollBar = raw?.closest?.('.inv-creative-scrollbar');
    if (scrollBar && button === 0) {
      this._startCreativeScrollbarDrag(vy);
      return true;
    }
    const slotBtn = raw?.closest?.('.inv-slot');
    if (slotBtn) {
      this._handleSlotMouseDown(slotBtn.dataset.zone, Number(slotBtn.dataset.index), { button, shiftKey });
      this._updateCursorGhost(vx, vy);
      return true;
    }
    return false;
  }

  handleVirtualPointerMove(vx, vy, hoveredEl = null, activeButton = -1) {
    if (!this.isOpen) return;
    this._updateCursorGhost(vx, vy);
    this._updatePaperDollLook(vx, vy);

    if (this._scrollbarDrag && activeButton === 0) {
      this._updateCreativeScrollbarDrag(vy);
      return;
    }

    const raw = hoveredEl || document.elementFromPoint(vx, vy);
    const slotBtn = raw?.closest?.('.inv-slot') || (raw?.classList?.contains('inv-slot') ? raw : null);

    if (this._drag?.active && activeButton === this._drag.button && slotBtn) {
      this._handleDragOverSlot(slotBtn.dataset.zone, Number(slotBtn.dataset.index));
    }

    if (slotBtn) {
      const stack = this._getSlot(slotBtn.dataset.zone, Number(slotBtn.dataset.index));
      this._showTooltip(stack, vx, vy);
    } else {
      const creativeBtn = raw?.closest?.('.inv-creative-item');
      if (creativeBtn && creativeBtn.dataset.itemId) {
        this._showTooltip({ id: Number(creativeBtn.dataset.itemId), count: 1 }, vx, vy);
      } else {
        this.tooltipEl?.classList.add('hidden');
      }
    }
  }

  handleVirtualPointerUp(button) {
    if (this._scrollbarDrag) {
      this._scrollbarDrag = null;
    }
    if (this._drag?.active && (this._drag.button === button || button === undefined)) {
      this._finishDrag();
    }
  }

  updateVirtualPointer(vx, vy, hoveredEl, activeButton = -1) {
    this.handleVirtualPointerMove(vx, vy, hoveredEl, activeButton);
  }

  handleVirtualSlotClick(zone, index, button = 0, shiftKey = false, vx = null, vy = null) {
    if (!this.isOpen || !zone) return;
    this._handleSlotMouseDown(zone, index, { button, shiftKey });
    this._finishDrag();
    if (vx !== null && vy !== null) {
      this._updateCursorGhost(vx, vy);
    }
  }

  handleVirtualDrop(zone = null, index = -1) {
    if (!this.isOpen) return;
    if (this.cursorStack) {
      const dropS = ItemRegistry.cloneStack(this.cursorStack);
      this.cursorStack = null;
      this.onDropStack?.(dropS);
      this.render();
      return;
    }
    const targetZone = zone || this.selectedTouchRef?.zone;
    const targetIndex = zone ? index : (this.selectedTouchRef ? this.selectedTouchRef.index : -1);
    if (!targetZone || targetIndex < 0 || targetZone === 'craft_out') return;
    const cur = this._getSlot(targetZone, targetIndex);
    if (cur) {
      this._setSlot(targetZone, targetIndex, null);
      this.onDropStack?.(cur);
      this.selectedTouchRef = null;
      this._recomputeCraftResult();
      this.render();
    }
  }

  open(mode = 'inventory', blockPos = null) {
    if (
      this.isOpen &&
      this.mode === mode &&
      (!blockPos || (
        this.activeBlockPos?.x === blockPos.x &&
        this.activeBlockPos?.y === blockPos.y &&
        this.activeBlockPos?.z === blockPos.z
      ))
    ) {
      return;
    }
    this._finishDrag();
    this._returnCraftGridToInventory();
    this.mode = mode;
    this.activeBlockPos = blockPos ? { x: blockPos.x, y: blockPos.y, z: blockPos.z } : null;
    this.selectedTouchRef = null;
    this.isOpen = true;

    if (mode === 'crafting') {
      this.recipeBookOpen = true;
    } else if (mode === 'furnace' || mode === 'chest' || mode === 'creative') {
      this.recipeBookOpen = false;
    }

    this.overlay?.classList.remove('hidden');
    this._dollRect = null;
    this.renderLayout();
    this.render();
    this.onOpen?.(mode);
  }

  close() {
    if (!this.isOpen) return;
    this._finishDrag();
    this._scrollbarDrag = null;
    this._returnCraftGridToInventory();
    if (this.cursorStack) {
      const s = ItemRegistry.cloneStack(this.cursorStack);
      this.cursorStack = null;
      const leftover = this.inventory.addItem(
        s.id,
        s.count,
        s.maxDurability > 0 ? s.durability : null,
        s.meta
      );
      if (leftover > 0) {
        const dropS = ItemRegistry.cloneStack(s);
        dropS.count = leftover;
        this.onDropStack?.(dropS);
      }
    }
    clearTimeout(this._longPressTimer);
    this.selectedTouchRef = null;
    this.isOpen = false;
    this.activeBlockPos = null;
    this.overlay?.classList.add('hidden');
    this.tooltipEl?.classList.add('hidden');
    this.cursorGhostEl?.classList.add('hidden');
    this.onClose?.();
  }

  _returnCraftGridToInventory() {
    for (let i = 0; i < 9; i++) {
      const s = this.craftGrid[i];
      this.craftGrid[i] = null;
      if (!s || s.count <= 0) continue;
      const rem = this.inventory.addItem(s.id, s.count, s.maxDurability > 0 ? s.durability : null, s.meta);
      if (rem > 0) {
        const dropS = ItemRegistry.cloneStack(s);
        dropS.count = rem;
        this.onDropStack?.(dropS);
      }
    }
    this.craftResult = null;
    this.craftMatchedRecipe = null;
  }

  _getActiveGridSize() {
    return this.mode === 'crafting' ? 3 : 2;
  }

  _recomputeCraftResult() {
    if (this.mode !== 'inventory' && this.mode !== 'crafting') {
      this.craftResult = null;
      this.craftMatchedRecipe = null;
      return;
    }
    const size = this._getActiveGridSize();
    const subGrid = this.craftGrid.slice(0, size * size);
    const match = RecipeRegistry.matchCraftingGrid(subGrid, size);
    if (match) {
      this.craftResult = ItemRegistry.cloneStack(match.result);
      this.craftMatchedRecipe = match.recipe;
    } else {
      this.craftResult = null;
      this.craftMatchedRecipe = null;
    }
  }

  _consumeCraftIngredients(times = 1) {
    const size = this._getActiveGridSize();
    for (let i = 0; i < size * size; i++) {
      const s = this.craftGrid[i];
      if (s && s.count > 0) {
        s.count -= times;
        if (s.count <= 0) this.craftGrid[i] = null;
      }
    }
    this._recomputeCraftResult();
  }

  _getArmorKeyByIndex(index) {
    return ['helmet', 'chestplate', 'leggings', 'boots'][index] || 'helmet';
  }

  _getSlot(zone, index) {
    let raw = null;
    if (zone === 'inv') raw = this.inventory.slots[index] || null;
    else if (zone === 'armor') raw = this.inventory.armor[this._getArmorKeyByIndex(index)] || null;
    else if (zone === 'craft') raw = this.craftGrid[index] || null;
    else if (zone === 'craft_out') raw = this.craftResult || null;
    else if (zone === 'chest' && this.activeBlockPos) {
      const c = this.blockEntities.getOrCreateChest(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
      raw = c.slots[index] || null;
    } else if (zone === 'furnace' && this.activeBlockPos) {
      const f = this.blockEntities.getOrCreateFurnace(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
      if (index === 0) raw = f.input;
      else if (index === 1) raw = f.fuel;
      else if (index === 2) raw = f.output;
    }
    return ItemRegistry.cloneStack(raw);
  }

  _setSlot(zone, index, stack) {
    const clean = stack && stack.id && stack.count > 0 ? ItemRegistry.cloneStack(stack) : null;
    if (zone === 'inv') {
      this.inventory.setSlot(index, clean);
    } else if (zone === 'armor') {
      this.inventory.armor[this._getArmorKeyByIndex(index)] = clean;
      this.inventory._emitChange();
    } else if (zone === 'craft') {
      this.craftGrid[index] = clean;
      this._recomputeCraftResult();
    } else if (zone === 'chest' && this.activeBlockPos) {
      const c = this.blockEntities.getOrCreateChest(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
      c.slots[index] = clean;
    } else if (zone === 'furnace' && this.activeBlockPos) {
      const f = this.blockEntities.getOrCreateFurnace(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
      if (index === 0) f.input = clean;
      else if (index === 1) f.fuel = clean;
      else if (index === 2) f.output = clean;
    }
  }

  _isAllowedInSlot(zone, index, stack) {
    if (!stack || !stack.id) return true;
    if (zone === 'craft_out') return false;
    if (zone === 'furnace' && index === 2) return false;
    if (zone === 'armor') {
      const expectedSlot = this._getArmorKeyByIndex(index);
      const def = ItemRegistry.get(stack.id);
      return def?.armorSlot === expectedSlot;
    }
    return true;
  }

  _createSlotElement(zone, index, placeholder = '') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inv-slot';
    if (placeholder) btn.dataset.placeholder = placeholder;
    btn.dataset.zone = zone;
    btn.dataset.index = String(index);

    const icon = document.createElement('img');
    icon.className = 'inv-slot-icon hidden';
    icon.alt = '';
    icon.draggable = false;

    const count = document.createElement('span');
    count.className = 'inv-slot-count hidden';

    const durBar = document.createElement('div');
    durBar.className = 'slot-durability hidden';
    const durFill = document.createElement('div');
    durFill.className = 'slot-durability-fill';
    durBar.appendChild(durFill);

    btn.append(icon, count, durBar);
    this._slotElements.set(`${zone}:${index}`, { btn, icon, count, durBar, durFill });

    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (performance.now() - this._lastTouchEventAt < 950) return;
      this._handleSlotMouseDown(zone, index, e);
      this._updateCursorGhost(e.clientX, e.clientY);
    });

    btn.addEventListener('mouseenter', (e) => {
      if (this._drag?.active) {
        this._handleDragOverSlot(zone, index);
      }
      const stack = this._getSlot(zone, index);
      this._showTooltip(stack, e.clientX, e.clientY);
    });

    btn.addEventListener('mouseleave', () => {
      this.tooltipEl?.classList.add('hidden');
    });

    // Touch interactions: tap select/transfer + 380ms stationary long-press split
    btn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      this._lastTouchEventAt = performance.now();
      this._longPressTriggered = false;
      this._touchMoved = false;
      const t = e.changedTouches[0];
      if (t) {
        this._touchStartPos.x = t.clientX;
        this._touchStartPos.y = t.clientY;
      }
      clearTimeout(this._longPressTimer);
      this._longPressTimer = setTimeout(() => {
        if (!this._touchMoved) {
          this._longPressTriggered = true;
          this._handleTouchSplit(zone, index);
        }
      }, 380);
    }, { passive: true });

    btn.addEventListener('touchmove', (e) => {
      const t = e.changedTouches[0];
      if (!t) return;
      if (Math.hypot(t.clientX - this._touchStartPos.x, t.clientY - this._touchStartPos.y) > 8) {
        this._touchMoved = true;
        clearTimeout(this._longPressTimer);
      }
    }, { passive: true });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._lastTouchEventAt = performance.now();
      clearTimeout(this._longPressTimer);
      if (this._longPressTriggered || this._touchMoved) {
        this._longPressTriggered = false;
        this._touchMoved = false;
        return;
      }
      this._handleTouchTap(zone, index);
    }, { passive: false });

    return btn;
  }

  _collectMatchingToCursor() {
    if (!this.cursorStack) return;
    const maxS = ItemRegistry.getMaxStack(this.cursorStack.id);
    if (this.cursorStack.count >= maxS) return;

    const collectZones = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) collectZones.push(['inv', i]);
    if (this.mode === 'inventory') {
      for (let i = 0; i < 4; i++) collectZones.push(['craft', i]);
    } else if (this.mode === 'crafting') {
      for (let i = 0; i < 9; i++) collectZones.push(['craft', i]);
    } else if (this.mode === 'chest' && this.activeBlockPos) {
      for (let i = 0; i < CHEST_SIZE; i++) collectZones.push(['chest', i]);
    } else if (this.mode === 'furnace' && this.activeBlockPos) {
      collectZones.push(['furnace', 0], ['furnace', 1], ['furnace', 2]);
    }

    // Minecraft Java pulls non-full stacks first, then full stacks
    const candidates = [];
    for (const [z, idx] of collectZones) {
      const s = this._getSlot(z, idx);
      if (s && ItemRegistry.canStackTogether(s, this.cursorStack)) {
        candidates.push({ z, idx, stack: s });
      }
    }
    candidates.sort((a, b) => a.stack.count - b.stack.count);

    for (const c of candidates) {
      const space = maxS - this.cursorStack.count;
      if (space <= 0) break;
      const take = Math.min(space, c.stack.count);
      this.cursorStack.count += take;
      c.stack.count -= take;
      this._setSlot(c.z, c.idx, c.stack.count > 0 ? c.stack : null);
    }
  }

  _canSlotAcceptDragStack(zone, index, cursorProto) {
    if (zone === 'craft_out' || zone === 'armor') return false;
    if (zone === 'furnace' && index === 2) return false;
    if (!this._isAllowedInSlot(zone, index, cursorProto)) return false;
    const cur = this._getSlot(zone, index);
    if (!cur) return true;
    if (!ItemRegistry.canStackTogether(cur, cursorProto)) return false;
    return cur.count < ItemRegistry.getMaxStack(cur.id);
  }

  _handleDragOverSlot(zone, index) {
    if (!this._drag?.active || !zone || index < 0) return;
    const key = `${zone}:${index}`;
    if (this._drag.visitedKeys.has(key)) return;

    if (this._drag.button === 2) {
      // Right-Drag: place 1 item into every newly visited compatible slot
      if (!this.cursorStack || this.cursorStack.count <= 0) return;
      if (!this._canSlotAcceptDragStack(zone, index, this.cursorStack)) return;
      this._drag.visitedKeys.add(key);
      const cur = this._getSlot(zone, index);
      if (!cur) {
        this._setSlot(
          zone,
          index,
          ItemRegistry.createStack(
            this.cursorStack.id,
            1,
            this.cursorStack.maxDurability > 0 ? this.cursorStack.durability : null,
            this.cursorStack.meta
          )
        );
      } else {
        cur.count += 1;
        this._setSlot(zone, index, cur);
      }
      this.cursorStack.count -= 1;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      this.render();
      return;
    }

    if (this._drag.button === 0 && this._drag.sourceCursor) {
      // Left-Drag: upgrade from initial single click into Java 1.21 even distribution across 2+ slots
      const first = this._drag.visited[0];
      if (!first) return;
      const firstKey = `${first.zone}:${first.index}`;

      if (!this._drag.evenActive) {
        // Only activate even-split drag if the initial slot was compatible (not an item swap)
        if (!this._drag.firstCompatible) return;
        // Revert first slot back to pre-drag state before distributing evenly
        this._setSlot(first.zone, first.index, this._drag.snapshots.get(firstKey) || null);
        this.cursorStack = ItemRegistry.cloneStack(this._drag.sourceCursor);
        this._drag.evenActive = true;
      }

      if (!this._canSlotAcceptDragStack(zone, index, this._drag.sourceCursor)) return;
      if (Math.floor(this._drag.sourceCursor.count / (this._drag.visited.length + 1)) < 1) return;
      this._drag.visitedKeys.add(key);
      this._drag.visited.push({ zone, index });
      this._drag.snapshots.set(key, this._getSlot(zone, index));
      this._applyEvenDistribution();
      this.render();
    }
  }

  _applyEvenDistribution() {
    if (!this._drag?.evenActive || !this._drag.sourceCursor) return;
    const total = this._drag.sourceCursor.count;
    const n = this._drag.visited.length;
    if (n <= 0) return;

    const perSlot = Math.floor(total / n);
    if (perSlot <= 0) {
      // If fewer items than slots, keep cursor intact & do not place partial zeroes
      return;
    }

    let placedTotal = 0;
    const proto = this._drag.sourceCursor;
    const maxS = ItemRegistry.getMaxStack(proto.id);

    for (const { zone, index } of this._drag.visited) {
      const orig = this._drag.snapshots.get(`${zone}:${index}`) || null;
      const origCount = orig ? orig.count : 0;
      const add = Math.min(perSlot, maxS - origCount);
      placedTotal += add;
      if (add > 0) {
        const nextStack = orig
          ? ItemRegistry.cloneStack(orig)
          : ItemRegistry.createStack(
              proto.id,
              origCount + add,
              proto.maxDurability > 0 ? proto.durability : null,
              proto.meta
            );
        if (orig && nextStack) nextStack.count = origCount + add;
        this._setSlot(zone, index, nextStack);
      }
    }

    const rem = total - placedTotal;
    if (rem > 0) {
      this.cursorStack = ItemRegistry.cloneStack(proto);
      this.cursorStack.count = rem;
    } else {
      this.cursorStack = null;
    }
  }

  _finishDrag() {
    if (!this._drag) return;
    if (this._drag.visitedKeys && this._drag.visitedKeys.size > 1) {
      this._lastClick.time = 0;
    }
    this._drag = null;
    for (const ui of this._slotElements.values()) {
      ui.btn.classList.remove('drag-preview');
    }
  }

  _handleSlotMouseDown(zone, index, e) {
    this._finishDrag();

    if (e.button === 0 && e.shiftKey) {
      this._handleQuickMove(zone, index);
      return;
    }

    if (zone === 'craft_out') {
      if (!this.craftResult) return;
      if (this.cursorStack) {
        if (!ItemRegistry.canStackTogether(this.cursorStack, this.craftResult)) return;
        const maxS = ItemRegistry.getMaxStack(this.cursorStack.id);
        if (this.cursorStack.count + this.craftResult.count > maxS) return;
        this.cursorStack.count += this.craftResult.count;
      } else {
        this.cursorStack = ItemRegistry.cloneStack(this.craftResult);
      }
      this._consumeCraftIngredients(1);
      this.render();
      return;
    }

    const now = performance.now();
    const slotStack = this._getSlot(zone, index);

    // Right-click (button 2): split half on empty cursor, or place 1 & arm Right-Drag
    if (e.button === 2) {
      if (!this.cursorStack) {
        if (!slotStack) return;
        const takeCount = Math.ceil(slotStack.count / 2);
        const remainCount = slotStack.count - takeCount;
        this.cursorStack = ItemRegistry.createStack(
          slotStack.id,
          takeCount,
          slotStack.maxDurability > 0 ? slotStack.durability : null,
          slotStack.meta
        );
        if (remainCount > 0) {
          slotStack.count = remainCount;
          this._setSlot(zone, index, slotStack);
        } else {
          this._setSlot(zone, index, null);
        }
        this._collectIfFurnaceOut(zone, index);
      } else {
        if (!this._isAllowedInSlot(zone, index, this.cursorStack)) return;
        const placedOk = !slotStack || (
          ItemRegistry.canStackTogether(slotStack, this.cursorStack) &&
          slotStack.count < ItemRegistry.getMaxStack(slotStack.id)
        );
        if (placedOk) {
          if (!slotStack) {
            this._setSlot(
              zone,
              index,
              ItemRegistry.createStack(
                this.cursorStack.id,
                1,
                this.cursorStack.maxDurability > 0 ? this.cursorStack.durability : null,
                this.cursorStack.meta
              )
            );
          } else {
            slotStack.count += 1;
            this._setSlot(zone, index, slotStack);
          }
          this.cursorStack.count -= 1;
          if (this.cursorStack.count <= 0) {
            this.cursorStack = null;
          } else {
            this._drag = {
              active: true,
              button: 2,
              visitedKeys: new Set([`${zone}:${index}`]),
            };
          }
        }
      }
      this.render();
      return;
    }

    // Left-click (button 0) Double-Click Collect:
    const isDoubleClick = (
      now - this._lastClick.time < 320 &&
      this._lastClick.zone === zone &&
      this._lastClick.index === index
    );
    if (isDoubleClick && this.cursorStack) {
      this._collectMatchingToCursor();
      this._lastClick.time = 0;
      this.render();
      return;
    }
    if (isDoubleClick && !this.cursorStack && slotStack) {
      this.cursorStack = slotStack;
      this._setSlot(zone, index, null);
      this._collectMatchingToCursor();
      this._lastClick.time = 0;
      this.render();
      return;
    }

    // Normal Left-click (button 0) + arm Java Left-Drag if holding a stack > 1
    if (zone === 'furnace' && index === 2) {
      if (!slotStack) return;
      if (!this.cursorStack) {
        this.cursorStack = slotStack;
        this._setSlot(zone, index, null);
        this._collectIfFurnaceOut(zone, index);
      } else if (ItemRegistry.canStackTogether(this.cursorStack, slotStack)) {
        const maxS = ItemRegistry.getMaxStack(this.cursorStack.id);
        const space = maxS - this.cursorStack.count;
        if (space > 0) {
          const take = Math.min(space, slotStack.count);
          this.cursorStack.count += take;
          slotStack.count -= take;
          this._setSlot(zone, index, slotStack.count > 0 ? slotStack : null);
          this._collectIfFurnaceOut(zone, index);
        }
      }
      this.render();
      return;
    }

    if (!this.cursorStack) {
      if (!slotStack) {
        this._lastClick = { time: now, zone, index, itemId: 0, meta: 0 };
        return;
      }
      this.cursorStack = slotStack;
      this._setSlot(zone, index, null);
      this._lastClick = { time: now, zone, index, itemId: slotStack.id, meta: slotStack.meta || 0 };
    } else {
      if (!this._isAllowedInSlot(zone, index, this.cursorStack)) return;

      const sourceCursorSnap = ItemRegistry.cloneStack(this.cursorStack);
      const preSlotSnap = ItemRegistry.cloneStack(slotStack);
      const firstCompatible =
        zone !== 'armor' &&
        (!slotStack || (
          ItemRegistry.canStackTogether(slotStack, this.cursorStack) &&
          slotStack.count < ItemRegistry.getMaxStack(slotStack.id)
        ));

      if (!slotStack) {
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = null;
      } else if (ItemRegistry.canStackTogether(slotStack, this.cursorStack)) {
        const maxS = ItemRegistry.getMaxStack(slotStack.id);
        const space = maxS - slotStack.count;
        if (space > 0) {
          const add = Math.min(space, this.cursorStack.count);
          slotStack.count += add;
          this._setSlot(zone, index, slotStack);
          this.cursorStack.count -= add;
          if (this.cursorStack.count <= 0) this.cursorStack = null;
        }
      } else {
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = slotStack;
      }

      if (sourceCursorSnap.count > 1 && firstCompatible) {
        const snapshots = new Map();
        snapshots.set(`${zone}:${index}`, preSlotSnap);
        this._drag = {
          active: true,
          button: 0,
          evenActive: false,
          firstCompatible: true,
          sourceCursor: sourceCursorSnap,
          visited: [{ zone, index }],
          visitedKeys: new Set([`${zone}:${index}`]),
          snapshots,
        };
      }

      this._lastClick = { time: now, zone, index, itemId: sourceCursorSnap.id, meta: sourceCursorSnap.meta || 0 };
    }
    this.render();
  }

  _handleQuickMove(zone, index) {
    if (zone === 'craft_out') {
      let guard = 0;
      while (this.craftResult && guard < 64) {
        if (!this.inventory.canAcceptExact(this.craftResult.id, this.craftResult.count, this.craftResult.durability, this.craftResult.meta)) break;
        const res = ItemRegistry.cloneStack(this.craftResult);
        this.inventory.addItem(res.id, res.count, res.maxDurability > 0 ? res.durability : null, res.meta);
        this._consumeCraftIngredients(1);
        guard++;
      }
      this.render();
      return;
    }

    const src = this._getSlot(zone, index);
    if (!src) return;

    const tryMoveToRange = (targetZone, startIdx, endIdx) => {
      for (let i = startIdx; i < endIdx && src.count > 0; i++) {
        if (targetZone === zone && i === index) continue;
        const dst = this._getSlot(targetZone, i);
        if (dst && ItemRegistry.canStackTogether(dst, src)) {
          const maxS = ItemRegistry.getMaxStack(dst.id);
          const add = Math.min(maxS - dst.count, src.count);
          if (add > 0) {
            dst.count += add;
            this._setSlot(targetZone, i, dst);
            src.count -= add;
          }
        }
      }
      for (let i = startIdx; i < endIdx && src.count > 0; i++) {
        if (targetZone === zone && i === index) continue;
        if (!this._getSlot(targetZone, i) && this._isAllowedInSlot(targetZone, i, src)) {
          this._setSlot(targetZone, i, src);
          src.count = 0;
        }
      }
      this._setSlot(zone, index, src.count > 0 ? src : null);
    };

    if (zone === 'inv') {
      const def = ItemRegistry.get(src.id);
      if (this.mode === 'inventory' && def?.armorSlot) {
        const armorIdx = ['helmet', 'chestplate', 'leggings', 'boots'].indexOf(def.armorSlot);
        if (armorIdx >= 0 && !this._getSlot('armor', armorIdx)) {
          this._setSlot('armor', armorIdx, src);
          this._setSlot(zone, index, null);
          this.render();
          return;
        }
      }
      if (this.mode === 'chest') {
        tryMoveToRange('chest', 0, CHEST_SIZE);
      } else if (this.mode === 'furnace') {
        if (RecipeRegistry.getSmeltResult(src.id)) {
          tryMoveToRange('furnace', 0, 1);
        } else if (RecipeRegistry.getFuelBurnTicks(src.id) > 0) {
          tryMoveToRange('furnace', 1, 2);
        }
      } else if (index < HOTBAR_SIZE) {
        tryMoveToRange('inv', HOTBAR_SIZE, INVENTORY_SIZE);
      } else {
        tryMoveToRange('inv', 0, HOTBAR_SIZE);
      }
    } else {
      tryMoveToRange('inv', 0, INVENTORY_SIZE);
      if (zone === 'furnace' && index === 2) {
        this._collectIfFurnaceOut(zone, index);
      }
    }

    this.render();
  }

  _collectIfFurnaceOut(zone, index) {
    if (zone === 'furnace' && index === 2 && this.activeBlockPos) {
      const xp = this.blockEntities?.collectFurnaceXp?.(
        this.activeBlockPos.x,
        this.activeBlockPos.y,
        this.activeBlockPos.z
      ) || 0;
      if (xp > 0) {
        this.onCollectFurnaceXp?.(xp);
      }
    }
  }

  _handleTouchSplit(zone, index) {
    if (zone === 'craft_out') return;
    const src = this._getSlot(zone, index);
    if (!src || src.count <= 1) return;
    if (this.cursorStack) return;

    const half = Math.ceil(src.count / 2);
    const keep = src.count - half;
    this.cursorStack = ItemRegistry.createStack(src.id, half, src.maxDurability > 0 ? src.durability : null, src.meta);
    this._setSlot(zone, index, ItemRegistry.createStack(src.id, keep, src.maxDurability > 0 ? src.durability : null, src.meta));
    this.selectedTouchRef = null;
    this.render();
  }

  _handleTouchTap(zone, index) {
    if (zone === 'craft_out') {
      if (!this.craftResult) return;
      if (this.cursorStack) {
        if (ItemRegistry.canStackTogether(this.cursorStack, this.craftResult)) {
          const maxS = ItemRegistry.getMaxStack(this.cursorStack.id);
          if (this.cursorStack.count + this.craftResult.count <= maxS) {
            this.cursorStack.count += this.craftResult.count;
            this._consumeCraftIngredients(1);
            this.render();
          }
        }
        return;
      }
      if (!this.inventory.canAcceptExact(this.craftResult.id, this.craftResult.count, this.craftResult.durability, this.craftResult.meta)) {
        return;
      }
      this.inventory.addItem(this.craftResult.id, this.craftResult.count, null, this.craftResult.meta);
      this._consumeCraftIngredients(1);
      this.render();
      return;
    }

    if (zone === 'furnace' && index === 2) {
      const fOut = this._getSlot(zone, index);
      if (!fOut) return;
      if (this.cursorStack) {
        if (ItemRegistry.canStackTogether(this.cursorStack, fOut)) {
          const maxS = ItemRegistry.getMaxStack(this.cursorStack.id);
          const take = Math.min(maxS - this.cursorStack.count, fOut.count);
          if (take > 0) {
            this.cursorStack.count += take;
            fOut.count -= take;
            this._setSlot(zone, index, fOut.count > 0 ? fOut : null);
            this._collectIfFurnaceOut(zone, index);
            this.render();
          }
        }
        return;
      }
      const rem = this.inventory.addItem(fOut.id, fOut.count, fOut.maxDurability > 0 ? fOut.durability : null, fOut.meta);
      this._setSlot(zone, index, rem > 0 ? ItemRegistry.createStack(fOut.id, rem, null, fOut.meta) : null);
      if (rem < fOut.count) this._collectIfFurnaceOut(zone, index);
      this.render();
      return;
    }

    if (this.cursorStack) {
      const dst = this._getSlot(zone, index);
      if (!this._isAllowedInSlot(zone, index, this.cursorStack)) return;
      if (!dst) {
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = null;
      } else if (ItemRegistry.canStackTogether(dst, this.cursorStack)) {
        const maxS = ItemRegistry.getMaxStack(dst.id);
        const add = Math.min(maxS - dst.count, this.cursorStack.count);
        if (add > 0) {
          dst.count += add;
          this._setSlot(zone, index, dst);
          this.cursorStack.count -= add;
          if (this.cursorStack.count <= 0) this.cursorStack = null;
        }
      } else {
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = dst;
      }
      this.selectedTouchRef = null;
      this.render();
      return;
    }

    const clickedStack = this._getSlot(zone, index);
    if (!this.selectedTouchRef) {
      if (!clickedStack) return;
      this.selectedTouchRef = { zone, index };
      this._showTooltip(clickedStack, null, null);
      this.render();
      return;
    }

    if (this.selectedTouchRef.zone === zone && this.selectedTouchRef.index === index) {
      this.selectedTouchRef = null;
      this.tooltipEl?.classList.add('hidden');
      this.render();
      return;
    }

    const src = this._getSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index);
    if (!src || !this._isAllowedInSlot(zone, index, src)) {
      this.selectedTouchRef = null;
      this.render();
      return;
    }

    if (!clickedStack) {
      this._setSlot(zone, index, src);
      this._setSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index, null);
    } else if (ItemRegistry.canStackTogether(clickedStack, src)) {
      const maxS = ItemRegistry.getMaxStack(clickedStack.id);
      const add = Math.min(maxS - clickedStack.count, src.count);
      if (add > 0) {
        clickedStack.count += add;
        this._setSlot(zone, index, clickedStack);
        src.count -= add;
        this._setSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index, src.count > 0 ? src : null);
      }
    } else {
      this._setSlot(zone, index, src);
      this._setSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index, clickedStack);
    }

    this.selectedTouchRef = null;
    this.tooltipEl?.classList.add('hidden');
    this.render();
  }

  autoFillRecipe(recipe, fillAll = false) {
    const gridSize = this._getActiveGridSize();
    if (!RecipeRegistry.fitsInGrid(recipe, gridSize)) return;

    const alreadySameRecipe = this.craftMatchedRecipe && this.craftMatchedRecipe.id === recipe.id;
    if (!alreadySameRecipe) {
      this._returnCraftGridToInventory();
    }

    const takeOneMatching = (expected) => {
      const opts = Array.isArray(expected) ? expected : [expected];
      for (let i = 0; i < INVENTORY_SIZE; i++) {
        const s = this.inventory.slots[i];
        if (s && opts.includes(s.id) && s.count > 0) {
          const taken = ItemRegistry.createStack(s.id, 1, null, s.meta);
          s.count -= 1;
          if (s.count <= 0) this.inventory.slots[i] = null;
          return taken;
        }
      }
      return null;
    };

    const addOneSet = () => {
      if (!RecipeRegistry.canCraftFromSlots(recipe, this.inventory.slots, gridSize)) return false;

      const slotsToUse = [];
      if (recipe.type === 'shapeless') {
        for (let idx = 0; idx < recipe.ingredients.length; idx++) {
          const cur = this.craftGrid[idx];
          const opts = Array.isArray(recipe.ingredients[idx]) ? recipe.ingredients[idx] : [recipe.ingredients[idx]];
          if (cur && (!opts.includes(cur.id) || cur.count >= ItemRegistry.getMaxStack(cur.id))) return false;
          slotsToUse.push({ gridIdx: idx, expected: recipe.ingredients[idx] });
        }
      } else {
        for (let py = 0; py < recipe.height; py++) {
          const row = recipe.pattern[py];
          for (let px = 0; px < recipe.width; px++) {
            const ch = row[px];
            if (ch !== ' ') {
              const gIdx = py * gridSize + px;
              const cur = this.craftGrid[gIdx];
              const expected = recipe.key[ch];
              const opts = Array.isArray(expected) ? expected : [expected];
              if (cur && (!opts.includes(cur.id) || cur.count >= ItemRegistry.getMaxStack(cur.id))) return false;
              slotsToUse.push({ gridIdx: gIdx, expected });
            }
          }
        }
      }

      for (const req of slotsToUse) {
        const picked = takeOneMatching(req.expected);
        if (!picked) return false;
        const cur = this.craftGrid[req.gridIdx];
        if (cur) {
          cur.count += 1;
        } else {
          this.craftGrid[req.gridIdx] = picked;
        }
      }
      return true;
    };

    const maxCycles = fillAll ? 64 : 1;
    for (let c = 0; c < maxCycles; c++) {
      if (!addOneSet()) break;
    }

    this.inventory._emitChange();
    this._recomputeCraftResult();
    this.render();
  }

  _getCreativeCatalogEntries(category, query = '') {
    const blocks = BlockRegistry.getPlaceableBlocks();
    const items = ItemRegistry.getAllItems();
    const natureSet = new Set([
      1, 2, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
      27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 60, 61, 62, 63, 74,
    ]);
    const isCombatOrTool = (id) => {
      if (id === 76) return true; // TNT
      const def = ItemRegistry.get(id);
      if (!def) return false;
      return Boolean(
        def.toolType ||
        def.armorSlot ||
        def.isBow ||
        id === 343 || // ARROW
        id === 321 || // FLINT_AND_STEEL
        id === 322 || // SHEARS
        id === 348    // ENDER_PEARL
      );
    };
    let list;
    if (category === 'blocks') {
      list = blocks.filter((b) => !natureSet.has(b.id) && b.id !== 76).map((b) => ({ id: b.id, name: b.name }));
    } else if (category === 'nature') {
      list = blocks.filter((b) => natureSet.has(b.id)).map((b) => ({ id: b.id, name: b.name }));
    } else if (category === 'combat') {
      list = [
        ...blocks.filter((b) => b.id === 76).map((b) => ({ id: b.id, name: b.name })),
        ...items.filter((it) => isCombatOrTool(it.id)).map((it) => ({ id: it.id, name: it.name })),
      ];
    } else if (category === 'items') {
      list = items.filter((it) => !isCombatOrTool(it.id)).map((it) => ({ id: it.id, name: it.name }));
    } else {
      list = [...blocks.map((b) => ({ id: b.id, name: b.name })), ...items.map((it) => ({ id: it.id, name: it.name }))];
    }
    const q = (query || '').trim().toLowerCase();
    if (q) {
      list = list.filter((e) => (e.name || '').toLowerCase().includes(q));
    }
    return list;
  }

  _syncCreativeThumb() {
    const cat = this._creativeCatalogEl;
    const bar = this._creativeScrollbarEl;
    const thumb = this._creativeThumbEl;
    if (!cat || !bar || !thumb) return;
    const maxScroll = Math.max(0, cat.scrollHeight - cat.clientHeight);
    if (maxScroll <= 1) {
      thumb.style.height = '100%';
      thumb.style.top = '0px';
      return;
    }
    const barH = bar.clientHeight || 180;
    const thumbH = Math.max(24, Math.round((cat.clientHeight / cat.scrollHeight) * barH));
    const ratio = cat.scrollTop / maxScroll;
    const topPx = Math.round(ratio * Math.max(0, barH - thumbH));
    thumb.style.height = `${thumbH}px`;
    thumb.style.top = `${topPx}px`;
  }

  _startCreativeScrollbarDrag(clientY) {
    if (!this._creativeCatalogEl || !this._creativeScrollbarEl) return;
    this._scrollbarDrag = { startY: clientY };
    this._updateCreativeScrollbarDrag(clientY);
  }

  _updateCreativeScrollbarDrag(clientY) {
    const cat = this._creativeCatalogEl;
    const bar = this._creativeScrollbarEl;
    if (!cat || !bar) return;
    const rect = bar.getBoundingClientRect();
    const h = Math.max(1, rect.height);
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / h));
    const maxScroll = Math.max(0, cat.scrollHeight - cat.clientHeight);
    cat.scrollTop = ratio * maxScroll;
    this._syncCreativeThumb();
  }

  renderLayout() {
    this._slotElements.clear();
    if (!this.topSectionEl || !this.mainGridEl || !this.hotbarGridEl) return;
    this.topSectionEl.innerHTML = '';
    this.mainGridEl.innerHTML = '';
    this.hotbarGridEl.innerHTML = '';
    this.furnaceFlameFill = null;
    this.furnaceArrowFill = null;
    this.playerCanvas = null;
    this._creativeCatalogEl = null;
    this._creativeScrollbarEl = null;
    this._creativeThumbEl = null;

    const showCraftUI = this.mode === 'inventory' || this.mode === 'crafting';
    this.recipeToggleBtn?.classList.toggle('hidden', !showCraftUI);
    this.creativeTabBtn?.classList.toggle('hidden', !this.inventory.creativeMode && this.mode !== 'creative');
    this.creativeTabBtn?.classList.toggle('active', this.mode === 'creative');

    if (this.mode === 'inventory') {
      this.titleEl.textContent = 'Инвентарь';
      const layout = document.createElement('div');
      layout.className = 'inv-top-player-layout';

      const armorCol = document.createElement('div');
      armorCol.className = 'inv-armor-col';
      const placeholders = ['Шлем', 'Броня', 'Поножи', 'Боты'];
      for (let a = 0; a < 4; a++) {
        armorCol.appendChild(this._createSlotElement('armor', a, placeholders[a]));
      }

      const dollWrap = document.createElement('div');
      dollWrap.className = 'inv-doll-frame';
      const canvas = document.createElement('canvas');
      canvas.id = 'inv-player-canvas';
      canvas.width = 120;
      canvas.height = 154;
      dollWrap.appendChild(canvas);
      this.playerCanvas = canvas;
      this.playerPreview?.bindCanvas(canvas);

      const craftWrap = document.createElement('div');
      craftWrap.className = 'inv-craft-wrap';
      const craftLabel = document.createElement('div');
      craftLabel.className = 'inv-section-label';
      craftLabel.textContent = 'Крафт 2×2';

      const craftRow = document.createElement('div');
      craftRow.className = 'inv-craft-row';
      const grid2 = document.createElement('div');
      grid2.className = 'inv-craft-grid-2';
      for (let i = 0; i < 4; i++) {
        grid2.appendChild(this._createSlotElement('craft', i));
      }
      const arrow = document.createElement('div');
      arrow.className = 'inv-craft-arrow';
      arrow.textContent = '➜';
      const outSlot = this._createSlotElement('craft_out', 0);
      outSlot.classList.add('inv-slot-output');

      craftRow.append(grid2, arrow, outSlot);
      craftWrap.append(craftLabel, craftRow);

      layout.append(armorCol, dollWrap, craftWrap);
      this.topSectionEl.appendChild(layout);
    } else if (this.mode === 'crafting') {
      this.titleEl.textContent = 'Верстак (3×3)';
      const craftWrap = document.createElement('div');
      craftWrap.className = 'inv-craft-table-layout';
      const grid3 = document.createElement('div');
      grid3.className = 'inv-craft-grid-3';
      for (let i = 0; i < 9; i++) {
        grid3.appendChild(this._createSlotElement('craft', i));
      }
      const arrow = document.createElement('div');
      arrow.className = 'inv-craft-arrow';
      arrow.textContent = '➜';
      const outSlot = this._createSlotElement('craft_out', 0);
      outSlot.classList.add('inv-slot-output');
      craftWrap.append(grid3, arrow, outSlot);
      this.topSectionEl.appendChild(craftWrap);
    } else if (this.mode === 'furnace') {
      this.titleEl.textContent = 'Печь';
      const furnWrap = document.createElement('div');
      furnWrap.className = 'inv-furnace-layout';

      const leftCol = document.createElement('div');
      leftCol.className = 'inv-furnace-col';
      const inputSlot = this._createSlotElement('furnace', 0, 'Сырьё');

      const flameTrack = document.createElement('div');
      flameTrack.className = 'furnace-flame-track';
      const flameFill = document.createElement('div');
      flameFill.className = 'furnace-flame-fill';
      flameTrack.appendChild(flameFill);
      this.furnaceFlameFill = flameFill;

      const fuelSlot = this._createSlotElement('furnace', 1, 'Топливо');
      leftCol.append(inputSlot, flameTrack, fuelSlot);

      const arrowTrack = document.createElement('div');
      arrowTrack.className = 'furnace-arrow-track';
      const arrowFill = document.createElement('div');
      arrowFill.className = 'furnace-arrow-fill';
      arrowTrack.appendChild(arrowFill);
      this.furnaceArrowFill = arrowFill;

      const outputSlot = this._createSlotElement('furnace', 2, 'Готово');
      outputSlot.classList.add('inv-slot-output');

      furnWrap.append(leftCol, arrowTrack, outputSlot);
      this.topSectionEl.appendChild(furnWrap);
    } else if (this.mode === 'chest') {
      this.titleEl.textContent = 'Сундук';
      const chestGrid = document.createElement('div');
      chestGrid.className = 'inv-chest-grid';
      for (let i = 0; i < CHEST_SIZE; i++) {
        chestGrid.appendChild(this._createSlotElement('chest', i));
      }
      this.topSectionEl.appendChild(chestGrid);
    } else if (this.mode === 'creative') {
      this.titleEl.textContent = 'Творческий каталог';
      const shell = document.createElement('div');
      shell.className = 'inv-creative-shell';

      const tabs = document.createElement('div');
      tabs.className = 'inv-creative-tabs';
      const cats = [
        ['all', 'Все'],
        ['blocks', 'Блоки'],
        ['nature', 'Природа'],
        ['combat', 'Оружие'],
        ['items', 'Предметы'],
      ];

      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'inv-creative-search';
      searchInput.placeholder = 'Поиск предметов...';
      searchInput.value = this.creativeSearch;

      const body = document.createElement('div');
      body.className = 'inv-creative-body';

      const catalog = document.createElement('div');
      catalog.className = 'inv-creative-catalog';

      const scrollbar = document.createElement('div');
      scrollbar.className = 'inv-creative-scrollbar';
      const thumb = document.createElement('div');
      thumb.className = 'inv-creative-thumb';
      scrollbar.appendChild(thumb);

      this._creativeCatalogEl = catalog;
      this._creativeScrollbarEl = scrollbar;
      this._creativeThumbEl = thumb;

      const fillCatalog = () => {
        catalog.innerHTML = '';
        const list = this._getCreativeCatalogEntries(this.creativeCategory, this.creativeSearch);
        for (const entry of list) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'inv-creative-item';
          btn.title = entry.name;
          btn.dataset.itemId = String(entry.id);
          const img = document.createElement('img');
          img.src = this.atlas.getItemIconDataURL(entry.id);
          img.alt = entry.name;
          img.draggable = false;
          btn.appendChild(img);
          btn.addEventListener('mouseenter', (e) => {
            this._showTooltip({ id: entry.id, count: 1 }, e.clientX, e.clientY);
          });
          btn.addEventListener('mouseleave', () => {
            this.tooltipEl?.classList.add('hidden');
          });
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const count = ItemRegistry.getMaxStack(entry.id);
            if (e.shiftKey || this.cursorStack) {
              this.inventory.addItem(entry.id, count);
            } else {
              this.cursorStack = ItemRegistry.createStack(entry.id, count);
            }
            this.render();
          });
          catalog.appendChild(btn);
        }
        catalog.scrollTop = 0;
        requestAnimationFrame(() => this._syncCreativeThumb());
      };

      for (const [catId, label] of cats) {
        const tBtn = document.createElement('button');
        tBtn.type = 'button';
        tBtn.className = `inv-cat-btn ${this.creativeCategory === catId ? 'active' : ''}`;
        tBtn.textContent = label;
        tBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.creativeCategory = catId;
          tabs.querySelectorAll('.inv-cat-btn').forEach((b) => b.classList.remove('active'));
          tBtn.classList.add('active');
          fillCatalog();
        });
        tabs.appendChild(tBtn);
      }

      catalog.addEventListener('scroll', () => this._syncCreativeThumb(), { passive: true });
      scrollbar.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._startCreativeScrollbarDrag(e.clientY);
      });
      scrollbar.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        if (e.touches[0]) this._startCreativeScrollbarDrag(e.touches[0].clientY);
      }, { passive: true });
      scrollbar.addEventListener('touchmove', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.touches[0]) this._updateCreativeScrollbarDrag(e.touches[0].clientY);
      }, { passive: false });
      scrollbar.addEventListener('touchend', () => {
        this._scrollbarDrag = null;
      }, { passive: true });

      searchInput.addEventListener('input', (e) => {
        e.stopPropagation();
        this.creativeSearch = searchInput.value;
        fillCatalog();
      });
      searchInput.addEventListener('keydown', (e) => e.stopPropagation());

      body.append(catalog, scrollbar);
      shell.append(tabs, searchInput, body);
      this.topSectionEl.appendChild(shell);
      fillCatalog();
    }

    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      this.mainGridEl.appendChild(this._createSlotElement('inv', i));
    }
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const s = this._createSlotElement('inv', i);
      if (i === this.inventory.selectedSlot) s.classList.add('hotbar-active');
      this.hotbarGridEl.appendChild(s);
    }
  }

  _renderSlotVisual(zone, index, stack) {
    const ui = this._slotElements.get(`${zone}:${index}`);
    if (!ui) return;

    const isSelectedTouch = Boolean(this.selectedTouchRef && this.selectedTouchRef.zone === zone && this.selectedTouchRef.index === index);
    ui.btn.classList.toggle('touch-selected', isSelectedTouch);

    const isDragHighlighted = Boolean(this._drag?.active && this._drag.evenActive && this._drag.visitedKeys?.has(`${zone}:${index}`));
    ui.btn.classList.toggle('drag-preview', isDragHighlighted);

    const sig = stack && stack.id > 0 && stack.count > 0
      ? `${stack.id}:${stack.count}:${stack.durability || 0}:${stack.maxDurability || 0}`
      : 'empty';
    if (ui.lastSig === sig) return;
    ui.lastSig = sig;

    if (stack && stack.id > 0 && stack.count > 0) {
      ui.icon.src = this.atlas.getItemIconDataURL(stack.id);
      ui.icon.classList.remove('hidden');
      const showCount = stack.count > 1;
      ui.count.textContent = showCount ? String(stack.count) : '';
      ui.count.classList.toggle('hidden', !showCount);

      const maxDur = stack.maxDurability || 0;
      const showDur = maxDur > 0 && stack.durability < maxDur;
      ui.durBar.classList.toggle('hidden', !showDur);
      if (showDur) {
        const ratio = Math.max(0, Math.min(1, stack.durability / maxDur));
        ui.durFill.style.width = `${Math.round(ratio * 100)}%`;
        ui.durFill.style.background = getDurabilityColor(ratio);
      }
    } else {
      ui.icon.classList.add('hidden');
      ui.count.classList.add('hidden');
      ui.durBar.classList.add('hidden');
    }
  }

  render() {
    if (!this.isOpen) return;

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      this._renderSlotVisual('inv', i, this.inventory.slots[i]);
    }
    if (this.mode === 'inventory') {
      for (let a = 0; a < 4; a++) {
        this._renderSlotVisual('armor', a, this._getSlot('armor', a));
      }
      for (let c = 0; c < 4; c++) {
        this._renderSlotVisual('craft', c, this.craftGrid[c]);
      }
      this._renderSlotVisual('craft_out', 0, this.craftResult);
      this.playerPreview?.syncEquipment(this.inventory.getHeldStack(), this.inventory.armor);
    } else if (this.mode === 'crafting') {
      for (let c = 0; c < 9; c++) {
        this._renderSlotVisual('craft', c, this.craftGrid[c]);
      }
      this._renderSlotVisual('craft_out', 0, this.craftResult);
    } else if (this.mode === 'chest' && this.activeBlockPos) {
      for (let i = 0; i < CHEST_SIZE; i++) {
        this._renderSlotVisual('chest', i, this._getSlot('chest', i));
      }
    } else if (this.mode === 'furnace' && this.activeBlockPos) {
      this._renderSlotVisual('furnace', 0, this._getSlot('furnace', 0));
      this._renderSlotVisual('furnace', 1, this._getSlot('furnace', 1));
      this._renderSlotVisual('furnace', 2, this._getSlot('furnace', 2));
      this.updateFurnaceProgress();
    }

    this._renderCursorGhost();
    this.renderRecipeBook();
  }

  updateFurnaceProgress() {
    if (!this.isOpen || this.mode !== 'furnace' || !this.activeBlockPos) return;
    const f = this.blockEntities.getOrCreateFurnace(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
    if (this.furnaceFlameFill) {
      const burnPct = f.burnMax > 0 ? Math.max(0, Math.min(100, (f.burnTime / f.burnMax) * 100)) : 0;
      this.furnaceFlameFill.style.height = `${burnPct.toFixed(1)}%`;
    }
    if (this.furnaceArrowFill) {
      const cookPct = f.cookMax > 0 ? Math.max(0, Math.min(100, (f.cookTime / f.cookMax) * 100)) : 0;
      this.furnaceArrowFill.style.width = `${cookPct.toFixed(1)}%`;
    }
    this._renderSlotVisual('furnace', 0, f.input);
    this._renderSlotVisual('furnace', 1, f.fuel);
    this._renderSlotVisual('furnace', 2, f.output);
  }

  _renderRecipePreview(entry) {
    if (!this.recipePreviewEl) return;
    if (!entry || !entry.recipe) {
      this.recipePreviewEl.classList.add('hidden');
      return;
    }
    const r = entry.recipe;
    const resName = entry.resultDef?.name || 'Предмет';
    const note = !entry.fitsInGrid ? ' (нужен верстак 3×3)' : (!entry.craftable ? ' (недостаточно ресурсов)' : '');

    // Build 3x3 array of itemIds
    const cells = new Array(9).fill(0);
    if (r.type === 'shapeless') {
      r.ingredients.forEach((ing, idx) => {
        if (idx < 9) cells[idx] = Array.isArray(ing) ? ing[0] : ing;
      });
    } else {
      for (let py = 0; py < r.height; py++) {
        const row = r.pattern[py];
        for (let px = 0; px < r.width; px++) {
          const ch = row[px];
          if (ch !== ' ') {
            const expected = r.key[ch];
            cells[py * 3 + px] = Array.isArray(expected) ? expected[0] : expected;
          }
        }
      }
    }

    this.recipePreviewEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'inv-recipe-preview-title';
    title.textContent = `${resName} ×${r.result.count}${note}`;

    const body = document.createElement('div');
    body.className = 'inv-recipe-preview-body';

    const grid = document.createElement('div');
    grid.className = 'inv-recipe-preview-grid';
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-recipe-preview-cell';
      if (cells[i] > 0) {
        const img = document.createElement('img');
        img.src = this.atlas.getItemIconDataURL(cells[i]);
        img.alt = ItemRegistry.getName(cells[i]);
        img.title = ItemRegistry.getName(cells[i]);
        img.draggable = false;
        cell.appendChild(img);
      }
      grid.appendChild(cell);
    }

    const arrow = document.createElement('div');
    arrow.className = 'inv-recipe-preview-arrow';
    arrow.textContent = '➜';

    const out = document.createElement('div');
    out.className = 'inv-recipe-preview-out';
    const outImg = document.createElement('img');
    outImg.src = this.atlas.getItemIconDataURL(r.result.id);
    outImg.alt = resName;
    outImg.draggable = false;
    out.appendChild(outImg);

    body.append(grid, arrow, out);
    this.recipePreviewEl.append(title, body);
    this.recipePreviewEl.classList.remove('hidden');
  }

  renderRecipeBook() {
    if (!this.recipeDrawerEl || !this.recipeListEl) return;
    const allow = this.isOpen && (this.mode === 'inventory' || this.mode === 'crafting') && this.recipeBookOpen;
    this.recipeDrawerEl.classList.toggle('hidden', !allow);
    this.recipeToggleBtn?.classList.toggle('active', allow);
    if (!allow) return;

    const gridSize = this._getActiveGridSize();
    const allList = RecipeRegistry.getRecipeBookList(this.inventory.slots, gridSize, true);
    const filtered = this.onlyCraftableFilter ? allList.filter((e) => e.craftable) : allList;

    const totalPages = Math.max(1, Math.ceil(filtered.length / this.recipesPerPage));
    this.recipePage = Math.max(0, Math.min(totalPages - 1, this.recipePage));

    if (this.recipePageLabel) {
      this.recipePageLabel.textContent = `${this.recipePage + 1} / ${totalPages}`;
    }
    if (this.recipePrevBtn) {
      this.recipePrevBtn.disabled = this.recipePage <= 0;
    }
    if (this.recipeNextBtn) {
      this.recipeNextBtn.disabled = this.recipePage >= totalPages - 1;
    }

    const start = this.recipePage * this.recipesPerPage;
    const pageEntries = filtered.slice(start, start + this.recipesPerPage);

    this.recipeListEl.innerHTML = '';
    for (const entry of pageEntries) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recipe-book-item';
      btn.classList.toggle('craftable', entry.craftable);
      btn.classList.toggle('missing', !entry.craftable);
      btn.classList.toggle('requires-table', !entry.fitsInGrid);
      btn.title = `${entry.resultDef?.name || 'Рецепт'} ×${entry.recipe.result.count}${!entry.fitsInGrid ? ' (Верстак 3×3)' : ''}`;

      const img = document.createElement('img');
      img.src = this.atlas.getItemIconDataURL(entry.recipe.result.id);
      img.alt = entry.resultDef?.name || '';
      img.draggable = false;

      const label = document.createElement('span');
      label.className = 'recipe-item-name';
      label.textContent = `${entry.resultDef?.name || ''}${entry.recipe.result.count > 1 ? ` ×${entry.recipe.result.count}` : ''}`;

      btn.append(img, label);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.previewRecipe = entry.recipe.id;
        this._renderRecipePreview(entry);
        if (entry.craftable) {
          this.autoFillRecipe(entry.recipe, e.shiftKey);
        }
      });
      this.recipeListEl.appendChild(btn);
    }

    if (this.previewRecipe) {
      const matchEntry = allList.find((e) => e.recipe.id === this.previewRecipe);
      this._renderRecipePreview(matchEntry || null);
    } else {
      this.recipePreviewEl?.classList.add('hidden');
    }
  }

  _renderCursorGhost() {
    if (!this.cursorGhostEl) return;
    if (!this.cursorStack || this.cursorStack.count <= 0) {
      this.cursorGhostEl.classList.add('hidden');
      return;
    }
    const img = this.cursorGhostEl.querySelector('img');
    const cnt = this.cursorGhostEl.querySelector('span');
    if (img) img.src = this.atlas.getItemIconDataURL(this.cursorStack.id);
    if (cnt) {
      cnt.textContent = this.cursorStack.count > 1 ? String(this.cursorStack.count) : '';
      cnt.classList.toggle('hidden', this.cursorStack.count <= 1);
    }
    this.cursorGhostEl.classList.remove('hidden');
  }

  _updateCursorGhost(x, y) {
    if (!this.cursorGhostEl || !this.cursorStack) return;
    // Positioned cleanly top-left above pointer tip & above VirtualMouse (#virtual-cursor z-index: 95)
    this.cursorGhostEl.style.left = `${x - 26}px`;
    this.cursorGhostEl.style.top = `${y - 26}px`;
  }

  _showTooltip(stack, x, y) {
    if (!this.tooltipEl || !stack || !stack.id) {
      this.tooltipEl?.classList.add('hidden');
      return;
    }
    const def = ItemRegistry.get(stack.id);
    if (!def) return;
    const lines = [def.name];

    if (stack.id < 256) {
      const heldStack = this.inventory?.getHeldStack?.();
      const heldDef = heldStack ? ItemRegistry.get(heldStack.id) : null;
      const info = BlockRegistry.getSurvivalInfo(stack.id, heldDef);
      if (info) {
        if (info.hardnessLabel) lines.push(`Твёрдость: ${info.hardnessLabel}`);
        if (info.toolLabel) lines.push(info.toolLabel);
        if (info.dropLabel) lines.push(`Дроп: ${info.dropLabel}`);
        if (!info.isLiquid && !info.unbreakable && Number.isFinite(info.heldBreakTimeSec)) {
          lines.push(`Время добычи: ${info.heldBreakTimeSec}с`);
        }
      }
    } else {
      if (def.maxDurability > 0) {
        const cur = stack.durability || def.maxDurability;
        lines.push(`Прочность: ${cur}/${def.maxDurability}`);
      }
      if (def.armorPoints > 0) {
        lines.push(`Защита: +${def.armorPoints}`);
      }
      if (def.isFood && def.foodStats) {
        lines.push(`Сытость: +${def.foodStats.hunger}`);
      }
      if (def.toolSpeed > 1) {
        lines.push(`Скорость: ${def.toolSpeed}×`);
      }
      if (def.meleeDamage > 1) {
        lines.push(`Урон: ${def.meleeDamage}`);
      }
      if (def.isBow) {
        lines.push('Зажмите ПКМ для натяжения тетивы (нужны Стрелы)');
      }
      if (def.isMilk) {
        lines.push('Снимает эффекты голода и регенерации');
      }
      if (def.isPearl) {
        lines.push('Телепортирует к месту попадания (−5 HP)');
      }
      if (def.isBoneMeal) {
        lines.push('Мгновенно удобряет посевы и саженцы');
      }
      if (def.fluidId) {
        lines.push(def.fluidId === 74 ? 'Разливает лаву · топливо для печи (100 оп.)' : 'Разливает бесконечный источник воды');
      }
    }

    this.tooltipEl.innerHTML = lines.map((l, idx) => idx === 0 ? `<strong>${l}</strong>` : `<span>${l}</span>`).join('');
    this.tooltipEl.classList.remove('hidden');
    if (x !== null && y !== null) {
      this._updateTooltipPos(x, y);
    } else {
      this.tooltipEl.style.left = '50%';
      this.tooltipEl.style.top = '12px';
    }
  }

  _updateTooltipPos(x, y) {
    if (!this.tooltipEl || this.tooltipEl.classList.contains('hidden')) return;
    this.tooltipEl.style.left = `${Math.min(window.innerWidth - 190, Math.max(8, x + 14))}px`;
    this.tooltipEl.style.top = `${Math.max(8, y - 34)}px`;
  }
}
