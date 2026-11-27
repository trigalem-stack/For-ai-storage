// Authentic 16x16 Minecraft-style procedural pixel art generators for all Stage 5 items.

function clampByte(n) {
  return n < 0 ? 0 : n > 255 ? 255 : n | 0;
}

function shade(rgb, delta) {
  return [clampByte(rgb[0] + delta), clampByte(rgb[1] + delta), clampByte(rgb[2] + delta), rgb[3] ?? 255];
}

const TOOL_PALETTES = {
  wood: { main: [156, 114, 62], light: [188, 144, 86], dark: [104, 72, 36] },
  stone: { main: [134, 134, 138], light: [170, 170, 174], dark: [86, 86, 92] },
  iron: { main: [212, 216, 222], light: [248, 250, 255], dark: [142, 148, 158] },
  gold: { main: [246, 206, 54], light: [255, 244, 136], dark: [186, 132, 24] },
  diamond: { main: [68, 224, 212], light: [152, 252, 244], dark: [28, 152, 148] },
};

const ARMOR_PALETTES = {
  leather: { main: [164, 98, 56], light: [204, 138, 86], dark: [112, 62, 32], rim: [74, 40, 18] },
  iron: { main: [208, 212, 220], light: [246, 248, 252], dark: [128, 134, 144], rim: [86, 92, 102] },
  gold: { main: [246, 204, 52], light: [255, 242, 142], dark: [182, 128, 24], rim: [132, 86, 12] },
  diamond: { main: [72, 222, 210], light: [162, 252, 246], dark: [28, 148, 144], rim: [16, 102, 102] },
};

const HANDLE_COLORS = {
  s: [134, 96, 50, 255],
  d: [92, 64, 30, 255],
  h: [166, 124, 70, 255],
};

function makeMaskLookup(rows, paletteMap) {
  return (x, y) => {
    const ch = rows[y]?.[x] || '.';
    if (ch === '.' || ch === ' ') return [0, 0, 0, 0];
    return paletteMap[ch] || [0, 0, 0, 0];
  };
}

const TOOL_TEMPLATES = {
  pickaxe: [
    '................',
    '......MMMMMM....',
    '....MMLLLLLLMM..',
    '...MML......LMM.',
    '..MM..........DM',
    '..D..........dMM',
    '............dh.M',
    '...........dh...',
    '..........dh....',
    '.........dh.....',
    '........dh......',
    '.......dh.......',
    '......dh........',
    '.....dh.........',
    '....ds..........',
    '................',
  ],
  axe: [
    '................',
    '........MMMM....',
    '......MMLLLLMM..',
    '.....MLLLLLLLMM.',
    '.....MLLLMMMMDM.',
    '.....MLLMD..dhM.',
    '......MMM..dh...',
    '..........dh....',
    '.........dh.....',
    '........dh......',
    '.......dh.......',
    '......dh........',
    '.....dh.........',
    '....dh..........',
    '...ds...........',
    '................',
  ],
  shovel: [
    '................',
    '..........MMMM..',
    '.........MLLLLm.',
    '........MLLLLLM.',
    '........MLLLMM..',
    '........MMMDM...',
    '.........dh.....',
    '........dh......',
    '.......dh.......',
    '......dh........',
    '.....dh.........',
    '....dh..........',
    '...dh...........',
    '..ds............',
    '................',
    '................',
  ],
  sword: [
    '................',
    '............MMM.',
    '...........MLLM.',
    '..........MLLMD.',
    '.........MLLMD..',
    '........MLLMD...',
    '.......MLLMD....',
    '..MM..MLLMD.....',
    '...MMMLLMD......',
    '....MMMMD.......',
    '...dhMMM........',
    '..dh..MM........',
    '.dh.............',
    'ds..............',
    '................',
    '................',
  ],
  hoe: [
    '................',
    '.....MMMMMMM....',
    '...MMLLLLLLLM...',
    '..MML......DM...',
    '..MD.......dh...',
    '..........dh....',
    '.........dh.....',
    '........dh......',
    '.......dh.......',
    '......dh........',
    '.....dh.........',
    '....dh..........',
    '...dh...........',
    '..ds............',
    '................',
    '................',
  ],
};

