import { BLOCK_IDS } from '../blocks/BlockRegistry.js';
import { ITEM_IDS, ItemRegistry } from './ItemRegistry.js';
import { FURNACE_COOK_TICKS } from '../constants.js';

const ANY_LOG = [BLOCK_IDS.OAK_LOG, BLOCK_IDS.BIRCH_LOG, BLOCK_IDS.SPRUCE_LOG];
const ANY_PLANKS = [BLOCK_IDS.OAK_PLANKS];
const ANY_COAL = [ITEM_IDS.COAL, ITEM_IDS.CHARCOAL];

function matchesIngredient(itemId, expected) {
  if (!itemId) return false;
  if (Array.isArray(expected)) return expected.includes(itemId);
  return itemId === expected;
}

class RecipeRegistryImpl {
  constructor() {
    this.recipes = [];
    this.smelting = new Map();
    this.fuels = new Map();
    this._registerCraftingRecipes();
    this._registerSmelting();
    this._registerFuels();
  }

  _addShapeless(id, ingredients, result, category = 'building') {
    this.recipes.push({
      id,
      type: 'shapeless',
      category,
      ingredients, // array of itemId or itemId[]
      result, // { id, count }
    });
  }

  _addShaped(id, pattern, key, result, options = {}) {
    const height = pattern.length;
    const width = pattern[0].length;
    this.recipes.push({
      id,
      type: 'shaped',
      category: options.category || 'gear',
      mirror: options.mirror ?? false,
      width,
      height,
      pattern,
      key,
      result,
    });
  }

