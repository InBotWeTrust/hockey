import { Fragment, type ReactNode } from 'react';

type MarkerKind = 'bold' | 'italic';

interface MarkerMatch {
  index: number;
  marker: '**' | '__';
  kind: MarkerKind;
}

const MARKERS: Array<{ marker: '**' | '__'; kind: MarkerKind }> = [
  { marker: '**', kind: 'bold' },
  { marker: '__', kind: 'italic' },
];

function findNextMarker(text: string, from: number): MarkerMatch | null {
  let match: MarkerMatch | null = null;
  for (const candidate of MARKERS) {
    const index = text.indexOf(candidate.marker, from);
    if (index === -1) continue;
    if (match === null || index < match.index) {
      match = { index, marker: candidate.marker, kind: candidate.kind };
    }
  }
  return match;
}

function parseRichText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  while (cursor < text.length) {
    const open = findNextMarker(text, cursor);
    if (!open) {
      nodes.push(text.slice(cursor));
      break;
    }

    if (open.index > cursor) {
      nodes.push(text.slice(cursor, open.index));
    }

    const contentStart = open.index + open.marker.length;
    const closeIndex = text.indexOf(open.marker, contentStart);
    if (closeIndex === -1 || closeIndex === contentStart) {
      nodes.push(open.marker);
      cursor = contentStart;
      continue;
    }

    const content = parseRichText(text.slice(contentStart, closeIndex), `${keyPrefix}-${key}`);
    const nodeKey = `${keyPrefix}-${key}`;
    nodes.push(
      open.kind === 'bold' ? (
        <strong key={nodeKey}>{content}</strong>
      ) : (
        <em key={nodeKey}>{content}</em>
      ),
    );
    key += 1;
    cursor = closeIndex + open.marker.length;
  }

  return nodes;
}

export function stripRichTextSyntax(text: string): string {
  return text.replace(/\*\*|__/g, '');
}

export function RichText({ text }: { text: string }): JSX.Element {
  return (
    <>
      {parseRichText(text, 'rt').map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </>
  );
}
