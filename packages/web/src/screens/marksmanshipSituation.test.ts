import { describe, expect, it } from 'vitest';
import type { MarksmanshipV5Measurements } from '@hockey/game-core';
import { describeMarksmanshipV5Situation } from './marksmanshipSituation.js';

const base: MarksmanshipV5Measurements = {
  puckX: 120,
  goalMin: 100,
  goalMax: 180,
  goalieMin: 150,
  goalieMax: 223.76,
  shooterDirection: -1,
  goalDirection: 1,
  goalieDirection: 1,
};

describe('marksmanship V5 situation text', () => {
  it.each([
    [{ goalieMin: 104, goalieMax: 177, puckX: 101 }, 'Суперметкий', 'Слева от вратаря: внутренний просвет 4,0'],
    [{ goalieMin: 103, goalieMax: 176, puckX: 178 }, 'Суперметкий', 'Справа от вратаря: внутренний просвет 4,0'],
    [{ goalieMin: 130, goalieMax: 203.76, puckX: 128 }, 'На грани', 'Слева от вратаря: шайба в 2,0 от края, просвет 30,0'],
    [{ goalMin: 70, goalMax: 150, goalieMin: 100, goalieMax: 173.76, puckX: 85 }, 'Сложный в углу', 'У левого борта: внутренний просвет 30,0'],
    [{ goalMin: 410, goalMax: 490, goalieMin: 396.24, goalieMax: 470, puckX: 480 }, 'Сложный в углу', 'У правого борта: внутренний просвет 20,0'],
    [{ goalieMin: 120, goalieMax: 193.76, puckX: 110 }, 'За вратаря', 'Игрок влево, ворота и вратарь вправо; просвет слева 20,0'],
    [{ goalieMin: 86.24, goalieMax: 160, puckX: 170,
      shooterDirection: 1, goalDirection: -1, goalieDirection: -1 },
    'За вратаря', 'Игрок вправо, ворота и вратарь влево; просвет справа 20,0'],
    [{ goalieMin: 125, goalieMax: 198.76, puckX: 108,
      shooterDirection: 1, goalDirection: 1, goalieDirection: 1 },
    'Меткий', 'Слева от вратаря: внутренний просвет 25,0'],
    [{ goalieMin: 205, goalieMax: 278.76, puckX: 130, goalieDirection: 0 },
    'Противоход', 'Игрок влево, ворота вправо; внешний зазор 25,0'],
    [{ goalieMin: 6.24, goalieMax: 80, puckX: 130,
      shooterDirection: 1, goalDirection: -1, goalieDirection: 0 },
    'Противоход', 'Игрок вправо, ворота влево; внешний зазор 20,0'],
    [{ goalieMin: 174, goalieMax: 247.76, puckX: 120 }, 'Вратарь рядом', 'Слева от вратаря: широкий просвет 74,0'],
    [{ goalieMin: 185, goalieMax: 258.76, puckX: 130,
      shooterDirection: 1, goalDirection: 1 },
    'Вратарь рядом', 'Вратарь справа от ворот: внешний зазор 5,0'],
    [{ goalieMin: 152.4, goalieMax: 226.16, puckX: 120,
      shooterDirection: 1, goalDirection: 1 },
    'Простой', 'Слева от вратаря: просвет 52,4 — вне сложных порогов'],
    [{ goalieMin: 260, goalieMax: 333.76, puckX: 130,
      shooterDirection: 1, goalDirection: 1 },
    'Простой', 'Вратарь справа от ворот: внешний зазор 80,0 — вне сложных порогов'],
  ] as const)('describes a scored situation: %s', (overrides, name, reason) => {
    expect(describeMarksmanshipV5Situation({ ...base, ...overrides })).toEqual({ name, reason });
  });
});
