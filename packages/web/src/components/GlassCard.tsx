import type { CSSProperties, ReactNode } from 'react';

export interface GlassCardProps {
  tone?: 'light' | 'dark';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

export function GlassCard({
  tone = 'light',
  className,
  style,
  children,
  onClick,
}: GlassCardProps): JSX.Element {
  const base = tone === 'dark' ? 'glass-dark' : 'glass';
  const finalClass = className ? `${base} ${className}` : base;
  return (
    <div className={finalClass} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
