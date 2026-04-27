import type { JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { searchMessagesApi, type ChatDTO, type MessageSearchHit } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { HighlightedText } from './HighlightedText.js';
import { excerptAround } from '../searchUtils.js';

export interface SearchResultsDropdownProps {
  query: string;
  chatHits: ChatDTO[];
}

function chatLabel(c: ChatDTO): string {
  if (c.type === 'direct' && c.dmCounterpart) return c.dmCounterpart.displayName;
  return c.name ?? 'Без названия';
}

const cardButtonStyle = {
  textAlign: 'left' as const,
  padding: '8px 12px',
  borderRadius: 12,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
  color: 'var(--ink)',
};

export function SearchResultsDropdown({
  query,
  chatHits,
}: SearchResultsDropdownProps): JSX.Element {
  const navigate = useNavigate();
  const trimmed = query.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const enabled = trimmed.length >= 2;

  const { data, isLoading, isError, refetch } = useQuery<MessageSearchHit[]>({
    queryKey: chatKeys.search(trimmed),
    queryFn: () => searchMessagesApi(trimmed, 50),
    enabled,
    staleTime: 30_000,
  });

  return (
    <div
      className="glass-dark"
      style={{
        margin: '6px 14px 0',
        borderRadius: 16,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <section>
        <h3 style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--muted)' }}>Чаты</h3>
        {chatHits.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
            Совпадений среди чатов нет
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {chatHits.map((c) => (
              <button
                type="button"
                key={c.id}
                className="glass"
                onClick={() => navigate(`/chat/${c.id}`)}
                style={cardButtonStyle}
              >
                <HighlightedText text={chatLabel(c)} tokens={tokens} />
              </button>
            ))}
          </div>
        )}
      </section>

      {enabled ? (
        <section>
          <h3
            style={{
              margin: '0 0 6px',
              fontSize: 12,
              color: 'var(--muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Сообщения
            {isLoading && <Loader2 size={12} className="spin" aria-label="Loading" />}
          </h3>
          {isError ? (
            <div
              className="glass-dark"
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13 }}>Не удалось загрузить результаты.</span>
              <button
                type="button"
                onClick={() => void refetch()}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--ink)',
                  borderRadius: 999,
                  padding: '2px 10px',
                  font: 'inherit',
                  fontSize: 12,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                Повторить
              </button>
            </div>
          ) : !isLoading && (data ?? []).length === 0 ? (
            <p
              className="glass"
              style={{
                margin: 0,
                padding: '8px 12px',
                borderRadius: 12,
                color: 'var(--muted)',
                fontSize: 13,
              }}
            >
              {`Ничего не найдено по «${trimmed}»`}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(data ?? []).map((hit) => {
                const snippet = excerptAround(hit.content, tokens);
                return (
                  <button
                    type="button"
                    key={hit.id}
                    className="glass"
                    onClick={() => navigate(`/chat/${hit.chatId}?goto=${hit.id}`)}
                    style={{ ...cardButtonStyle, display: 'flex', flexDirection: 'column', gap: 4 }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hit.senderName}</span>
                    <span style={{ fontSize: 13 }}>
                      <HighlightedText text={snippet} tokens={tokens} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