  _registerCraftingRecipes() {
    // 1. Planks from any log (4 planks)
    this._addShapeless('planks_from_log', [ANY_LOG], { id: BLOCK_IDS.OAK_PLANKS, count: 4 }, 'basic');

    // 2. Sticks (2 planks vertical -> 4 sticks)
    this._addShaped('sticks', ['P', 'P'], { P: ANY_PLANKS }, { id: ITEM_IDS.STICK, count: 4 }, { category: 'basic' });

    // 3. Crafting Table (2x2 planks)
    this._addShaped('crafting_table', ['PP', 'PP'], { P: ANY_PLANKS }, { id: BLOCK_IDS.CRAFTING_TABLE, count: 1 }, { category: 'basic' });

    // 4. Torches (coal/charcoal over stick -> 4 torches)
    this._addShaped('torches', ['C', 'S'], { C: ANY_COAL, S: ITEM_IDS.STICK }, { id: BLOCK_IDS.TORCH, count: 4 }, { category: 'basic' });

    // 5. Furnace (8 cobble ring)
    this._addShaped(
      'furnace',
      ['CCC', 'C C', 'CCC'],
      { C: BLOCK_IDS.COBBLESTONE },
      { id: BLOCK_IDS.FURNACE, count: 1 },
      { category: 'basic' }
    );

    // 6. Chest (8 planks ring)
    this._addShaped(
      'chest',
      ['PPP', 'P P', 'PPP'],
      { P: ANY_PLANKS },
      { id: BLOCK_IDS.CHEST, count: 1 },
      { category: 'basic' }
    );

    // 7. Bed (3 wool + 3 planks)
    this._addShaped(
      'bed',
      ['WWW', 'PPP'],
      { W: BLOCK_IDS.WOOL_WHITE, P: ANY_PLANKS },
      { id: BLOCK_IDS.BED_FOOT, count: 1 },
      { category: 'basic' }
    );

    // 8. Ladder (7 sticks -> 3 ladders)
    this._addShaped(
      'ladder',
      ['S S', 'SSS', 'S S'],
      { S: ITEM_IDS.STICK },
      { id: BLOCK_IDS.LADDER, count: 3 },
      { category: 'building' }
    );

    // 9. Stone bricks, Sandstone, Clay block
    this._addShaped('stone_bricks', ['SS', 'SS'], { S: BLOCK_IDS.STONE }, { id: BLOCK_IDS.STONE_BRICKS, count: 4 }, { category: 'building' });
    this._addShaped('sandstone', ['SS', 'SS'], { S: BLOCK_IDS.SAND }, { id: BLOCK_IDS.SANDSTONE, count: 1 }, { category: 'building' });
    this._addShaped('clay_block', ['CC', 'CC'], { C: ITEM_IDS.CLAY_BALL }, { id: BLOCK_IDS.CLAY, count: 1 }, { category: 'building' });

    // 10. Storage blocks <-> 9 ingots/gems
    const blockConversions = [
      { key: 'coal', item: ITEM_IDS.COAL, block: BLOCK_IDS.COAL_BLOCK },
      { key: 'iron', item: ITEM_IDS.IRON_INGOT, block: BLOCK_IDS.IRON_BLOCK },
      { key: 'gold', item: ITEM_IDS.GOLD_INGOT, block: BLOCK_IDS.GOLD_BLOCK },
      { key: 'diamond', item: ITEM_IDS.DIAMOND, block: BLOCK_IDS.DIAMOND_BLOCK },
    ];
    for (const bc of blockConversions) {
      this._addShaped(`${bc.key}_block`, ['III', 'III', 'III'], { I: bc.item }, { id: bc.block, count: 1 }, { category: 'building' });
      this._addShapeless(`${bc.key}_from_block`, [bc.block], { id: bc.item, count: 9 }, 'building');
    }

    // 11. Tools across 5 tiers
    const toolMaterials = [
      { tier: 'wooden', mat: ANY_PLANKS, prefix: 'WOODEN' },
      { tier: 'stone', mat: BLOCK_IDS.COBBLESTONE, prefix: 'STONE' },
      { tier: 'iron', mat: ITEM_IDS.IRON_INGOT, prefix: 'IRON' },
      { tier: 'golden', mat: ITEM_IDS.GOLD_INGOT, prefix: 'GOLDEN' },
      { tier: 'diamond', mat: ITEM_IDS.DIAMOND, prefix: 'DIAMOND' },
    ];
    for (const tm of toolMaterials) {
      this._addShaped(
        `${tm.tier}_pickaxe`,
        ['MMM', ' S ', ' S '],
        { M: tm.mat, S: ITEM_IDS.STICK },
        { id: ITEM_IDS[`${tm.prefix}_PICKAXE`], count: 1 },
        { category: 'tools' }
      );
      this._addShaped(
        `${tm.tier}_axe`,
        ['MM', 'MS', ' S'],
        { M: tm.mat, S: ITEM_IDS.STICK },
        { id: ITEM_IDS[`${tm.prefix}_AXE`], count: 1 },
        { category: 'tools', mirror: true }
      );
      this._addShaped(
        `${tm.tier}_shovel`,
        ['M', 'S', 'S'],
        { M: tm.mat, S: ITEM_IDS.STICK },
        { id: ITEM_IDS[`${tm.prefix}_SHOVEL`], count: 1 },
        { category: 'tools' }
      );
      this._addShaped(
        `${tm.tier}_sword`,
        ['M', 'M', 'S'],
        { M: tm.mat, S: ITEM_IDS.STICK },
        { id: ITEM_IDS[`${tm.prefix}_SWORD`], count: 1 },
        { category: 'tools' }
      );
      this._addShaped(
        `${tm.tier}_hoe`,
        ['MM', ' S', ' S'],
        { M: tm.mat, S: ITEM_IDS.STICK },
        { id: ITEM_IDS[`${tm.prefix}_HOE`], count: 1 },
        { category: 'tools', mirror: true }
      );
    }

    // 12. Armor sets (Iron, Golden, Diamond)
    const armorSets = [
      { tier: 'iron', mat: ITEM_IDS.IRON_INGOT, prefix: 'IRON' },
      { tier: 'golden', mat: ITEM_IDS.GOLD_INGOT, prefix: 'GOLDEN' },
      { tier: 'diamond', mat: ITEM_IDS.DIAMOND, prefix: 'DIAMOND' },
    ];
    for (const as of armorSets) {
      this._addShaped(`${as.tier}_helmet`, ['MMM', 'M M'], { M: as.mat }, { id: ITEM_IDS[`${as.prefix}_HELMET`], count: 1 }, { category: 'armor' });
      this._addShaped(`${as.tier}_chestplate`, ['M M', 'MMM', 'MMM'], { M: as.mat }, { id: ITEM_IDS[`${as.prefix}_CHESTPLATE`], count: 1 }, { category: 'armor' });
      this._addShaped(`${as.tier}_leggings`, ['MMM', 'M M', 'M M'], { M: as.mat }, { id: ITEM_IDS[`${as.prefix}_LEGGINGS`], count: 1 }, { category: 'armor' });
      this._addShaped(`${as.tier}_boots`, ['M M', 'M M'], { M: as.mat }, { id: ITEM_IDS[`${as.prefix}_BOOTS`], count: 1 }, { category: 'armor' });
    }

    // 13. Utility tools
    this._addShaped('bucket', ['I I', ' I '], { I: ITEM_IDS.IRON_INGOT }, { id: ITEM_IDS.BUCKET, count: 1 }, { category: 'tools' });
    this._addShaped('shears', [' I', 'I '], { I: ITEM_IDS.IRON_INGOT }, { id: ITEM_IDS.SHEARS, count: 1 }, { category: 'tools', mirror: true });
    this._addShapeless('flint_and_steel', [ITEM_IDS.IRON_INGOT, ITEM_IDS.FLINT], { id: ITEM_IDS.FLINT_AND_STEEL, count: 1 }, 'tools');
  }

