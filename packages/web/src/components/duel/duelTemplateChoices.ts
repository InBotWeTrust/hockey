import type { AmateurDuelTemplate } from '../../api/amateurDuel.js';
export function duelTemplateChoices(templates: AmateurDuelTemplate[]) {
  return templates.flatMap((template) =>
    (template.duel_kind === 'marathon' ? [4000, 7000] as const : [undefined]).map((window) => ({
      template,
      value: window === undefined ? template.id : `${template.id}:${window}`,
      marathonWindow: window,
    })),
  );
}
