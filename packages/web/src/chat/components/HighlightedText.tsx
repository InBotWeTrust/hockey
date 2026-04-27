import type { JSX } from 'react';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HighlightedTextProps {
  text: string;
  tokens: string[];
}

export function HighlightedText({ text, tokens }: HighlightedTextProps): JSX.Element {
  const cleanTokens = tokens.map((t) => t.trim()).filter((t) => t.length > 0);
  if (cleanTokens.length === 0) {
    return <>{text}</>;
  }
  const pattern = cleanTokens.map(escapeRegex).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          return <mark key={i}>{part}</mark>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
