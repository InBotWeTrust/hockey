import { z } from 'zod';

export type OnboardingChainKey = 'beginner' | 'amateur';

export const onboardingTutorialConfigSchema = z
  .object({
    shooterFrequency: z.number().min(0.05).max(2),
    goalieFrequency: z.number().min(0.05).max(2),
    goalFrequency: z.number().min(0.05).max(2),
  })
  .strict();

export const onboardingStepInputSchema = z.discriminatedUnion('kind', [
  z.object({
    position: z.number().int().min(1).max(100),
    kind: z.literal('informational'),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    ctaLabel: z.string().trim().min(1).max(40),
    mediaObjectId: z.string().uuid(),
  }),
  z.object({
    position: z.number().int().min(1).max(100),
    kind: z.literal('tutorial_shot'),
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(1000),
    ctaLabel: z.string().trim().min(1).max(40),
    tutorial: onboardingTutorialConfigSchema,
  }),
]);

export type OnboardingStepDTO =
  | {
      id: string;
      position: number;
      kind: 'informational';
      title: string;
      description: string;
      ctaLabel: string;
      imageUrl: string;
    }
  | {
      id: string;
      position: number;
      kind: 'tutorial_shot';
      title: string;
      description: string;
      ctaLabel: string;
      tutorial: {
        shooterFrequency: number;
        goalieFrequency: number;
        goalFrequency: number;
      };
    };

export interface OnboardingRequiredDTO {
  required: null | {
    chain: OnboardingChainKey;
    versionId: string;
    steps: OnboardingStepDTO[];
  };
}
