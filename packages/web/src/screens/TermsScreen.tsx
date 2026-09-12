import { Link } from 'react-router-dom';

export function TermsScreen(): JSX.Element {
  return (
    <main className="screen prices-screen legal-screen">
      <article className="prices-screen__content legal-screen__content">
        <header className="prices-screen__header">
          <div className="section-label">Ultimate Hockey</div>
          <h1>Пользовательское соглашение</h1>
          <p>Редакция от 12 сентября 2026 года</p>
        </header>

        <section className="glass legal-screen__section">
          <h2>1. Общие положения</h2>
          <p>
            Настоящее соглашение регулирует использование игры Ultimate Hockey и приобретение
            цифровых пакетов монет. Используя игру или оформляя покупку, пользователь принимает
            условия соглашения.
          </p>
        </section>

        <section className="glass legal-screen__section">
          <h2>2. Продавец</h2>
          <p>ИП Гуменюк Егор Михайлович</p>
          <p>ОГРНИП 323100000016441 · ИНН 101602099457</p>
          <p>
            Поддержка:{' '}
            <a href="mailto:egorgumenyuk@yandex.ru">egorgumenyuk@yandex.ru</a>
          </p>
        </section>

        <section className="glass legal-screen__section">
          <h2>3. Правила использования</h2>
          <p>
            Пользователь обязуется не нарушать работу сервиса, не пытаться получить чужой доступ,
            не автоматизировать игровые действия в обход правил и не использовать ошибки игры для
            получения необоснованного преимущества.
          </p>
        </section>

        <section className="glass legal-screen__section">
          <h2>4. Ответственность и изменения</h2>
          <p>
            Пользователь отвечает за сохранность доступа к своему аккаунту. Продавец вправе
            обновлять игру, каталог и настоящее соглашение; новая редакция действует с момента
            публикации на этой странице и не изменяет условия уже завершённых покупок.
          </p>
        </section>

        <nav className="glass legal-screen__links" aria-label="Юридические документы">
          <Link to="/offer">Публичная оферта</Link>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/personal-data-consent">Согласие на обработку данных</Link>
          <Link to="/prices">Вернуться к тарифам</Link>
          <Link to="/login">Войти</Link>
        </nav>
      </article>
    </main>
  );
}
