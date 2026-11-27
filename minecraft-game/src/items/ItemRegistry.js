import { BLOCK_IDS, BlockRegistry } from '../blocks/BlockRegistry.js';
import { ITEM_IDS } from './ItemIds.js';
import {
  TOOL_DURABILITY_WOOD,
  TOOL_DURABILITY_STONE,
  TOOL_DURABILITY_IRON,
  TOOL_DURABILITY_GOLD,
  TOOL_DURABILITY_DIAMOND,
  MAX_STACK_DEFAULT,
} from '../constants.js';

export { ITEM_IDS };

const TOOL_TIERS = {
  wood: { tier: 1, speed: 2, durability: TOOL_DURABILITY_WOOD, label: 'Деревянная', swordLabel: 'Деревянный' },
  stone: { tier: 2, speed: 4, durability: TOOL_DURABILITY_STONE, label: 'Каменная', swordLabel: 'Каменный' },
  iron: { tier: 3, speed: 6, durability: TOOL_DURABILITY_IRON, label: 'Железная', swordLabel: 'Железный' },
  gold: { tier: 1, speed: 12, durability: TOOL_DURABILITY_GOLD, label: 'Золотая', swordLabel: 'Золотой' },
  diamond: { tier: 4, speed: 8, durability: TOOL_DURABILITY_DIAMOND, label: 'Алмазная', swordLabel: 'Алмазный' },
};

const ARMOR_TIERS = {
  leather: {
    label: 'Кожаный',
    labelFem: 'Кожаная',
    labelPlur: 'Кожаные',
    durability: { helmet: 55, chestplate: 80, leggings: 75, boots: 65 },
    defense: { helmet: 1, chestplate: 3, leggings: 2, boots: 1 },
  },
  iron: {
    label: 'Железный',
    labelFem: 'Железная',
    labelPlur: 'Железные',
    durability: { helmet: 165, chestplate: 240, leggings: 225, boots: 195 },
    defense: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
  },
  gold: {
    label: 'Золотой',
    labelFem: 'Золотая',
    labelPlur: 'Золотые',
    durability: { helmet: 77, chestplate: 112, leggings: 105, boots: 91 },
    defense: { helmet: 2, chestplate: 5, leggings: 3, boots: 1 },
  },
  diamond: {
    label: 'Алмазный',
    labelFem: 'Алмазная',
    labelPlur: 'Алмазные',
    durability: { helmet: 363, chestplate: 528, leggings: 495, boots: 429 },
    defense: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
  },
};

class ItemRegistryImpl {
  constructor() {
    this.items = new Map();
    this.byKey = new Map();
    this._registerAllItems();
  }

  _register(def) {
    const entry = {
      id: def.id,
      key: def.key,
      name: def.name,
      isBlock: false,
      category: def.category || 'material',
      maxStack: def.maxStack ?? MAX_STACK_DEFAULT,
      sprite: def.sprite || def.key,
      toolType: def.toolType || null,
      toolTier: def.toolTier ?? 0,
      toolSpeed: def.toolSpeed ?? 1,
      maxDurability: def.maxDurability ?? 0,
      armorSlot: def.armorSlot || null, // 'helmet' | 'chestplate' | 'leggings' | 'boots'
      armorTier: def.armorTier || null,
      armorPoints: def.armorPoints ?? 0,
      attackDamage: def.attackDamage ?? 1,
      lightEmission: def.lightEmission ?? 0,
      fluidId: def.fluidId ?? 0,
      isFood: Boolean(def.foodStats),
      foodStats: def.foodStats || null,
      isBow: def.id === ITEM_IDS.BOW,
      isMilk: def.id === ITEM_IDS.MILK_BUCKET,
      isPearl: def.id === ITEM_IDS.ENDER_PEARL,
      isEgg: def.id === ITEM_IDS.EGG,
      isBoneMeal: def.id === ITEM_IDS.BONE_MEAL,
    };
    this.items.set(entry.id, entry);
    this.byKey.set(entry.key, entry);
  }

