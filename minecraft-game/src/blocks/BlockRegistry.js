// Extensible Block Registry for Stages 1-12.
// Compact numeric IDs (0..255) stored in Chunk Uint8Array.
import { ITEM_IDS } from '../items/ItemIds.js';

export const BLOCK_IDS = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  OAK_LOG: 7,
  OAK_LEAVES: 8,
  OAK_PLANKS: 9,
  SNOW_GRASS: 10,
  SNOW: 11,
  WATER: 12,
  SANDSTONE: 13,
  GRAVEL: 14,
  CLAY: 15,
  ICE: 16,
  BIRCH_LOG: 17,
  BIRCH_LEAVES: 18,
  SPRUCE_LOG: 19,
  SPRUCE_LEAVES: 20,
  CACTUS: 21,
  GRANITE: 22,
  DIORITE: 23,
  ANDESITE: 24,
  COAL_ORE: 25,
  IRON_ORE: 26,
  GOLD_ORE: 27,
  LAPIS_ORE: 28,
  REDSTONE_ORE: 29,
  DIAMOND_ORE: 30,
  EMERALD_ORE: 31,
  TALL_GRASS: 32,
  POPPY: 33,
  DANDELION: 34,
  DEAD_BUSH: 35,
  RED_MUSHROOM: 36,
  BROWN_MUSHROOM: 37,
  BLUE_ORCHID: 38,
  VINE: 39,
  TORCH: 40,
  GLOWSTONE: 41,
  JACK_O_LANTERN: 42,
  BED_FOOT: 43,
  BED_HEAD: 44,
  CRAFTING_TABLE: 45,
  FURNACE: 46,
  FURNACE_LIT: 47,
  CHEST: 48,
  GLASS: 49,
  STONE_BRICKS: 50,
  LADDER: 51,
  COAL_BLOCK: 52,
  IRON_BLOCK: 53,
  GOLD_BLOCK: 54,
  DIAMOND_BLOCK: 55,
  WOOL_WHITE: 56,
  FARMLAND: 57,
  WHEAT_0: 58,
  WHEAT_1: 59,
  WHEAT_2: 60,
  WHEAT_3: 61,
  WHEAT_4: 62,
  WHEAT_5: 63,
  WHEAT_6: 64,
  WHEAT_7: 65,
  HAY_BALE: 66,
  COPPER_ORE: 67,
  COPPER_BLOCK: 68,
  DEEPSLATE: 69,
  SMOOTH_STONE: 70,
  BRICKS: 71,
  BOOKSHELF: 72,
  MOSSY_COBBLESTONE: 73,
  LAVA: 74,
  OBSIDIAN: 75,
  TNT: 76,
});

const TOOL_NAME_RU = Object.freeze({
  pickaxe: 'Кирка',
  axe: 'Топор',
  shovel: 'Лопата',
  hoe: 'Мотыга',
  sword: 'Меч',
  shears: 'Ножницы',
});

const TIER_NAME_RU = Object.freeze({
  0: '',
  1: 'Деревянная+',
  2: 'Каменная+',
  3: 'Железная+',
  4: 'Алмазная',
});

const ITEM_DROP_NAME_RU = Object.freeze({
  [ITEM_IDS.STICK]: 'Палка',
  [ITEM_IDS.COAL]: 'Уголь',
  [ITEM_IDS.IRON_INGOT]: 'Железный слиток',
  [ITEM_IDS.GOLD_INGOT]: 'Золотой слиток',
  [ITEM_IDS.DIAMOND]: 'Алмаз',
  [ITEM_IDS.EMERALD]: 'Изумруд',
  [ITEM_IDS.LAPIS_LAZULI]: 'Лазурит',
  [ITEM_IDS.REDSTONE]: 'Редстоун',
  [ITEM_IDS.FLINT]: 'Кремень',
  [ITEM_IDS.CLAY_BALL]: 'Глина (4 шт.)',
  [ITEM_IDS.APPLE]: 'Яблоко',
  [ITEM_IDS.WHEAT_SEEDS]: 'Семена пшеницы',
  [ITEM_IDS.WHEAT]: 'Пшеница',
  [ITEM_IDS.RAW_COPPER]: 'Рудная медь',
});

class BlockRegistryImpl {
  constructor() {
    this.byId = new Array(256).fill(null);
    this.byKey = new Map();
    this.opacityTable = new Uint8Array(256);
    this.emissionTable = new Uint8Array(256);
    this.opaqueTable = new Uint8Array(256);
    this.aoTable = new Uint8Array(256);
    this._registerAllBlocks();
  }

