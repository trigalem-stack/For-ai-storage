// Core world, chunk, player, physics, biome, lighting, and loop constants shared across stages (1-12).

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const CHUNK_VOLUME = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE; // 32768
export const SEA_LEVEL = 62;

// Fixed simulation tick rate (20 TPS = 50 ms per tick)
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

// Day/Night cycle constants (24000 ticks = 20 real minutes at 20 TPS)
export const DAY_LENGTH_TICKS = 24000;
export const DEFAULT_WORLD_TIME = 1000;
export const SLEEP_START_TICK = 12541;
export const SLEEP_END_TICK = 23458;
export const CLOUD_HEIGHT_MIN = 108;
export const CLOUD_HEIGHT_MAX = 112;

// Inventory, crafting, chest & furnace constants (Stage 5)
export const INVENTORY_SIZE = 36;
export const ARMOR_SLOTS = 4;
export const CHEST_SIZE = 27;
export const FURNACE_COOK_TICKS = 200; // 10 seconds at 20 TPS
export const ITEM_DROP_PLAYER_DELAY = 1.5; // Seconds before player-thrown item is picked back up
export const ITEM_DROP_DEATH_LIFETIME = 300.0; // 5 minutes (6000 ticks) for death drops
export const TOOL_DURABILITY_WOOD = 59;
export const TOOL_DURABILITY_STONE = 131;
export const TOOL_DURABILITY_IRON = 250;
export const TOOL_DURABILITY_GOLD = 32;
export const TOOL_DURABILITY_DIAMOND = 1561;

// Survival stats constants (Stage 6)
export const MAX_HEALTH = 20;
export const MAX_FOOD = 20;
export const DEFAULT_SATURATION = 5.0;
export const EXHAUSTION_THRESHOLD = 4.0;
export const MAX_AIR_TICKS = 300; // 15 seconds at 20 TPS
export const HURT_INVULN_TICKS = 10; // 0.5 seconds i-frames
export const EAT_DURATION_SEC = 1.6; // 32 ticks eating animation

// Lighting constants (Minecraft 0..15 channels)
export const MAX_LIGHT_LEVEL = 15;
export const TORCH_LIGHT_LEVEL = 14;
export const GLOWSTONE_LIGHT_LEVEL = 15;
export const JACK_O_LANTERN_LIGHT_LEVEL = 15;
export const FURNACE_LIGHT_LEVEL = 13;
export const REDSTONE_GLOW_LEVEL = 9;

// Player AABB hitbox & eye dimensions (authentic Minecraft Java proportions)
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HALF_WIDTH = PLAYER_WIDTH * 0.5; // 0.3
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_CROUCH_HEIGHT = 1.5;
export const PLAYER_CROUCH_EYE_HEIGHT = 1.27;
export const PLAYER_SWIM_HEIGHT = 0.82;
export const PLAYER_SWIM_EYE_HEIGHT = 0.52;

// Movement speeds (blocks / second)
export const WALK_SPEED = 4.317;
export const SPRINT_SPEED = 5.612;
export const CROUCH_SPEED = 1.295;
export const SWIM_SPEED = 3.85;
export const SWIM_SPRINT_SPEED = 5.6;
export const FLY_SPEED = 9.5;
export const FLY_SPRINT_SPEED = 15.0;

// Physics tuned to exact Minecraft jump apex (~1.252 blocks: v0^2 / (2g) = 8.952^2 / 64 = 1.2522)
export const GRAVITY = 32.0;
export const JUMP_VELOCITY = 8.952;
export const TERMINAL_VELOCITY = 54.0;
export const JUMP_COOLDOWN_SEC = 0.14;
export const SNEAK_EDGE_DEPTH = 0.6;

// Creative breaking anti-spam repeat interval (seconds)
export const CREATIVE_BREAK_COOLDOWN = 0.17;

// Camera FOV
export const BASE_FOV = 72;
export const SPRINT_FOV_BOOST = 10;

// Raycast & interaction
export const REACH_DISTANCE = 5.0;
export const HOTBAR_SIZE = 9;
export const MAX_STACK_SIZE = 64;
export const MAX_STACK_DEFAULT = MAX_STACK_SIZE;

// Render distance presets (chunks radius around player)
export const DEFAULT_RENDER_DISTANCE_PC = 7;
export const DEFAULT_RENDER_DISTANCE_MOBILE = 4;
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 16;

// Chunk meshing frame budget (ms)
export const CHUNK_FRAME_BUDGET_MS = 1.8;

// Texture atlas layout: 16x16 grid of 32x32 padded cells (inner 16x16 + 8px edge padding)
export const ATLAS_GRID_SIZE = 16;
export const ATLAS_TILE_INNER = 16;
export const ATLAS_TILE_PAD = 8;
export const ATLAS_CELL_SIZE = ATLAS_TILE_INNER + ATLAS_TILE_PAD * 2; // 32
export const ATLAS_PIXELS = ATLAS_GRID_SIZE * ATLAS_CELL_SIZE; // 512

// Directional face brightness multipliers
export const FACE_SHADE = Object.freeze({
  TOP: 1.0,    // +Y
  SOUTH: 0.84, // +Z
  NORTH: 0.80, // -Z
  EAST: 0.66,  // +X
  WEST: 0.62,  // -X
  BOTTOM: 0.50,// -Y
});

// Smooth Voxel Ambient Occlusion levels (0 = darkest corner, 3 = unoccluded)
export const AO_CURVE = Object.freeze([0.50, 0.70, 0.85, 1.0]);

// Camera modes (cycled via F5 / Camera HUD button)
export const CAMERA_MODES = Object.freeze({
  FIRST_PERSON: 0,
  THIRD_PERSON_BACK: 1,
  THIRD_PERSON_FRONT: 2,
});

// Biome IDs (stored per column in Chunk.biomes Uint8Array)
export const BIOME_IDS = Object.freeze({
  PLAINS: 0,
  FOREST: 1,
  BIRCH_FOREST: 2,
  DESERT: 3,
  SNOWY_TAIGA: 4,
  MOUNTAINS: 5,
  SWAMP: 6,
  BEACH: 7,
});

export const BIOME_NAMES = Object.freeze({
  0: 'Plains (Равнины)',
  1: 'Forest (Лес)',
  2: 'Birch Forest (Берёзовый лес)',
  3: 'Desert (Пустыня)',
  4: 'Snowy Taiga (Снежная тайга)',
  5: 'Mountains (Горы)',
  6: 'Swamp & River (Болото/Река)',
  7: 'Beach (Пляж)',
});

// Autosave interval
export const AUTOSAVE_INTERVAL_MS = 15000;
