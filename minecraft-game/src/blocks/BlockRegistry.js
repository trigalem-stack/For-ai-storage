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
    });

    this.register({
      id: BLOCK_IDS.GRASS,
      key: 'grass',
      name: 'Grass Block',
      hardness: 0.6,
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
      name: 'Dirt',
      hardness: 0.5,
      faces: this._allFaces('dirt'),
    });

    this.register({
      id: BLOCK_IDS.STONE,
      key: 'stone',
      name: 'Stone',
      hardness: 1.5,
      faces: this._allFaces('stone'),
    });

    this.register({
      id: BLOCK_IDS.COBBLESTONE,
      key: 'cobblestone',
      name: 'Cobblestone',
      hardness: 2.0,
      faces: this._allFaces('cobblestone'),
    });

    this.register({
      id: BLOCK_IDS.BEDROCK,
      key: 'bedrock',
      name: 'Bedrock',
      hardness: Infinity,
      faces: this._allFaces('bedrock'),
    });

    this.register({
      id: BLOCK_IDS.SAND,
      key: 'sand',
      name: 'Sand',
      hardness: 0.5,
      faces: this._allFaces('sand'),
    });

    this.register({
      id: BLOCK_IDS.OAK_LOG,
      key: 'oak_log',
      name: 'Oak Log',
      hardness: 2.0,
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
      name: 'Oak Leaves',
      hardness: 0.2,
      isOpaque: false,
      isCutout: true,
      occludesAO: false,
      faces: this._allFaces('oak_leaves'),
    });

    this.register({
      id: BLOCK_IDS.OAK_PLANKS,
      key: 'oak_planks',
      name: 'Oak Planks',
      hardness: 2.0,
      faces: this._allFaces('oak_planks'),
    });

    this.register({
      id: BLOCK_IDS.SNOW_GRASS,
      key: 'snow_grass',
      name: 'Snowy Grass',
      hardness: 0.6,
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
      name: 'Snow Block',
      hardness: 0.4,
      faces: this._allFaces('snow'),
    });

    this.register({
      id: BLOCK_IDS.WATER,
      key: 'water',
      name: 'Water',
      hardness: Infinity,
      isSolid: false,
      isOpaque: false,
      isTransparent: true,
      isLiquid: true,
      occludesAO: false,
      faces: this._allFaces('water'),
    });
  }
}

export const BlockRegistry = new BlockRegistryImpl();
