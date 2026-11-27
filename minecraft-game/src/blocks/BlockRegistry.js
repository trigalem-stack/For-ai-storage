// Extensible Block Registry for Stages 1-12.
// Compact numeric IDs (0..255) stored in Chunk Uint8Array.

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
});

class BlockRegistryImpl {
  constructor() {
    this.byId = new Array(256).fill(null);
    this.byKey = new Map();
    this._registerAllBlocks();
  }

  register(def) {
    const isCross = Boolean(def.isCross);
    const entry = {
      id: def.id,
      key: def.key,
      name: def.name,
      isAir: Boolean(def.isAir),
      isCross,
      isSolid: def.isSolid !== undefined ? def.isSolid : (!def.isAir && !def.isLiquid && !isCross),
      isOpaque: def.isOpaque !== undefined
        ? def.isOpaque
        : (!def.isAir && !def.isTransparent && !def.isCutout && !def.isLiquid && !isCross && !(def.inset > 0)),
      isTransparent: Boolean(def.isTransparent || def.isLiquid),
      isCutout: Boolean(def.isCutout || isCross),
      isLiquid: Boolean(def.isLiquid),
      occludesAO: def.occludesAO !== undefined
        ? def.occludesAO
        : (!def.isAir && !def.isTransparent && !def.isCutout && !def.isLiquid && !isCross && !(def.inset > 0)),
      fallsWithGravity: Boolean(def.fallsWithGravity),
      slipperiness: def.slipperiness ?? 0.0,
      inset: def.inset ?? 0,
      tintType: def.tintType || null, // 'grass' | 'foliage' | 'spruce' | 'birch' | 'swamp'
      materialType: def.materialType || 'stone',
      hardness: def.hardness ?? 1.0,
      requiresTool: Boolean(def.requiresTool),
      preferredTool: def.preferredTool || null,
      dropId: def.dropId !== undefined ? def.dropId : def.id,
      dropChance: def.dropChance ?? 1.0,
      lightEmission: def.lightEmission ?? 0,
      redstoneGlow: Boolean(def.redstoneGlow),
      faces: def.faces || null,
    };
    this.byId[entry.id] = entry;
    this.byKey.set(entry.key, entry);
    return entry;
  }

  get(id) {
    return this.byId[id] || this.byId[0];
  }

  getByKey(key) {
    return this.byKey.get(key) || this.byId[0];
  }

  isOpaque(id) {
    const b = this.byId[id];
    return b ? b.isOpaque : false;
  }

  isSolid(id) {
    const b = this.byId[id];
    return b ? b.isSolid : false;
  }

  isTargetable(id) {
    const b = this.byId[id];
    return b ? (b.isSolid || b.isCross) : false;
  }

  isLiquid(id) {
    const b = this.byId[id];
    return b ? b.isLiquid : false;
  }

  occludesAO(id) {
    const b = this.byId[id];
    return b ? b.occludesAO : false;
  }

  fallsWithGravity(id) {
    const b = this.byId[id];
    return b ? b.fallsWithGravity : false;
  }

  getBreakTime(blockId, heldItem = null, modifiers = {}) {
    const def = this.get(blockId);
    if (!def || def.isAir || def.isLiquid || def.hardness < 0 || !Number.isFinite(def.hardness)) {
      return Infinity;
    }
    if (def.hardness === 0) return 0.05;

    let speedMultiplier = 1.0;
    const isBestTool = Boolean(heldItem && heldItem.toolType && heldItem.toolType === def.preferredTool);
    const canHarvest = !def.requiresTool || isBestTool;

    if (isBestTool && heldItem.toolSpeed) {
      speedMultiplier = heldItem.toolSpeed;
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

  getAllBlocks() {
    return this.byId.filter((b) => b && !b.isAir);
  }

  getPlaceableBlocks() {
    return this.byId.filter((b) => b && !b.isAir && !b.isLiquid && b.id !== BLOCK_IDS.BEDROCK);
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
      lightEmission: 9,
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
  }
}

export const BlockRegistry = new BlockRegistryImpl();
