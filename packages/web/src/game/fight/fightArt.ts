// Authored atlas frames with a shared skate baseline; no gameplay data.
export const FIGHT_ART = {
  source: {
    width: 1536,
    height: 1024,
  },
  canvas: {
    width: 384,
    height: 512,
  },
  // Pose-specific landmarks in the normalized canvas, relative to the skate anchor.
  landmarks: {
    crouch: { head:{x:27,y:-259},body:{x:6,y:-175},contact:{x:27,y:-259} },
    crouch_block: { head:{x:25,y:-252},body:{x:5,y:-173},contact:{x:25,y:-252} },
    crouch_attack: { head:{x:22,y:-257},body:{x:5,y:-175},contact:{x:170,y:-168} },
    idle: { head: { x: 34, y: -344 }, body: { x: 15, y: -222 }, contact: { x: 34, y: -344 } },
    attack_head: {
      head: { x: 11, y: -346 },
      body: { x: -7, y: -225 },
      contact: { x: 163, y: -324 },
    },
    attack_body: {
      head: { x: 41, y: -286 },
      body: { x: 7, y: -188 },
      contact: { x: 120, y: -202 },
    },
    block_head: { head: { x: 26, y: -348 }, body: { x: 2, y: -222 }, contact: { x: 26, y: -348 } },
    block_body: { head: { x: 34, y: -331 }, body: { x: 16, y: -216 }, contact: { x: 16, y: -216 } },
    hit: { head: { x: -83, y: -334 }, body: { x: -19, y: -210 }, contact: { x: -83, y: -334 } },
    lose: { head: { x: 24, y: -224 }, body: { x: -12, y: -137 }, contact: { x: 24, y: -224 } },
  },
  frames: {
    crouch: {x:0,y:0,width:384,height:512,offsetX:0,offsetY:0},
    crouch_block: {x:384,y:0,width:384,height:512,offsetX:0,offsetY:0},
    crouch_attack: {x:768,y:0,width:384,height:512,offsetX:0,offsetY:0},
    idle: {
      x: 62,
      y: 76,
      width: 257,
      height: 405,
      offsetX: 62,
    },
    attack_head: {
      x: 428,
      y: 77,
      width: 338,
      height: 404,
      offsetX: 44,
    },
    attack_body: {
      x: 803,
      y: 133,
      width: 307,
      height: 347,
      offsetX: 35,
    },
    block_head: {
      x: 1200,
      y: 77,
      width: 257,
      height: 404,
      offsetX: 48,
    },
    block_body: {
      x: 56,
      y: 562,
      width: 278,
      height: 393,
      offsetX: 56,
    },
    hit: {
      x: 445,
      y: 566,
      width: 300,
      height: 390,
      offsetX: 61,
    },
    lose: {
      x: 815,
      y: 653,
      width: 248,
      height: 289,
      offsetX: 47,
    },
  },
} as const;