  register(def) {
    const isCross = Boolean(def.isCross);
    const isTorch = Boolean(def.isTorch);
    const isBed = Boolean(def.isBed);
    const isLadder = Boolean(def.isLadder);
    const isCrop = Boolean(def.isCrop);
    const isFarmland = Boolean(def.isFarmland);
    const isOpaque = def.isOpaque !== undefined
      ? def.isOpaque
      : (!def.isAir && !def.isTransparent && !def.isCutout && !def.isLiquid && !isCross && !isTorch && !isBed && !isLadder && !isCrop && !isFarmland && !(def.inset > 0));
    const lightOpacity = def.lightOpacity !== undefined
      ? def.lightOpacity
      : (isOpaque ? 15 : 0);

    const entry = {
      id: def.id,
      key: def.key,
      name: def.name,
      isAir: Boolean(def.isAir),
      isCross,
      isTorch,
      isBed,
      isLadder,
      isCrop,
      isFarmland,
      cropStage: def.cropStage ?? -1,
      isClimbable: Boolean(def.isClimbable || isLadder),
      directional: Boolean(def.directional),
      interactiveType: def.interactiveType || null, // 'crafting' | 'furnace' | 'chest' | 'bed'
      isSolid: def.isSolid !== undefined ? def.isSolid : (!def.isAir && !def.isLiquid && !isCross && !isTorch && !isLadder && !isCrop),
      isOpaque,
      isTransparent: Boolean(def.isTransparent || def.isLiquid),
      isCutout: Boolean(def.isCutout || isCross || isTorch || isBed || isLadder || isCrop),
      isLiquid: Boolean(def.isLiquid),
      occludesAO: def.occludesAO !== undefined
        ? def.occludesAO
        : (!def.isAir && !def.isTransparent && !def.isCutout && !def.isLiquid && !isCross && !isTorch && !isBed && !isLadder && !isCrop && !isFarmland && !(def.inset > 0)),
      fallsWithGravity: Boolean(def.fallsWithGravity),
      slipperiness: def.slipperiness ?? 0.0,
      inset: def.inset ?? 0,
      tintType: def.tintType || null, // 'grass' | 'foliage' | 'spruce' | 'birch' | 'swamp'
      materialType: def.materialType || 'stone',
      hardness: def.hardness ?? 1.0,
      blastResistance: def.blastResistance !== undefined
        ? def.blastResistance
        : (def.hardness < 0 ? 3600000 : def.isLiquid ? 100 : (def.materialType === 'stone' ? Math.max(2.0, (def.hardness ?? 1.5) * 4.0) : Math.max(0.2, (def.hardness ?? 0.5) * 1.5))),
      requiresTool: Boolean(def.requiresTool),
      preferredTool: def.preferredTool || null,
      minToolTier: def.minToolTier ?? (def.requiresTool ? 1 : 0),
      dropId: def.dropId !== undefined ? def.dropId : def.id,
      dropCount: def.dropCount ?? 1,
      dropMin: def.dropMin ?? (def.dropCount ?? 1),
      dropMax: def.dropMax ?? (def.dropCount ?? 1),
      dropChance: def.dropChance ?? 1.0,
      lightEmission: def.lightEmission ?? 0,
      touchLightEmission: def.touchLightEmission ?? 0,
      lightOpacity,
      redstoneGlow: Boolean(def.redstoneGlow),
      faces: def.faces || null,
    };
    this.byId[entry.id] = entry;
    this.byKey.set(entry.key, entry);
    this.opacityTable[entry.id] = entry.lightOpacity;
    this.emissionTable[entry.id] = entry.lightEmission;
    this.opaqueTable[entry.id] = entry.isOpaque ? 1 : 0;
    this.aoTable[entry.id] = entry.occludesAO ? 1 : 0;
    return entry;
  }

  get(id) {
    return this.byId[id] || this.byId[0];
  }

  getByKey(key) {
    return this.byKey.get(key) || this.byId[0];
  }

  isOpaque(id) {
    return this.opaqueTable[id] === 1;
  }

  isSolid(id) {
    const b = this.byId[id];
    return b ? b.isSolid : false;
  }

  isTargetable(id) {
    const b = this.byId[id];
    return b ? (b.isSolid || b.isCross || b.isTorch || b.isBed || b.isLadder || b.isCrop) : false;
  }

  isCrop(id) {
    return id >= BLOCK_IDS.WHEAT_0 && id <= BLOCK_IDS.WHEAT_7;
  }

  isTorch(id) {
    return id === BLOCK_IDS.TORCH;
  }

  isBed(id) {
    return id === BLOCK_IDS.BED_FOOT || id === BLOCK_IDS.BED_HEAD;
  }

  isClimbable(id) {
    const b = this.byId[id];
    return b ? b.isClimbable : false;
  }

  getLightOpacity(id) {
    return this.opacityTable[id];
  }

  getLightEmission(id) {
    return this.emissionTable[id];
  }

  isLiquid(id) {
    const b = this.byId[id];
    return b ? b.isLiquid : false;
  }

  isWater(id) {
    return id === BLOCK_IDS.WATER;
  }

  isLava(id) {
    return id === BLOCK_IDS.LAVA;
  }

  isFluid(id) {
    return id === BLOCK_IDS.WATER || id === BLOCK_IDS.LAVA;
  }

  isWashable(id) {
    const b = this.byId[id];
    if (!b || b.isAir || b.isLiquid) return false;
    return Boolean(b.isCross || b.isTorch || b.isCrop || b.isLadder || b.id === BLOCK_IDS.SNOW);
  }

  isCross(id) {
    const b = this.byId[id];
    return b ? b.isCross : false;
  }

  occludesAO(id) {
    return this.aoTable[id] === 1;
  }

  fallsWithGravity(id) {
    const b = this.byId[id];
    return b ? b.fallsWithGravity : false;
  }

  getAllBlocks() {
    return this.byId.filter((b) => b && !b.isAir);
  }

  getBlastResistance(id) {
    const b = this.byId[id];
    return b ? (b.blastResistance ?? 0.5) : 0;
  }

  canHarvest(blockId, heldItem = null) {
    const def = this.get(blockId);
    if (!def || def.isAir || def.isLiquid || def.hardness < 0 || !Number.isFinite(def.hardness)) {
      return false;
    }
    if (!def.requiresTool) return true;
    if (!heldItem || !heldItem.toolType) return false;
    if (heldItem.toolType !== def.preferredTool) return false;
    return (heldItem.toolTier || 0) >= def.minToolTier;
  }

