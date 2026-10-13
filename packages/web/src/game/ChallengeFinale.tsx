import { useEffect, useState } from 'react';
import { versionBonusGameArtwork } from './bonusGameArtwork.js';
import './challengeFinale.css';

export function ChallengeFinale({
  outcome,
  location = 'beach',
}: {
  outcome: 'completed' | 'failed';
  location?: 'beach' | 'ski' | 'cyberpunk';
}): JSX.Element {
  const [frame, setFrame] = useState(0);
  const [brokenFrames, setBrokenFrames] = useState<number[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFrame(1), 2500);
    return () => window.clearTimeout(timer);
  }, []);
  const won = outcome === 'completed';
  const name = won ? 'win' : 'loss';
  const beachCopy = won
    ? 'Последняя шайба в воротах! Ты успел убежать с пляжа, прежде чем волна залила каток.'
    : 'Прилив оказался быстрее. Вода затопила каток, и ты остался сидеть на льду в луже. В следующий раз успеешь.';
  const beachDescriptions = won
    ? [
        'Игрок в красно-синей форме убегает с пляжа',
        'Игрок издалека смотрит на разрушенный и залитый каток',
      ]
    : [
        'Игрок в красно-синей форме смотрит на приближающуюся волну',
        'Игрок сидит в луже на залитом катке',
      ];
  const landscapeCopy =
    location === 'beach'
      ? beachCopy
      : won
        ? 'Последняя шайба в воротах! Ты успел уйти с катка, прежде чем лавина засыпала лёд. Теперь можно перевести дух.'
        : 'Лавина накрыла каток. Ты остался сидеть в снегу, а матч пришлось закончить. В\u00a0следующий раз успеешь.';
  const landscapeDescriptions =
    location === 'beach'
      ? beachDescriptions
      : won
        ? [
            'Игрок в красно-синей форме убегает со льда перед лавиной',
            'Игрок с безопасной террасы смотрит на засыпанный каток',
          ]
        : ['Игрок смотрит на надвигающуюся лавину', 'Игрок сидит в снегу на засыпанном катке'];
  const copy =
    location === 'cyberpunk'
      ? won
        ? 'Последняя шайба в воротах! Ты успел выбраться со льда, прежде чем сеть перегорела и весь двор погрузился во тьму.'
        : 'Магниты удержали тебя на льду, а разряд сбил с ног. Сеть перегорела, и матч закончился. В\u00a0следующий раз успеешь.'
      : landscapeCopy;
  const descriptions =
    location === 'cyberpunk'
      ? won
        ? [
            'Игрок убегает со льда, магнитные полосы искрят',
            'Игрок за пределами погасшего катка, щитки дымятся',
          ]
        : [
            'Магниты удерживают коньки игрока, по полосе проходит разряд',
            'Игрок сидит на обесточенном катке рядом с дымящимся щитком',
          ]
      : landscapeDescriptions;
  return (
    <section className="challenge-result-story" aria-label="Финал истории">
      <div className="challenge-result-story__artwork">
        {[0, 1].map(
          (index) =>
            !brokenFrames.includes(index) && (
              <img
                key={index}
                className={`challenge-result-story__image${frame === index ? ' challenge-result-story__image--active' : ''}`}
                aria-hidden={frame !== index}
                alt={descriptions[index]}
                src={versionBonusGameArtwork(`/bonus-games/finales/${location}-${name}-${index + 1}.webp`)}
                onError={() => setBrokenFrames((previous) => [...previous, index])}
              />
            ),
        )}
      </div>
      <p className="modal-copy bonus-game-preview-modal__story">{copy}</p>
    </section>
  );
}
