import { Container, Graphics, Text } from 'pixi.js';
import { PUCK_START } from '@hockey/game-core';
import type { Scale } from '../coords.js';

const JERSEY = 0x1a3a8a;
const JERSEY_DARK = 0x0e2460;
const HELMET = 0x0b1428;
const SKIN = 0xf1c7a8;
const STICK = 0x6d4a1e;
const STICK_BLADE = 0x0b0b0b;

export class Player {
  readonly container = new Container();
  private readonly shadow = new Graphics();
  private readonly body = new Graphics();
  private readonly jerseyNumber = new Text({
    text: '87',
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: 10,
      fontWeight: '700',
      fill: 0xffffff,
    },
  });

  constructor() {
    this.container.addChild(this.shadow);
    this.container.addChild(this.body);
    this.container.addChild(this.jerseyNumber);
    this.jerseyNumber.anchor.set(0.5);
  }

  update(scale: Scale, shooterX = PUCK_START.x): void {
    const s = scale.factor;
    const cx = shooterX;
    const cy = PUCK_START.y + 22;
    const px = cx * s + scale.offsetX;
    const py = cy * s + scale.offsetY;

    const bodyW = 30 * s;
    const bodyH = 34 * s;

    this.shadow.clear();
    this.shadow
      .ellipse(0, bodyH / 2 + 4 * s, bodyW * 0.55, 5 * s)
      .fill({ color: 0x0f172a, alpha: 0.22 });

    this.body.clear();

    this.body
      .moveTo(-bodyW * 0.35, -bodyH * 0.05)
      .lineTo(bodyW * 0.35, -bodyH * 0.05)
      .lineTo(bodyW * 0.48, bodyH * 0.5)
      .lineTo(-bodyW * 0.48, bodyH * 0.5)
      .closePath()
      .fill(JERSEY)
      .stroke({ color: JERSEY_DARK, width: 1.2 * s });

    this.body
      .roundRect(-bodyW * 0.58, -bodyH * 0.1, bodyW * 0.2, bodyH * 0.35, 2 * s)
      .fill(JERSEY)
      .roundRect(bodyW * 0.38, -bodyH * 0.1, bodyW * 0.2, bodyH * 0.35, 2 * s)
      .fill(JERSEY);
    this.body
      .circle(-bodyW * 0.52, bodyH * 0.3, bodyW * 0.13)
      .fill(SKIN)
      .circle(bodyW * 0.52, bodyH * 0.3, bodyW * 0.13)
      .fill(SKIN);

    this.body
      .circle(0, -bodyH * 0.35, bodyW * 0.32)
      .fill(HELMET)
      .stroke({ color: JERSEY_DARK, width: 1.2 * s });
    this.body
      .rect(-bodyW * 0.3, -bodyH * 0.45, bodyW * 0.6, 2 * s)
      .fill(0xcc3333);

    this.body
      .moveTo(bodyW * 0.5, bodyH * 0.35)
      .lineTo(bodyW * 1.8, -bodyH * 0.5)
      .stroke({ color: STICK, width: 2.5 * s, cap: 'round' });
    this.body
      .rect(bodyW * 1.7, -bodyH * 0.55, 14 * s, 5 * s)
      .fill(STICK_BLADE);

    this.jerseyNumber.style.fontSize = 10 * s;
    this.jerseyNumber.position.set(0, bodyH * 0.22);

    this.container.position.set(px, py);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
