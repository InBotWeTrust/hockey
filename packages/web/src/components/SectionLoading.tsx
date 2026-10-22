import './section-loading.css';

/** Route/data loading stays inside its section; only startup may lock the app. */
export function SectionLoading({
  message = 'Идёт загрузка…',
  retry,
}: {
  message?: string;
  retry?: () => void;
}): JSX.Element {
  return (
    <div className="section-loading" role={retry ? 'alert' : 'status'} aria-live="polite">
      <span>{message}</span>
      {retry && <button type="button" className="btn btn--cta" onClick={retry}>Повторить</button>}
    </div>
  );
}
