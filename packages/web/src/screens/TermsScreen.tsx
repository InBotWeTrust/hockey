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
          <h2>3. Цифровые пакеты монет</h2>
          <p>
            Состав и стоимость доступных пакетов указаны на странице тарифов в рублях. Монеты
            используются только внутри Ultimate Hockey, не являются денежными средствами и не
            подлежат обмену между пользователями или выводу в деньги.
          </p>
        </section>

        <section className="glass legal-screen__section">
          <h2>4. Оплата и зачисление</h2>
          <p>
            Оплата производится через ЮKassa внутри приложения. После подтверждения успешной
            оплаты монеты автоматически зачисляются на аккаунт, с которого была оформлена
            покупка. Пакеты являются цифровым товаром, поэтому физическая доставка не требуется.
          </p>
          <p>
            Если монеты не зачислились после успешной оплаты, пользователь может обратиться в
            поддержку и приложить сведения о платеже.
          </p>
        </section>

        <section className="glass legal-screen__section">
          <h2>5. Возвраты</h2>
          <p>
            Запрос на возврат рассматривается по адресу поддержки с учётом статуса платежа,
            факта зачисления и использования монет, а также требований законодательства России.
            Настоящее соглашение не ограничивает обязательные права потребителя.
          </p>
        </section>

        <section className="glass legal-screen__section">
          <h2>6. Ответственность и изменения</h2>
          <p>
            Пользователь отвечает за сохранность доступа к своему аккаунту. Продавец вправе
            обновлять игру, каталог и настоящее соглашение; новая редакция действует с момента
            публикации на этой странице и не изменяет условия уже завершённых покупок.
          </p>
        </section>

        <Link className="legal-screen__back" to="/prices">
          Вернуться к тарифам
        </Link>
      </article>
    </main>
  );
}
