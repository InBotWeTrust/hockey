import { VisitorGameGate } from '../VisitorGameGate.js';
import { X } from 'lucide-react';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { computerOpponent, opponentArt, type ComputerOpponentId } from './computerOpponents.js';
import type { Game } from './rules.js';
export const art = (name: string) => `/bar/cards/${name}-v1.webp`;
export function MariaScene({
  variant = 'playing',
  label = 'Мария за карточным столом',
  result = false,
  opponentId = 'maria',
}: {
  variant?: string;
  label?: string;
  result?: boolean;
  opponentId?: ComputerOpponentId;
}) {
  return (
    <div
      className={`bonus-game-preview-modal__artwork durak-scene${result ? ' durak-scene--result' : ''}`}
      role="img"
      aria-label={label}
    >
      <img src={opponentArt(opponentId, variant)} alt="" />
    </div>
  );
}
const closeButton = (onClose: () => void) => (
  <button type="button" className="icon-btn" aria-label="Закрыть" onClick={onClose}>
    <X size={15} />
  </button>
);
export function DurakLaunchModal({
  onClose,
  onPlay,
  opponentId = 'maria',
}: {
  onClose: () => void;
  onPlay: () => void;
  opponentId?: ComputerOpponentId;
}) {
  const opponent = computerOpponent(opponentId);
  const withName = {
    maria: 'Марией',
    daria: 'Дарьей',
    grigory: 'Григорием',
    arsenich: 'Арсеничем',
  }[opponentId];
  return (
    <AccessibleModal
      title={`Дурак с ${withName}`}
      onRequestClose={onClose}
      cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
      headerAction={closeButton(onClose)}
    >
      <MariaScene
        opponentId={opponentId}
        variant={opponentId === 'maria' ? 'playing' : 'invite'}
        label={`${opponent.name} приглашает сыграть в карты`}
      />
      <p className="modal-copy bonus-game-preview-modal__story">
        {opponentId === 'maria'
          ? 'Мария составит тебе компанию за карточным столом. Обычный подкидной дурак: 36 карт, без ставок. Избавься от всех карт раньше соперницы.'
          : `Подкидной дурак: 36 карт, без ставок. ${opponent.description}`}
      </p>
      <VisitorGameGate character={opponentId} avatar={opponentArt(opponentId, 'avatar')}>
      <div className="modal-actions">
        <button className="modal-primary btn btn--cta" onClick={onPlay}>
          Играть
        </button>
      </div>
      </VisitorGameGate>
    </AccessibleModal>
  );
}
export function DurakResultModal({
  result,
  onReplay,
  onBack,
  opponentId = 'maria',
}: {
  result: Game['result'];
  onReplay: () => void;
  onBack: () => void;
  opponentId?: ComputerOpponentId;
}) {
  const opponent = computerOpponent(opponentId);
  const title = result === 0 ? 'Ты выиграл' : result === 1 ? 'Ты проиграл' : 'Ничья';
  return (
    <AccessibleModal
      title={title}
      onRequestClose={onBack}
      cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
      headerAction={closeButton(onBack)}
    >
      <MariaScene
        opponentId={opponentId}
        variant={result === 0 ? 'player-win' : result === 1 ? 'player-loss' : 'playing'}
        label={title}
        result
      />
      <p className="modal-copy">
        {result === 0
          ? opponent.win
          : result === 1
            ? opponent.loss
            : '«Все карты ушли в отбой. Сыграем ещё?»'}
      </p>
      <VisitorGameGate character={opponentId} avatar={opponentArt(opponentId, 'avatar')}>
      <div className="modal-actions">
        <button className="btn btn--ghost" onClick={onBack}>
          Вернуться в бар
        </button>
        <button className="modal-primary btn btn--cta" onClick={onReplay}>
          Повторить
        </button>
      </div>
      </VisitorGameGate>
    </AccessibleModal>
  );
}
