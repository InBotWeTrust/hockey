import { ChevronRight, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function CommunityLinks(): JSX.Element {
  const navigate = useNavigate();

  return (
    <div className="profile-community-story-grid">
      <div className="profile-community-settings-column">
        <section className="profile-settings-section" aria-label="Настройки">
          <span className="section-label profile-section-label">Профиль</span>
          <div className="profile-utility-grid">
            <button
              type="button"
              className="profile-utility-card profile-utility-card--settings glass"
              aria-label="Настройки"
              onClick={() => navigate('/profile/settings')}
            >
              <span className="profile-utility-card__visual profile-utility-card__visual--icon">
                <Settings aria-hidden="true" />
              </span>
              <span className="profile-utility-card__copy">
                <strong className="profile-settings-card__title">Настройки</strong>
              </span>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </section>
        <section className="profile-community-section" aria-label="Сообщества">
          <span className="section-label profile-section-label">Сообщества</span>
          <div className="profile-community-icon-grid">
            <a
              className="profile-community-icon-card"
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
            </a>
            <a
              className="profile-community-icon-card"
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
            </a>
          </div>
        </section>
      </div>
      <section className="profile-story-section" aria-label="Сюжет">
        <span className="section-label profile-section-label">Сюжет</span>
        <button
          type="button"
          className="profile-story-card"
          aria-label="Открыть раздел «Сюжет»"
          onClick={() => navigate('/profile/story')}
        >
          <img src="/profile/story-cinema.webp" alt="" />
          <span className="profile-story-card__shade" aria-hidden="true" />
          <ChevronRight aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