  getBreakTime(blockId, heldItem = null, modifiers = {}) {
    const def = this.get(blockId);
    if (!def || def.isAir || def.isLiquid || def.hardness < 0 || !Number.isFinite(def.hardness)) {
      return Infinity;
    }
    if (def.hardness === 0) return 0.05;

    let speedMultiplier = 1.0;
    const isBestTool = Boolean(heldItem && heldItem.toolType && heldItem.toolType === def.preferredTool);
    const isSwordBoost = Boolean(heldItem && heldItem.toolType === 'sword' && (def.materialType === 'grass' || def.materialType === 'plant' || def.id === BLOCK_IDS.WOOL_WHITE));
    const isShearsBoost = Boolean(heldItem && heldItem.toolType === 'shears' && (def.id === BLOCK_IDS.WOOL_WHITE || def.materialType === 'grass'));
    const canHarvest = this.canHarvest(blockId, heldItem);

    if ((isBestTool || isShearsBoost) && heldItem.toolSpeed) {
      speedMultiplier = heldItem.toolSpeed;
    } else if (isSwordBoost) {
      speedMultiplier = 1.5;
    }
    if (modifiers.inWater) speedMultiplier /= 5;
    if (modifiers.onGround === false) speedMultiplier /= 5;

    const baseFactor = canHarvest ? 1.5 : 5.0;
    return (def.hardness * baseFactor) / Math.max(0.1, speedMultiplier);
  }

  getDrop(blockId) {
    const def = this.get(blockId);
    if (!def || def.isAir || def.isLiquid) return 0;
    if (def.dropChance < 1.0 && Math.random() > def.dropChance) return 0;
    return def.dropId;
  }

  getHarvestDrops(blockId, heldItem = null) {
    const def = this.get(blockId);
    if (!def || def.isAir || def.isLiquid) return [];

    // Shears harvest leaves & wool directly
    if (heldItem?.toolType === 'shears' && (def.id === BLOCK_IDS.OAK_LEAVES || def.id === BLOCK_IDS.BIRCH_LEAVES || def.id === BLOCK_IDS.SPRUCE_LEAVES || def.id === BLOCK_IDS.TALL_GRASS || def.id === BLOCK_IDS.VINE)) {
      return [{ id: def.id, count: 1 }];
    }

    if (!this.canHarvest(blockId, heldItem)) {
      return [];
    }

    // Gravel 10% flint chance
    if (def.id === BLOCK_IDS.GRAVEL) {
      return [{ id: Math.random() < 0.1 ? ITEM_IDS.FLINT : BLOCK_IDS.GRAVEL, count: 1 }];
    }

    // Leaves drop sticks (~20%) / oak apples (~10% on oak leaves) or leaf block with shears
    if (def.id === BLOCK_IDS.OAK_LEAVES || def.id === BLOCK_IDS.BIRCH_LEAVES || def.id === BLOCK_IDS.SPRUCE_LEAVES) {
      const drops = [];
      if (Math.random() < 0.20) drops.push({ id: ITEM_IDS.STICK, count: 1 });
      if (def.id === BLOCK_IDS.OAK_LEAVES && Math.random() < 0.10) drops.push({ id: ITEM_IDS.APPLE, count: 1 });
      return drops;
    }

    // Tall Grass drops Wheat Seeds (~16%)
    if (def.id === BLOCK_IDS.TALL_GRASS) {
      return Math.random() < 0.16 ? [{ id: ITEM_IDS.WHEAT_SEEDS, count: 1 }] : [];
    }

    // Wheat crops: immature gives 1 seeds, mature (stage 7) gives 1 Wheat + 1..3 Seeds
    if (def.isCrop) {
      if (def.cropStage >= 7) {
        return [
          { id: ITEM_IDS.WHEAT, count: 1 },
          { id: ITEM_IDS.WHEAT_SEEDS, count: 1 + Math.floor(Math.random() * 3) },
        ];
      }
      return [{ id: ITEM_IDS.WHEAT_SEEDS, count: 1 }];
    }

    if (def.dropId <= 0) return [];
    if (def.dropChance < 1.0 && Math.random() > def.dropChance) return [];

    const count = def.dropMax > def.dropMin
      ? def.dropMin + Math.floor(Math.random() * (def.dropMax - def.dropMin + 1))
      : def.dropCount;
    return count > 0 ? [{ id: def.dropId, count }] : [];
  }

  getPlaceableBlocks() {
    return this.byId.filter(
      (b) => b && !b.isAir && !b.isLiquid && !b.isCrop && b.id !== BLOCK_IDS.BEDROCK && b.id !== BLOCK_IDS.BED_HEAD && b.id !== BLOCK_IDS.FURNACE_LIT
    );
  }

  _resolveDropLabel(dropId) {
    if (!dropId || dropId <= 0) return 'Ничего';
    if (dropId < 256) return this.get(dropId)?.name || 'Блок';
    return ITEM_DROP_NAME_RU[dropId] || 'Предмет';
  }

