import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CHARACTER_GAME, type GameCharacter } from '@hockey/game-core';
import { AccessibleModal } from '../../components/AccessibleModal.js';
import { gameApi } from './api.js';
import { gameArt, gameCopy, gameNames, characterNames } from './content.js';
import { gameClose } from './GameModals.js';
import { OchkoStake } from './OchkoStake.js';
import { BarGamesLobby } from './BarGamesLobby.js';
export function CharacterLaunch({
  character,
  close,
}: {
  character: GameCharacter;
  close: () => void;
}) {
  const request = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const navigate = useNavigate(),
    kind = CHARACTER_GAME[character];
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await gameApi.start(character, request.current);
      navigate(`/bar/games/match/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось начать партию.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <AccessibleModal
      title={`${gameNames[kind]} с ${{ maria: 'Марией', daria: 'Дарьей', veronika: 'Вероникой', arsenich: 'Арсеничем', grigory: 'Григорием', oleg: 'Олегом' }[character]}`}
      onRequestClose={close}
      cardClassName="bonus-game-preview-modal bonus-game-launch-modal"
      headerAction={gameClose(close)}
    >
      <img
        className="bar-game-invite-art"
        src={gameArt(kind, 'invite', character)}
        alt={characterNames[character]}
      />
      <p className="modal-copy bonus-game-preview-modal__story">{gameCopy[kind].invite}</p>
      {character === 'grigory' ? (
        <OchkoStake onStarted={(r) => navigate(`/bar/games/match/${r.id}`)} />
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button
              className="modal-primary btn btn--cta"
              onClick={() => void start()}
              disabled={busy}
            >
              Играть
            </button>
          </div>
        </>
      )}
    </AccessibleModal>
  );
}
export function BarGamesPage() {
  const [params] = useSearchParams();
  const value = params.get('game');
  const initial =
    value === 'armwrestling' ||
    value === 'ochko' ||
    value === 'darts' ||
    value === 'checkers' ||
    value === 'billiards'
      ? value
      : 'cards';
  const navigate = useNavigate();
  return (
    <main className="bar-game-screen">
      <button className="btn btn--ghost" onClick={() => navigate('/bar')}>
        Вернуться в бар
      </button>
      <BarGamesLobby initial={initial} />
    </main>
  );
}
