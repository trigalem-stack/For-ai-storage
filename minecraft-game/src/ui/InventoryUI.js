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
    this.onDropStack = options.onDropStack || null; // (stack) => void
    this.onOpen = options.onOpen || null;
    this.playerPreview = options.playerPreview || null;

    this.isOpen = false;
    this.mode = 'inventory'; // 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative'
    this.activeBlockPos = null; // { x, y, z }
    this.cursorStack = null;
    this.selectedTouchRef = null; // { zone, index } for mobile tap-transfer
    this.splitMode = false;
    this.recipeBookOpen = false;
    this.craftGrid = new Array(9).fill(null);
    this.craftResult = null;
    this.craftMatchedRecipe = null;

    this._slotElements = new Map(); // "zone:index" -> DOM element refs
    this._longPressTimer = null;
    this._longPressTriggered = false;

    this.overlay = document.getElementById('inventory-overlay');
    this.windowEl = document.getElementById('inventory-window');
    this.titleEl = document.getElementById('inv-title');
    this.topSectionEl = document.getElementById('inv-top-section');
    this.mainGridEl = document.getElementById('inv-main-grid');
    this.hotbarGridEl = document.getElementById('inv-hotbar-grid');
    this.recipeDrawerEl = document.getElementById('inv-recipe-drawer');
    this.recipeListEl = document.getElementById('inv-recipe-list');
    this.cursorGhostEl = document.getElementById('inv-cursor-ghost');
    this.tooltipEl = document.getElementById('inv-tooltip');

    this.recipeToggleBtn = document.getElementById('btn-inv-recipes');
    this.creativeTabBtn = document.getElementById('btn-inv-creative');
    this.splitToggleBtn = document.getElementById('btn-inv-split');
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
      if (e.target === this.overlay) {
        if (this.cursorStack) {
          this.onDropStack?.(this.cursorStack);
          this.cursorStack = null;
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
      if (this.playerPreview && this.playerCanvas && this.mode === 'inventory') {
        const rect = this.playerCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
          this.playerPreview.setLookTarget(nx, ny);
        }
      }
    });

    this.overlay?.addEventListener('touchmove', (e) => {
      if (this.playerPreview && this.playerCanvas && this.mode === 'inventory' && e.touches[0]) {
        const rect = this.playerCanvas.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const nx = ((e.touches[0].clientX - rect.left) / rect.width) * 2 - 1;
          const ny = ((e.touches[0].clientY - rect.top) / rect.height) * 2 - 1;
          this.playerPreview.setLookTarget(nx, ny);
        }
      }
    }, { passive: true });

    this.recipeToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.recipeBookOpen = !this.recipeBookOpen;
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

    this.splitToggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.splitMode = !this.splitMode;
      this.splitToggleBtn.classList.toggle('active', this.splitMode);
    });

    this.dropSelectedBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.cursorStack) {
        this.onDropStack?.(this.cursorStack);
        this.cursorStack = null;
        this.render();
        return;
      }
      if (this.selectedTouchRef) {
        const cur = this._getSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index);
        if (cur) {
          this._setSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index, null);
          this.onDropStack?.(cur);
          this.selectedTouchRef = null;
          this._recomputeCraftResult();
          this.render();
        }
      }
    });
  }

  open(mode = 'inventory', blockPos = null) {
    if (this.isOpen && this.mode === mode && (!blockPos || (this.activeBlockPos?.x === blockPos.x && this.activeBlockPos?.y === blockPos.y && this.activeBlockPos?.z === blockPos.z))) {
      return;
    }
    this._returnCraftGridToInventory();
    this.mode = mode;
    this.activeBlockPos = blockPos ? { x: blockPos.x, y: blockPos.y, z: blockPos.z } : null;
    this.selectedTouchRef = null;
    this.splitMode = false;
    this.isOpen = true;

    if (mode === 'crafting') {
      this.recipeBookOpen = true;
    } else if (mode === 'furnace' || mode === 'chest' || mode === 'creative') {
      this.recipeBookOpen = false;
    }

    this.overlay?.classList.remove('hidden');
    this.renderLayout();
    this.render();
    this.onOpen?.(mode);
  }

  close() {
    if (!this.isOpen) return;
    this._returnCraftGridToInventory();
    if (this.cursorStack) {
      const leftover = this.inventory.addItem(
        this.cursorStack.id,
        this.cursorStack.count,
        this.cursorStack.maxDurability > 0 ? this.cursorStack.durability : null,
        this.cursorStack.meta
      );
      if (leftover > 0) {
        const dropS = ItemRegistry.cloneStack(this.cursorStack);
        dropS.count = leftover;
        this.onDropStack?.(dropS);
      }
      this.cursorStack = null;
    }
    this.selectedTouchRef = null;
    this.splitMode = false;
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
      if (!s || s.count <= 0) continue;
      const rem = this.inventory.addItem(s.id, s.count, s.maxDurability > 0 ? s.durability : null, s.meta);
      if (rem > 0) {
        const dropS = ItemRegistry.cloneStack(s);
        dropS.count = rem;
        this.onDropStack?.(dropS);
      }
      this.craftGrid[i] = null;
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
      this.craftResult = match.result;
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
    if (zone === 'inv') return this.inventory.slots[index] || null;
    if (zone === 'armor') return this.inventory.armor[this._getArmorKeyByIndex(index)] || null;
    if (zone === 'craft') return this.craftGrid[index] || null;
    if (zone === 'craft_out') return this.craftResult || null;
    if (zone === 'chest' && this.activeBlockPos) {
      const c = this.blockEntities.getOrCreateChest(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
      return c.slots[index] || null;
    }
    if (zone === 'furnace' && this.activeBlockPos) {
      const f = this.blockEntities.getOrCreateFurnace(this.activeBlockPos.x, this.activeBlockPos.y, this.activeBlockPos.z);
      if (index === 0) return f.input;
      if (index === 1) return f.fuel;
      if (index === 2) return f.output;
    }
    return null;
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
    if (zone === 'furnace' && index === 2) return false; // cannot place into furnace output
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

    // Desktop mouse clicks
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._handleSlotMouseDown(zone, index, e);
    });

    btn.addEventListener('mouseenter', (e) => {
      const stack = this._getSlot(zone, index);
      this._showTooltip(stack, e.clientX, e.clientY);
    });

    btn.addEventListener('mouseleave', () => {
      this.tooltipEl?.classList.add('hidden');
    });

    // Mobile Touch interactions (tap select/transfer + 380ms long-press split)
    btn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      this._longPressTriggered = false;
      clearTimeout(this._longPressTimer);
      this._longPressTimer = setTimeout(() => {
        this._longPressTriggered = true;
        this._handleTouchSplit(zone, index);
      }, 380);
    }, { passive: true });

    btn.addEventListener('touchend', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(this._longPressTimer);
      if (this._longPressTriggered) {
        this._longPressTriggered = false;
        return;
      }
      this._handleTouchTap(zone, index);
    }, { passive: false });

    return btn;
  }

  _handleSlotMouseDown(zone, index, e) {
    // Shift + LMB quick move
    if (e.button === 0 && e.shiftKey) {
      this._handleQuickMove(zone, index);
      return;
    }

    // Craft Output Slot click
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

    const slotStack = this._getSlot(zone, index);

    // Right-click (button 2): split half on empty cursor, or place 1 item
    if (e.button === 2) {
      if (!this.cursorStack) {
        if (!slotStack) return;
        const takeCount = Math.ceil(slotStack.count / 2);
        const remainCount = slotStack.count - takeCount;
        this.cursorStack = ItemRegistry.createStack(slotStack.id, takeCount, slotStack.maxDurability > 0 ? slotStack.durability : null, slotStack.meta);
        if (remainCount > 0) {
          slotStack.count = remainCount;
          this._setSlot(zone, index, slotStack);
        } else {
          this._setSlot(zone, index, null);
        }
      } else {
        if (!this._isAllowedInSlot(zone, index, this.cursorStack)) return;
        if (!slotStack) {
          this._setSlot(zone, index, ItemRegistry.createStack(this.cursorStack.id, 1, this.cursorStack.maxDurability > 0 ? this.cursorStack.durability : null, this.cursorStack.meta));
          this.cursorStack.count -= 1;
          if (this.cursorStack.count <= 0) this.cursorStack = null;
        } else if (ItemRegistry.canStackTogether(slotStack, this.cursorStack)) {
          const maxS = ItemRegistry.getMaxStack(slotStack.id);
          if (slotStack.count < maxS) {
            slotStack.count += 1;
            this._setSlot(zone, index, slotStack);
            this.cursorStack.count -= 1;
            if (this.cursorStack.count <= 0) this.cursorStack = null;
          }
        }
      }
      this.render();
      return;
    }

    // Left-click (button 0): pick up / place / merge / swap
    if (!this.cursorStack) {
      if (!slotStack) return;
      this.cursorStack = ItemRegistry.cloneStack(slotStack);
      this._setSlot(zone, index, null);
    } else {
      if (!this._isAllowedInSlot(zone, index, this.cursorStack)) return;
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
        // Swap stacks
        const old = ItemRegistry.cloneStack(slotStack);
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = old;
      }
    }
    this.render();
  }

  _handleQuickMove(zone, index) {
    if (zone === 'craft_out') {
      let guard = 0;
      while (this.craftResult && guard < 64) {
        if (!this.inventory.canAccept(this.craftResult.id, this.craftResult.count, this.craftResult.durability)) break;
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
      // Pass 1: stack with existing
      for (let i = startIdx; i < endIdx && src.count > 0; i++) {
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
      // Pass 2: empty slot
      for (let i = startIdx; i < endIdx && src.count > 0; i++) {
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
    }

    this.render();
  }

  _handleTouchSplit(zone, index) {
    if (zone === 'craft_out') return;
    const src = this._getSlot(zone, index);
    if (!src || src.count <= 1) return;
    const half = Math.ceil(src.count / 2);
    const keep = src.count - half;
    const halfStack = ItemRegistry.createStack(src.id, half, null, src.meta);
    this._setSlot(zone, index, ItemRegistry.createStack(src.id, keep, null, src.meta));
    // Place half into cursorStack or auto-find empty inventory slot and select it
    if (!this.cursorStack) {
      this.cursorStack = halfStack;
    } else {
      this.inventory.addItem(halfStack.id, halfStack.count);
    }
    this.render();
  }

  _handleTouchTap(zone, index) {
    // If craft result tapped on touch, craft directly to inventory!
    if (zone === 'craft_out') {
      if (!this.craftResult) return;
      if (this.cursorStack && ItemRegistry.canStackTogether(this.cursorStack, this.craftResult)) {
        const maxS = ItemRegistry.getMaxStack(this.cursorStack.id);
        if (this.cursorStack.count + this.craftResult.count <= maxS) {
          this.cursorStack.count += this.craftResult.count;
          this._consumeCraftIngredients(1);
          this.render();
          return;
        }
      }
      const rem = this.inventory.addItem(this.craftResult.id, this.craftResult.count);
      if (rem < this.craftResult.count) {
        this._consumeCraftIngredients(1);
      }
      this.render();
      return;
    }

    // If holding a split stack in cursorStack from long-press or split mode
    if (this.cursorStack) {
      const dst = this._getSlot(zone, index);
      if (!this._isAllowedInSlot(zone, index, this.cursorStack)) return;
      if (!dst) {
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = null;
      } else if (ItemRegistry.canStackTogether(dst, this.cursorStack)) {
        const maxS = ItemRegistry.getMaxStack(dst.id);
        const add = Math.min(maxS - dst.count, this.cursorStack.count);
        dst.count += add;
        this._setSlot(zone, index, dst);
        this.cursorStack.count -= add;
        if (this.cursorStack.count <= 0) this.cursorStack = null;
      } else {
        const old = ItemRegistry.cloneStack(dst);
        this._setSlot(zone, index, this.cursorStack);
        this.cursorStack = old;
      }
      this.selectedTouchRef = null;
      this.render();
      return;
    }

    if (this.splitMode) {
      this._handleTouchSplit(zone, index);
      this.splitMode = false;
      this.splitToggleBtn?.classList.remove('active');
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
    if (!src) {
      this.selectedTouchRef = null;
      this.render();
      return;
    }
    if (!this._isAllowedInSlot(zone, index, src)) {
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
      const tmp = ItemRegistry.cloneStack(clickedStack);
      this._setSlot(zone, index, src);
      this._setSlot(this.selectedTouchRef.zone, this.selectedTouchRef.index, tmp);
    }

    this.selectedTouchRef = null;
    this.tooltipEl?.classList.add('hidden');
    this.render();
  }

  autoFillRecipe(recipe) {
    const gridSize = this._getActiveGridSize();
    if (!RecipeRegistry.fitsInGrid(recipe, gridSize)) return;
    this._returnCraftGridToInventory();

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

    if (recipe.type === 'shapeless') {
      recipe.ingredients.forEach((ing, idx) => {
        const picked = takeOneMatching(ing);
        if (picked) this.craftGrid[idx] = picked;
      });
    } else {
      for (let py = 0; py < recipe.height; py++) {
        const row = recipe.pattern[py];
        for (let px = 0; px < recipe.width; px++) {
          const ch = row[px];
          if (ch !== ' ') {
            const picked = takeOneMatching(recipe.key[ch]);
            if (picked) this.craftGrid[py * gridSize + px] = picked;
          }
        }
      }
    }
    this.inventory._emitChange();
    this._recomputeCraftResult();
    this.render();
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

    const showCraftUI = this.mode === 'inventory' || this.mode === 'crafting';
    this.recipeToggleBtn?.classList.toggle('hidden', !showCraftUI);
    this.creativeTabBtn?.classList.toggle('hidden', !this.inventory.creativeMode && this.mode !== 'creative');
    this.creativeTabBtn?.classList.toggle('active', this.mode === 'creative');

    if (this.mode === 'inventory') {
      this.titleEl.textContent = 'Инвентарь';
      const layout = document.createElement('div');
      layout.className = 'inv-top-player-layout';

      // Armor column (4 slots)
      const armorCol = document.createElement('div');
      armorCol.className = 'inv-armor-col';
      const placeholders = ['Шлем', 'Броня', 'Поножи', 'Боты'];
      for (let a = 0; a < 4; a++) {
        armorCol.appendChild(this._createSlotElement('armor', a, placeholders[a]));
      }

      // Live 3D Steve Paper Doll Canvas
      const dollWrap = document.createElement('div');
      dollWrap.className = 'inv-doll-frame';
      const canvas = document.createElement('canvas');
      canvas.id = 'inv-player-canvas';
      canvas.width = 132;
      canvas.height = 176;
      dollWrap.appendChild(canvas);
      this.playerCanvas = canvas;
      this.playerPreview?.bindCanvas(canvas);

      // 2x2 Crafting section
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
      const catalog = document.createElement('div');
      catalog.className = 'inv-creative-catalog';
      const blocks = BlockRegistry.getPlaceableBlocks();
      const items = ItemRegistry.getAllItems();
      const list = [...blocks.map((b) => ({ id: b.id, name: b.name })), ...items.map((it) => ({ id: it.id, name: it.name }))];
      for (const entry of list) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inv-creative-item';
        btn.title = entry.name;
        const img = document.createElement('img');
        img.src = this.atlas.getItemIconDataURL(entry.id);
        img.alt = entry.name;
        btn.appendChild(img);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const count = ItemRegistry.getMaxStack(entry.id);
          this.inventory.addItem(entry.id, count);
          this.render();
        });
        catalog.appendChild(btn);
      }
      this.topSectionEl.appendChild(catalog);
    }

    // Main player inventory (slots 9..35)
    for (let i = HOTBAR_SIZE; i < INVENTORY_SIZE; i++) {
      this.mainGridEl.appendChild(this._createSlotElement('inv', i));
    }
    // Player hotbar row inside inventory (slots 0..8)
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

  renderRecipeBook() {
    if (!this.recipeDrawerEl || !this.recipeListEl) return;
    const allow = this.isOpen && (this.mode === 'inventory' || this.mode === 'crafting') && this.recipeBookOpen;
    this.recipeDrawerEl.classList.toggle('hidden', !allow);
    this.recipeToggleBtn?.classList.toggle('active', allow);
    if (!allow) return;

    const gridSize = this._getActiveGridSize();
    const list = RecipeRegistry.getRecipeBookList(this.inventory.slots, gridSize);
    this.recipeListEl.innerHTML = '';

    for (const entry of list) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `recipe-book-item ${entry.craftable ? 'craftable' : 'missing'}`;
      btn.title = `${entry.resultDef?.name || 'Рецепт'} ×${entry.recipe.result.count}`;

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
        if (entry.craftable) {
          this.autoFillRecipe(entry.recipe);
        } else {
          this._showTooltip({ id: entry.recipe.result.id, count: entry.recipe.result.count }, e.clientX, e.clientY);
        }
      });
      this.recipeListEl.appendChild(btn);
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
    this.cursorGhostEl.style.left = `${x + 4}px`;
    this.cursorGhostEl.style.top = `${y + 4}px`;
  }

  _showTooltip(stack, x, y) {
    if (!this.tooltipEl || !stack || !stack.id) {
      this.tooltipEl?.classList.add('hidden');
      return;
    }
    const def = ItemRegistry.get(stack.id);
    if (!def) return;
    const lines = [def.name];
    if (def.maxDurability > 0) {
      const cur = stack.durability || def.maxDurability;
      lines.push(`Прочность: ${cur}/${def.maxDurability}`);
    }
    if (def.armorPoints > 0) {
      lines.push(`Защита: +${def.armorPoints}`);
    }
    if (def.toolSpeed > 1) {
      lines.push(`Скорость: ${def.toolSpeed}×`);
    }
    this.tooltipEl.innerHTML = lines.map((l, idx) => idx === 0 ? `<strong>${l}</strong>` : `<span>${l}</span>`).join('');
    this.tooltipEl.classList.remove('hidden');
    if (x !== null && y !== null) {
      this._updateTooltipPos(x, y);
    } else {
      this.tooltipEl.style.left = '50%';
      this.tooltipEl.style.top = '14px';
    }
  }

  _updateTooltipPos(x, y) {
    if (!this.tooltipEl || this.tooltipEl.classList.contains('hidden')) return;
    this.tooltipEl.style.left = `${Math.min(window.innerWidth - 170, x + 14)}px`;
    this.tooltipEl.style.top = `${Math.max(8, y - 34)}px`;
  }
}