  getSurvivalInfo(blockId, heldItem = null) {
    const def = this.get(blockId);
    if (!def || def.isAir) return null;

    if (def.isLiquid) {
      return {
        isLiquid: true,
        hardnessLabel: 'Жидкость',
        toolLabel: 'Ведро (ПКМ по источнику)',
        dropLabel: def.id === BLOCK_IDS.WATER ? 'Ведро воды' : 'Ведро лавы (топливо 1000с)',
        handBreakTimeSec: Infinity,
        heldBreakTimeSec: Infinity,
        canHarvestWithHeld: false,
      };
    }

    if (def.hardness < 0 || !Number.isFinite(def.hardness)) {
      return {
        isLiquid: false,
        unbreakable: true,
        hardnessLabel: 'Неразрушимый (∞)',
        toolLabel: 'Не ломается в выживании',
        dropLabel: 'Ничего',
        handBreakTimeSec: Infinity,
        heldBreakTimeSec: Infinity,
        canHarvestWithHeld: false,
      };
    }

    const prefTool = def.preferredTool ? (TOOL_NAME_RU[def.preferredTool] || def.preferredTool) : null;
    const minTierLabel = TIER_NAME_RU[def.minToolTier] || '';
    let toolLabel;
    if (def.requiresTool) {
      toolLabel = `Нужна: ${prefTool || 'Инструмент'}${minTierLabel ? ` (${minTierLabel})` : ''}`;
    } else if (prefTool) {
      toolLabel = `Любой (быстрее: ${prefTool})`;
    } else {
      toolLabel = 'Любой инструмент / рука';
    }

    let dropLabel;
    if (def.id === BLOCK_IDS.OAK_LEAVES || def.id === BLOCK_IDS.BIRCH_LEAVES || def.id === BLOCK_IDS.SPRUCE_LEAVES) {
      dropLabel = def.id === BLOCK_IDS.OAK_LEAVES
        ? 'Палка (20%), Яблоко (10%), Ножницы → Листва'
        : 'Палка (20%), Ножницы → Листва';
    } else if (def.id === BLOCK_IDS.GRAVEL) {
      dropLabel = 'Гравий (90%) / Кремень (10%)';
    } else if (def.id === BLOCK_IDS.TALL_GRASS) {
      dropLabel = 'Семена пшеницы (16%), Ножницы → Трава';
    } else if (def.isCrop) {
      dropLabel = def.cropStage >= 7 ? 'Пшеница ×1 + Семена 1–3' : 'Семена пшеницы ×1';
    } else if (def.dropId <= 0) {
      dropLabel = 'Ничего (ломается без дропа)';
    } else {
      const baseName = this._resolveDropLabel(def.dropId);
      const qtyStr = def.dropMax > def.dropMin
        ? ` ×${def.dropMin}–${def.dropMax}`
        : (def.dropCount > 1 ? ` ×${def.dropCount}` : '');
      const cond = def.requiresTool ? ` (с ${prefTool || 'инстр.'})` : ' (всегда)';
      dropLabel = `${baseName}${qtyStr}${cond}`;
    }

    const handBreakTimeSec = this.getBreakTime(blockId, null, { inWater: false, onGround: true });
    const heldBreakTimeSec = heldItem
      ? this.getBreakTime(blockId, heldItem, { inWater: false, onGround: true })
      : handBreakTimeSec;
    const canHarvestWithHeld = this.canHarvest(blockId, heldItem);

    return {
      isLiquid: false,
      unbreakable: false,
      hardness: def.hardness,
      hardnessLabel: def.hardness === 0 ? '0 (мгновенно)' : `${def.hardness}`,
      toolLabel,
      dropLabel,
      handBreakTimeSec,
      heldBreakTimeSec,
      canHarvestWithHeld,
      requiresTool: def.requiresTool,
    };
  }

  _allFaces(tileName) {
    return {
      top: tileName,
      bottom: tileName,
      north: tileName,
      south: tileName,
      east: tileName,
      west: tileName,
    };
  }

