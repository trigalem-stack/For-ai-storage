// Core world, chunk, player, physics, and loop constants shared across all stages (1-12).

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 128;
export const CHUNK_VOLUME = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE; // 32768
export const SEA_LEVEL = 62;

// Fixed simulation tick rate (20 TPS = 50 ms per tick, matching Minecraft)
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

// Player AABB hitbox & eye dimensions (authentic Minecraft Java proportions)
export const PLAYER_WIDTH = 0.6;
export const PLAYER_HALF_WIDTH = PLAYER_WIDTH * 0.5; // 0.3
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_CROUCH_HEIGHT = 1.5;
export const PLAYER_CROUCH_EYE_HEIGHT = 1.27;

// Movement speeds (blocks / second)
export const WALK_SPEED = 4.317;
export const SPRINT_SPEED = 5.612;
export const CROUCH_SPEED = 1.295;
export const FLY_SPEED = 11.0;
export const FLY_SPRINT_SPEED = 22.0;

// Physics tuned to exact Minecraft jump apex (~1.252 blocks: v0^2 / (2g) = 8.952^2 / 64 = 1.2522)
export const GRAVITY = 32.0;
export const JUMP_VELOCITY = 8.952;
export const TERMINAL_VELOCITY = 54.0;
export const JUMP_COOLDOWN_SEC = 0.14;
export const SNEAK_EDGE_DEPTH = 0.6;

// Camera FOV
export const BASE_FOV = 72;
export const SPRINT_FOV_BOOST = 10;

// Raycast & interaction
export const REACH_DISTANCE = 5.0;
export const HOTBAR_SIZE = 9;
export const MAX_STACK_SIZE = 64;

// Render distance presets (chunks radius around player)
export const DEFAULT_RENDER_DISTANCE_PC = 6;
export const DEFAULT_RENDER_DISTANCE_MOBILE = 4;
export const MIN_RENDER_DISTANCE = 2;
export const MAX_RENDER_DISTANCE = 16;

// Chunk streaming frame budget (ms)
export const CHUNK_FRAME_BUDGET_MS = 3.5;

// Texture atlas layout: 16x16 grid of 32x32 padded cells (inner 16x16 + 8px edge padding)
export const ATLAS_GRID_SIZE = 16;
export const ATLAS_TILE_INNER = 16;
export const ATLAS_TILE_PAD = 8;
export const ATLAS_CELL_SIZE = ATLAS_TILE_INNER + ATLAS_TILE_PAD * 2; // 32
export const ATLAS_PIXELS = ATLAS_GRID_SIZE * ATLAS_CELL_SIZE; // 512

// Directional face brightness multipliers (authentic Minecraft look)
export const FACE_SHADE = Object.freeze({
  TOP: 1.0,    // +Y
  SOUTH: 0.8,  // +Z
  NORTH: 0.8,  // -Z
  EAST: 0.6,   // +X
  WEST: 0.6,   // -X
  BOTTOM: 0.5, // -Y
});

// Smooth Voxel Ambient Occlusion levels (0 = darkest corner, 3 = unoccluded)
export const AO_CURVE = Object.freeze([0.48, 0.68, 0.84, 1.0]);

// Camera modes (cycled via F5 / Camera HUD button)
export const CAMERA_MODES = Object.freeze({
  FIRST_PERSON: 0,
  THIRD_PERSON_BACK: 1,
  THIRD_PERSON_FRONT: 2,
});

// Autosave interval
export const AUTOSAVE_INTERVAL_MS = 15000;