  _registerAllItems() {
    // Materials
    const materials = [
      { id: ITEM_IDS.STICK, key: 'stick', name: 'Палка', sprite: 'item_stick' },
      { id: ITEM_IDS.COAL, key: 'coal', name: 'Уголь', sprite: 'item_coal' },
      { id: ITEM_IDS.CHARCOAL, key: 'charcoal', name: 'Древесный уголь', sprite: 'item_charcoal' },
      { id: ITEM_IDS.IRON_INGOT, key: 'iron_ingot', name: 'Железный слиток', sprite: 'item_iron_ingot' },
      { id: ITEM_IDS.GOLD_INGOT, key: 'gold_ingot', name: 'Золотой слиток', sprite: 'item_gold_ingot' },
      { id: ITEM_IDS.DIAMOND, key: 'diamond', name: 'Алмаз', sprite: 'item_diamond' },
      { id: ITEM_IDS.EMERALD, key: 'emerald', name: 'Изумруд', sprite: 'item_emerald' },
      { id: ITEM_IDS.LAPIS_LAZULI, key: 'lapis_lazuli', name: 'Лазурит', sprite: 'item_lapis' },
      { id: ITEM_IDS.REDSTONE, key: 'redstone', name: 'Редстоун', sprite: 'item_redstone' },
      { id: ITEM_IDS.FLINT, key: 'flint', name: 'Кремень', sprite: 'item_flint' },
      { id: ITEM_IDS.CLAY_BALL, key: 'clay_ball', name: 'Глина (ком)', sprite: 'item_clay_ball' },
      { id: ITEM_IDS.BRICK, key: 'brick', name: 'Кирпич', sprite: 'item_brick' },
      { id: ITEM_IDS.LEATHER, key: 'leather', name: 'Кожа', sprite: 'item_leather' },
      { id: ITEM_IDS.WHEAT_SEEDS, key: 'wheat_seeds', name: 'Семена пшеницы', sprite: 'item_wheat_seeds' },
      { id: ITEM_IDS.WHEAT, key: 'wheat', name: 'Пшеница', sprite: 'item_wheat' },
      { id: ITEM_IDS.BOWL, key: 'bowl', name: 'Миска', sprite: 'item_bowl' },
      { id: ITEM_IDS.RAW_COPPER, key: 'raw_copper', name: 'Рудная медь', sprite: 'item_raw_copper' },
      { id: ITEM_IDS.COPPER_INGOT, key: 'copper_ingot', name: 'Медный слиток', sprite: 'item_copper_ingot' },
      { id: ITEM_IDS.GUNPOWDER, key: 'gunpowder', name: 'Порох', sprite: 'item_gunpowder' },
      { id: ITEM_IDS.STRING, key: 'string', name: 'Нить', sprite: 'item_string' },
      { id: ITEM_IDS.FEATHER, key: 'feather', name: 'Перо', sprite: 'item_feather' },
      { id: ITEM_IDS.BONE, key: 'bone', name: 'Кость', sprite: 'item_bone' },
      { id: ITEM_IDS.BONE_MEAL, key: 'bone_meal', name: 'Костная мука', sprite: 'item_bone_meal' },
    ];
    for (const m of materials) {
      this._register({ ...m, category: 'material', maxStack: 64 });
    }

    this._register({
      id: ITEM_IDS.ARROW,
      key: 'arrow',
      name: 'Стрела',
      category: 'weapon',
      maxStack: 64,
      sprite: 'item_arrow',
    });
    this._register({
      id: ITEM_IDS.EGG,
      key: 'egg',
      name: 'Яйцо',
      category: 'material',
      maxStack: 16,
      sprite: 'item_egg',
    });
    this._register({
      id: ITEM_IDS.ENDER_PEARL,
      key: 'ender_pearl',
      name: 'Жемчуг Эндера',
      category: 'utility',
      maxStack: 16,
      sprite: 'item_ender_pearl',
    });
    this._register({
      id: ITEM_IDS.BOW,
      key: 'bow',
      name: 'Лук',
      category: 'weapon',
      maxStack: 1,
      sprite: 'item_bow',
      toolType: 'bow',
      maxDurability: 384,
      attackDamage: 1,
    });
    this._register({
      id: ITEM_IDS.MILK_BUCKET,
      key: 'milk_bucket',
      name: 'Ведро молока',
      category: 'utility',
      maxStack: 1,
      sprite: 'item_milk_bucket',
      toolType: 'bucket',
    });

    // Foods (Stage 6)
    const foods = [
      { id: ITEM_IDS.APPLE, key: 'apple', name: 'Яблоко', sprite: 'item_apple', foodStats: { hunger: 4, saturation: 2.4 } },
      {
        id: ITEM_IDS.GOLDEN_APPLE,
        key: 'golden_apple',
        name: 'Золотое яблоко',
        sprite: 'item_golden_apple',
        foodStats: { hunger: 4, saturation: 9.6, canAlwaysEat: true, absorption: 4, regenTicks: 100 },
      },
      { id: ITEM_IDS.BREAD, key: 'bread', name: 'Хлеб', sprite: 'item_bread', foodStats: { hunger: 5, saturation: 6.0 } },
      {
        id: ITEM_IDS.MUSHROOM_STEW,
        key: 'mushroom_stew',
        name: 'Тушёные грибы',
        sprite: 'item_mushroom_stew',
        maxStack: 1,
        foodStats: { hunger: 6, saturation: 7.2, returnItem: ITEM_IDS.BOWL },
      },
      { id: ITEM_IDS.RAW_PORKCHOP, key: 'raw_porkchop', name: 'Сырая свинина', sprite: 'item_raw_porkchop', foodStats: { hunger: 3, saturation: 1.8 } },
      { id: ITEM_IDS.COOKED_PORKCHOP, key: 'cooked_porkchop', name: 'Жареная свинина', sprite: 'item_cooked_porkchop', foodStats: { hunger: 8, saturation: 12.8 } },
      { id: ITEM_IDS.RAW_BEEF, key: 'raw_beef', name: 'Сырая говядина', sprite: 'item_raw_beef', foodStats: { hunger: 3, saturation: 1.8 } },
      { id: ITEM_IDS.COOKED_BEEF, key: 'cooked_beef', name: 'Стейк', sprite: 'item_cooked_beef', foodStats: { hunger: 8, saturation: 12.8 } },
      {
        id: ITEM_IDS.RAW_CHICKEN,
        key: 'raw_chicken',
        name: 'Сырая курятина',
        sprite: 'item_raw_chicken',
        foodStats: { hunger: 2, saturation: 1.2, hungerDebuffChance: 0.3, hungerDebuffTicks: 600 },
      },
      { id: ITEM_IDS.COOKED_CHICKEN, key: 'cooked_chicken', name: 'Жареная курятина', sprite: 'item_cooked_chicken', foodStats: { hunger: 6, saturation: 7.2 } },
      { id: ITEM_IDS.RAW_MUTTON, key: 'raw_mutton', name: 'Сырая баранина', sprite: 'item_raw_mutton', foodStats: { hunger: 2, saturation: 1.2 } },
      { id: ITEM_IDS.COOKED_MUTTON, key: 'cooked_mutton', name: 'Жареная баранина', sprite: 'item_cooked_mutton', foodStats: { hunger: 6, saturation: 9.6 } },
      {
        id: ITEM_IDS.ROTTEN_FLESH,
        key: 'rotten_flesh',
        name: 'Гнилая плоть',
        sprite: 'item_rotten_flesh',
        foodStats: { hunger: 4, saturation: 0.8, hungerDebuffChance: 0.8, hungerDebuffTicks: 600 },
      },
      {
        id: ITEM_IDS.SPIDER_EYE,
        key: 'spider_eye',
        name: 'Паучий глаз',
        sprite: 'item_spider_eye',
        foodStats: { hunger: 2, saturation: 3.2, hungerDebuffChance: 1.0, hungerDebuffTicks: 240 },
      },
    ];
    for (const f of foods) {
      this._register({ ...f, category: 'food', maxStack: f.maxStack ?? 64 });
    }

    // Tools: 5 tiers x 5 types
    const toolSpecs = [
      { id: ITEM_IDS.WOODEN_PICKAXE, tier: 'wood', type: 'pickaxe', key: 'wooden_pickaxe', name: 'Деревянная кирка', dmg: 2 },
      { id: ITEM_IDS.WOODEN_AXE, tier: 'wood', type: 'axe', key: 'wooden_axe', name: 'Деревянный топор', dmg: 7 },
      { id: ITEM_IDS.WOODEN_SHOVEL, tier: 'wood', type: 'shovel', key: 'wooden_shovel', name: 'Деревянная лопата', dmg: 2.5 },
      { id: ITEM_IDS.WOODEN_SWORD, tier: 'wood', type: 'sword', key: 'wooden_sword', name: 'Деревянный меч', dmg: 4 },
      { id: ITEM_IDS.WOODEN_HOE, tier: 'wood', type: 'hoe', key: 'wooden_hoe', name: 'Деревянная мотыга', dmg: 1 },

      { id: ITEM_IDS.STONE_PICKAXE, tier: 'stone', type: 'pickaxe', key: 'stone_pickaxe', name: 'Каменная кирка', dmg: 3 },
      { id: ITEM_IDS.STONE_AXE, tier: 'stone', type: 'axe', key: 'stone_axe', name: 'Каменный топор', dmg: 9 },
      { id: ITEM_IDS.STONE_SHOVEL, tier: 'stone', type: 'shovel', key: 'stone_shovel', name: 'Каменная лопата', dmg: 3.5 },
      { id: ITEM_IDS.STONE_SWORD, tier: 'stone', type: 'sword', key: 'stone_sword', name: 'Каменный меч', dmg: 5 },
      { id: ITEM_IDS.STONE_HOE, tier: 'stone', type: 'hoe', key: 'stone_hoe', name: 'Каменная мотыга', dmg: 1 },

      { id: ITEM_IDS.IRON_PICKAXE, tier: 'iron', type: 'pickaxe', key: 'iron_pickaxe', name: 'Железная кирка', dmg: 4 },
      { id: ITEM_IDS.IRON_AXE, tier: 'iron', type: 'axe', key: 'iron_axe', name: 'Железный топор', dmg: 9 },
      { id: ITEM_IDS.IRON_SHOVEL, tier: 'iron', type: 'shovel', key: 'iron_shovel', name: 'Железная лопата', dmg: 4.5 },
      { id: ITEM_IDS.IRON_SWORD, tier: 'iron', type: 'sword', key: 'iron_sword', name: 'Железный меч', dmg: 6 },
      { id: ITEM_IDS.IRON_HOE, tier: 'iron', type: 'hoe', key: 'iron_hoe', name: 'Железная мотыга', dmg: 1 },

      { id: ITEM_IDS.GOLDEN_PICKAXE, tier: 'gold', type: 'pickaxe', key: 'golden_pickaxe', name: 'Золотая кирка', dmg: 2 },
      { id: ITEM_IDS.GOLDEN_AXE, tier: 'gold', type: 'axe', key: 'golden_axe', name: 'Золотой топор', dmg: 7 },
      { id: ITEM_IDS.GOLDEN_SHOVEL, tier: 'gold', type: 'shovel', key: 'golden_shovel', name: 'Золотая лопата', dmg: 2.5 },
      { id: ITEM_IDS.GOLDEN_SWORD, tier: 'gold', type: 'sword', key: 'golden_sword', name: 'Золотой меч', dmg: 4 },
      { id: ITEM_IDS.GOLDEN_HOE, tier: 'gold', type: 'hoe', key: 'golden_hoe', name: 'Золотая мотыга', dmg: 1 },

      { id: ITEM_IDS.DIAMOND_PICKAXE, tier: 'diamond', type: 'pickaxe', key: 'diamond_pickaxe', name: 'Алмазная кирка', dmg: 5 },
      { id: ITEM_IDS.DIAMOND_AXE, tier: 'diamond', type: 'axe', key: 'diamond_axe', name: 'Алмазовый топор', dmg: 9 },
      { id: ITEM_IDS.DIAMOND_SHOVEL, tier: 'diamond', type: 'shovel', key: 'diamond_shovel', name: 'Алмазная лопата', dmg: 5.5 },
      { id: ITEM_IDS.DIAMOND_SWORD, tier: 'diamond', type: 'sword', key: 'diamond_sword', name: 'Алмазный меч', dmg: 7 },
      { id: ITEM_IDS.DIAMOND_HOE, tier: 'diamond', type: 'hoe', key: 'diamond_hoe', name: 'Алмазная мотыга', dmg: 1 },
    ];
    for (const t of toolSpecs) {
      const tierInfo = TOOL_TIERS[t.tier];
      this._register({
        id: t.id,
        key: t.key,
        name: t.name,
        category: 'tool',
        maxStack: 1,
        sprite: `item_${t.key}`,
        toolType: t.type,
        toolTier: tierInfo.tier,
        toolSpeed: tierInfo.speed,
        maxDurability: tierInfo.durability,
        attackDamage: t.dmg,
      });
    }

    // Armor sets
    const armorSpecs = [
      { id: ITEM_IDS.LEATHER_HELMET, tier: 'leather', slot: 'helmet', key: 'leather_helmet', name: 'Кожаный шлем' },
      { id: ITEM_IDS.LEATHER_CHESTPLATE, tier: 'leather', slot: 'chestplate', key: 'leather_chestplate', name: 'Кожаная туника' },
      { id: ITEM_IDS.LEATHER_LEGGINGS, tier: 'leather', slot: 'leggings', key: 'leather_leggings', name: 'Кожаные штаны' },
      { id: ITEM_IDS.LEATHER_BOOTS, tier: 'leather', slot: 'boots', key: 'leather_boots', name: 'Кожаные ботинки' },

      { id: ITEM_IDS.IRON_HELMET, tier: 'iron', slot: 'helmet', key: 'iron_helmet', name: 'Железный шлем' },
      { id: ITEM_IDS.IRON_CHESTPLATE, tier: 'iron', slot: 'chestplate', key: 'iron_chestplate', name: 'Железный нагрудник' },
      { id: ITEM_IDS.IRON_LEGGINGS, tier: 'iron', slot: 'leggings', key: 'iron_leggings', name: 'Железные поножи' },
      { id: ITEM_IDS.IRON_BOOTS, tier: 'iron', slot: 'boots', key: 'iron_boots', name: 'Железные ботинки' },

      { id: ITEM_IDS.GOLDEN_HELMET, tier: 'gold', slot: 'helmet', key: 'golden_helmet', name: 'Золотой шлем' },
      { id: ITEM_IDS.GOLDEN_CHESTPLATE, tier: 'gold', slot: 'chestplate', key: 'golden_chestplate', name: 'Золотой нагрудник' },
      { id: ITEM_IDS.GOLDEN_LEGGINGS, tier: 'gold', slot: 'leggings', key: 'golden_leggings', name: 'Золотые поножи' },
      { id: ITEM_IDS.GOLDEN_BOOTS, tier: 'gold', slot: 'boots', key: 'golden_boots', name: 'Золотые ботинки' },

      { id: ITEM_IDS.DIAMOND_HELMET, tier: 'diamond', slot: 'helmet', key: 'diamond_helmet', name: 'Алмазный шлем' },
      { id: ITEM_IDS.DIAMOND_CHESTPLATE, tier: 'diamond', slot: 'chestplate', key: 'diamond_chestplate', name: 'Алмазный нагрудник' },
      { id: ITEM_IDS.DIAMOND_LEGGINGS, tier: 'diamond', slot: 'leggings', key: 'diamond_leggings', name: 'Алмазные поножи' },
      { id: ITEM_IDS.DIAMOND_BOOTS, tier: 'diamond', slot: 'boots', key: 'diamond_boots', name: 'Алмазные ботинки' },
    ];
    for (const a of armorSpecs) {
      const tierInfo = ARMOR_TIERS[a.tier];
      this._register({
        id: a.id,
        key: a.key,
        name: a.name,
        category: 'armor',
        maxStack: 1,
        sprite: `item_${a.key}`,
        armorSlot: a.slot,
        armorTier: a.tier,
        armorPoints: tierInfo.defense[a.slot],
        maxDurability: tierInfo.durability[a.slot],
      });
    }

    // Utility items
    this._register({
      id: ITEM_IDS.BUCKET,
      key: 'bucket',
      name: 'Ведро',
      category: 'utility',
      maxStack: 16,
      sprite: 'item_bucket',
      toolType: 'bucket',
    });
    this._register({
      id: ITEM_IDS.WATER_BUCKET,
      key: 'water_bucket',
      name: 'Ведро воды',
      category: 'utility',
      maxStack: 1,
      sprite: 'item_water_bucket',
      toolType: 'bucket',
      fluidId: BLOCK_IDS.WATER,
    });
    this._register({
      id: ITEM_IDS.LAVA_BUCKET,
      key: 'lava_bucket',
      name: 'Ведро лавы',
      category: 'utility',
      maxStack: 1,
      sprite: 'item_lava_bucket',
      toolType: 'bucket',
      fluidId: BLOCK_IDS.LAVA,
    });
    this._register({
      id: ITEM_IDS.FLINT_AND_STEEL,
      key: 'flint_and_steel',
      name: 'Огниво',
      category: 'utility',
      maxStack: 1,
      sprite: 'item_flint_and_steel',
      toolType: 'flint_and_steel',
      maxDurability: 64,
      lightEmission: 8,
    });
    this._register({
      id: ITEM_IDS.SHEARS,
      key: 'shears',
      name: 'Ножницы',
      category: 'tool',
      maxStack: 1,
      sprite: 'item_shears',
      toolType: 'shears',
      toolSpeed: 10,
      maxDurability: 238,
    });
  }

