import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchCoinPackages, type CoinPackage } from '../api/payments.js';

function markerLabel(marker: CoinPackage['marker']): string | null {
  if (marker === 'hit') return 'Хит';
  if (marker === 'top') return 'Топ';
  if (marker === 'premium') return 'Премиум';
  return null;
}

function numberText(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function rubText(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function PricePackageCard({ pack }: { pack: CoinPackage }): JSX.Element {
  const marker = markerLabel(pack.marker);

  return (
    <article className="glass prices-package-card">
      <div className="prices-package-card__icon" aria-hidden="true">
        <CircleDollarSign size={26} strokeWidth={2.35} />
        {marker !== null ? (
          <span
            className={`prices-package-card__marker${pack.marker === 'premium' ? ' prices-package-card__marker--premium' : ''}`}
          >
            {marker}
          </span>
        ) : null}
      </div>
      <div className="prices-package-card__copy">
        <h2>{pack.title}</h2>
        <strong>{numberText(pack.coinAmount)} монет</strong>
        <p>{pack.description}</p>
        {pack.badgeText ? (
          <span className="prices-package-card__badge">{pack.badgeText}</span>
        ) : null}
      </div>
      <data className="prices-package-card__price" value={pack.priceRub}>
        {rubText(pack.priceRub)}
      </data>
    </article>
  );
}

export function PricesScreen(): JSX.Element {
  const packagesQuery = useQuery({
    queryKey: ['bank', 'packages'],
    queryFn: fetchCoinPackages,
  });
  const packages = packagesQuery.data?.packages ?? [];

  return (
    <main className="screen prices-screen">
      <section className="prices-screen__content" aria-labelledby="prices-screen-title">
        <header className="prices-screen__header">
          <div className="section-label">Банк</div>
          <h1 id="prices-screen-title">Пакеты монет</h1>
          <p>Актуальные пакеты для игры. Стоимость указана в рублях.</p>
        </header>

        {packagesQuery.isLoading ? (
          <div className="prices-screen__state glass" role="status">
            Загружаем пакеты…
          </div>
        ) : null}
        {packagesQuery.isError ? (
          <div className="prices-screen__state glass" role="alert">
            Не удалось загрузить пакеты. Попробуйте обновить страницу.
          </div>
        ) : null}
        {packagesQuery.data && packages.length === 0 ? (
          <div className="prices-screen__state glass">Пакеты монет пока не опубликованы.</div>
        ) : null}
        {packagesQuery.data && packages.length > 0 ? (
          <div className="prices-screen__grid" aria-label="Доступные пакеты монет">
            {packages.map((pack) => (
              <PricePackageCard key={pack.id} pack={pack} />
            ))}
          </div>
        ) : null}

        <section className="glass prices-screen__legal" aria-labelledby="prices-legal-title">
          <h2 id="prices-legal-title">Оплата и получение</h2>
          <p>
            Монеты — цифровой товар внутри Ultimate Hockey. Они зачисляются на игровой аккаунт
            после успешной оплаты. Физическая доставка не требуется.
          </p>
          <p>
            Оплата доступна только авторизованным пользователям внутри приложения. На этой
            странице оформить покупку нельзя.
          </p>
          <div className="prices-screen__legal-links">
            <Link to="/terms">Пользовательское соглашение</Link>
            <Link to="/offer">Публичная оферта</Link>
            <Link to="/privacy">Политика конфиденциальности</Link>
          </div>

          <h2>Продавец и поддержка</h2>
          <p>ИП Гуменюк Егор Михайлович</p>
          <p>ОГРНИП 323100000016441 · ИНН 101602099457</p>
          <p>
            Email поддержки:{' '}
            <a href="mailto:egorgumenyuk@yandex.ru">egorgumenyuk@yandex.ru</a>
          </p>
        </section>
      </section>
    </main>
  );
}
