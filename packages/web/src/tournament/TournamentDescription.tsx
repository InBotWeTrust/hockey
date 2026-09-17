import { Fragment } from 'react';

export const DEFAULT_TOURNAMENT_DESCRIPTION =
  'Турнир для тех, кто уже считает этот лёд в этой игре своим.\nБросок за броском, серия за серией — до финальной сирены.';

function renderInlineMarkdown(value: string) {
  return value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}

export function TournamentDescription({ value }: { value: string }) {
  return (
    <div className="tournament-details__description">
      {value.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>
          {paragraph.split('\n').map((line, lineIndex) => (
            <Fragment key={lineIndex}>
              {lineIndex > 0 && <br />}
              {renderInlineMarkdown(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