const ARMOR_TEMPLATES = {
  helmet: [
    '................',
    '................',
    '................',
    '....RRRRRRRR....',
    '...RLLLLLLLLR...',
    '..RLMMMMMMMMMR..',
    '..RMMDDDDDDDDMR.',
    '..RMD........DR.',
    '..RMD........DR.',
    '..RMD........DR.',
    '..RRR........RR.',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  chestplate: [
    '................',
    '..RRR......RRR..',
    '.RLLLR....RLLLR.',
    '.RLMMR....RMMLR.',
    '.RMMMRRRRRRMMMR.',
    '.RMMMMMMMMMMMMR.',
    '..RMMLLLLLLMMR..',
    '..RMMDDDDDDMMR..',
    '..RMMMMMMMMMMR..',
    '..RMMMMMMMMMMR..',
    '..RMMDDDDDDMMR..',
    '..RMMMMMMMMMMR..',
    '..RRRRRRRRRRRR..',
    '................',
    '................',
    '................',
  ],
  leggings: [
    '................',
    '..RRRRRRRRRRRR..',
    '..RLLLLLLLLLLR..',
    '..RMMMMMMMMMMR..',
    '..RMMDDDDDDMMR..',
    '..RMMMRRRRMMMR..',
    '..RMMR....RMMR..',
    '..RMMR....RMMR..',
    '..RMMR....RMMR..',
    '..RMDR....RDMR..',
    '..RMDR....RDMR..',
    '..RMDR....RDMR..',
    '..RRRR....RRRR..',
    '................',
    '................',
    '................',
  ],
  boots: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..RRRR....RRRR..',
    '..RLLR....RLLR..',
    '..RMMR....RMMR..',
    '..RMDR....RDMR..',
    '.RMMDR....RDMMR.',
    '.RMMMR....RMMMR.',
    '.RDDDR....RDDDR.',
    '.RRRRR....RRRRR.',
    '................',
    '................',
    '................',
  ],
};

