export const BlockType = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  COBBLESTONE: 8,
  BEDROCK: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  DIAMOND_ORE: 12,
  PLANKS: 13,
  SNOW: 14,
  GLASS: 15,
};

// Pre-computed lookup tables (16 block types)
// TRANSPARENT_LUT[bt] = 1 for AIR, WATER, LEAVES, GLASS
export const TRANSPARENT_LUT = new Uint8Array(16);
TRANSPARENT_LUT[BlockType.AIR] = 1;
TRANSPARENT_LUT[BlockType.WATER] = 1;
TRANSPARENT_LUT[BlockType.LEAVES] = 1;
TRANSPARENT_LUT[BlockType.GLASS] = 1;

// SOLID_LUT[bt] = 1 for everything except AIR and WATER
export const SOLID_LUT = new Uint8Array(16);
for (let i = 0; i < 16; i++) SOLID_LUT[i] = 1;
SOLID_LUT[BlockType.AIR] = 0;
SOLID_LUT[BlockType.WATER] = 0;

// LIQUID_LUT[bt] = 1 only for WATER
export const LIQUID_LUT = new Uint8Array(16);
LIQUID_LUT[BlockType.WATER] = 1;

// TEXTURE_LUT[bt * 3 + faceId] — faceId: 0=top, 1=side, 2=bottom
export const TEXTURE_LUT = new Uint8Array(16 * 3);
function setTex(bt, top, side, bottom) {
  TEXTURE_LUT[bt * 3]     = top;
  TEXTURE_LUT[bt * 3 + 1] = side;
  TEXTURE_LUT[bt * 3 + 2] = bottom;
}
setTex(BlockType.GRASS, 0, 1, 2);
setTex(BlockType.DIRT, 2, 2, 2);
setTex(BlockType.STONE, 3, 3, 3);
setTex(BlockType.SAND, 4, 4, 4);
setTex(BlockType.WATER, 5, 5, 5);
setTex(BlockType.WOOD, 6, 7, 6);
setTex(BlockType.LEAVES, 8, 8, 8);
setTex(BlockType.COBBLESTONE, 9, 9, 9);
setTex(BlockType.BEDROCK, 10, 10, 10);
setTex(BlockType.COAL_ORE, 11, 11, 11);
setTex(BlockType.IRON_ORE, 12, 12, 12);
setTex(BlockType.DIAMOND_ORE, 13, 13, 13);
setTex(BlockType.PLANKS, 14, 14, 14);
setTex(BlockType.SNOW, 15, 15, 15);
setTex(BlockType.GLASS, 16, 16, 16);

export function getBlockTexture(blockType, faceId) {
  return TEXTURE_LUT[blockType * 3 + faceId];
}

export function isTransparent(blockType) {
  return TRANSPARENT_LUT[blockType];
}

export function isSolid(blockType) {
  return SOLID_LUT[blockType];
}

export function isLiquid(blockType) {
  return LIQUID_LUT[blockType];
}

// Block names for HUD display
export const blockNames = {
  [BlockType.GRASS]: 'Grass',
  [BlockType.DIRT]: 'Dirt',
  [BlockType.STONE]: 'Stone',
  [BlockType.SAND]: 'Sand',
  [BlockType.WOOD]: 'Wood',
  [BlockType.LEAVES]: 'Leaves',
  [BlockType.COBBLESTONE]: 'Cobblestone',
  [BlockType.PLANKS]: 'Planks',
  [BlockType.SNOW]: 'Snow',
  [BlockType.GLASS]: 'Glass',
};

// Default hotbar blocks
export const hotbarBlocks = [
  BlockType.GRASS,
  BlockType.DIRT,
  BlockType.STONE,
  BlockType.COBBLESTONE,
  BlockType.PLANKS,
  BlockType.WOOD,
  BlockType.SAND,
  BlockType.LEAVES,
  BlockType.GLASS,
];