  isBlockId(id) {
    return id > 0 && id < 256;
  }

  isItemId(id) {
    return id >= 256 && this.items.has(id);
  }

  get(id) {
    if (!id || id <= 0) return null;
    if (id < 256) {
      const b = BlockRegistry.get(id);
      if (!b || b.isAir) return null;
      return {
        id: b.id,
        key: b.key,
        name: b.name,
        isBlock: true,
        category: 'block',
        maxStack: b.isBed ? 1 : MAX_STACK_DEFAULT,
        sprite: null,
        toolType: null,
        toolTier: 0,
        toolSpeed: 1,
        maxDurability: 0,
        armorSlot: null,
        armorTier: null,
        armorPoints: 0,
        attackDamage: 1,
        lightEmission: b.lightEmission || 0,
        blockDef: b,
      };
    }
    return this.items.get(id) || null;
  }

  getByKey(key) {
    if (this.byKey.has(key)) return this.byKey.get(key);
    const b = BlockRegistry.getByKey(key);
    if (b && !b.isAir) return this.get(b.id);
    return null;
  }

  getName(id) {
    return this.get(id)?.name || 'Пусто';
  }

  getMaxStack(id) {
    return this.get(id)?.maxStack ?? MAX_STACK_DEFAULT;
  }

  getMaxDurability(id) {
    return this.get(id)?.maxDurability ?? 0;
  }

