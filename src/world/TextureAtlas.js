import * as THREE from 'three';

const TEX_SIZE = 16; // each texture is 16x16 pixels
export const ATLAS_GRID = 5; // 5x5 grid
const ATLAS_SIZE = TEX_SIZE * ATLAS_GRID; // 64x64

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawPixel(ctx, x, y, r, g, b, a = 255) {
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(x, y, 1, 1);
}

function fillRect(ctx, x, y, w, h, r, g, b, a = 255) {
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(x, y, w, h);
}

function noise(rand, x, y) {
  return rand() > 0.5 ? 1 : 0;
}

function drawGrassTop(ctx, ox, oy) {
  const rand = seededRandom(42);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const g = 100 + Math.floor(rand() * 60);
      const r = 20 + Math.floor(rand() * 20);
      const b = 10;
      drawPixel(ctx, ox + x, oy + y, r, g, b);
    }
  }
}

function drawGrassSide(ctx, ox, oy) {
  const rand = seededRandom(123);
  // Bottom half - dirt
  for (let y = 4; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 130 + Math.floor(rand() * 30);
      drawPixel(ctx, ox + x, oy + y, base, base * 0.65, base * 0.35);
    }
  }
  // Top strip - green
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const g = 100 + Math.floor(rand() * 60);
      drawPixel(ctx, ox + x, oy + y, 30, g, 10);
    }
  }
  // Irregular grass edge
  for (let x = 0; x < TEX_SIZE; x++) {
    const depth = 3 + Math.floor(rand() * 3);
    const g = 90 + Math.floor(rand() * 50);
    drawPixel(ctx, ox + x, oy + depth, 30, g, 10);
  }
}

function drawDirt(ctx, ox, oy) {
  const rand = seededRandom(456);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 130 + Math.floor(rand() * 40);
      const dark = rand() < 0.15;
      const r = dark ? base * 0.7 : base;
      drawPixel(ctx, ox + x, oy + y, r, r * 0.65, r * 0.35);
    }
  }
}

function drawStone(ctx, ox, oy) {
  const rand = seededRandom(789);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 115 + Math.floor(rand() * 40);
      drawPixel(ctx, ox + x, oy + y, base, base, base);
    }
  }
  // Cracks
  for (let i = 0; i < 8; i++) {
    const sx = Math.floor(rand() * 14) + 1;
    const sy = Math.floor(rand() * 14) + 1;
    const len = 2 + Math.floor(rand() * 3);
    for (let j = 0; j < len; j++) {
      const px = sx + j;
      if (px < TEX_SIZE) drawPixel(ctx, ox + px, oy + sy, 80, 80, 80);
    }
  }
}

function drawSand(ctx, ox, oy) {
  const rand = seededRandom(321);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 210 + Math.floor(rand() * 30);
      drawPixel(ctx, ox + x, oy + y, base, base * 0.9, base * 0.6);
    }
  }
}

function drawWater(ctx, ox, oy) {
  const rand = seededRandom(555);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const b = 160 + Math.floor(rand() * 50);
      drawPixel(ctx, ox + x, oy + y, 30, 50 + Math.floor(rand() * 30), b, 180);
    }
  }
}

function drawWoodTop(ctx, ox, oy) {
  const rand = seededRandom(610);
  // Concentric rings
  const cx = 8, cy = 8;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const ring = Math.floor(dist) % 3;
      const base = ring === 0 ? 140 : ring === 1 ? 115 : 130;
      const n = Math.floor(rand() * 15);
      drawPixel(ctx, ox + x, oy + y, base + n, (base + n) * 0.7, (base + n) * 0.35);
    }
  }
}

function drawWoodSide(ctx, ox, oy) {
  const rand = seededRandom(620);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const stripe = (x + Math.floor(rand() * 2)) % 4 === 0;
      const base = stripe ? 100 : 130 + Math.floor(rand() * 20);
      drawPixel(ctx, ox + x, oy + y, base, base * 0.65, base * 0.3);
    }
  }
}

function drawLeaves(ctx, ox, oy) {
  const rand = seededRandom(700);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (rand() < 0.2) {
        // Transparent holes
        drawPixel(ctx, ox + x, oy + y, 0, 0, 0, 0);
      } else {
        const g = 80 + Math.floor(rand() * 80);
        drawPixel(ctx, ox + x, oy + y, 15 + Math.floor(rand() * 20), g, 10, 220);
      }
    }
  }
}

function drawCobblestone(ctx, ox, oy) {
  const rand = seededRandom(800);
  // Base stone
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 100 + Math.floor(rand() * 50);
      drawPixel(ctx, ox + x, oy + y, base, base, base);
    }
  }
  // Irregular shapes (darker patches)
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(rand() * 12);
    const sy = Math.floor(rand() * 12);
    const w = 2 + Math.floor(rand() * 4);
    const h = 2 + Math.floor(rand() * 4);
    for (let dy = 0; dy < h && sy + dy < TEX_SIZE; dy++) {
      for (let dx = 0; dx < w && sx + dx < TEX_SIZE; dx++) {
        drawPixel(ctx, ox + sx + dx, oy + sy + dy, 70 + Math.floor(rand() * 20), 70 + Math.floor(rand() * 20), 70 + Math.floor(rand() * 20));
      }
    }
  }
}

function drawBedrock(ctx, ox, oy) {
  const rand = seededRandom(900);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 30 + Math.floor(rand() * 50);
      drawPixel(ctx, ox + x, oy + y, base, base, base);
    }
  }
}