export function registerAllItemSprites(atlas) {
  // Materials
  atlas.addTile('item_stick', makeMaskLookup([
    '................',
    '.............h..',
    '............hd..',
    '...........hd...',
    '..........hd....',
    '.........hd.....',
    '........hd......',
    '.......hd.......',
    '......hd........',
    '.....hd.........',
    '....hd..........',
    '...hd...........',
    '..sd............',
    '.s..............',
    '................',
    '................',
  ], HANDLE_COLORS));

  atlas.addTile('item_coal', makeMaskLookup([
    '................',
    '................',
    '......oooo......',
    '....oobbbboo....',
    '...obbccccbbo...',
    '..obccbbbbbcco..',
    '..obcbhhbbbcco..',
    '..obbbbbccccco..',
    '..ocbbbbccccco..',
    '...occcccccoo...',
    '....oocccooo....',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [18, 18, 22, 255],
    b: [42, 42, 48, 255],
    c: [64, 64, 72, 255],
    h: [96, 98, 108, 255],
  }));

  atlas.addTile('item_charcoal', makeMaskLookup([
    '................',
    '................',
    '.....ooooo......',
    '...oobbbbboo....',
    '..obbccbbccbo...',
    '..obcchhbbcco...',
    '..obbbbbcccco...',
    '..obbccccbbco...',
    '...occccccbo....',
    '....ooccooo.....',
    '.....oooo.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [24, 20, 18, 255],
    b: [56, 48, 42, 255],
    c: [82, 70, 60, 255],
    h: [112, 98, 84, 255],
  }));

  const registerIngot = (name, pal) => {
    atlas.addTile(name, makeMaskLookup([
      '................',
      '................',
      '................',
      '......oooooo....',
      '....oollllllo...',
      '...olllllllmdo..',
      '..olllmmmmmmddo.',
      '..olmmmmddddmdo.',
      '..ommmmddddddo..',
      '...odddddddoo...',
      '....oooooooo....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], pal));
  };

  registerIngot('item_iron_ingot', {
    o: [76, 80, 88, 255],
    l: [244, 246, 250, 255],
    m: [196, 202, 212, 255],
    d: [132, 138, 148, 255],
  });

  registerIngot('item_gold_ingot', {
    o: [122, 78, 12, 255],
    l: [255, 244, 126, 255],
    m: [244, 198, 42, 255],
    d: [188, 128, 18, 255],
  });

  atlas.addTile('item_diamond', makeMaskLookup([
    '................',
    '................',
    '.....oooooo.....',
    '...oolllllloo...',
    '..olllllmmmmmo..',
    '..olllmmhhmmmo..',
    '..olmmmmmmmmdo..',
    '...ommmmmmdoo...',
    '....ommmddoo....',
    '.....ommmdo.....',
    '......omdo......',
    '.......oo.......',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [20, 108, 110, 255],
    l: [158, 252, 246, 255],
    m: [64, 224, 214, 255],
    h: [232, 255, 255, 255],
    d: [32, 158, 156, 255],
  }));

  atlas.addTile('item_emerald', makeMaskLookup([
    '................',
    '......oooo......',
    '....oolllloo....',
    '...olllhhllmo...',
    '...ollmmmmmdo...',
    '...olmmmmdddo...',
    '...olmmmmdddo...',
    '...ommmmddddo...',
    '....oddddddo....',
    '.....odddoo.....',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [14, 86, 36, 255],
    l: [118, 246, 134, 255],
    h: [204, 255, 212, 255],
    m: [38, 206, 86, 255],
    d: [18, 138, 52, 255],
  }));

  atlas.addTile('item_lapis', makeMaskLookup([
    '................',
    '................',
    '.....ooooo......',
    '...oolbbbloo....',
    '..olbhhhhbbdo...',
    '..obbhbbbbddo...',
    '..obbbbbbdddo...',
    '...obbbddddo....',
    '....oodddoo.....',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [18, 34, 102, 255],
    l: [86, 138, 238, 255],
    b: [42, 84, 198, 255],
    h: [134, 186, 255, 255],
    d: [24, 52, 146, 255],
  }));

  atlas.addTile('item_redstone', makeMaskLookup([
    '................',
    '................',
    '.......oo.......',
    '.....oorroo.....',
    '....orrhhroo....',
    '...orrrrrddoo...',
    '..orrrrrrrdddo..',
    '..orrrdddddddo..',
    '...oodddddddo...',
    '....ooodddoo....',
    '.......ooo......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [98, 10, 10, 255],
    r: [228, 32, 24, 255],
    h: [255, 132, 118, 255],
    d: [158, 16, 12, 255],
  }));

  atlas.addTile('item_flint', makeMaskLookup([
    '................',
    '................',
    '.......ooo......',
    '......ohbbo.....',
    '.....ohbbbdo....',
    '....ohbbbddo....',
    '...ohbbbdddo....',
    '...obbbddddo....',
    '....obddddo.....',
    '.....odddo......',
    '......ooo.......',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [26, 28, 32, 255],
    h: [132, 136, 144, 255],
    b: [82, 86, 94, 255],
    d: [48, 50, 56, 255],
  }));

  atlas.addTile('item_clay_ball', makeMaskLookup([
    '................',
    '................',
    '.....ooooo......',
    '...oollllbo.....',
    '..olllllbbbo....',
    '..ollllbbbdo....',
    '..obbbbbdddo....',
    '...obbbdddo.....',
    '....ooddoo......',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [88, 96, 108, 255],
    l: [184, 194, 208, 255],
    b: [152, 162, 176, 255],
    d: [118, 126, 138, 255],
  }));

  registerIngot('item_brick', {
    o: [96, 36, 26, 255],
    l: [198, 102, 76, 255],
    m: [168, 72, 50, 255],
    d: [128, 48, 34, 255],
  });

  atlas.addTile('item_apple', makeMaskLookup([
    '................',
    '........oo......',
    '.......oggo.....',
    '....oooo.oo.....',
    '...orrrooroo....',
    '..orrhrrrrrro...',
    '..orrhrrrrrrdo..',
    '..orrrrrrrrrdo..',
    '..orrrrrrrrddo..',
    '...orrrrrdddo...',
    '....oorrddoo....',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [92, 16, 16, 255],
    g: [76, 148, 42, 255],
    r: [222, 34, 34, 255],
    h: [255, 144, 144, 255],
    d: [156, 20, 20, 255],
  }));

  // 5 tiers x 5 tool shapes
  const tierNames = [
    ['wooden', 'wood'],
    ['stone', 'stone'],
    ['iron', 'iron'],
    ['golden', 'gold'],
    ['diamond', 'diamond'],
  ];
  for (const [prefix, palKey] of tierNames) {
    const p = TOOL_PALETTES[palKey];
    const palMap = {
      M: [...p.main, 255],
      m: shade(p.main, -18),
      L: [...p.light, 255],
      D: [...p.dark, 255],
      s: HANDLE_COLORS.s,
      d: HANDLE_COLORS.d,
      h: HANDLE_COLORS.h,
    };
    for (const [toolType, mask] of Object.entries(TOOL_TEMPLATES)) {
      atlas.addTile(`item_${prefix}_${toolType}`, makeMaskLookup(mask, palMap));
    }
  }

  // Armor sprites
  for (const [tierPrefix, palKey] of [['leather', 'leather'], ['iron', 'iron'], ['golden', 'gold'], ['diamond', 'diamond']]) {
    const p = ARMOR_PALETTES[palKey];
    const palMap = {
      M: [...p.main, 255],
      L: [...p.light, 255],
      D: [...p.dark, 255],
      R: [...p.rim, 255],
    };
    for (const [slot, mask] of Object.entries(ARMOR_TEMPLATES)) {
      atlas.addTile(`item_${tierPrefix}_${slot}`, makeMaskLookup(mask, palMap));
    }
  }

  // Utility tools
  atlas.addTile('item_bucket', makeMaskLookup([
    '................',
    '................',
    '....oooooooo....',
    '...ollllllllo...',
    '..olmmmmmmmmmo..',
    '..omddddddddmo..',
    '..ommdmmmmddmo..',
    '...omdmmmmddo...',
    '...ommmmmdddo...',
    '....ommmdddo....',
    '....ommmdddo....',
    '.....ooddoo.....',
    '......oooo......',
    '................',
    '................',
    '................',
  ], {
    o: [68, 72, 80, 255],
    l: [238, 242, 248, 255],
    m: [178, 184, 194, 255],
    d: [118, 124, 134, 255],
  }));

  atlas.addTile('item_flint_and_steel', makeMaskLookup([
    '................',
    '................',
    '......oooo......',
    '....oolllloo....',
    '...ollmmmmmdo...',
    '...olmd..dmddo..',
    '..........ofbo..',
    '...ooo....offo..',
    '..ohffo..offdo..',
    '..offbbooffdo...',
    '...offffffdo....',
    '....oooooo......',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [42, 44, 52, 255],
    l: [236, 240, 246, 255],
    m: [176, 182, 192, 255],
    d: [96, 100, 110, 255],
    f: [76, 80, 88, 255],
    b: [56, 58, 66, 255],
    h: [255, 206, 92, 255],
  }));

  atlas.addTile('item_shears', makeMaskLookup([
    '................',
    '................',
    '..........ooo...',
    '.........olllo..',
    '........olllmo..',
    '...ooo..olmdo...',
    '..olllo.omdo....',
    '..olllmmmdo.....',
    '...ooolmddo.....',
    '.....ooorrro....',
    '....orrroooro...',
    '...orroo..orro..',
    '...orro...orro..',
    '....ooo....ooo..',
    '................',
    '................',
  ], {
    o: [62, 66, 74, 255],
    l: [236, 240, 246, 255],
    m: [176, 182, 192, 255],
    d: [118, 124, 134, 255],
    r: [198, 42, 36, 255],
  }));

  // Stage 6 Foods, Farming, Leather & Copper Sprites
  atlas.addTile('item_golden_apple', makeMaskLookup([
    '................',
    '........oo......',
    '.......oggo.....',
    '....oooo.oo.....',
    '...oyyyooyoo....',
    '..oyyhyyyyyyyo..',
    '..oyyhyyyyyydo..',
    '..oyyyyyyyyydo..',
    '..oyyyyyyyyddo..',
    '...oydddddddo...',
    '....ooodddoo....',
    '.......ooo......',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [134, 86, 12, 255],
    g: [98, 148, 44, 255],
    y: [246, 206, 52, 255],
    h: [255, 248, 164, 255],
    d: [192, 134, 22, 255],
  }));

  atlas.addTile('item_wheat_seeds', makeMaskLookup([
    '................',
    '................',
    '................',
    '.....oo....oo...',
    '....olgo..olgo..',
    '....oggd..oggd..',
    '.....oo....oo...',
    '..oo.....oo.....',
    '.olgo...olgo....',
    '.oggd...oggd....',
    '..oo.....oo.....',
    '......oo........',
    '.....olgo.......',
    '.....oggd.......',
    '......oo........',
    '................',
  ], {
    o: [52, 82, 24, 255],
    l: [164, 212, 82, 255],
    g: [112, 166, 46, 255],
    d: [76, 118, 32, 255],
  }));

  atlas.addTile('item_wheat', makeMaskLookup([
    '................',
    '..........ooo...',
    '.........oyyyo..',
    '........oyhdyo..',
    '.......oyyyo....',
    '......oyhdyo....',
    '.....oyyyo......',
    '....oyhdyo......',
    '...oyyyo........',
    '...ossso........',
    '..osssdo........',
    '..osdo..........',
    '.osdo...........',
    '.oo.............',
    '................',
    '................',
  ], {
    o: [118, 92, 24, 255],
    y: [222, 190, 62, 255],
    h: [248, 226, 114, 255],
    d: [176, 142, 38, 255],
    s: [196, 168, 72, 255],
  }));

  atlas.addTile('item_bread', makeMaskLookup([
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '...oolllllloo...',
    '..ollllbbbbbbo..',
    '..olbbbbbbddbo..',
    '..obbbdddddddbo.',
    '...ooddddddddo..',
    '....ooooooooo...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [96, 56, 20, 255],
    l: [224, 174, 86, 255],
    b: [194, 134, 52, 255],
    d: [148, 92, 30, 255],
  }));

  atlas.addTile('item_bowl', makeMaskLookup([
    '................',
    '................',
    '................',
    '................',
    '..oooooooooooo..',
    '.ollmmmmmmmmddo.',
    '.ommmmmmmdddddo.',
    '..ommmmddddddo..',
    '...oodddddddo...',
    '.....ooooooo....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [78, 52, 24, 255],
    l: [188, 142, 84, 255],
    m: [152, 108, 58, 255],
    d: [112, 74, 34, 255],
  }));

  atlas.addTile('item_mushroom_stew', makeMaskLookup([
    '................',
    '................',
    '....oooooooo....',
    '..oorrssssrrbo..',
    '.oorssrrbbssbbo.',
    '..oooooooooooo..',
    '.olmmmmmmmmdddo.',
    '..ommmdddddddo..',
    '...oodddddddo...',
    '.....ooooooo....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [78, 52, 24, 255],
    l: [188, 142, 84, 255],
    m: [152, 108, 58, 255],
    d: [112, 74, 34, 255],
    r: [196, 66, 52, 255],
    s: [216, 172, 118, 255],
    b: [142, 92, 54, 255],
  }));

  const registerMeat = (key, raw, cookedMode) => {
    const pal = cookedMode === 'pork'
      ? (raw
        ? { o: [128, 52, 58, 255], m: [236, 134, 142, 255], h: [255, 196, 200, 255], d: [196, 92, 100, 255] }
        : { o: [96, 48, 24, 255], m: [196, 118, 72, 255], h: [232, 176, 128, 255], d: [144, 78, 40, 255] })
      : cookedMode === 'beef'
      ? (raw
        ? { o: [108, 22, 24, 255], m: [198, 52, 54, 255], h: [244, 186, 182, 255], d: [152, 32, 34, 255] }
        : { o: [68, 30, 18, 255], m: [134, 68, 42, 255], h: [188, 122, 84, 255], d: [94, 42, 24, 255] })
      : cookedMode === 'chicken'
      ? (raw
        ? { o: [142, 96, 86, 255], m: [242, 194, 182, 255], h: [255, 228, 220, 255], d: [204, 148, 134, 255] }
        : { o: [114, 62, 22, 255], m: [208, 134, 62, 255], h: [244, 192, 114, 255], d: [158, 92, 34, 255] })
      : (raw
        ? { o: [118, 32, 36, 255], m: [212, 74, 78, 255], h: [248, 198, 198, 255], d: [164, 46, 50, 255] }
        : { o: [82, 42, 22, 255], m: [162, 94, 52, 255], h: [222, 184, 148, 255], d: [118, 64, 32, 255] });
    atlas.addTile(key, makeMaskLookup([
      '................',
      '................',
      '.....ooooo......',
      '...oohhhhmo.....',
      '..ohmmmmmmdo....',
      '..ommhhmmddo....',
      '..ommmmmdddo....',
      '...ommmdddo.....',
      '....oodddo......',
      '......ooo.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ], pal));
  };
  registerMeat('item_raw_porkchop', true, 'pork');
  registerMeat('item_cooked_porkchop', false, 'pork');
  registerMeat('item_raw_beef', true, 'beef');
  registerMeat('item_cooked_beef', false, 'beef');
  registerMeat('item_raw_chicken', true, 'chicken');
  registerMeat('item_cooked_chicken', false, 'chicken');
  registerMeat('item_raw_mutton', true, 'mutton');
  registerMeat('item_cooked_mutton', false, 'mutton');

  atlas.addTile('item_rotten_flesh', makeMaskLookup([
    '................',
    '................',
    '....ooooo.......',
    '...ogggmmo......',
    '..ogmmgmmmo.....',
    '..ommmggddo.....',
    '...ommmddo......',
    '....odddo.......',
    '.....ooo........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [66, 48, 24, 255],
    g: [118, 146, 62, 255],
    m: [148, 86, 56, 255],
    d: [104, 56, 34, 255],
  }));

  atlas.addTile('item_leather', makeMaskLookup([
    '................',
    '................',
    '...ooo....ooo...',
    '..olllo..olllo..',
    '..olmmmmmmmmlo..',
    '...ommmmmmmmo...',
    '...ommmmmmddo...',
    '..olmmmmdddddo..',
    '..olmmmddddmdo..',
    '...oooodddooo...',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [78, 42, 18, 255],
    l: [198, 132, 76, 255],
    m: [164, 96, 50, 255],
    d: [118, 64, 30, 255],
  }));

  atlas.addTile('item_raw_copper', makeMaskLookup([
    '................',
    '................',
    '......oooo......',
    '....oocccco.....',
    '...occgcccbo....',
    '..occggcccbbo...',
    '..occcccbbbdo...',
    '...occcbbddo....',
    '....ooddddo.....',
    '......oooo......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], {
    o: [88, 48, 28, 255],
    c: [224, 126, 74, 255],
    g: [76, 174, 142, 255],
    b: [192, 96, 52, 255],
    d: [142, 66, 36, 255],
  }));

  registerIngot('item_copper_ingot', {
    o: [108, 48, 22, 255],
    l: [248, 172, 118, 255],
    m: [212, 118, 70, 255],
    d: [158, 76, 38, 255],
  });
}