  getAllItems() {
    return Array.from(this.items.values());
  }

  getAllSpriteKeys() {
    return Array.from(this.items.values()).map((it) => it.sprite);
  }

  createStack(id, count = 1, durability = null, meta = 0) {
    const def = this.get(id);
    if (!def || count <= 0) return null;
    const maxDur = def.maxDurability || 0;
    const clampedCount = Math.min(def.maxStack, Math.max(1, Math.floor(count)));
    return {
      id: def.id,
      count: clampedCount,
      durability: maxDur > 0 ? (durability !== null && durability !== undefined ? Math.max(0, Math.min(maxDur, durability)) : maxDur) : 0,
      maxDurability: maxDur,
      meta: meta || 0,
    };
  }

  cloneStack(stack) {
    if (!stack || !stack.id || stack.count <= 0) return null;
    return {
      id: stack.id,
      count: stack.count,
      durability: stack.durability || 0,
      maxDurability: stack.maxDurability || this.getMaxDurability(stack.id),
      meta: stack.meta || 0,
    };
  }

  canStackTogether(a, b) {
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if ((a.meta || 0) !== (b.meta || 0)) return false;
    const maxStack = this.getMaxStack(a.id);
    if (maxStack <= 1) return false;
    if ((a.maxDurability || 0) > 0 || (b.maxDurability || 0) > 0) return false;
    return true;
  }

  isFood(id) {
    return Boolean(this.get(id)?.isFood);
  }

  getFoodStats(id) {
    return this.get(id)?.foodStats || null;
  }

  getHeldLightEmission(stack) {
    if (!stack || !stack.id || stack.count <= 0) return 0;
    const def = this.get(stack.id);
    return def ? (def.lightEmission || 0) : 0;
  }

  getMeleeDamage(id) {
    const def = this.get(id);
    return def ? (def.attackDamage || 1) : 1;
  }

  isTool(id) {
    const def = this.get(id);
    return Boolean(def && (def.maxDurability || 0) > 0 && !def.armorSlot);
  }

  isWeapon(id) {
    const def = this.get(id);
    return Boolean(def && (def.toolType === 'sword' || def.isBow));
  }
}

export const ItemRegistry = new ItemRegistryImpl();
export { BLOCK_IDS };