  _registerAllBlocks() {
    this.register({
      id: BLOCK_IDS.AIR,
      key: 'air',
      name: 'Воздух',
      isAir: true,
      isSolid: false,
      isOpaque: false,
      occludesAO: false,
      hardness: 0,
      dropId: 0,
    });

    this.register({
      id: BLOCK_IDS.GRASS,
      key: 'grass',
      name: 'Блок травы',
      materialType: 'grass',
      tintType: 'grass',
      hardness: 0.6,
      preferredTool: 'shovel',
      dropId: BLOCK_IDS.DIRT,
      faces: {
        top: 'grass_top',
        bottom: 'dirt',
        north: 'grass_side',
        south: 'grass_side',
        east: 'grass_side',
        west: 'grass_side',
      },
    });

    this.register({
      id: BLOCK_IDS.DIRT,
      key: 'dirt',
      name: 'Земля',
      materialType: 'dirt',
      hardness: 0.5,
      preferredTool: 'shovel',
      faces: this._allFaces('dirt'),
    });

    this.register({
      id: BLOCK_IDS.STONE,
      key: 'stone',
      name: 'Камень',
      materialType: 'stone',
      hardness: 1.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      dropId: BLOCK_IDS.COBBLESTONE,
      faces: this._allFaces('stone'),
    });

    this.register({
      id: BLOCK_IDS.COBBLESTONE,
      key: 'cobblestone',
      name: 'Булыжник',
      materialType: 'stone',
      hardness: 2.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      faces: this._allFaces('cobblestone'),
    });

    this.register({
      id: BLOCK_IDS.BEDROCK,
      key: 'bedrock',
      name: 'Бедрок',
      materialType: 'stone',
      hardness: -1,
      dropId: 0,
      faces: this._allFaces('bedrock'),
    });

    this.register({
      id: BLOCK_IDS.SAND,
      key: 'sand',
      name: 'Песок',
      materialType: 'sand',
      fallsWithGravity: true,
      hardness: 0.5,
      preferredTool: 'shovel',
      faces: this._allFaces('sand'),
    });

    this.register({
      id: BLOCK_IDS.OAK_LOG,
      key: 'oak_log',
      name: 'Дубовое бревно',
      materialType: 'wood',
      hardness: 2.0,
      preferredTool: 'axe',
      faces: {
        top: 'oak_log_top',
        bottom: 'oak_log_top',
        north: 'oak_log_side',
        south: 'oak_log_side',
        east: 'oak_log_side',
        west: 'oak_log_side',
      },
    });

    this.register({
      id: BLOCK_IDS.OAK_LEAVES,
      key: 'oak_leaves',
      name: 'Листва дуба',
      materialType: 'grass',
      tintType: 'foliage',
      hardness: 0.2,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 1,
      faces: this._allFaces('oak_leaves'),
    });

    this.register({
      id: BLOCK_IDS.OAK_PLANKS,
      key: 'oak_planks',
      name: 'Дубовые доски',
      materialType: 'wood',
      hardness: 2.0,
      preferredTool: 'axe',
      faces: this._allFaces('oak_planks'),
    });

    this.register({
      id: BLOCK_IDS.SNOW_GRASS,
      key: 'snow_grass',
      name: 'Снежный дёрн',
      materialType: 'snow',
      hardness: 0.6,
      preferredTool: 'shovel',
      dropId: BLOCK_IDS.DIRT,
      faces: {
        top: 'snow',
        bottom: 'dirt',
        north: 'snow_grass_side',
        south: 'snow_grass_side',
        east: 'snow_grass_side',
        west: 'snow_grass_side',
      },
    });

    this.register({
      id: BLOCK_IDS.SNOW,
      key: 'snow',
      name: 'Снег',
      materialType: 'snow',
      hardness: 0.2,
      preferredTool: 'shovel',
      faces: this._allFaces('snow'),
    });

    this.register({
      id: BLOCK_IDS.WATER,
      key: 'water',
      name: 'Вода',
      materialType: 'liquid',
      hardness: -1,
      isSolid: false,
      isOpaque: false,
      isTransparent: true,
      isLiquid: true,
      occludesAO: false,
      lightOpacity: 2,
      dropId: 0,
      faces: this._allFaces('water'),
    });

    this.register({
      id: BLOCK_IDS.SANDSTONE,
      key: 'sandstone',
      name: 'Песчаник',
      materialType: 'stone',
      hardness: 0.8,
      requiresTool: true,
      preferredTool: 'pickaxe',
      faces: {
        top: 'sandstone_top',
        bottom: 'sandstone_bottom',
        north: 'sandstone_side',
        south: 'sandstone_side',
        east: 'sandstone_side',
        west: 'sandstone_side',
      },
    });

    this.register({
      id: BLOCK_IDS.GRAVEL,
      key: 'gravel',
      name: 'Гравий',
      materialType: 'sand',
      fallsWithGravity: true,
      hardness: 0.6,
      preferredTool: 'shovel',
      faces: this._allFaces('gravel'),
    });

    this.register({
      id: BLOCK_IDS.CLAY,
      key: 'clay',
      name: 'Глина',
      materialType: 'dirt',
      hardness: 0.6,
      preferredTool: 'shovel',
      dropId: ITEM_IDS.CLAY_BALL,
      dropCount: 4,
      faces: this._allFaces('clay'),
    });

    this.register({
      id: BLOCK_IDS.ICE,
      key: 'ice',
      name: 'Лёд',
      materialType: 'ice',
      slipperiness: 0.96,
      hardness: 0.5,
      isOpaque: false,
      isTransparent: true,
      occludesAO: false,
      lightOpacity: 1,
      preferredTool: 'pickaxe',
      dropId: 0,
      faces: this._allFaces('ice'),
    });

    this.register({
      id: BLOCK_IDS.BIRCH_LOG,
      key: 'birch_log',
      name: 'Берёзовое бревно',
      materialType: 'wood',
      hardness: 2.0,
      preferredTool: 'axe',
      faces: {
        top: 'birch_log_top',
        bottom: 'birch_log_top',
        north: 'birch_log_side',
        south: 'birch_log_side',
        east: 'birch_log_side',
        west: 'birch_log_side',
      },
    });

    this.register({
      id: BLOCK_IDS.BIRCH_LEAVES,
      key: 'birch_leaves',
      name: 'Листва берёзы',
      materialType: 'grass',
      tintType: 'birch',
      hardness: 0.2,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 1,
      faces: this._allFaces('birch_leaves'),
    });

    this.register({
      id: BLOCK_IDS.SPRUCE_LOG,
      key: 'spruce_log',
      name: 'Еловое бревно',
      materialType: 'wood',
      hardness: 2.0,
      preferredTool: 'axe',
      faces: {
        top: 'spruce_log_top',
        bottom: 'spruce_log_top',
        north: 'spruce_log_side',
        south: 'spruce_log_side',
        east: 'spruce_log_side',
        west: 'spruce_log_side',
      },
    });

    this.register({
      id: BLOCK_IDS.SPRUCE_LEAVES,
      key: 'spruce_leaves',
      name: 'Хвоя ели',
      materialType: 'grass',
      tintType: 'spruce',
      hardness: 0.2,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 1,
      faces: this._allFaces('spruce_leaves'),
    });

    this.register({
      id: BLOCK_IDS.CACTUS,
      key: 'cactus',
      name: 'Кактус',
      materialType: 'plant',
      inset: 1 / 16,
      hardness: 0.4,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 1,
      faces: {
        top: 'cactus_top',
        bottom: 'cactus_bottom',
        north: 'cactus_side',
        south: 'cactus_side',
        east: 'cactus_side',
        west: 'cactus_side',
      },
    });

    this.register({
      id: BLOCK_IDS.GRANITE,
      key: 'granite',
      name: 'Гранит',
      materialType: 'stone',
      hardness: 1.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      faces: this._allFaces('granite'),
    });

    this.register({
      id: BLOCK_IDS.DIORITE,
      key: 'diorite',
      name: 'Диорит',
      materialType: 'stone',
      hardness: 1.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      faces: this._allFaces('diorite'),
    });

    this.register({
      id: BLOCK_IDS.ANDESITE,
      key: 'andesite',
      name: 'Андезит',
      materialType: 'stone',
      hardness: 1.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      faces: this._allFaces('andesite'),
    });

    this.register({
      id: BLOCK_IDS.COAL_ORE,
      key: 'coal_ore',
      name: 'Угольная руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      dropId: ITEM_IDS.COAL,
      faces: this._allFaces('coal_ore'),
    });

    this.register({
      id: BLOCK_IDS.IRON_ORE,
      key: 'iron_ore',
      name: 'Железная руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 2,
      faces: this._allFaces('iron_ore'),
    });

    this.register({
      id: BLOCK_IDS.GOLD_ORE,
      key: 'gold_ore',
      name: 'Золотая руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 3,
      faces: this._allFaces('gold_ore'),
    });

    this.register({
      id: BLOCK_IDS.LAPIS_ORE,
      key: 'lapis_ore',
      name: 'Лазуритовая руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 2,
      dropId: ITEM_IDS.LAPIS_LAZULI,
      dropMin: 4,
      dropMax: 8,
      faces: this._allFaces('lapis_ore'),
    });

    this.register({
      id: BLOCK_IDS.REDSTONE_ORE,
      key: 'redstone_ore',
      name: 'Редстоуновая руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 3,
      dropId: ITEM_IDS.REDSTONE,
      dropMin: 4,
      dropMax: 5,
      lightEmission: 0,
      touchLightEmission: 9,
      redstoneGlow: true,
      faces: this._allFaces('redstone_ore'),
    });

    this.register({
      id: BLOCK_IDS.DIAMOND_ORE,
      key: 'diamond_ore',
      name: 'Алмазная руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 3,
      dropId: ITEM_IDS.DIAMOND,
      faces: this._allFaces('diamond_ore'),
    });

    this.register({
      id: BLOCK_IDS.EMERALD_ORE,
      key: 'emerald_ore',
      name: 'Изумрудная руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 3,
      dropId: ITEM_IDS.EMERALD,
      faces: this._allFaces('emerald_ore'),
    });

    // Cross-mesh (X-shaped) non-solid plants
    this.register({
      id: BLOCK_IDS.TALL_GRASS,
      key: 'tall_grass',
      name: 'Трава',
      materialType: 'plant',
      isCross: true,
      tintType: 'grass',
      hardness: 0,
      dropId: 0,
      faces: this._allFaces('tall_grass'),
    });

    this.register({
      id: BLOCK_IDS.POPPY,
      key: 'poppy',
      name: 'Мак',
      materialType: 'plant',
      isCross: true,
      hardness: 0,
      faces: this._allFaces('poppy'),
    });

    this.register({
      id: BLOCK_IDS.DANDELION,
      key: 'dandelion',
      name: 'Одуванчик',
      materialType: 'plant',
      isCross: true,
      hardness: 0,
      faces: this._allFaces('dandelion'),
    });

    this.register({
      id: BLOCK_IDS.DEAD_BUSH,
      key: 'dead_bush',
      name: 'Сухой куст',
      materialType: 'plant',
      isCross: true,
      hardness: 0,
      dropId: 0,
      faces: this._allFaces('dead_bush'),
    });

    this.register({
      id: BLOCK_IDS.RED_MUSHROOM,
      key: 'red_mushroom',
      name: 'Мухомор',
      materialType: 'plant',
      isCross: true,
      hardness: 0,
      faces: this._allFaces('red_mushroom'),
    });

    this.register({
      id: BLOCK_IDS.BROWN_MUSHROOM,
      key: 'brown_mushroom',
      name: 'Коричневый гриб',
      materialType: 'plant',
      isCross: true,
      hardness: 0,
      faces: this._allFaces('brown_mushroom'),
    });

    this.register({
      id: BLOCK_IDS.BLUE_ORCHID,
      key: 'blue_orchid',
      name: 'Голубая орхидея',
      materialType: 'plant',
      isCross: true,
      hardness: 0,
      faces: this._allFaces('blue_orchid'),
    });

    this.register({
      id: BLOCK_IDS.VINE,
      key: 'vine',
      name: 'Лиана',
      materialType: 'plant',
      isCross: true,
      tintType: 'swamp',
      hardness: 0.2,
      faces: this._allFaces('vine'),
    });

    // Stage 4 Light Sources & Functional Bed
    this.register({
      id: BLOCK_IDS.TORCH,
      key: 'torch',
      name: 'Факел',
      materialType: 'wood',
      isTorch: true,
      isSolid: false,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 0,
      lightEmission: 14,
      hardness: 0,
      faces: this._allFaces('torch'),
    });

    this.register({
      id: BLOCK_IDS.GLOWSTONE,
      key: 'glowstone',
      name: 'Светящийся камень',
      materialType: 'glass',
      hardness: 0.3,
      lightEmission: 15,
      faces: this._allFaces('glowstone'),
    });

    this.register({
      id: BLOCK_IDS.JACK_O_LANTERN,
      key: 'jack_o_lantern',
      name: 'Светильник Джека',
      materialType: 'wood',
      hardness: 1.0,
      preferredTool: 'axe',
      directional: true,
      lightEmission: 15,
      faces: {
        top: 'pumpkin_top',
        bottom: 'pumpkin_top',
        south: 'jack_o_lantern_face',
        north: 'pumpkin_side',
        east: 'pumpkin_side',
        west: 'pumpkin_side',
      },
    });

    this.register({
      id: BLOCK_IDS.BED_FOOT,
      key: 'bed',
      name: 'Кровать',
      materialType: 'wood',
      isBed: true,
      interactiveType: 'bed',
      isSolid: true,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 0,
      hardness: 0.2,
      dropId: BLOCK_IDS.BED_FOOT,
      faces: {
        top: 'bed_foot_top',
        bottom: 'oak_planks',
        north: 'bed_side_foot',
        south: 'bed_end_foot',
        east: 'bed_side_foot',
        west: 'bed_side_foot',
      },
    });

    this.register({
      id: BLOCK_IDS.BED_HEAD,
      key: 'bed_head',
      name: 'Кровать (изголовье)',
      materialType: 'wood',
      isBed: true,
      interactiveType: 'bed',
      isSolid: true,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 0,
      hardness: 0.2,
      dropId: BLOCK_IDS.BED_FOOT,
      faces: {
        top: 'bed_head_top',
        bottom: 'oak_planks',
        north: 'bed_end_head',
        south: 'bed_side_head',
        east: 'bed_side_head',
        west: 'bed_side_head',
      },
    });

    // Stage 5 Interactive & Crafted Blocks
    this.register({
      id: BLOCK_IDS.CRAFTING_TABLE,
      key: 'crafting_table',
      name: 'Верстак',
      materialType: 'wood',
      interactiveType: 'crafting',
      hardness: 2.5,
      preferredTool: 'axe',
      faces: {
        top: 'crafting_table_top',
        bottom: 'oak_planks',
        north: 'crafting_table_front',
        south: 'crafting_table_side',
        east: 'crafting_table_side',
        west: 'crafting_table_front',
      },
    });

    this.register({
      id: BLOCK_IDS.FURNACE,
      key: 'furnace',
      name: 'Печь',
      materialType: 'stone',
      interactiveType: 'furnace',
      directional: true,
      hardness: 3.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: {
        top: 'furnace_top',
        bottom: 'furnace_top',
        south: 'furnace_front',
        north: 'furnace_side',
        east: 'furnace_side',
        west: 'furnace_side',
      },
    });

    this.register({
      id: BLOCK_IDS.FURNACE_LIT,
      key: 'furnace_lit',
      name: 'Горящая печь',
      materialType: 'stone',
      interactiveType: 'furnace',
      directional: true,
      lightEmission: 13,
      hardness: 3.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      dropId: BLOCK_IDS.FURNACE,
      faces: {
        top: 'furnace_top',
        bottom: 'furnace_top',
        south: 'furnace_front_on',
        north: 'furnace_side',
        east: 'furnace_side',
        west: 'furnace_side',
      },
    });

    this.register({
      id: BLOCK_IDS.CHEST,
      key: 'chest',
      name: 'Сундук',
      materialType: 'wood',
      interactiveType: 'chest',
      directional: true,
      hardness: 2.5,
      preferredTool: 'axe',
      faces: {
        top: 'chest_top',
        bottom: 'chest_top',
        south: 'chest_front',
        north: 'chest_side',
        east: 'chest_side',
        west: 'chest_side',
      },
    });

    this.register({
      id: BLOCK_IDS.GLASS,
      key: 'glass',
      name: 'Стекло',
      materialType: 'glass',
      hardness: 0.3,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 0,
      dropId: 0,
      faces: this._allFaces('glass'),
    });

    this.register({
      id: BLOCK_IDS.STONE_BRICKS,
      key: 'stone_bricks',
      name: 'Каменные кирпичи',
      materialType: 'stone',
      hardness: 1.5,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: this._allFaces('stone_bricks'),
    });

    this.register({
      id: BLOCK_IDS.LADDER,
      key: 'ladder',
      name: 'Лестница',
      materialType: 'wood',
      isLadder: true,
      isClimbable: true,
      isSolid: false,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      lightOpacity: 0,
      hardness: 0.4,
      preferredTool: 'axe',
      faces: this._allFaces('ladder'),
    });

    this.register({
      id: BLOCK_IDS.COAL_BLOCK,
      key: 'coal_block',
      name: 'Угольный блок',
      materialType: 'stone',
      hardness: 5.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: this._allFaces('coal_block'),
    });

    this.register({
      id: BLOCK_IDS.IRON_BLOCK,
      key: 'iron_block',
      name: 'Железный блок',
      materialType: 'stone',
      hardness: 5.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 2,
      faces: this._allFaces('iron_block'),
    });

    this.register({
      id: BLOCK_IDS.GOLD_BLOCK,
      key: 'gold_block',
      name: 'Золотой блок',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 3,
      faces: this._allFaces('gold_block'),
    });

    this.register({
      id: BLOCK_IDS.DIAMOND_BLOCK,
      key: 'diamond_block',
      name: 'Алмазный блок',
      materialType: 'stone',
      hardness: 5.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 3,
      faces: this._allFaces('diamond_block'),
    });

    this.register({
      id: BLOCK_IDS.WOOL_WHITE,
      key: 'wool_white',
      name: 'Белая шерсть',
      materialType: 'wool',
      hardness: 0.8,
      preferredTool: 'shears',
      faces: this._allFaces('wool_white'),
    });

    // Stage 6 Farming, Crops, Ores & Natural Stone Variants
    this.register({
      id: BLOCK_IDS.FARMLAND,
      key: 'farmland',
      name: 'Грядка',
      materialType: 'dirt',
      isFarmland: true,
      isSolid: true,
      isOpaque: false,
      occludesAO: false,
      hardness: 0.6,
      preferredTool: 'shovel',
      dropId: BLOCK_IDS.DIRT,
      faces: {
        top: 'farmland_dry',
        bottom: 'dirt',
        north: 'dirt',
        south: 'dirt',
        east: 'dirt',
        west: 'dirt',
      },
    });

    for (let st = 0; st <= 7; st++) {
      this.register({
        id: BLOCK_IDS.WHEAT_0 + st,
        key: `wheat_${st}`,
        name: st === 7 ? 'Пшеница (спелая)' : `Пшеница (рост ${st})`,
        materialType: 'plant',
        isCrop: true,
        cropStage: st,
        isSolid: false,
        isOpaque: false,
        isCutout: true,
        occludesAO: false,
        lightOpacity: 0,
        hardness: 0,
        dropId: st === 7 ? ITEM_IDS.WHEAT : ITEM_IDS.WHEAT_SEEDS,
        faces: this._allFaces(`wheat_stage_${st}`),
      });
    }

    this.register({
      id: BLOCK_IDS.HAY_BALE,
      key: 'hay_bale',
      name: 'Сноп сена',
      materialType: 'plant',
      hardness: 0.5,
      preferredTool: 'hoe',
      faces: {
        top: 'hay_bale_top',
        bottom: 'hay_bale_top',
        north: 'hay_bale_side',
        south: 'hay_bale_side',
        east: 'hay_bale_side',
        west: 'hay_bale_side',
      },
    });

    this.register({
      id: BLOCK_IDS.COPPER_ORE,
      key: 'copper_ore',
      name: 'Медная руда',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 2,
      dropId: ITEM_IDS.RAW_COPPER,
      dropMin: 2,
      dropMax: 4,
      faces: this._allFaces('copper_ore'),
    });

    this.register({
      id: BLOCK_IDS.COPPER_BLOCK,
      key: 'copper_block',
      name: 'Медный блок',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 2,
      faces: this._allFaces('copper_block'),
    });

    this.register({
      id: BLOCK_IDS.DEEPSLATE,
      key: 'deepslate',
      name: 'Глубинный сланец',
      materialType: 'stone',
      hardness: 3.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: this._allFaces('deepslate'),
    });

    this.register({
      id: BLOCK_IDS.SMOOTH_STONE,
      key: 'smooth_stone',
      name: 'Гладкий камень',
      materialType: 'stone',
      hardness: 2.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: this._allFaces('smooth_stone'),
    });

    this.register({
      id: BLOCK_IDS.BRICKS,
      key: 'bricks',
      name: 'Кирпичный блок',
      materialType: 'stone',
      hardness: 2.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: this._allFaces('bricks'),
    });

    this.register({
      id: BLOCK_IDS.BOOKSHELF,
      key: 'bookshelf',
      name: 'Книжная полка',
      materialType: 'wood',
      hardness: 1.5,
      preferredTool: 'axe',
      faces: {
        top: 'oak_planks',
        bottom: 'oak_planks',
        north: 'bookshelf',
        south: 'bookshelf',
        east: 'bookshelf',
        west: 'bookshelf',
      },
    });

    this.register({
      id: BLOCK_IDS.MOSSY_COBBLESTONE,
      key: 'mossy_cobblestone',
      name: 'Замшелый булыжник',
      materialType: 'stone',
      hardness: 2.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 1,
      faces: this._allFaces('mossy_cobblestone'),
    });

    this.register({
      id: BLOCK_IDS.LAVA,
      key: 'lava',
      name: 'Лава',
      materialType: 'liquid',
      hardness: -1,
      isSolid: false,
      isOpaque: false,
      isTransparent: true,
      isLiquid: true,
      occludesAO: false,
      lightOpacity: 3,
      lightEmission: 15,
      dropId: 0,
      faces: this._allFaces('lava'),
    });

    this.register({
      id: BLOCK_IDS.OBSIDIAN,
      key: 'obsidian',
      name: 'Обсидиан',
      materialType: 'stone',
      hardness: 50.0,
      blastResistance: 1200.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      minToolTier: 4,
      faces: this._allFaces('obsidian'),
    });

    this.register({
      id: BLOCK_IDS.TNT,
      key: 'tnt',
      name: 'Динамит (TNT)',
      materialType: 'plant',
      hardness: 0.0,
      blastResistance: 0.0,
      faces: {
        top: 'tnt_top',
        bottom: 'tnt_bottom',
        north: 'tnt_side',
        south: 'tnt_side',
        east: 'tnt_side',
        west: 'tnt_side',
      },
    });
  }
}

export const BlockRegistry = new BlockRegistryImpl();
