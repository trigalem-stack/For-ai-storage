// Extensible Block Registry for Stages 1-12.
// Each block has a compact numeric ID (0..255) stored in Chunk Uint8Array.

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
});

class BlockRegistryImpl {
  constructor() {
    this.byId = new Array(256).fill(null);
    this.byKey = new Map();
    this._registerStage1Blocks();
  }

  register(def) {
    const entry = {
      id: def.id,
      key: def.key,
      name: def.name,
      isAir: Boolean(def.isAir),
      isSolid: def.isSolid !== undefined ? def.isSolid : !def.isAir && !def.isLiquid,
      isOpaque: def.isOpaque !== undefined ? def.isOpaque : !def.isAir && !def.isTransparent && !def.isCutout && !def.isLiquid,
      isTransparent: Boolean(def.isTransparent || def.isLiquid),
      isCutout: Boolean(def.isCutout),
      isLiquid: Boolean(def.isLiquid),
      occludesAO: def.occludesAO !== undefined ? def.occludesAO : (!def.isAir && !def.isTransparent && !def.isCutout && !def.isLiquid),
      hardness: def.hardness ?? 1.0,
      requiresTool: Boolean(def.requiresTool),
      preferredTool: def.preferredTool || null,
      dropId: def.dropId !== undefined ? def.dropId : def.id,
      dropChance: def.dropChance ?? 1.0,
      lightEmission: def.lightEmission ?? 0, // Hook for Stage 4 lighting
      faces: def.faces || null, // { top, bottom, north, south, east, west }
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

  isLiquid(id) {
    const b = this.byId[id];
    return b ? b.isLiquid : false;
  }

  occludesAO(id) {
    const b = this.byId[id];
    return b ? b.occludesAO : false;
  }

  /**
   * Computes Minecraft block breaking time in seconds.
   * Hook for Stage 5 tools & efficiency multipliers.
   */
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

  /**
   * Returns dropped block ID when broken (e.g. Grass -> Dirt, Stone -> Cobblestone).
   */
  getDrop(blockId) {
    const def = this.get(blockId);
    if (!def || def.isAir || def.isLiquid) return 0;
    if (def.dropChance < 1.0 && Math.random() > def.dropChance) return 0;
    return def.dropId;
  }

  getAllBlocks() {
    return this.byId.filter((b) => b && !b.isAir);
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

  _registerStage1Blocks() {
    this.register({
      id: BLOCK_IDS.AIR,
      key: 'air',
      name: 'Air',
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
      hardness: 0.5,
      preferredTool: 'shovel',
      faces: this._allFaces('dirt'),
    });

    this.register({
      id: BLOCK_IDS.STONE,
      key: 'stone',
      name: 'Камень',
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
      hardness: 2.0,
      requiresTool: true,
      preferredTool: 'pickaxe',
      faces: this._allFaces('cobblestone'),
    });

    this.register({
      id: BLOCK_IDS.BEDROCK,
      key: 'bedrock',
      name: 'Бедрок',
      hardness: -1,
      dropId: 0,
      faces: this._allFaces('bedrock'),
    });

    this.register({
      id: BLOCK_IDS.SAND,
      key: 'sand',
      name: 'Песок',
      hardness: 0.5,
      preferredTool: 'shovel',
      faces: this._allFaces('sand'),
    });

    this.register({
      id: BLOCK_IDS.OAK_LOG,
      key: 'oak_log',
      name: 'Дубовое бревно',
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
      hardness: 2.0,
      preferredTool: 'axe',
      faces: this._allFaces('oak_planks'),
    });

    this.register({
      id: BLOCK_IDS.SNOW_GRASS,
      key: 'snow_grass',
      name: 'Снежный дёрн',
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
      hardness: 0.2,
      preferredTool: 'shovel',
      faces: this._allFaces('snow'),
    });

    this.register({
      id: BLOCK_IDS.WATER,
      key: 'water',
      name: 'Вода',
      hardness: -1,
      isSolid: false,
      isOpaque: false,
      isTransparent: true,
      isLiquid: true,
      occludesAO: false,
      dropId: 0,
      faces: this._allFaces('water'),
    });
  }
}

export const BlockRegistry = new BlockRegistryImpl();
