import { z } from 'zod';
import { barOccupants, barLayoutErrors } from '@hockey/game-core';
const profile = z
  .object({
    name: z.string().min(1).max(80),
    role: z.string().max(80),
    description: z.string().max(240),
    avatar: z.string().nullable(),
    composition: z.string().nullable(),
  })
  .strict();
const profiles = z
  .object({
    daria: profile,
    grigory: profile,
    maria: profile,
    arsenich: profile,
    online: profile,
    oleg: profile,
    timofey: profile,
    veronika: profile,
    news: profile,
    broadcasts: profile,
  })
  .strict();
export const barLayoutSchema = z
  .object({
    slots: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            occupantId: z.enum(barOccupants).nullable(),
            x: z.number().min(0).max(100),
            y: z.number().min(0).max(100),
            scale: z.number().min(0.5).max(1),
          })
          .strict(),
      )
      .length(10),
    defaultSlotId: z.string(),
    profiles,
  })
  .strict()
  .superRefine((layout, ctx) => {
    for (const message of barLayoutErrors(layout))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  });
export const barLayoutWriteSchema = z
  .object({ revision: z.number().int().positive(), layout: barLayoutSchema })
  .strict();
