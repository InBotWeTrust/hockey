import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const UPDATED_AT = '12 сентября 2026 года';

function LegalPage({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <main className="screen prices-screen legal-screen">
      <article className="prices-screen__content legal-screen__content">
        <header className="prices-screen__header">
          <div className="section-label">Ultimate Hockey</div>
          <h1>{title}</h1>
          <p>Редакция от {UPDATED_AT}</p>
        </header>
        {children}
        <nav className="glass legal-screen__links" aria-label="Юридические документы">
          <Link to="/terms">Условия использования</Link>
          <Link to="/offer">Публичная оферта</Link>
          <Link to="/privacy">Политика конфиденциальности</Link>
          <Link to="/personal-data-consent">Согласие на обработку данных</Link>
          <Link to="/prices">Тарифы</Link>
          <Link to="/login">Войти</Link>
        </nav>
      </article>
    </main>
  );
}

function SellerDetails(): JSX.Element {
  return (
    <>
      <p>ИП Гуменюк Егор Михайлович</p>
      <p>ОГРНИП 323100000016441 · ИНН 101602099457</p>
      <p>
        Email: <a href="mailto:egorgumenyuk@yandex.ru">egorgumenyuk@yandex.ru</a>
      </p>
    </>
  );
}

export function OfferScreen(): JSX.Element {
  return (
    <LegalPage title="Публичная оферта">
      <section className="glass legal-screen__section">
        <h2>1. Продавец</h2>
        <SellerDetails />
      </section>
      <section className="glass legal-screen__section">
        <h2>2. Предмет оферты</h2>
        <p>
          Продавец предлагает пользователю приобрести выбранный пакет монет для использования
          внутри Ultimate Hockey. Название, количество монет и цена в рублях указаны на странице
          тарифов. Оформление оплаты означает принятие этой оферты.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>3. Оплата и зачисление</h2>
        <p>
          Оплата производится через ЮKassa внутри приложения. После подтверждения успешной
          оплаты монеты автоматически зачисляются на аккаунт покупателя. Это цифровой товар:
          физическая доставка не требуется. Данные банковской карты продавцу не передаются.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>4. Использование монет</h2>
        <p>
          Монеты используются только внутри Ultimate Hockey, не являются денежными средствами,
          не переводятся другим пользователям и не предназначены для вывода в деньги.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>5. Возвраты</h2>
        <p>
          Запрос на возврат направляется на email продавца. Он рассматривается с учётом статуса
          платежа, факта зачисления и использования монет и требований законодательства России.
          Условия оферты не ограничивают обязательные права потребителя.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>6. Поддержка</h2>
        <p>
          Если оплаченные монеты не были зачислены, напишите на{' '}
          <a href="mailto:egorgumenyuk@yandex.ru">egorgumenyuk@yandex.ru</a> и укажите сведения
          о платеже и игровом аккаунте.
        </p>
      </section>
    </LegalPage>
  );
}

export function PrivacyScreen(): JSX.Element {
  return (
    <LegalPage title="Политика конфиденциальности">
      <section className="glass legal-screen__section">
        <h2>1. Оператор</h2>
        <SellerDetails />
      </section>
      <section className="glass legal-screen__section">
        <h2>2. Какие данные обрабатываются</h2>
        <p>
          Идентификаторы и публичные данные профиля Telegram и ВКонтакте, имя, username, аватар,
          часовой пояс, игровые действия и прогресс, обращения в поддержку, идентификаторы и
          статусы платежей, а также технические данные подключения и устройства.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>3. Цели и способы обработки</h2>
        <p>
          Данные используются для регистрации и входа, работы игры, сохранения прогресса,
          проведения и учёта платежей, поддержки пользователей, предотвращения злоупотреблений
          и выполнения требований закона. Обработка включает сбор, хранение, обновление,
          использование, передачу привлечённым сервисам в необходимом объёме и удаление.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>4. Сторонние сервисы</h2>
        <p>
          Для входа используются Telegram и ВКонтакте, для оплаты — ЮKassa, для работы приложения
          — инфраструктурные провайдеры. Данные банковской карты получает и обрабатывает ЮKassa;
          Ultimate Hockey не получает и не хранит полный номер карты и защитный код.
        </p>
      </section>
      <section className="glass legal-screen__section">
        <h2>5. Срок хранения и права пользователя</h2>
        <p>
          Данные хранятся, пока нужен аккаунт и работа сервиса, а затем — в течение обязательных
          сроков, установленных законом. Запросить сведения, исправление, удаление данных или
          отозвать согласие можно по адресу egorgumenyuk@yandex.ru. Удаление необходимых для
          аккаунта данных может сделать дальнейшее использование игры невозможным.
        </p>
      </section>
    </LegalPage>
  );
}

export function PersonalDataConsentScreen(): JSX.Element {
  return (
    <LegalPage title="Согласие на обработку персональных данных">
      <section className="glass legal-screen__section">
        <h2>Согласие пользователя</h2>
        <p>
          Пользователь свободно и в своём интересе даёт ИП Гуменюку Егору Михайловичу, ОГРНИП
          323100000016441, ИНН 101602099457, согласие на обработку данных, перечисленных в Политике
          конфиденциальности, для регистрации, входа, работы игры, платежей, поддержки и
          безопасности сервиса.
        </p>
        <p>
          Разрешаются автоматизированная и неавтоматизированная обработка, сбор, запись,
          систематизация, накопление, хранение, уточнение, использование, необходимая передача,
          блокирование и удаление данных.
        </p>
        <p>
          Согласие действует до достижения целей обработки или его отзыва. Отозвать согласие
          можно письмом на <a href="mailto:egorgumenyuk@yandex.ru">egorgumenyuk@yandex.ru</a>.
          Отзыв не влияет на законность обработки, выполненной до его получения, и на хранение,
          обязательное по закону.
        </p>
      </section>
    </LegalPage>
  );
}
