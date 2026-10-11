export function MarathonWindowPicker({
  selected,
  onChange,
  multiple = false,
}: {
  selected: Array<4000 | 7000>;
  onChange: (next: Array<4000 | 7000>) => void;
  multiple?: boolean;
}): JSX.Element {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
      <legend className="modal-copy">Время на следующий гол</legend>
      <div style={{ display: 'flex', gap: 8 }}>
        {([7000, 4000] as const).map((window) => (
          <button
            type="button"
            key={window}
            className={`btn ${selected.includes(window) ? 'btn--cta' : 'btn--ghost'}`}
            aria-pressed={selected.includes(window)}
            onClick={() => {
              if (!multiple) onChange([window]);
              else if (!selected.includes(window)) onChange([...selected, window]);
              else if (selected.length > 1) onChange(selected.filter((value) => value !== window));
            }}
          >
            {window / 1000} {window===4000 ? 'секунды' : 'секунд'}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
