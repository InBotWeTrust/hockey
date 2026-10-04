import { z } from 'zod';
import { ARSENICH_DESTINATION_KEYS } from './destinationRegistry.js';

export const arsenichDestinationKeySchema = z.enum(ARSENICH_DESTINATION_KEYS);
export const arsenichIntroWindowSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(1000),
    ctaLabel: z.string().trim().min(1).max(40),
  })
  .strict();
export const arsenichIntroWindowsSchema = z.array(arsenichIntroWindowSchema).min(1).max(2);

export interface ArsenichDestinationIntroDTO {
  destinationKey: z.infer<typeof arsenichDestinationKeySchema>;
  revision: number;
  speaker: 'stranger';
  windows: z.infer<typeof arsenichIntroWindowsSchema>;
}
