import type { ReactNode } from 'react';

export function TournamentAdminField({
  label,
  help,
  children,
  className = '',
}: {
  label: string;
  help: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <label
      className={`tournament-admin-field${className ? ` ${className}` : ''}`}
      data-tournament-field
    >
      <span className="tournament-admin-field__label">{label}</span>
      {children}
      <small className="tournament-admin-field__help">{help}</small>
    </label>
  );
}

export function TournamentAdminGroupHelp({ children }: { children: ReactNode }): JSX.Element {
  return (
    <p className="tournament-admin-field__help tournament-admin-field__help--group">{children}</p>
  );
}