  _registerSmelting() {
    this.smelting.set(BLOCK_IDS.IRON_ORE, { id: ITEM_IDS.IRON_INGOT, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(BLOCK_IDS.GOLD_ORE, { id: ITEM_IDS.GOLD_INGOT, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(BLOCK_IDS.SAND, { id: BLOCK_IDS.GLASS, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(BLOCK_IDS.COBBLESTONE, { id: BLOCK_IDS.STONE, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(BLOCK_IDS.OAK_LOG, { id: ITEM_IDS.CHARCOAL, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(BLOCK_IDS.BIRCH_LOG, { id: ITEM_IDS.CHARCOAL, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(BLOCK_IDS.SPRUCE_LOG, { id: ITEM_IDS.CHARCOAL, count: 1, cookTicks: FURNACE_COOK_TICKS });
    this.smelting.set(ITEM_IDS.CLAY_BALL, { id: ITEM_IDS.BRICK, count: 1, cookTicks: FURNACE_COOK_TICKS });
  }

  _registerFuels() {
    this.fuels.set(BLOCK_IDS.COAL_BLOCK, 16000); // 800s
    this.fuels.set(ITEM_IDS.COAL, 1600); // 80s
    this.fuels.set(ITEM_IDS.CHARCOAL, 1600); // 80s
    this.fuels.set(BLOCK_IDS.OAK_PLANKS, 300); // 15s
    this.fuels.set(BLOCK_IDS.OAK_LOG, 300);
    this.fuels.set(BLOCK_IDS.BIRCH_LOG, 300);
    this.fuels.set(BLOCK_IDS.SPRUCE_LOG, 300);
    this.fuels.set(BLOCK_IDS.CRAFTING_TABLE, 300);
    this.fuels.set(BLOCK_IDS.CHEST, 300);
    this.fuels.set(BLOCK_IDS.LADDER, 100);
    this.fuels.set(ITEM_IDS.STICK, 100); // 5s
    this.fuels.set(ITEM_IDS.WOODEN_PICKAXE, 200);
    this.fuels.set(ITEM_IDS.WOODEN_AXE, 200);
    this.fuels.set(ITEM_IDS.WOODEN_SHOVEL, 200);
    this.fuels.set(ITEM_IDS.WOODEN_SWORD, 200);
    this.fuels.set(ITEM_IDS.WOODEN_HOE, 200);
  }

  getSmeltResult(inputId) {
    if (!inputId) return null;
    return this.smelting.get(inputId) || null;
  }

  getFuelBurnTicks(fuelId) {
    if (!fuelId) return 0;
    return this.fuels.get(fuelId) || 0;
  }

  matchCraftingGrid(grid, gridSize) {
    // grid is array of length gridSize*gridSize holding stacks or null
    const nonEmpty = [];
    for (let i = 0; i < gridSize * gridSize; i++) {
      const s = grid[i];
      if (s && s.id && s.count > 0) {
        nonEmpty.push({ x: i % gridSize, y: Math.floor(i / gridSize), id: s.id });
      }
    }
    if (nonEmpty.length === 0) return null;

    let minX = gridSize, maxX = -1, minY = gridSize, maxY = -1;
    for (const cell of nonEmpty) {
      if (cell.x < minX) minX = cell.x;
      if (cell.x > maxX) maxX = cell.x;
      if (cell.y < minY) minY = cell.y;
      if (cell.y > maxY) maxY = cell.y;
    }
    const subW = maxX - minX + 1;
    const subH = maxY - minY + 1;

    for (const recipe of this.recipes) {
      if (recipe.type === 'shapeless') {
        if (nonEmpty.length !== recipe.ingredients.length) continue;
        const used = new Array(nonEmpty.length).fill(false);
        let ok = true;
        for (const req of recipe.ingredients) {
          let foundIdx = -1;
          for (let j = 0; j < nonEmpty.length; j++) {
            if (!used[j] && matchesIngredient(nonEmpty[j].id, req)) {
              foundIdx = j;
              break;
            }
          }
          if (foundIdx === -1) {
            ok = false;
            break;
          }
          used[foundIdx] = true;
        }
        if (ok) {
          return {
            recipe,
            result: ItemRegistry.createStack(recipe.result.id, recipe.result.count),
          };
        }
      } else {
        if (subW !== recipe.width || subH !== recipe.height) continue;
        if (this._matchShapedRect(grid, gridSize, minX, minY, recipe, false)) {
          return {
            recipe,
            result: ItemRegistry.createStack(recipe.result.id, recipe.result.count),
          };
        }
        if (recipe.mirror && this._matchShapedRect(grid, gridSize, minX, minY, recipe, true)) {
          return {
            recipe,
            result: ItemRegistry.createStack(recipe.result.id, recipe.result.count),
          };
        }
      }
    }
    return null;
  }

  _matchShapedRect(grid, gridSize, ox, oy, recipe, mirrored) {
    for (let py = 0; py < recipe.height; py++) {
      const row = recipe.pattern[py];
      for (let px = 0; px < recipe.width; px++) {
        const ch = row[mirrored ? (recipe.width - 1 - px) : px];
        const cell = grid[(oy + py) * gridSize + (ox + px)];
        const cellId = cell && cell.count > 0 ? cell.id : 0;
        if (ch === ' ') {
          if (cellId !== 0) return false;
        } else {
          const expected = recipe.key[ch];
          if (!matchesIngredient(cellId, expected)) return false;
        }
      }
    }
    return true;
  }

  fitsInGrid(recipe, gridSize) {
    if (recipe.type === 'shapeless') {
      return recipe.ingredients.length <= gridSize * gridSize;
    }
    return recipe.width <= gridSize && recipe.height <= gridSize;
  }

  getRecipeRequirements(recipe) {
    // Returns list of { expected, count, slots: [{x, y}] } for UI / auto-fill
    const counts = [];
    const addReq = (expected, slotPos) => {
      const key = Array.isArray(expected) ? expected.join(',') : String(expected);
      let entry = counts.find((c) => c.key === key);
      if (!entry) {
        entry = { key, expected, count: 0, positions: [] };
        counts.push(entry);
      }
      entry.count++;
      if (slotPos) entry.positions.push(slotPos);
    };

    if (recipe.type === 'shapeless') {
      recipe.ingredients.forEach((ing, idx) => addReq(ing, { idx }));
    } else {
      for (let py = 0; py < recipe.height; py++) {
        const row = recipe.pattern[py];
        for (let px = 0; px < recipe.width; px++) {
          const ch = row[px];
          if (ch !== ' ') {
            addReq(recipe.key[ch], { x: px, y: py });
          }
        }
      }
    }
    return counts;
  }

  canCraftFromSlots(recipe, slots, gridSize = 3) {
    if (!this.fitsInGrid(recipe, gridSize)) return false;
    const reqs = this.getRecipeRequirements(recipe);
    const available = new Map();
    for (const s of slots) {
      if (s && s.id && s.count > 0) {
        available.set(s.id, (available.get(s.id) || 0) + s.count);
      }
    }
    for (const req of reqs) {
      let have = 0;
      const options = Array.isArray(req.expected) ? req.expected : [req.expected];
      for (const optId of options) {
        have += available.get(optId) || 0;
      }
      if (have < req.count) return false;
    }
    return true;
  }

  getRecipeBookList(slots, gridSize = 3) {
    return this.recipes
      .filter((r) => this.fitsInGrid(r, gridSize))
      .map((recipe) => ({
        recipe,
        craftable: this.canCraftFromSlots(recipe, slots, gridSize),
        resultDef: ItemRegistry.get(recipe.result.id),
      }))
      .sort((a, b) => Number(b.craftable) - Number(a.craftable));
  }
}

export const RecipeRegistry = new RecipeRegistryImpl();
