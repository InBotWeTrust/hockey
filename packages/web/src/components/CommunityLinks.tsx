import { ChevronRight } from 'lucide-react';

export function CommunityLinks(): JSX.Element {
  return (
    <section className="profile-community-section" aria-label="Сообщества">
      <span className="section-label profile-section-label">Сообщества</span>
      <div className="profile-community-list">
        <a
          className="profile-community-card glass"
          href="https://vk.ru/ultimate_hockey"
          target="_blank"
          rel="noreferrer"
          aria-label="Открыть сообщество ВКонтакте"
        >
          <span
            className="profile-community-card__icon profile-community-card__icon--vk"
            data-testid="profile-community-icon-vk"
            aria-hidden="true"
          >
            <img src="/icons/vk-community.png" alt="" />
          </span>
          <span className="profile-community-card__copy">
            <strong>ВКонтакте</strong>
            <small>Новости, обновления и обсуждения</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </a>
        <a
          className="profile-community-card glass"
          href="https://t.me/ultimate_hockey"
          target="_blank"
          rel="noreferrer"
          aria-label="Открыть канал в Telegram"
        >
          <span
            className="profile-community-card__icon profile-community-card__icon--telegram"
            data-testid="profile-community-icon-telegram"
            aria-hidden="true"
          >
            <img src="/icons/telegram-community-v2.png" alt="" />
          </span>
          <span className="profile-community-card__copy">
            <strong>Telegram</strong>
            <small>Официальный канал игры</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
