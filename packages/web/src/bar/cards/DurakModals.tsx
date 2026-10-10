import { X } from 'lucide-react';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import type { Game } from './rules.js';
export const art = (name: string) => `/bar/cards/${name}-v1.webp`;
export function MariaScene({
  variant = 'playing',
  label = 'Мария за карточным столом',
  result = false,
}: {
  variant?: string;
  label?: string;
  result?: boolean;
}) {
  return (
    <div
      className={`bonus-game-preview-modal__artwork durak-scene${result ? ' durak-scene--result' : ''}`}
      role="img"
      aria-label={label}
    >
      <img src={art(variant)} alt="" />
    </div>
  );
}
const closeButton = (onClose: () => void) => (
  <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
    <X size={15} />
  </button>
);
export function DurakLaunchModal({ onClose, onPlay }: { onClose: () => void; onPlay: () => void }) {
  return (
    <AccessibleModal
      title="Дурак с Марией"
      onRequestClose={onClose}
      cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
      headerAction={closeButton(onClose)}
    >
      <MariaScene label="Мария приглашает сыграть в карты" />
      <p className="modal-copy bonus-game-preview-modal__story">
        Мария составит тебе компанию за карточным столом. Обычный подкидной дурак: 36 карт, без
        ставок. Избавься от всех карт раньше соперницы.
      </p>
      <div className="modal-actions">
        <button className="modal-primary btn btn--cta" onClick={onPlay}>
          Играть
        </button>
      </div>
    </AccessibleModal>
  );
}
export function DurakResultModal({
  result,
  onReplay,
  onBack,
}: {
  result: Game['result'];
  onReplay: () => void;
  onBack: () => void;
}) {
  const title = result === 0 ? 'Ты выиграл' : result === 1 ? 'Ты проиграл' : 'Ничья';
  return (
    <AccessibleModal
      title={title}
      onRequestClose={onBack}
      cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
      headerAction={closeButton(onBack)}
    >
      <MariaScene
        variant={result === 0 ? 'player-win' : result === 1 ? 'player-loss' : 'playing'}
        label={title}
        result
      />
      <p className="modal-copy">
        {result === 0
          ? '«Хорошо сыграно! Давай ещё одну?»'
          : result === 1
            ? '«В этот раз моя взяла. Давай попробуем ещё?»'
            : '«Все карты ушли в отбой. Сыграем ещё?»'}
      </p>
      <div className="modal-actions">
        <button className="btn btn--ghost" onClick={onBack}>
          Вернуться в бар
        </button>
        <button className="modal-primary btn btn--cta" onClick={onReplay}>
          Повторить
        </button>
      </div>
    </AccessibleModal>
  );
}