function drawOre(ctx, ox, oy, oreR, oreG, oreB, seed) {
  // Start with stone base
  drawStone(ctx, ox, oy);
  const rand = seededRandom(seed);
  // Add ore specks
  for (let i = 0; i < 12; i++) {
    const px = 2 + Math.floor(rand() * 12);
    const py = 2 + Math.floor(rand() * 12);
    if (rand() < 0.6) {
      drawPixel(ctx, ox + px, oy + py, oreR, oreG, oreB);
      // Cluster nearby
      if (px + 1 < TEX_SIZE) drawPixel(ctx, ox + px + 1, oy + py, oreR * 0.8, oreG * 0.8, oreB * 0.8);
      if (py + 1 < TEX_SIZE) drawPixel(ctx, ox + px, oy + py + 1, oreR * 0.9, oreG * 0.9, oreB * 0.9);
    }
  }
}

function drawPlanks(ctx, ox, oy) {
  const rand = seededRandom(1100);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const plank = Math.floor(y / 4);
      const edge = y % 4 === 0;
      const base = edge ? 120 : 170 + Math.floor(rand() * 20) - plank * 5;
      drawPixel(ctx, ox + x, oy + y, base, base * 0.7, base * 0.35);
    }
  }
}

function drawSnow(ctx, ox, oy) {
  const rand = seededRandom(1200);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const base = 230 + Math.floor(rand() * 25);
      drawPixel(ctx, ox + x, oy + y, base, base, base + 5 > 255 ? 255 : base + 5);
    }
  }
}

function drawGlass(ctx, ox, oy) {
  const rand = seededRandom(1300);
  // Clear to transparent first
  ctx.clearRect(ox, oy, TEX_SIZE, TEX_SIZE);
  // Draw border frame
  for (let x = 0; x < TEX_SIZE; x++) {
    for (let y = 0; y < TEX_SIZE; y++) {
      const onEdge = x === 0 || x === TEX_SIZE - 1 || y === 0 || y === TEX_SIZE - 1;
      const onInnerEdge = x === 1 || x === TEX_SIZE - 2 || y === 1 || y === TEX_SIZE - 2;
      if (onEdge) {
        // Outer border - light gray-blue
        const v = 180 + Math.floor(rand() * 20);
        drawPixel(ctx, ox + x, oy + y, v, v, v + 15, 255);
      } else if (onInnerEdge) {
        // Inner border highlight
        const v = 200 + Math.floor(rand() * 20);
        drawPixel(ctx, ox + x, oy + y, v, v + 5, v + 20, 240);
      } else {
        // Interior - checkerboard transparency pattern for see-through effect
        const checker = (x + y) % 2 === 0;
        if (checker) {
          // Light blue tint pixel (visible)
          const v = 210 + Math.floor(rand() * 30);
          drawPixel(ctx, ox + x, oy + y, v - 10, v, v + 20, 200);
        } else {
          // Transparent pixel (see through)
          drawPixel(ctx, ox + x, oy + y, 0, 0, 0, 0);
        }
      }
    }
  }
}

const drawFunctions = [
  drawGrassTop,     // 0
  drawGrassSide,    // 1
  drawDirt,         // 2
  drawStone,        // 3
  drawSand,         // 4
  drawWater,        // 5
  drawWoodTop,      // 6
  drawWoodSide,     // 7
  drawLeaves,       // 8
  drawCobblestone,  // 9
  drawBedrock,      // 10
  (ctx, ox, oy) => drawOre(ctx, ox, oy, 40, 40, 40, 1001),     // 11 coal
  (ctx, ox, oy) => drawOre(ctx, ox, oy, 200, 170, 130, 1002),  // 12 iron
  (ctx, ox, oy) => drawOre(ctx, ox, oy, 80, 220, 240, 1003),   // 13 diamond
  drawPlanks,       // 14
  drawSnow,         // 15
  drawGlass,        // 16
];

export function createTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  for (let i = 0; i < drawFunctions.length; i++) {
    const col = i % ATLAS_GRID;
    const row = Math.floor(i / ATLAS_GRID);
    const ox = col * TEX_SIZE;
    const oy = row * TEX_SIZE;
    drawFunctions[i](ctx, ox, oy);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return { texture, canvas };
}

export function getUVs(textureIndex) {
  const col = textureIndex % ATLAS_GRID;
  const row = Math.floor(textureIndex / ATLAS_GRID);
  const u0 = col / ATLAS_GRID;
  const v0 = 1 - (row + 1) / ATLAS_GRID;
  const u1 = (col + 1) / ATLAS_GRID;
  const v1 = 1 - row / ATLAS_GRID;
  return { u0, v0, u1, v1 };
}

// Pre-computed UV lookup table: 4 floats per texture (u0, v0, u1, v1)
const TOTAL_TEXTURES = ATLAS_GRID * ATLAS_GRID;
export const UV_TABLE = new Float32Array(TOTAL_TEXTURES * 4);
for (let i = 0; i < TOTAL_TEXTURES; i++) {
  const col = i % ATLAS_GRID;
  const row = Math.floor(i / ATLAS_GRID);
  UV_TABLE[i * 4]     = col / ATLAS_GRID;           // u0
  UV_TABLE[i * 4 + 1] = 1 - (row + 1) / ATLAS_GRID; // v0
  UV_TABLE[i * 4 + 2] = (col + 1) / ATLAS_GRID;     // u1
  UV_TABLE[i * 4 + 3] = 1 - row / ATLAS_GRID;       // v1
}
