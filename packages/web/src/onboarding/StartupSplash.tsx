import './onboarding.css';

export function StartupSplash({
  message = 'Идёт загрузка…',
  retry,
}: {
  message?: string;
  retry?: () => void;
}): JSX.Element {
  const messageLines = message.split('. ').map((line, index, lines) =>
    index < lines.length - 1 ? `${line}.` : line);
  return (
    <main className="onboarding-flow onboarding-flow--startup" aria-label="Загрузка приложения">
      <div className="onboarding-flow__startup" role={retry ? 'alert' : 'status'}>
        <p>
          {messageLines.map((line) => (
            <span className="onboarding-flow__startup-message-line" key={line}>{line}</span>
          ))}
        </p>
        {retry && (
          <button className="btn btn--cta" type="button" onClick={retry}>
            Повторить
          </button>
        )}
      </div>
    </main>
  );
}
