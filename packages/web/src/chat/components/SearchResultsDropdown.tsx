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
    <div className="chat-search-results">
      <section className="chat-search-results__section">
        <h3 className="chat-search-results__heading">Чаты</h3>
        {chatHits.length === 0 ? (
          <p className="chat-search-results__empty">
            Совпадений среди чатов нет
          </p>
        ) : (
          <div className="chat-search-results__list">
            {chatHits.map((c) => (
              <button
                type="button"
                key={c.id}
                className="chat-search-results__item"
                aria-label={chatLabel(c)}
                onClick={() => navigate(`/chat/${c.id}`)}
              >
                <HighlightedText text={chatLabel(c)} tokens={tokens} />
              </button>
            ))}
          </div>
        )}
      </section>

      {enabled ? (
        <section className="chat-search-results__section">
          <h3 className="chat-search-results__heading">
            Сообщения
            {isLoading && <Loader2 size={12} className="spin" aria-label="Loading" />}
          </h3>
          {isError ? (
            <div className="chat-search-results__error">
              <span style={{ fontSize: 13 }}>Не удалось загрузить результаты.</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="chat-search-results__retry"
              >
                Повторить
              </button>
            </div>
          ) : !isLoading && (data ?? []).length === 0 ? (
            <p className="chat-search-results__empty">
              {`Ничего не найдено по «${trimmed}»`}
            </p>
          ) : (
            <div className="chat-search-results__list">
              {(data ?? []).map((hit) => {
                const snippet = excerptAround(hit.content, tokens);
                return (
                  <button
                    type="button"
                    key={hit.id}
                    className="chat-search-results__item chat-search-results__item--message"
                    onClick={() => navigate(`/chat/${hit.chatId}?goto=${hit.id}`)}
                  >
                    <span className="chat-search-results__sender">{hit.senderName}</span>
                    <span className="chat-search-results__snippet">
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
