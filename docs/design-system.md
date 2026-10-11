# Ultimate Hockey: дизайн-система Liquid Glass

Дата: 11 октября 2026 года. База реализации: `origin/dev`, `465b718e`.

Это основной справочник для создания и изменения интерфейсов Ultimate Hockey. Он описывает реализованные компоненты и утверждённый материал. Значения берутся из CSS и React-компонентов этой ветки. Документ не означает, что каждая комбинация экрана, роли и устройства прошла браузерную приёмку.

## Как пользоваться

1. Найдите существующий элемент в каталоге ниже. Используйте его классы и структуру.
2. Для цвета и стекла используйте общие токены, а не собственные синие или белые заливки.
3. Размеры берите из базового класса и его существующего варианта. Варианты разных сценариев могут отличаться.
4. Если нужен новый вариант, добавьте класс и обновите этот файл вместе с кодом.
5. Проверьте результат на ширине 360 px, на светлой и тёмной локации, с длинным текстом и нужными состояниями.

Источники: [`global.css`](../packages/web/src/app/global.css), [`design-system.css`](../packages/web/src/app/design-system.css), [`liquid-glass.css`](../packages/web/src/app/liquid-glass.css). Локальные размеры бара, онбординга и игрового управления остаются в их scoped CSS и компонентах.

## Визуальное направление

Нейтральное прозрачное стекло основано на игровом табло. Цвет окружения виден через материал. Основные текст и иконки светлые; границы тонкие, блики и тени нейтральные. Крупные холодно-синие и молочно-белые подложки не используются как общий материал.

Иллюстрации, физическая площадка и игровые эффекты сохраняют собственные цвета. Цвета победы, ошибки, награды и прогресса несут смысл и не заменяются нейтральным стеклом. Бренды сервисов входа узнаются по их существующим иконкам и подписям, а наши кнопки используют общий материал. Внешний Telegram-виджет контролируется самим Telegram.

## Материалы

| Материал | Где применять | Заливка | Размытие |
| --- | --- | --- | --- |
| Chrome | Нижняя навигация, кнопка назад, внешняя оболочка переключателей, игровое табло | Нейтральный градиент 12% → 6% | 18 px, насыщенность 145% |
| Card | Карточки с содержимым, списки, сообщения | Нейтральный градиент 28% → 16% | 18 px, насыщенность 145% |
| Modal | Модальные окна, выпадающие списки через portal, выдвижные панели | Нейтральный градиент 66% → 57% | 24 px, насыщенность 135% |
| Selected | Выбранная вкладка, основное действие | Белый блик 16% | Без собственного blur внутри стекла |
| Inset | Вложенные поля, маленькие панели, вторичные кнопки | Нейтральное затемнение 12% | Без повторного blur внутри стекла |
| Solid | Sticky-заголовок таблицы, где нельзя показывать прокручиваемые строки снизу | `#25272b` | Нет |

Проценты относятся к альфа-каналу заливки, а не к прозрачности всего элемента. Не задавайте `opacity` контейнеру ради стекла: это ослабляет текст, иконки и дочерние элементы.

### Цвет и глубина

| Назначение | Токен | Значение |
| --- | --- | --- |
| Основной текст | `--liquid-ink`, совместимый `--ink` | `#f8f9fb` |
| Вторичный текст | `--liquid-muted`, `--muted` | Основной цвет с альфа 82% |
| Дополнительная подпись | `--liquid-muted-soft`, `--muted-soft` | Основной цвет с альфа 66% |
| Граница поверхности | `--liquid-border` | Белая, 38% |
| Вложенная граница | `--liquid-border-soft` | Белая, 18% |
| Затемнение за модалкой | `--liquid-scrim` | Чёрное, 34%; без blur всего экрана |
| Тень текста | `--liquid-text-shadow` | `0 1px 4px`, чёрная, 65% |
| Обычная поверхность | `--liquid-shadow` | Тень глубины + верхний и нижний внутренние блики |
| Выбранное состояние | `--liquid-selected-shadow` | Верхний внутренний блик + компактная тень |
| Модальное окно | `--liquid-modal-shadow` | Более глубокая тень + внутренний верхний блик |

Нейтральные градиенты: chrome — `rgba(18,20,23,.12)` → `rgba(30,32,35,.06)`; card — те же цвета с `.28` → `.16`; modal — `rgba(37,39,43,.66)` → `rgba(23,25,29,.57)`.

Старые `--surface-*`, `--glass-*` и `--chrome-*` остаются совместимыми именами и ссылаются на эти материалы. Токены `--liquid-*` объявлены на `:root`, чтобы меню и модалки через portal работали вне `.app-shell`.

### Семантические цвета

| Значение | Токен | Цвет на стекле |
| --- | --- | --- |
| Ошибка / списание | `--red-deep` | `#ff8b98` |
| Успех | `--green-deep` | `#83e3a5` |
| Монеты | `--reward-coin` | `#83e3a5` |
| Звёзды | `--reward-star` | `#f7d477` |
| Опыт | `--reward-experience` | `#91c4ff` |
| Жетоны | `--reward-token` | `#d2acff` |

Не используйте эти цвета как произвольное украшение обычных карточек. Локальные смысловые цвета результатов и игровых статусов сохранены; их декларации перечислены в каталоге.

## Размеры и общие компоненты

Основной интерфейс рассчитан на мобильный экран. Контрольная ширина — 360 px; обычный контейнер приложения — до 430 px. Учитывайте `100dvh`, safe areas, экранную клавиатуру и standalone PWA.

| Элемент | Размер / отступы | Форма | Материал / состояние |
| --- | --- | --- | --- |
| `.btn` | Текст 16 px / 700; padding 15 px 20 px; высота определяется текстом и padding | Pill: `--r-pill` | CTA — Selected; ghost — Inset; disabled — приглушение и отсутствие активной тени |
| `.icon-btn` | 34 × 34 px; padding 0 | Круг | Chrome; светлая иконка с мягкой тенью |
| Кнопка назад страницы | 38 × 38 px, min 38 px | Круг | Chrome |
| Кнопка назад в баре | Локальный вариант 36 × 36 px | Круг | Тот же Chrome |
| Управление под хоккейной площадкой | Крайние кнопки 56 × 56 px; gap 10 px; контейнер max 344 px | Радиус крайних кнопок 20 px | Общий нейтральный материал |
| `.segmented-tabs` | Внешний padding 4 px; gap 4 px; минимум пункта 42 px | Pill | Chrome; выбранный пункт — Selected |
| `.modal-card` | Width `min(100%, 320px)`; padding 24 px 22 px 22 px | Радиус 24 px | Modal; дополнительные варианты ширины перечислены ниже |
| `StartPeriodModal` | Width 100%, max 360 px; padding 28 px 24 px 22 px | Радиус 28 px | Modal и общий scrim |
| `GlassSelect`: поле | Height 44 px; padding 0 10 px 0 12 px; текст 13 px / 800 | Радиус 14 px | Inset внутри карточки |
| `GlassSelect`: список | Max height `min(280px, 100dvh − 24px)`; padding 6 px; пункт 38 px | Контейнер 18 px, пункт 12 px | Modal; выбранная опция отмечена галочкой |
| Радиусы токенов | `--r-sm` 12 px; `--r-md` 16 px; `--r-lg` 20 px; `--r-xl` 24 px | `--r-pill`: 999 px | Существующие специальные варианты сохраняются |

Сетка переключателя задаётся его потребителем: число колонок соответствует числу пунктов. Базовый `.segmented-tabs` не угадывает число вкладок.

### Кнопки и иконки

Обычные текстовые `.btn`, `.btn--cta` и `.btn--ghost` не получают добавленные SVG, lucide или emoji. Отдельное действие одной иконкой оформляется `.icon-btn`; `.icon-btn--dark` остаётся семантическим именем основного действия, но использует нейтральный материал.

Выбранное состояние показывают форма, светлый блик, рамка и контраст подписи. Сохраняйте `aria-pressed`, `aria-selected`, `aria-current`, реальные `disabled` и видимый фокус; одного цвета недостаточно. Непрозрачная тёмно-синяя заливка выбранного пункта не используется.

### Модальные окна

Стандартная структура: `.modal-backdrop` → `.modal-card` → `.modal-header` с `.modal-title` и кнопкой закрытия справа, затем `.modal-copy` и `.modal-actions`. Главное действие — `.modal-primary.btn--cta`. Не переносите сценарий в bottom sheet только ради внешнего вида.

Backdrop затемняет окружение. Blur принадлежит карточке. Вложенные карточки получают Inset без собственного blur, чтобы не было мутных прямоугольников и лишних слоёв композиции. Для таблицы с прокруткой sticky-заголовок получает Solid, чтобы строки под ним не смешивались с заголовками.

### Текст

Сохраняется системный стек `-apple-system`, `BlinkMacSystemFont`, `SF Pro`, `Segoe UI`, `Roboto`, sans-serif. Общие поверхности используют светлый текст и нейтральную тень; локальные размеры и веса перечислены в каталоге. Новые подписи не должны уходить в тёмный navy на прозрачном фоне. Проверяйте длинные русские имена, переносы, суммы и подписи disabled-состояний.

### Движение

Существующие токены: press 100 ms, fade 180 ms, масштаб текстовой кнопки `.97`, иконки `.94`. Реакция на нажатие сохраняется. Смена материала не меняет игровое время, состояния, анимации сцен, сетевые действия или навигацию. Учитывайте `prefers-reduced-motion`.

### Прозрачность и контраст

При `prefers-reduced-transparency: reduce`, повышенном контрасте и отсутствии поддержки backdrop blur используются плотные нейтральные поверхности. Основной и вторичный текст остаются светлыми. Плотность карточек отличается от плотности навигации намеренно: большие объёмы текста требуют более спокойной подложки.

## Проверки этой версии

Общие компоненты проверяются в локальном синтетическом каталоге на баре, льду и пляже. Проверки размеров: 360 и 430 px; состояния: выбранный/обычный/disabled пункт, карточка, обычная модалка, начало периода, portal-select и отключённая прозрачность. Это проверка реальных компонентов с тестовым содержимым, без входа и серверных записей. Она не заменяет приёмку каждой авторизованной страницы на dev и физическом iPhone.

Результаты и границы проверки приведены в конце документа.

## Каталог элементов и вариантов

Ниже перечислены декларации геометрии, типографики и оформления из текущего кода. Каталог группируется по исходному файлу. Это справочник деклараций, а не вычисленный CSS для каждого возможного DOM: учитывайте наследование, сочетание классов, каскад и медиаправила. `liquid-glass.css` загружается после общих стилей; локальные варианты могут уточнять размеры.

У каждого селектора показаны только явно заданные значения. Отсутствие свойства означает наследование или настройку потребителем, а не нулевой размер. Составные селекторы описывают вложенные элементы и состояния. Для одинакового селектора внутри разных media-блоков контекст указан отдельно.

<details>
<summary>app/liquid-glass.css — 30 элементов и правил</summary>

Источник: [liquid-glass.css](../packages/web/src/app/liquid-glass.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.app-shell` | `color: var(--liquid-ink)` |
| `.glass, .glass-dark` | `color: var(--liquid-ink)` |
| `.app-shell :is(.bottom-nav__dock, .segmented-tabs, .glass-dock-surface, .glass-dock-field, .chat-create-search, .header-bar.glass, .chat-dock-header:not(.chat-dock-header--bare), .icon-btn, .catalog-header-back, .bar-game-filter, .onboarding-story-action, .onboarding-story-close)` | `background: var(--liquid-chrome-bg)`; `border-color: var(--liquid-border)`; `box-shadow: var(--liquid-shadow)`; `color: var(--liquid-ink)`; `backdrop-filter: var(--liquid-blur)` |
| `.app-shell :is(.bottom-nav__icon-wrap--active, .segmented-tabs__item--active, .chip--active, .pill--dark, .bar-game-filter--active, .tournament-bracket__round-tabs button.is-active)` | `background: var(--liquid-selected-bg)`; `border-color: var(--liquid-border)`; `box-shadow: var(--liquid-selected-shadow)`; `color: var(--liquid-ink)`; `backdrop-filter: none` |
| `.app-shell :is(.bottom-nav__tab, .segmented-tabs__item, .bar-game-filter)` | `color: var(--liquid-ink)` |
| `.app-shell :is(.btn--cta, .btn--primary, .btn--ghost, .modal-primary, .duel-rating-info-modal__confirm, .bonus-game-card__action--repeat)` | `background: var(--liquid-selected-bg)`; `border: 1px solid var(--liquid-border)`; `box-shadow: var(--liquid-selected-shadow)`; `color: var(--liquid-ink)`; `backdrop-filter: none` |
| `.app-shell :is(.btn--ghost, .segmented-tabs__item:not(.segmented-tabs__item--active))` | `background: var(--liquid-inset-bg)`; `box-shadow: none` |
| `.app-shell :is(.btn, .icon-btn, .segmented-tabs__item):disabled` | `background: var(--liquid-inset-bg)`; `border-color: var(--liquid-border-soft)`; `box-shadow: none` |
| `.app-shell :is(.glass, .section-card-surface, .sections-quick-card, .bonus-game-card, .achievement-card, .profile-equipment-section, .profile-settings-card)` | `color: var(--liquid-ink)` |
| `.app-shell :is(.section-card-surface--active, .sections-quick-card--active, .bonus-game-card--featured, .achievement-card--claimable)` | `background: var(--liquid-card-bg)`; `border-color: rgba(255, 255, 255, 0.58)`; `box-shadow: var(--liquid-shadow)` |
| `.app-shell :is(.modal-card, .glass) :is(.glass, .daily-result-modal__period, .duel-history-summary__tiles > div, .tournament-operation-rewards__row > span)` | `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12)`; `backdrop-filter: none` |
| `.modal-backdrop` | `background: var(--liquid-scrim)`; `backdrop-filter: none` |
| `.app-shell :is(.modal-card, .admin-drawer, .tournament-player-search__results), .modal-card, [data-glass-select-menu='true']` | `background: var(--liquid-modal-bg)`; `color: var(--liquid-ink)`; `border-color: var(--liquid-border)`; `box-shadow: var(--liquid-modal-shadow)`; `backdrop-filter: var(--liquid-modal-blur)` |
| `.app-shell .modal-card.bar-conversation` | `background: var(--liquid-modal-bg)` |
| `.app-shell :is(.section-label, .modal-title, .modal-copy, .bar-intro, .chat-room-header__title)` | `color: var(--liquid-ink)` |
| `.app-shell :is(input, textarea, select)` | `color: var(--liquid-ink)` |
| `.app-shell :is(input, textarea)::placeholder` | `color: var(--liquid-muted)` |
| `.app-shell select option` | `background: #25272b`; `color: var(--liquid-ink)` |
| `.app-shell .bottom-nav__active-glow::after` | `background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.8), transparent)`; `box-shadow: 0 -2px 6px rgba(255, 255, 255, 0.16)` |
| `.app-shell .bottom-nav__badge` | `box-shadow: 0 0 0 2px rgba(25, 27, 30, 0.9)` |
| `.app-shell .game-scoreboard` | `background: var(--liquid-chrome-bg)`; `border-color: var(--liquid-border)`; `box-shadow: var(--liquid-shadow)` |
| `.app-shell :is(.home-arena-option, .home-arena-modal-status, .duel-history-summary, .onboarding-flow__speech)` | `background: var(--liquid-card-bg)`; `border-color: var(--liquid-border)`; `color: var(--liquid-ink)`; `box-shadow: var(--liquid-shadow)` |
| `.app-shell :is(.home-arena-option:has(input:checked), .onboarding-flow__actions .btn--cta, .fight-held.btn.btn--cta[aria-pressed='true'])` | `background: var(--liquid-selected-bg)`; `border-color: var(--liquid-border)`; `color: var(--liquid-ink)` |
| `.fight-challenge__count` | `background: var(--liquid-selected-bg)`; `color: var(--liquid-ink)` |
| `.app-shell .bar-space .online-durak-lobby--embedded :is(.segmented-tabs, .glass), .app-shell .bar-space :is(.bar-space__actions:not(.bar-space__actions--terminal), .bar-place-preview, .icon-btn)` | `background: var(--liquid-chrome-bg)`; `border-color: var(--liquid-border)`; `color: var(--liquid-ink)`; `box-shadow: var(--liquid-shadow)`; `backdrop-filter: var(--liquid-blur)` |
| `.app-shell .bar-space .online-durak-lobby--embedded .glass` | `background: var(--liquid-card-bg)` |
| `.app-shell .bar-space .online-durak-lobby--embedded :is(.segmented-tabs__item--active, .btn--cta), .app-shell .bar-space .bar-game-filter--active` | `background: var(--liquid-selected-bg)`; `border-color: var(--liquid-border)`; `box-shadow: var(--liquid-selected-shadow)` |
| `.app-shell :is(.login-screen__mini-app-card a, .tournament-rules a)` | `color: #a4d3ff` |
| `.app-shell .chat-bubble--own` | `background: rgba(255, 255, 255, 0.18)`; `color: var(--liquid-ink)` |
| `.app-shell :is(.onboarding-flow__speech, .login-screen__auth-button)` | `border-color: var(--liquid-border)`; `box-shadow: var(--liquid-shadow)` |

</details>

<details>
<summary>app/global.css — 6 элементов и правил</summary>

Источник: [global.css](../packages/web/src/app/global.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `*::-webkit-scrollbar` | `width: 0`; `height: 0` |
| `html, body, #root` | `min-height: 100%`; `width: 100%`; `background-color: var(--app-bg-bottom)` |
| `html, body` | `margin: 0`; `padding: 0`; `background-color: var(--app-bg-bottom)`; `color: var(--ink)` |
| `body` | `min-height: 100vh`; `min-height: 100dvh` |
| `#root` | `min-height: 100vh`; `min-height: 100dvh`; `background-color: var(--app-bg-bottom)` |
| `.app-shell` | `min-height: 100vh`; `min-height: 100dvh` |

</details>

<details>
<summary>app/design-system.css — 1967 элементов и правил</summary>

Источник: [design-system.css](../packages/web/src/app/design-system.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.app-shell` | `background: radial-gradient(circle at 80% 90%, rgba(59, 130, 246, 0.18), transparent 55%), linear-gradient(180deg, #c9dcf0 0%, #9cbfdf 100%)`; `height: 100vh`; `height: var(--app-viewport-height, 100dvh)` |
| `.admin-achievement-stages` | `gap: 10px`; `margin-top: 10px` |
| `.achievement-stage-details` | `gap: 9px`; `margin-top: 14px`; `color: var(--ink)`; `font-size: 13px` |
| `.achievement-stage-details__summary` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 750` |
| `.achievement-stage-details__current` | `gap: 4px` |
| `.achievement-stage-details__current strong` | `font-size: 14px`; `font-weight: 850` |
| `.achievement-stage-details__current span` | `color: var(--muted)`; `line-height: 1.45` |
| `.achievement-stage-details__next` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 750` |
| `.achievement-stage-progress` | `height: 24px`; `border-radius: 999px`; `background: rgba(148, 163, 184, 0.2)` |
| `.achievement-stage-progress__bar` | `height: 100%`; `border-radius: inherit`; `background: rgba(14, 165, 233, 0.3)` |
| `.achievement-stage-progress span` | `font-weight: 900` |
| `.admin-achievement-stage` | `min-width: 0`; `padding: 12px`; `border: 1px solid rgba(100, 116, 139, 0.18)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)` |
| `.admin-achievement-stage__header` | `gap: 10px` |
| `.admin-achievement-stage__header small` | `margin-top: 3px`; `color: var(--muted)`; `font-size: 11px` |
| `.admin-achievement-stage__header .btn` | `width: auto`; `min-width: 112px` |
| `.admin-achievement-stage__grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 8px`; `margin-top: 10px` |
| `.admin-achievement-stage__toggle` | `gap: 8px`; `min-width: 0`; `font-size: 12px`; `font-weight: 800` |
| `.admin-achievement-stage__toggle input` | `width: 18px`; `height: 18px` |
| `.admin-achievement-stage__error` | `margin-top: 8px`; `color: var(--red-deep)`; `font-size: 12px` |
| `.admin-achievement-stage__header .btn`<br>@media (max-width: 430px) | `width: 100%` |
| `.admin-achievement-stage__grid`<br>@media (max-width: 430px) | `grid-template-columns: minmax(0, 1fr)` |
| `.app-shell::after` | `background: linear-gradient( 180deg, rgba(234, 243, 251, 0.14) 0%, rgba(228, 239, 249, 0.5) 38%, rgba(218, 233, 246, 0.16) 100% )` |
| `.app-shell--login` | `background: #06172a` |
| `.app-shell--login::after` | `background: linear-gradient( 180deg, rgba(2, 10, 24, 0.48) 0%, rgba(2, 10, 24, 0.22) 30%, rgba(2, 10, 24, 0.08) 60%, rgba(2, 10, 24, 0.1) 100% )` |
| `.tournament-duel-result__artwork` | `width: 100%`; `margin: 14px auto 0`; `border-radius: 20px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `box-shadow: 0 14px 30px rgba(15, 23, 42, 0.18)` |
| `.modal-card.duel-result-card:not(.duel-result-card--compact)` | `width: min(100%, 380px)` |
| `.modal-card.demo-completion-modal` | `width: min(100%, 380px)` |
| `.regular-podium-modal .modal-copy` | `margin-top: 6px` |
| `.regular-podium-modal .tournament-duel-result__artwork` | `margin-top: 0` |
| `.regular-podium-modal__rewards` | `margin-top: 16px` |
| `.regular-podium-modal__rewards .section-label` | `margin: 0`; `padding: 2px 0` |
| `.regular-podium-modal__reward-list` | `gap: 12px 18px`; `margin-top: 10px` |
| `.regular-podium-modal__reward` | `gap: 5px`; `font-size: 18px`; `font-weight: 950`; `line-height: 1` |
| `.regular-podium-modal__reward > span:first-child` | `width: 20px`; `height: 20px` |
| `.regular-podium-modal__error` | `margin: 14px 0 0`; `color: var(--danger)`; `font-size: 12px`; `font-weight: 750`; `line-height: 1.35` |
| `.modal-card.monthly-rating-reward-modal` | `gap: 0` |
| `.monthly-rating-reward-modal .modal-title` | `font-size: clamp(20px, 5.8vw, 25px)`; `line-height: 1.16` |
| `.monthly-rating-reward-modal__artwork` | `margin-top: 18px`; `height: auto !important` |
| `.monthly-rating-reward-modal__placements` | `gap: 9px`; `margin-top: 16px` |
| `.monthly-rating-reward-modal__placements p` | `margin: 0` |
| `.monthly-rating-reward-modal__primary-result` | `color: var(--ink)`; `font-size: 17px`; `font-weight: 900`; `line-height: 1.35` |
| `.monthly-rating-reward-modal__other-standings` | `gap: 6px`; `margin-top: 14px` |
| `.monthly-rating-reward-modal__other-standings .section-label` | `margin: 0`; `padding: 2px 0` |
| `.monthly-rating-reward-modal__other-standings-list` | `gap: 4px` |
| `.monthly-rating-reward-modal__other-standings-list p` | `gap: 4px`; `margin: 0`; `color: var(--muted)`; `font-size: 13px`; `font-weight: 750`; `line-height: 1.35` |
| `.monthly-rating-reward-modal__other-standings-list strong` | `color: var(--ink)`; `font-weight: 900` |
| `.monthly-rating-reward-modal .regular-podium-modal__rewards` | `margin-top: 16px` |
| `.monthly-rating-reward-modal .modal-actions` | `margin-top: 20px` |
| `.monthly-rating-reward-modal__other-standings + .modal-actions` | `margin-top: 12px` |
| `.tournament-result-preview-switcher` | `width: min(410px, calc(100vw - 20px))`; `gap: 6px`; `padding-bottom: 2px` |
| `.tournament-result-preview-switcher a` | `padding: 7px 10px`; `border-radius: 999px`; `color: var(--muted)`; `background: var(--liquid-inset-bg)`; `font-size: 10px`; `font-weight: 850` |
| `.tournament-result-preview-switcher a.is-active` | `color: #ffffff`; `background: var(--liquid-selected-bg)` |
| `.visually-hidden` | `width: 1px !important`; `height: 1px !important`; `padding: 0 !important`; `margin: -1px !important`; `border: 0 !important` |
| `.route-loading` | `padding: 9px 14px`; `border: 1px solid rgba(255, 255, 255, 0.28)`; `border-radius: 999px`; `color: #ffffff`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 24px rgba(2, 10, 24, 0.24)`; `backdrop-filter: blur(10px)`; `font-size: 14px`; `font-weight: 800`; `letter-spacing: 0.01em` |
| `.login-screen` | `color: #ffffff` |
| `.login-screen__brand` | `padding: clamp(12px, 2.4dvh, 24px) 16px 0` |
| `.login-screen__logo` | `width: clamp(64px, 10dvh, 80px)`; `height: clamp(64px, 10dvh, 80px)`; `border-radius: 22px`; `box-shadow: 0 18px 44px rgba(0, 8, 22, 0.42), 0 0 0 1px rgba(225, 242, 255, 0.86), 0 0 30px rgba(127, 195, 255, 0.24)` |
| `.login-screen__title` | `margin: 7px 0 0`; `color: rgba(250, 253, 255, 0.98)`; `font-size: clamp(21px, 2.8dvh, 27px)`; `font-weight: 900`; `line-height: 1.08`; `letter-spacing: -0.025em` |
| `.login-screen__tagline` | `margin-top: 5px`; `color: rgba(248, 252, 255, 0.96)`; `font-size: clamp(13px, 1.7dvh, 15px)`; `font-weight: 750`; `line-height: 1.35` |
| `.login-screen__benefits` | `margin-top: 9px`; `gap: 6px` |
| `.login-screen__benefit` | `padding: 4px 9px`; `border: 1px solid rgba(224, 240, 255, 0.68)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: rgba(248, 252, 255, 0.96)`; `font-size: 10px`; `font-weight: 800`; `line-height: 1.2`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12)`; `backdrop-filter: blur(8px)` |
| `.login-screen__actions` | `width: 100%`; `max-width: 360px`; `margin: 0 auto`; `padding: 0`; `gap: 9px` |
| `.login-screen__referral` | `width: 242px`; `margin: 0 auto 2px`; `gap: 5px`; `color: #fff`; `font-size: 11px`; `font-weight: 800` |
| `.login-screen__referral small` | `color: rgba(245, 250, 255, 0.7)`; `font-weight: 650` |
| `.login-screen__referral input` | `width: 100%`; `height: 40px`; `padding: 0 15px`; `border: 1px solid rgba(220, 239, 255, 0.74)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: #fff`; `letter-spacing: 0.08em` |
| `.login-screen__referral input:focus` | `border-color: #fff` |
| `.login-screen__actions > .btn, .login-screen__actions > form, .login-screen__actions > form .btn` | `width: 100%` |
| `.login-screen__auth-button` | `width: 242px`; `height: 40px`; `min-height: 40px`; `border-radius: 999px` |
| `.login-screen__actions > .login-screen__auth-button, .login-screen__actions > form .login-screen__auth-button` | `width: 242px` |
| `.login-screen__actions > .btn--ghost` | `min-height: 40px`; `background: var(--liquid-inset-bg)`; `border-color: rgba(220, 239, 255, 0.86)`; `color: #ffffff`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 10px 26px rgba(0, 8, 24, 0.34), 0 0 16px rgba(116, 190, 255, 0.18)` |
| `.login-screen__auth-icon` | `width: 18px`; `height: 18px`; `border-radius: 5px` |
| `.login-screen__auth-button--vk` | `gap: 8px`; `font-size: 14px` |
| `.login-screen__terms` | `width: calc(100vw - 16px)`; `max-width: 430px`; `margin-top: 3px`; `color: rgba(245, 250, 255, 0.8)`; `font-size: 9px`; `font-weight: 500`; `line-height: 1.4` |
| `.login-screen__terms a` | `color: #ffffff` |
| `.login-screen--mini-app` | `padding: max(20px, var(--app-safe-top)) 16px max(20px, var(--app-safe-bottom))` |
| `.login-screen__mini-app-card` | `width: min(100%, 360px)`; `padding: 24px`; `gap: 16px`; `color: var(--ink)` |
| `.login-screen__mini-app-card h1, .login-screen__mini-app-card p` | `margin: 0` |
| `.login-screen__mini-app-card p` | `line-height: 1.55` |
| `.login-screen__mini-app-card a` | `color: #075985`; `font-weight: 800` |
| `.login-screen .telegram-login-unavailable, .login-screen .telegram-login-fallback__copy` | `color: rgba(245, 250, 255, 0.92) !important`; `font-size: 12px`; `font-weight: 700`; `line-height: 1.35` |
| `.login-screen__brand`<br>@media (max-height: 720px) | `padding-top: 8px` |
| `.login-screen__logo`<br>@media (max-height: 720px) | `width: 68px`; `height: 68px`; `border-radius: 19px` |
| `.login-screen__actions`<br>@media (max-height: 720px) | `gap: 7px` |
| `.login-screen__tagline`<br>@media (max-height: 720px) | `margin-top: 4px`; `font-size: 12px` |
| `.login-screen__title`<br>@media (max-height: 720px) | `margin-top: 5px`; `font-size: 20px` |
| `.login-screen__benefits`<br>@media (max-height: 720px) | `margin-top: 6px` |
| `.app-shell--arena-chat::after` | `background: linear-gradient( 180deg, rgba(232, 241, 249, 0.36) 0%, rgba(240, 247, 252, 0.46) 48%, rgba(232, 241, 249, 0.38) 100% )` |
| `.app-shell--arena-admin::after` | `background: linear-gradient( 180deg, rgba(5, 16, 35, 0.24) 0%, rgba(85, 128, 168, 0.18) 18%, transparent 44% ), linear-gradient(180deg, rgba(221, 236, 248, 0.08) 0%, rgba(197, 219, 238, 0.2) 100%)` |
| `.arena-error-state` | `width: min(100%, 340px)`; `gap: 12px` |
| `.arena-error-state__title` | `color: #ff6b6b`; `font-size: 18px`; `font-weight: 850` |
| `.arena-error-state__copy` | `max-width: 290px`; `color: rgba(248, 251, 255, 0.96)`; `font-size: 14px`; `font-weight: 700`; `line-height: 1.4` |
| `.arena-error-state__hint` | `color: rgba(248, 251, 255, 0.88)`; `font-size: 12px`; `font-weight: 650`; `line-height: 1.4` |
| `.arena-ambient-lights > span` | `width: 4px`; `height: 4px`; `border-radius: 50%`; `background: #ffffff`; `box-shadow: 0 0 8px rgba(235, 248, 255, 0.98), 0 0 18px rgba(137, 207, 255, 0.7), 0 0 30px rgba(83, 164, 255, 0.3)` |
| `.arena-ambient-lights > span:nth-child(1)` | `width: 5px`; `height: 5px` |
| `.arena-ambient-lights > span:nth-child(2)` | `width: 3px`; `height: 3px` |
| `.arena-ambient-lights > span:nth-child(3)` | `width: 6px`; `height: 6px` |
| `.arena-ambient-lights > span:nth-child(4)` | `width: 3px`; `height: 3px` |
| `.arena-ambient-lights > span:nth-child(5)` | `width: 5px`; `height: 5px` |
| `.arena-ambient-lights > span:nth-child(7)` | `width: 6px`; `height: 6px` |
| `.arena-ambient-lights > span:nth-child(8)` | `width: 3px`; `height: 3px` |
| `.arena-ambient-lights > span:nth-child(9)` | `width: 5px`; `height: 5px` |
| `.app-content` | `min-height: 0` |
| `.app-content > .screen` | `height: 100%`; `min-height: 100%` |
| `.app-shell--bottom-nav-visible .app-content > .screen` | `padding-bottom: calc(var(--bottom-nav-scroll-reserve) + var(--bottom-nav-bottom-gap)) !important` |
| `.glass` | `background: var(--glass-bg)`; `backdrop-filter: var(--blur-md)`; `border: 1px solid var(--glass-border)`; `box-shadow: var(--shadow-glass)` |
| `.glass-dark` | `background: var(--glass-bg-dark)`; `color: #ffffff`; `backdrop-filter: var(--blur-dark)`; `border: 1px solid var(--glass-border-dark)` |
| `.chat-bubble--own` | `background: var(--liquid-card-bg)`; `border-color: rgba(195, 219, 242, 0.2)`; `box-shadow: 0 10px 24px rgba(2, 8, 23, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08)` |
| `.glass-edge-fade::before` | `background: var(--glass-edge-bg)`; `backdrop-filter: blur(var(--glass-edge-blur, 8px)) saturate(var(--glass-edge-saturate, 115%))` |
| `.glass-dock-surface` | `background: var(--chrome-surface-bg, rgba(232, 242, 255, 0.62))`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `box-shadow: 0 18px 36px rgba(42, 91, 132, 0.22), 0 -1px 0 rgba(255, 255, 255, 0.5) inset`; `backdrop-filter: blur(20px) saturate(130%)` |
| `.glass-dock-icon` | `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `color: var(--muted)`; `box-shadow: none` |
| `.bottom-nav__dock` | `background: var(--chrome-surface-bg, rgba(226, 237, 249, 0.72))`; `border-color: var(--chrome-surface-border, rgba(255, 255, 255, 0.76))`; `box-shadow: var(--chrome-surface-shadow, 0 16px 34px rgba(38, 75, 112, 0.2)), inset 0 1px 0 rgba(255, 255, 255, 0.72), inset 0 -1px 0 rgba(94, 130, 166, 0.08)`; `backdrop-filter: blur(24px) saturate(124%)` |
| `.bottom-nav__tab` | `height: 100%`; `padding: 0`; `border: 0`; `color: rgba(248, 252, 255, 0.92)`; `background: transparent` |
| `.bottom-nav__tab--active` | `color: #f7fbff` |
| `.bottom-nav__icon-wrap` | `width: 46px`; `height: 46px`; `margin: 0 auto`; `border: 1px solid transparent`; `border-radius: 15px`; `background: transparent` |
| `.bottom-nav__icon-wrap--active` | `background: var(--liquid-selected-bg)`; `border-color: rgba(15, 23, 42, 0.92)`; `box-shadow: 0 7px 16px rgba(5, 27, 50, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.12)` |
| `.bottom-nav__active-glow` | `height: 2px` |
| `.bottom-nav__active-glow::after` | `width: 22px`; `height: 1.5px`; `border-radius: 999px`; `background: linear-gradient( 90deg, transparent 0%, rgba(135, 219, 255, 0.7) 26%, rgba(225, 248, 255, 0.94) 50%, rgba(117, 210, 255, 0.7) 74%, transparent 100% )`; `box-shadow: 0 0 3px rgba(104, 211, 255, 0.82), 0 -3px 6px rgba(79, 190, 255, 0.44), 0 -7px 10px rgba(64, 174, 244, 0.15)` |
| `.bottom-nav__badge` | `min-width: 16px`; `height: 16px`; `padding: 0 4px`; `border-radius: 999px`; `background: rgb(220, 38, 38)`; `color: #ffffff`; `font-size: 9px`; `font-weight: 800`; `box-shadow: 0 0 0 2px rgba(218, 230, 246, 0.96)` |
| `.glass-dock-field` | `min-width: 0`; `height: 40px`; `padding: 0 12px`; `border-radius: var(--r-pill)`; `gap: 8px`; `background: var(--chrome-surface-bg, rgba(255, 255, 255, 0.55))`; `border: 1px solid var(--chrome-surface-border, rgba(255, 255, 255, 0.7))`; `backdrop-filter: blur(18px) saturate(122%)` |
| `.app-shell--arena .chat-dock-header:not(.chat-dock-header--bare), .app-shell--arena .header-bar.glass, .app-shell--arena .chat-create-search` | `background: var(--chrome-surface-bg)`; `border-color: var(--chrome-surface-border)`; `box-shadow: var(--chrome-surface-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.72)`; `backdrop-filter: blur(22px) saturate(124%)` |
| `.game-scoreboard-stack` | `grid-template-columns: minmax(0, 1fr)`; `gap: 7px`; `width: 100%`; `min-width: 0` |
| `.game-scoreboard.bonus-game-marksmanship-score` | `width: max-content`; `max-width: 100%`; `padding-inline: 0` |
| `.bonus-game-marksmanship-score__inner` | `width: max-content` |
| `.bonus-game-marksmanship-score__part` | `gap: var(--marksmanship-part-gap, 4px)`; `min-width: 0`; `padding: 8px var(--marksmanship-part-padding, 10px)` |
| `.bonus-game-marksmanship-score .game-scoreboard__label` | `font-size: var(--marksmanship-label-size, 8px)` |
| `.bonus-game-marksmanship-score .game-scoreboard__value` | `font-size: var(--marksmanship-value-size, 18px)` |
| `.game-scoreboard, .bar-space__actions, .bar-space .icon-btn, .bar-space .bar-place-preview, .modal-card.bar-conversation` | `width: 100%`; `min-width: 0`; `border: 1px solid rgba(205, 232, 255, 0.46)`; `border-radius: clamp(14px, 5cqw, 22px)`; `color: #f8fbff`; `background: var(--liquid-chrome-bg)`; `box-shadow: 0 14px 30px rgba(0, 10, 27, 0.3), 0 0 20px rgba(111, 190, 255, 0.11), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(112, 182, 247, 0.12), inset 1px 0 0 rgba(255, 255, 255, 0.05), inset -1px 0 0 rgba(255, 255, 255, 0.05)`; `backdrop-filter: blur(18px) saturate(145%)` |
| `.game-scoreboard__rows` | `min-width: 0` |
| `.game-scoreboard__row` | `min-width: 0`; `padding: clamp(7px, 2.8cqw, 11px) clamp(7px, 2.4cqw, 10px)` |
| `.game-scoreboard__row--secondary` | `background: var(--liquid-card-bg)` |
| `.game-scoreboard__metric` | `min-width: 0`; `padding: 0 clamp(5px, 2.2cqw, 10px)`; `gap: clamp(3px, 1.2cqw, 5px)` |
| `.game-scoreboard__metric + .game-scoreboard__metric::before` | `width: 1px`; `background: linear-gradient( 180deg, transparent, rgba(158, 206, 249, 0.32) 18%, rgba(158, 206, 249, 0.32) 82%, transparent )` |
| `.game-scoreboard__row--dense .game-scoreboard__metric` | `padding-inline: clamp(2px, 1.2cqw, 6px)` |
| `.game-scoreboard__row--dense .game-scoreboard__value` | `font-size: clamp(14px, 5.4cqw, 22px)` |
| `.game-scoreboard__label` | `max-width: 100%`; `color: rgba(211, 228, 246, 0.78)`; `font-size: clamp(7px, 2.65cqw, 11px)`; `font-weight: 800`; `line-height: 1`; `letter-spacing: 0.11em` |
| `.game-scoreboard__label--small` | `font-size: clamp(5px, 1.9cqw, 8px)`; `letter-spacing: 0.045em` |
| `.game-scoreboard__value` | `max-width: 100%`; `color: #f8fbff`; `font-size: clamp(17px, 6.6cqw, 27px)`; `font-weight: 900`; `letter-spacing: -0.025em`; `line-height: 0.96` |
| `.game-scoreboard__metric--timer .game-scoreboard__value` | `color: #edf8ff` |
| `.game-scoreboard__metric--muted .game-scoreboard__value` | `color: rgba(222, 235, 248, 0.72)` |
| `.game-scoreboard__metric--warning .game-scoreboard__value` | `color: #f4c542` |
| `.game-scoreboard__metric--danger .game-scoreboard__value` | `color: #ffbdc8` |
| `.game-scoreboard__metric--large .game-scoreboard__value` | `font-size: clamp(24px, 8.6cqw, 36px)` |
| `.game-scoreboard__metric--small .game-scoreboard__value` | `font-size: clamp(14px, 4.8cqw, 20px)` |
| `.game-scoreboard__metric--timer.game-scoreboard__metric--small .game-scoreboard__label` | `font-size: clamp(6px, 1.8cqw, 8px)`; `letter-spacing: 0.025em` |
| `.game-scoreboard__metric--timer.game-scoreboard__metric--small .game-scoreboard__value` | `font-size: clamp(12px, 3.9cqw, 18px)`; `letter-spacing: -0.035em` |
| `.game-scoreboard__status-line` | `min-width: 0`; `padding: clamp(6px, 2.1cqw, 9px) clamp(10px, 3.2cqw, 14px)`; `grid-template-columns: clamp(18px, 6.4cqw, 24px) minmax(0, 1fr) auto`; `gap: clamp(5px, 1.8cqw, 8px)`; `color: rgba(228, 243, 255, 0.9)`; `background: var(--liquid-card-bg)`; `font-size: clamp(7px, 2.5cqw, 10px)`; `font-weight: 850`; `line-height: 1.1`; `letter-spacing: 0.04em` |
| `.game-scoreboard__status-avatar, .game-scoreboard__status-avatar-fallback` | `width: clamp(18px, 6.4cqw, 24px)`; `height: clamp(18px, 6.4cqw, 24px)`; `border: 1px solid rgba(221, 240, 255, 0.28)`; `border-radius: 50%` |
| `.game-scoreboard__status-avatar-fallback` | `background: var(--liquid-card-bg)`; `color: rgba(239, 248, 255, 0.92)`; `font-size: clamp(7px, 2.5cqw, 10px)` |
| `.game-scoreboard__status-label, .game-scoreboard__status-value` | `min-width: 0` |
| `.game-scoreboard__status-value` | `color: rgba(222, 235, 248, 0.72)` |
| `.game-scoreboard__status-line--active .game-scoreboard__status-value` | `color: #edf8ff` |
| `.game-scoreboard__status-line--danger .game-scoreboard__status-value` | `color: #ffbdc8` |
| `.game-scoreboard__notice` | `min-width: 0`; `padding: clamp(6px, 2.1cqw, 9px) clamp(10px, 3.2cqw, 14px)`; `color: rgba(228, 243, 255, 0.9)`; `background: var(--liquid-card-bg)`; `font-size: clamp(7px, 2.5cqw, 10px)`; `font-weight: 850`; `line-height: 1.1`; `letter-spacing: 0.055em` |
| `.game-scoreboard`<br>@media (prefers-reduced-transparency: reduce) | `background: var(--liquid-card-bg)`; `backdrop-filter: none` |
| `.chat-dock-header` | `min-height: 54px`; `margin: 0 12px`; `padding: 6px 8px`; `border-radius: var(--r-pill)`; `gap: 10px` |
| `.chat-dock-header--bare` | `min-height: 40px`; `margin-bottom: 12px`; `padding: 0`; `background: transparent`; `border: 0`; `box-shadow: none`; `backdrop-filter: none` |
| `.chat-list-search-input::placeholder` | `color: var(--liquid-muted)`; `font-weight: 500` |
| `.chat-list-search-field` | `height: 40px`; `border-radius: 16px` |
| `.chat-room-search__field` | `height: 40px`; `border-radius: 20px` |
| `.chat-room-search` | `margin: 8px 14px 0` |
| `.chat-room-header` | `min-height: 54px`; `margin: 0 12px`; `gap: 8px` |
| `.chat-room-header__control` | `width: 40px`; `height: 40px`; `min-width: 40px`; `min-height: 40px`; `padding: 0` |
| `.icon-btn.chat-room-header__control--surface` | `background: var(--chrome-surface-bg)`; `border-color: var(--chrome-surface-border)`; `color: var(--liquid-ink)`; `box-shadow: 0 7px 18px rgba(2, 8, 23, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.82)`; `backdrop-filter: blur(12px) saturate(140%)` |
| `.chat-room-header__profile` | `min-width: 0`; `padding: 0`; `border: 0`; `background: transparent`; `color: inherit` |
| `.chat-room-header__identity` | `min-width: 0`; `min-height: 48px`; `padding: 4px 10px 4px 5px`; `gap: 8px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 24px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 5px 16px rgba(15, 35, 55, 0.14)`; `backdrop-filter: blur(12px) saturate(116%)` |
| `.chat-room-header__copy` | `min-width: 0` |
| `.chat-room-header__title` | `color: var(--ink)`; `font-size: 15px`; `font-weight: 750`; `line-height: 18px` |
| `.chat-room-header__subtitle` | `margin-top: 1px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 550`; `line-height: 14px` |
| `.chat-search-results` | `margin: 6px 14px 0`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 10px 28px rgba(9, 27, 46, 0.2)`; `color: var(--ink)`; `backdrop-filter: blur(16px) saturate(118%)` |
| `.chat-search-results__heading` | `min-height: 30px`; `margin: 0`; `padding: 8px 12px 5px`; `gap: 6px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 800`; `letter-spacing: 0.04em` |
| `.chat-search-results__item` | `width: 100%`; `min-height: 42px`; `padding: 9px 12px`; `border: 0`; `background: transparent`; `color: var(--ink)`; `font-size: 13px` |
| `.chat-search-results__item:not(.chat-search-results__item--message)` | `gap: 10px` |
| `.chat-search-results__chat-copy` | `min-width: 0`; `gap: 2px` |
| `.chat-search-results__chat-name` | `font-size: 14px`; `font-weight: 700` |
| `.chat-search-results__chat-type` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 550` |
| `.chat-search-results__item:active` | `background: rgba(121, 170, 213, 0.16)` |
| `.chat-search-results__item--message` | `gap: 3px` |
| `.chat-search-results__sender` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650` |
| `.chat-search-results__snippet` | `font-size: 13px` |
| `.chat-search-results mark` | `padding: 0 2px`; `border-radius: 4px`; `background: rgba(121, 191, 242, 0.3)`; `color: inherit` |
| `.chat-search-results__empty` | `margin: 0`; `padding: 7px 12px 11px`; `color: var(--liquid-muted)`; `font-size: 13px` |
| `.chat-room__empty-state` | `margin-top: min(18vh, 140px)`; `padding: 10px 16px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: #ffffff`; `font-size: 13px`; `font-weight: 800`; `line-height: 1.25`; `box-shadow: 0 8px 24px rgba(2, 10, 23, 0.2)`; `backdrop-filter: blur(12px) saturate(120%)` |
| `.chat-search-results__error` | `padding: 8px 12px 11px`; `gap: 8px` |
| `.chat-search-results__retry` | `padding: 3px 10px`; `border: 1px solid rgba(35, 55, 78, 0.42)`; `border-radius: 12px`; `background: transparent`; `color: var(--ink)`; `font-size: 12px` |
| `.chat-dock-composer` | `margin: 0 12px`; `padding: 10px`; `border-radius: 20px`; `gap: 6px` |
| `.chat-edge-top` | `padding: 10px 0 20px`; `margin-bottom: -20px` |
| `.chat-edge-bottom` | `padding: 20px 0 max(10px, var(--app-dock-safe-bottom))`; `margin-top: -20px` |
| `.chat-edge-top--overlay` | `padding-top: calc(10px + var(--app-safe-top))`; `margin-bottom: 0` |
| `.chat-edge-bottom--overlay` | `margin-top: 0` |
| `.bonus-games-catalog` | `width: 100%`; `max-width: 760px`; `margin: 0 auto`; `gap: 14px` |
| `.bonus-games-catalog__header` | `grid-template-columns: 34px minmax(0, 1fr)`; `gap: 10px` |
| `.bonus-games-catalog__title` | `margin: 2px 0 0`; `color: var(--ink)`; `font-size: 25px`; `font-weight: 950`; `line-height: 1.04` |
| `.bonus-games-catalog__heading` | `min-width: 0`; `gap: 10px` |
| `.bonus-games-skill-tabs` | `width: 100%`; `min-width: 0` |
| `.bonus-games-skill-tabs .segmented-tabs` | `width: 100%`; `max-width: 100%`; `min-width: 0` |
| `.bonus-games-skill-tabs .segmented-tabs--scrollable` | `gap: 4px`; `padding-inline: 4px` |
| `.bonus-games-skill-tabs .segmented-tabs--scrollable .segmented-tabs__item` | `padding-inline: 8px` |
| `.bonus-games-attempt-progress` | `min-height: 74px`; `gap: 9px`; `padding: 12px 13px 11px`; `border: 1px solid rgba(255, 255, 255, 0.94)`; `border-radius: 22px`; `background: rgba(237, 244, 250, 0.84)`; `box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18), 0 0 0 2px rgba(74, 144, 226, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)` |
| `.bonus-games-attempt-progress__bar` | `height: 34px`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 999px`; `background: rgba(119, 137, 156, 0.48)`; `box-shadow: inset 0 1px 4px rgba(15, 23, 42, 0.14)` |
| `.bonus-games-attempt-progress__bar > span` | `min-width: 0`; `border-radius: inherit`; `background: linear-gradient(90deg, #399bc8 0%, #59b9de 72%, #7ccbe8 100%)` |
| `.bonus-games-attempt-progress__value` | `color: var(--liquid-ink)`; `font-size: 14px`; `font-weight: 950`; `letter-spacing: 0.04em` |
| `.bonus-games-attempt-progress__meta` | `gap: 10px`; `color: var(--liquid-muted)`; `font-size: 12px`; `line-height: 1.2` |
| `.bonus-games-attempt-progress__meta strong` | `font-weight: 900` |
| `.bonus-games-attempt-progress__meta span` | `color: inherit`; `font-weight: 900` |
| `.bonus-games-rules` | `gap: 9px`; `margin: 0`; `color: var(--muted)`; `font-size: 13px`; `font-weight: 700`; `line-height: 1.4` |
| `.bonus-games-rules li::marker` | `color: var(--ink)`; `font-weight: 900` |
| `.bonus-games-catalog__notice` | `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 18px`; `padding: 15px`; `background: var(--liquid-inset-bg)`; `color: var(--muted)`; `font-size: 14px`; `font-weight: 750`; `line-height: 1.4` |
| `.bonus-games-catalog__notice--error` | `background: rgba(241, 247, 252, 0.9)`; `border-color: rgba(255, 255, 255, 0.94)`; `color: var(--liquid-muted)`; `font-weight: 850`; `box-shadow: 0 12px 28px rgba(2, 8, 23, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.86)` |
| `.chat-list-error` | `margin: 12px 14px`; `padding: 18px`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 20px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 14px 32px rgba(2, 8, 23, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.84)`; `backdrop-filter: blur(16px) saturate(130%)` |
| `.chat-list-error__copy` | `margin-bottom: 10px`; `color: var(--liquid-muted)`; `font-size: 14px`; `font-weight: 800` |
| `.bonus-games-catalog__grid` | `gap: 12px` |
| `.bonus-games-focus` | `gap: 12px` |
| `.bonus-games-focus > h2` | `margin: 0` |
| `.bonus-games-catalog__groups, .bonus-games-group` | `gap: 12px` |
| `.bonus-games-group` | `padding-top: 2px` |
| `.bonus-games-group > h2` | `margin: 0` |
| `.bonus-game-card` | `min-height: 236px`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 22px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.72)` |
| `.bonus-game-card--featured` | `border-color: rgba(255, 255, 255, 0.94)`; `background: var(--liquid-card-bg)`; `box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18), 0 0 0 2px rgba(74, 144, 226, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)` |
| `.bonus-game-card--featured .bonus-game-card__artwork-frame` | `width: 100%`; `height: clamp(176px, 48vw, 204px)`; `margin: 0`; `border: 0`; `border-radius: 0`; `box-shadow: none` |
| `.bonus-game-card--compact` | `height: 144px`; `min-height: 144px`; `grid-template-columns: 144px minmax(0, 1fr)` |
| `.bonus-game-card--compact .bonus-game-card__artwork-frame` | `width: 124px`; `margin: 10px 0 10px 10px` |
| `.bonus-game-card--compact .bonus-game-card__content` | `min-width: 0`; `grid-template-rows: auto auto auto auto`; `gap: 7px 6px`; `padding: 8px 10px 8px 6px` |
| `.bonus-game-card--compact .bonus-game-card__eyebrow` | `font-size: 9px`; `font-weight: 800` |
| `.bonus-game-card--compact .bonus-game-card__title` | `font-size: 14px`; `line-height: 1.05` |
| `.bonus-game-card--compact .bonus-game-card__details` | `font-size: 10.5px`; `line-height: 1.18` |
| `.bonus-game-card--compact .bonus-game-card__reward-list` | `gap: 7px` |
| `.bonus-game-card--compact .bonus-game-card__reward-item` | `gap: 2px`; `font-size: 11.5px` |
| `.bonus-game-card--compact .bonus-game-card__reward-icon svg` | `width: 12px`; `height: 12px` |
| `.bonus-game-card__hit-area` | `width: 100%`; `height: 100%`; `padding: 0`; `border: 0`; `border-radius: inherit`; `background: transparent` |
| `.bonus-game-card__hit-area:focus-visible` | `box-shadow: inset 0 0 0 3px rgba(37, 99, 235, 0.72)` |
| `.bonus-game-card__artwork-frame` | `width: calc(100% - 24px)`; `margin: 12px 12px 0`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 16px`; `background: var(--liquid-card-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42)` |
| `.bonus-game-card__artwork` | `width: 100%`; `height: 100%`; `border-radius: inherit` |
| `.bonus-game-card__status` | `min-height: 0`; `padding: 3px 7px`; `border: 0`; `border-radius: 999px`; `box-shadow: none`; `font-size: 9px`; `font-weight: 800`; `line-height: 1.1` |
| `.bonus-game-card__status--completed` | `background: rgba(32, 122, 82, 0.13)`; `color: #287457` |
| `.bonus-game-card__status--available` | `background: rgba(180, 137, 38, 0.14)`; `color: #87681f` |
| `.bonus-game-card__status--locked` | `background: var(--liquid-card-bg)`; `color: var(--liquid-muted)` |
| `.bonus-game-card__completion-badge` | `width: 22px`; `height: 22px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 999px`; `background: var(--liquid-card-bg)`; `color: #fff`; `box-shadow: 0 3px 10px rgba(15, 23, 42, 0.18)` |
| `.bonus-game-card__content` | `grid-template-columns: minmax(0, 1fr) 20px`; `gap: 7px 8px`; `padding: 13px 14px 14px` |
| `.bonus-game-card__eyebrow` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 900`; `letter-spacing: 0.1em` |
| `.bonus-game-card__title` | `margin: 0`; `color: var(--ink)`; `font-size: 21px`; `font-weight: 950`; `line-height: 1.05` |
| `.bonus-game-card__description, .bonus-game-card__details, .bonus-game-card__reward-note, .bonus-game-card__reward-title` | `margin: 0`; `font-size: 12px`; `font-weight: 750`; `line-height: 1.35` |
| `.bonus-game-card__description, .bonus-game-card__details` | `color: var(--liquid-muted)` |
| `.bonus-game-card__details` | `gap: 2px` |
| `.bonus-game-card__reward-note` | `color: var(--liquid-muted)` |
| `.bonus-game-card__reward` | `gap: 5px` |
| `.bonus-game-card__reward-title` | `color: var(--ink)` |
| `.bonus-game-card__reward-list` | `gap: 16px` |
| `.bonus-game-card__reward-item` | `gap: 5px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 900`; `line-height: 1` |
| `.bonus-game-card__reward--muted .bonus-game-card__reward-item` | `color: var(--liquid-muted)` |
| `.bonus-game-card__reward--muted .bonus-game-card__reward-icon` | `color: rgba(15, 23, 42, 0.48) !important` |
| `.bonus-game-card__action` | `min-height: 46px`; `margin-top: 4px` |
| `.bonus-game-card__chevron` | `color: var(--card-chevron-color)` |
| `.bonus-games-purchase-error` | `margin: 14px 0 0`; `color: #b91c1c`; `font-size: 13px`; `font-weight: 800`; `line-height: 1.4` |
| `.bonus-game-mode-state` | `min-height: 100dvh`; `padding: calc(20px + var(--app-safe-top)) 18px calc(96px + var(--app-safe-bottom))` |
| `.bonus-game-mode-card` | `width: min(100%, 340px)`; `gap: 14px`; `padding: 24px 20px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 24px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 18px 48px rgba(15, 23, 42, 0.16)` |
| `.bonus-game-mode-card h1, .bonus-game-mode-card p` | `margin: 0` |
| `.bonus-game-mode-card h1` | `font-size: 24px`; `font-weight: 950` |
| `.bonus-game-mode-card p` | `color: var(--muted)`; `font-size: 14px`; `font-weight: 750`; `line-height: 1.42` |
| `.bonus-game-mode-card [role='timer']` | `color: var(--ink)`; `font-size: 34px` |
| `.modal-card.bonus-game-break-modal` | `width: min(100%, 340px)` |
| `.bonus-game-break-modal .modal-copy` | `max-width: 280px` |
| `.bonus-game-break-timer` | `color: var(--ink)`; `font-size: 34px`; `font-weight: 800`; `line-height: 1` |
| `.bonus-game-break-progress, .bonus-game-preview-modal__condition` | `margin: 0`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 900`; `line-height: 1.35` |
| `.modal-card.bonus-game-preview-modal` | `width: min(100%, 520px)`; `max-height: calc( var(--app-viewport-height, 100dvh) - var(--app-safe-top) - var(--app-safe-bottom) - 20px )`; `padding: 18px 16px 16px`; `background: var(--liquid-modal-bg)`; `box-shadow: none`; `backdrop-filter: none` |
| `.modal-card.bonus-game-launch-modal` | `width: min(430px, calc(100vw - 28px))`; `max-height: calc(100dvh - 48px - var(--app-safe-top) - var(--app-safe-bottom))`; `padding: 24px 22px 22px` |
| `.bonus-game-preview-modal__artwork` | `width: 100%`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 10px 26px rgba(15, 23, 42, 0.14)` |
| `.bonus-game-launch-modal .bonus-game-preview-modal__artwork` | `height: var(--inventory-item-art-height, auto)`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 22px`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78), 0 10px 18px rgba(15, 23, 42, 0.1)` |
| `.bonus-game-preview-modal__story` | `margin-top: 12px` |
| `.bonus-game-preview-modal__condition` | `gap: 7px`; `margin-top: 10px` |
| `.bonus-game-preview-modal__condition-icon` | `color: var(--liquid-muted)` |
| `.bonus-game-preview-modal__condition-lines` | `gap: 2px` |
| `.bonus-game-inventory-fields` | `gap: 10px`; `margin-top: 12px` |
| `.bonus-game-inventory-fields label` | `gap: 5px`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 850` |
| `.bonus-game-inventory-fields select` | `width: 100%`; `min-height: 42px`; `border: 1px solid rgba(148, 163, 184, 0.38)`; `border-radius: 13px`; `padding: 0 11px`; `color: var(--ink)`; `background: var(--liquid-inset-bg)` |
| `.admin-form-section-title` | `margin: 12px 0 0`; `padding-top: 12px`; `color: var(--ink)`; `font-size: 15px`; `font-weight: 950` |
| `.admin-form-section-title:first-child` | `margin-top: 0`; `padding-top: 0` |
| `.bonus-game-reconcile` | `max-width: min(250px, calc(100cqw - 28px))`; `min-height: 38px`; `gap: 8px`; `padding: 8px 10px`; `border: 1px solid rgba(255, 255, 255, 0.66)`; `border-radius: 14px`; `color: var(--liquid-ink)`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 22px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.54)`; `backdrop-filter: blur(12px) saturate(135%)`; `font-size: 11px`; `font-weight: 850`; `line-height: 1.2` |
| `.bonus-game-reconcile__spinner` | `width: 12px`; `height: 12px`; `border: 2px solid rgba(37, 99, 235, 0.2)`; `border-radius: 50%` |
| `.bonus-game-reconcile__retry` | `min-height: 26px`; `padding: 0 8px`; `border: 1px solid rgba(37, 99, 235, 0.2)`; `border-radius: 999px`; `color: #1d4ed8`; `background: var(--liquid-inset-bg)` |
| `.bonus-game-abandon-error` | `margin: 12px 0 0`; `color: #b91c1c`; `font-size: 13px`; `font-weight: 800` |
| `.modal-card.bonus-game-result-modal` | `width: min(100%, 360px)`; `padding: 20px 18px 18px`; `background: var(--liquid-modal-bg)`; `box-shadow: none`; `backdrop-filter: none` |
| `.bonus-game-result-modal .modal-title` | `font-size: 14px`; `font-weight: 900`; `letter-spacing: 0.1em`; `line-height: 1.25` |
| `.bonus-game-result-modal .modal-copy` | `margin-top: 6px`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 800` |
| `.bonus-game-result-metrics` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 8px` |
| `.bonus-game-result-metrics--endurance` | `grid-template-columns: repeat(2, minmax(0, 1fr))` |
| `.bonus-game-result-metrics--shot-stats` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `margin-top: 8px` |
| `.bonus-game-result-metrics--shot-stats-three` | `grid-template-columns: repeat(3, minmax(0, 1fr))` |
| `.bonus-game-result-metric` | `min-width: 0`; `padding: 12px 6px`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72)` |
| `.bonus-game-result-metric span` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 900`; `letter-spacing: 0.1em`; `line-height: 1.1` |
| `.bonus-game-result-metric strong` | `margin-top: 7px`; `color: var(--ink)`; `font-size: 20px`; `font-weight: 800`; `line-height: 1` |
| `.result-modal__details` | `gap: 4px`; `margin-top: 10px`; `color: var(--liquid-ink)`; `font-size: 14px`; `font-weight: 850`; `line-height: 1.15` |
| `.result-modal__detail:first-child` | `font-size: 22px` |
| `.bonus-game-result-reward` | `margin-top: 12px`; `padding: 12px 14px`; `border: 1px solid rgba(255, 255, 255, 0.68)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64)` |
| `.bonus-game-result-reward-label` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 900`; `letter-spacing: 0.12em`; `line-height: 1.1` |
| `.bonus-game-result-reward-values` | `gap: 7px 12px`; `margin-top: 7px` |
| `.bonus-game-result-reward-value` | `gap: 4px`; `font-size: 12px`; `font-weight: 900`; `line-height: 1.2` |
| `.inventory-purchase-toast` | `grid-template-columns: 52px minmax(0, 1fr)`; `width: min(390px, calc(100vw - 32px))`; `margin: 0`; `padding: 8px`; `gap: 10px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 17px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 14px 38px rgba(15, 23, 42, 0.3)`; `color: #fff` |
| `.inventory-purchase-toast__artwork` | `width: 52px`; `height: 52px`; `border: 1px solid rgba(255, 255, 255, 0.68)`; `border-radius: 12px` |
| `.inventory-purchase-toast__content` | `min-width: 0`; `gap: 2px` |
| `.inventory-purchase-toast__status` | `color: rgba(255, 255, 255, 0.68)`; `font-size: 10px`; `font-weight: 750` |
| `.inventory-purchase-toast__content strong` | `font-size: 14px`; `font-weight: 900` |
| `.inventory-purchase-toast__amount` | `color: #6ee7b7`; `font-size: 12px`; `font-weight: 850` |
| `.bonus-game-result-actions` | `margin-top: 18px` |
| `.modal-backdrop` | `padding: calc(20px + var(--app-safe-top)) 20px calc(20px + var(--app-safe-bottom))`; `background: var(--liquid-scrim)`; `backdrop-filter: blur(14px) saturate(115%)` |
| `.modal-card` | `width: min(100%, 320px)`; `border-radius: 24px`; `padding: 24px 22px 22px`; `background: var(--liquid-modal-bg)`; `border: 1.5px solid rgba(255, 255, 255, 0.86)`; `box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.5)`; `color: var(--ink)`; `backdrop-filter: blur(22px) saturate(150%)` |
| `.modal-card.tournament-wizard` | `width: min(100%, 1080px)`; `height: min(var(--app-viewport-height, 90dvh), 860px)`; `max-width: calc(100vw - 32px)`; `grid-template-rows: auto auto minmax(0, 1fr) auto`; `gap: 14px` |
| `.modal-card.tournament-wizard--schedule-only` | `grid-template-rows: auto minmax(0, 1fr) auto` |
| `.modal-card.experience-rating-modal` | `width: min(calc(100vw - 24px), 520px)`; `max-height: min(calc(var(--app-viewport-height, 100dvh) - 32px), 760px)`; `padding: 20px 16px 16px`; `grid-template-rows: auto minmax(0, 1fr)` |
| `.experience-rating-modal > div:last-child` | `min-height: 0`; `height: min(68dvh, 620px)` |
| `.experience-rating__viewport` | `min-height: 0` |
| `.experience-rating__title` | `gap: 7px` |
| `.experience-rating__title svg` | `width: 18px`; `height: 18px`; `color: var(--reward-experience)` |
| `.experience-rating__pinned .tournament-standing-table` | `border-radius: 0` |
| `.experience-rating__state` | `min-height: 160px`; `padding: 24px`; `gap: 12px`; `color: var(--muted)` |
| `.experience-rating__more, .experience-rating__retry` | `margin: 10px auto` |
| `.profile-balance--button` | `width: 100%`; `border: 0`; `padding: 0`; `color: inherit`; `background: transparent` |
| `.profile-balance--button:focus-visible` | `border-radius: 10px` |
| `.tournament-wizard__header` | `padding-bottom: 2px` |
| `.tournament-wizard__steps` | `gap: 6px`; `min-width: 0`; `padding: 2px 0 4px` |
| `.tournament-wizard__steps .chip` | `min-height: 32px`; `padding: 0 10px`; `font-size: 11px` |
| `.tournament-wizard .modal-copy` | `min-height: 0`; `margin: 0`; `padding: 2px 4px 12px 2px` |
| `.tournament-wizard__body` | `gap: 10px` |
| `.tournament-wizard .modal-actions` | `grid-template-columns: minmax(0, 1fr) auto auto`; `margin-top: 0`; `padding-top: 12px` |
| `.tournament-wizard__save-state` | `gap: 8px`; `min-width: 0`; `color: var(--muted)`; `font-size: 12px`; `font-weight: 800` |
| `.tournament-admin-grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 12px`; `min-width: 0` |
| `.tournament-admin-grid--single` | `grid-template-columns: minmax(0, 1fr)` |
| `.tournament-admin-grid--playoff-timing` | `grid-template-columns: repeat(3, minmax(0, 1fr))` |
| `.tournament-playoff-days` | `gap: 9px`; `min-width: 0` |
| `.tournament-playoff-days__header, .tournament-playoff-day__title` | `gap: 10px` |
| `.tournament-playoff-days__header strong, .tournament-playoff-day__title strong` | `color: var(--ink)`; `font-size: 12px`; `font-weight: 850` |
| `.tournament-playoff-days__header span` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 700` |
| `.tournament-playoff-days__list` | `gap: 8px` |
| `.tournament-pair-schedule__day` | `gap: 8px`; `min-width: 0`; `padding: 10px`; `border: 1px solid rgba(79, 101, 130, 0.16)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-pair-schedule__day > p` | `margin: 0`; `font-size: 12px` |
| `.tournament-playoff-day` | `grid-template-columns: minmax(132px, 1.2fr) minmax(118px, 0.9fr) minmax(118px, 0.8fr)`; `gap: 8px 10px`; `padding: 10px`; `border: 1px solid rgba(79, 101, 130, 0.16)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-playoff-day__title .admin-compact-btn` | `min-height: 28px`; `padding: 5px 9px` |
| `.tournament-playoff-days__add` | `min-height: 32px`; `padding: 6px 12px` |
| `.tournament-admin-field` | `gap: 6px`; `min-width: 0`; `color: var(--ink)` |
| `.tournament-admin-field__label` | `font-size: 12px`; `font-weight: 900`; `line-height: 1.2` |
| `.tournament-admin-field__help` | `margin: 0`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.35` |
| `.tournament-admin-field__help--group` | `margin: -2px 0 2px` |
| `.admin-screen .tournament-admin-textarea` | `width: 100%`; `min-width: 0`; `min-height: 124px`; `border: 1px solid rgba(255, 255, 255, 0.88)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `padding: 11px 12px`; `font-size: 13px`; `font-weight: 750`; `line-height: 1.4`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84), 0 8px 20px rgba(4, 18, 36, 0.08)` |
| `.admin-screen .tournament-admin-textarea--compact` | `min-height: 76px` |
| `.admin-screen .tournament-admin-textarea:focus` | `border-color: rgba(30, 91, 151, 0.72)`; `box-shadow: 0 0 0 3px rgba(92, 157, 215, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)` |
| `.tournament-admin-details, .tournament-playoff-round` | `min-width: 0`; `margin: 0`; `padding: 11px 12px`; `border: 1px solid rgba(79, 101, 130, 0.2)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)` |
| `.tournament-admin-details > summary` | `color: var(--ink)`; `font-size: 12px`; `font-weight: 900` |
| `.tournament-admin-details[open] > summary` | `margin-bottom: 10px` |
| `.tournament-playoff-round` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 10px 12px` |
| `.tournament-playoff-round__title` | `margin: 0`; `color: var(--ink)`; `font-size: 15px`; `font-weight: 900`; `line-height: 1.2` |
| `.tournament-playoff-round__timing-title` | `margin: 4px 0 0`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 900`; `line-height: 1.2` |
| `.tournament-admin-note, .tournament-review-card` | `gap: 6px`; `padding: 12px`; `border: 1px solid rgba(79, 101, 130, 0.16)`; `border-radius: 14px`; `background: var(--liquid-card-bg)`; `color: var(--muted)`; `font-size: 12px`; `line-height: 1.4` |
| `.tournament-lifecycle-panel` | `gap: 12px`; `margin: 0 4px` |
| `.tournament-lifecycle-panel p` | `margin: 0`; `color: rgba(244, 249, 255, 0.96)`; `font-size: 13px`; `font-weight: 750`; `line-height: 1.4` |
| `.tournament-lifecycle-panel__primary-action` | `width: 100%`; `min-height: 52px`; `padding: 12px 18px`; `border: 1px solid rgba(114, 177, 139, 0.56)`; `border-radius: 18px`; `background: rgba(43, 96, 65, 0.78)`; `color: rgba(239, 255, 245, 0.98)`; `font-size: 14px`; `font-weight: 850`; `letter-spacing: 0.02em`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 10px 24px rgba(20, 66, 43, 0.2)` |
| `.tournament-lifecycle-panel__primary-action:disabled` | `background: rgba(43, 96, 65, 0.44)`; `border-color: rgba(114, 177, 139, 0.3)` |
| `.tournament-schedule-shift` | `gap: 12px` |
| `.tournament-schedule-shift__summary` | `margin: 0`; `padding: 10px 12px`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-schedule-shift__summary div` | `gap: 4px` |
| `.tournament-schedule-shift__summary dt, .tournament-schedule-shift__note` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 620`; `line-height: 1.45` |
| `.tournament-schedule-shift__summary dd` | `margin: 0`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 780` |
| `.tournament-schedule-shift__note` | `margin: 0` |
| `.tournament-review-card strong` | `color: var(--ink)`; `font-size: 17px` |
| `.tournament-wizard .modal-primary` | `width: auto`; `min-width: 140px` |
| `.tournament-picker` | `gap: 8px`; `margin: 0`; `padding: 12px`; `border: 1px solid rgba(79, 101, 130, 0.2)`; `border-radius: 16px` |
| `.tournament-picker__selected` | `gap: 6px` |
| `.tournament-picker__results` | `gap: 6px` |
| `.tournament-picker__result` | `gap: 12px`; `min-height: 44px`; `padding: 8px 10px`; `border: 1px solid rgba(79, 101, 130, 0.18)`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)` |
| `.tournament-picker__result small` | `color: var(--muted)` |
| `.tournament-ordered-list, .tournament-home-sequence` | `gap: 8px`; `margin: 0`; `padding: 12px`; `border: 1px solid rgba(79, 101, 130, 0.2)`; `border-radius: 16px` |
| `.tournament-ordered-list__hint` | `color: var(--muted)`; `font-size: 12px` |
| `.tournament-ordered-list__row` | `gap: 10px`; `min-height: 40px`; `padding: 6px 8px`; `border-radius: 12px`; `background: var(--liquid-inset-bg)` |
| `.tournament-ordered-list__row > div, .tournament-home-sequence > div` | `gap: 6px` |
| `.modal-backdrop:has(.tournament-wizard)`<br>@media (max-width: 560px) | `padding: 0` |
| `.modal-card.tournament-wizard`<br>@media (max-width: 560px) | `width: 100%`; `height: var(--app-viewport-height, 100dvh) !important`; `max-width: none`; `max-height: none !important`; `border-radius: 0`; `padding: calc(14px + var(--app-safe-top)) 14px calc(14px + var(--app-safe-bottom))` |
| `.tournament-wizard .modal-actions`<br>@media (max-width: 560px) | `grid-template-columns: 1fr auto` |
| `.tournament-admin-grid, .tournament-admin-grid--playoff-timing, .tournament-playoff-round, .tournament-playoff-day`<br>@media (max-width: 560px) | `grid-template-columns: minmax(0, 1fr)` |
| `.tournament-wizard input, .tournament-wizard textarea, .tournament-wizard button[role='combobox']`<br>@media (max-width: 560px) | `font-size: 16px !important` |
| `.modal-header` | `gap: 12px` |
| `.modal-header .modal-title` | `min-width: 0` |
| `.modal-title` | `margin: 0`; `color: var(--ink)`; `font-size: 16px`; `font-weight: 950`; `line-height: 1.25`; `letter-spacing: 0` |
| `.modal-copy` | `margin: 14px 0 0`; `color: var(--muted)`; `font-size: 15px`; `font-weight: 700`; `line-height: 1.42`; `letter-spacing: 0` |
| `.arsenich-introduction-shell` | `padding: 40px 24px 0` |
| `.arsenich-introduction-shell::before` | `background: rgba(201, 220, 240, 0.08)`; `backdrop-filter: blur(14px) saturate(92%)` |
| `.arsenich-introduction` | `width: min(calc(100vw - 48px), 380px)`; `margin: 0 auto`; `padding: 14px`; `border-radius: 22px`; `box-shadow: 0 20px 46px rgba(2, 8, 23, 0.38)` |
| `.arsenich-introduction__header` | `gap: 14px` |
| `.arsenich-introduction__avatar` | `width: 56px`; `height: 56px`; `border: 2px solid rgba(255, 255, 255, 0.9)`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 18px rgba(15, 43, 68, 0.18)` |
| `.arsenich-introduction__copy` | `min-width: 0` |
| `.arsenich-introduction__copy strong` | `color: rgba(255, 255, 255, 0.98)`; `font-size: 16px`; `font-weight: 900`; `line-height: 1.18` |
| `.arsenich-introduction__description` | `gap: 12px`; `margin-top: 18px`; `color: rgba(255, 255, 255, 0.84)`; `font-size: 13px`; `font-weight: 650`; `line-height: 1.45` |
| `.arsenich-introduction__description p, .arsenich-introduction__hints` | `margin: 0` |
| `.arsenich-introduction__hints` | `gap: 10px`; `padding: 0` |
| `.arsenich-introduction__actions` | `margin-top: 14px` |
| `.arsenich-introduction__actions .btn--cta` | `border-color: rgba(255, 255, 255, 0.22)`; `background: var(--liquid-selected-bg)`; `color: #ffffff`; `box-shadow: 0 8px 20px rgba(15, 23, 42, 0.22)` |
| `.modal-actions` | `gap: 10px`; `margin-top: 22px` |
| `.modal-backdrop--sheet` | `padding: calc(16px + var(--app-safe-top)) 0 0` |
| `.modal-card.sheet-card` | `width: min(100%, 520px)`; `border-radius: 26px 26px 0 0`; `padding: 10px 18px calc(18px + var(--app-safe-bottom))` |
| `.sheet-grabber` | `width: 38px`; `height: 5px`; `margin: -2px auto 12px`; `border-radius: 999px`; `background: var(--liquid-card-bg)` |
| `.sheet-grabber--top` | `margin: -2px auto 10px` |
| `.sheet-drag-handle` | `min-height: 32px`; `margin: -10px -18px 0` |
| `.sheet-drag-handle .sheet-grabber` | `margin: 0` |
| `.public-profile-passport` | `gap: 12px`; `margin-top: -8px`; `padding: 0`; `border-radius: 0` |
| `.public-profile-identity` | `gap: 15px` |
| `.public-profile-identity__name` | `font-size: 25px` |
| `.public-profile-avatar` | `width: 80px`; `height: 80px` |
| `.public-profile-experience` | `gap: 3px`; `max-width: 115%`; `min-height: 24px`; `padding: 3px 7px`; `border: 1px solid rgba(255, 255, 255, 0.92)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 4px 12px rgba(15, 43, 68, 0.22)`; `color: var(--reward-experience)`; `font-size: 12px`; `font-weight: 900`; `line-height: 1` |
| `.public-profile-experience svg` | `width: 13px`; `height: 13px` |
| `.public-profile-experience__value` | `min-width: 0` |
| `.public-profile-identity .profile-identity__level` | `font-size: 15px` |
| `.sheet-content` | `min-width: 0` |
| `.modal-primary` | `min-height: 56px`; `width: 100%`; `border-radius: var(--r-pill)`; `font-size: 15px`; `font-weight: 900`; `letter-spacing: 0.12em` |
| `.receipt-payment-summary` | `min-width: 0`; `gap: 7px` |
| `.receipt-payment-summary__coins, .receipt-payment-summary__rubles` | `gap: 5px`; `font-size: 17px`; `font-weight: 950`; `line-height: 1` |
| `.receipt-payment-summary__coins` | `color: var(--reward-coin)` |
| `.receipt-payment-summary__rubles` | `color: var(--ink)` |
| `.receipt-payment-summary__separator` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 800` |
| `.modal-actions.receipt-payment-actions` | `margin-top: 8px` |
| `.modal-backdrop`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `padding: calc(18px + var(--app-safe-top)) 18px calc(18px + var(--app-safe-bottom))` |
| `.modal-card`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `max-width: calc(100vw - 56px)`; `border-radius: 20px`; `padding: 20px 18px 18px` |
| `.modal-title`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `font-size: 15px`; `line-height: 1.22` |
| `.modal-copy`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `margin-top: 10px`; `font-size: 13px`; `line-height: 1.36` |
| `.modal-actions`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `gap: 8px`; `margin-top: 18px` |
| `.modal-primary`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `min-height: 48px`; `font-size: 12.5px`; `letter-spacing: 0.08em` |
| `.bonus-game-launch-modal`<br>@media (hover: hover) and (pointer: fine) and (min-width: 700px) | `padding: 20px 18px 18px` |
| `.chat-create-field` | `width: 100%`; `min-height: 44px`; `border: 1px solid rgba(255, 255, 255, 0.86)`; `border-radius: 20px`; `background: var(--liquid-inset-bg)`; `padding: 0 16px`; `color: var(--ink)`; `font-size: 15px`; `font-weight: 700` |
| `.chat-create-field::placeholder` | `color: var(--liquid-muted)`; `font-weight: 400` |
| `.chat-create-search` | `min-height: 44px`; `gap: 8px`; `border-radius: 20px`; `background: var(--chrome-surface-bg, rgba(255, 255, 255, 0.92))`; `border: 1px solid var(--chrome-surface-border, transparent)`; `padding: 0 14px` |
| `.chat-create-field--bare` | `min-width: 0`; `min-height: 40px`; `border: none`; `border-radius: 0`; `background: transparent`; `padding: 0` |
| `.pill` | `padding: 6px 12px`; `border-radius: var(--r-pill)`; `background: var(--glass-bg)`; `border: 1px solid var(--glass-border)`; `font-size: 12px`; `font-weight: 700`; `color: var(--ink)`; `gap: 6px` |
| `.pill--dark` | `background: var(--liquid-selected-bg)`; `border: 1px solid rgba(15, 23, 42, 0.9)`; `color: #ffffff` |
| `.pill small` | `font-size: 9px`; `letter-spacing: 0.14em`; `font-weight: 600` |
| `.chip` | `min-height: 34px`; `padding: 0 16px`; `border-radius: var(--r-pill)`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.68)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68)`; `font-size: 14px`; `font-weight: 900`; `color: var(--ink)`; `backdrop-filter: var(--blur-md)`; `gap: 6px`; `line-height: 1` |
| `.chip--active` | `background: var(--liquid-selected-bg)`; `color: #ffffff`; `border: 1px solid rgba(15, 23, 42, 0.9)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 8px 18px rgba(15, 23, 42, 0.12)` |
| `.segmented-tabs` | `gap: 4px`; `padding: 4px`; `border-radius: var(--r-pill)`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.62)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74)` |
| `.segmented-tabs__item` | `min-width: 0`; `min-height: 42px`; `border-radius: var(--r-pill)`; `border: 1px solid transparent`; `background: transparent`; `color: var(--liquid-muted)`; `font-size: 13px`; `font-weight: 800`; `line-height: 1`; `padding: 0 10px` |
| `.segmented-tabs--compact .segmented-tabs__item` | `font-size: 11px`; `padding: 0 4px` |
| `.segmented-tabs--scrollable` | `padding-inline: 8px` |
| `.segmented-tabs--scrollable .segmented-tabs__item` | `min-width: max-content`; `min-height: 36px`; `padding-inline: 13px` |
| `.tournament-details > .segmented-tabs--scrollable .segmented-tabs__item` | `min-width: max-content` |
| `.segmented-tabs__item--active` | `border-color: rgba(15, 23, 42, 0.92)`; `background: var(--liquid-selected-bg)`; `color: #ffffff`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 8px 18px rgba(15, 23, 42, 0.12)` |
| `.app-shell--arena .segmented-tabs` | `background: rgba(226, 236, 246, 0.78)`; `border-color: rgba(255, 255, 255, 0.9)`; `box-shadow: 0 8px 22px rgba(2, 8, 23, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.86)`; `backdrop-filter: blur(16px) saturate(125%)` |
| `.app-shell--arena .segmented-tabs__item:not(.segmented-tabs__item--active)` | `color: var(--liquid-ink)`; `font-weight: 850` |
| `.segmented-tabs__attention` | `width: 7px`; `height: 7px`; `border-radius: 999px`; `background: rgba(220, 38, 38, 0.94)`; `box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14)` |
| `.segmented-tabs__attention--small` | `width: 6px`; `height: 6px`; `box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.14)` |
| `.btn` | `padding: 15px 20px`; `border-radius: var(--r-pill)`; `border: none`; `font-size: 16px`; `font-weight: 700`; `letter-spacing: 0.08em`; `gap: 0` |
| `.btn--cta` | `background: var(--liquid-selected-bg)`; `color: #ffffff`; `border: 1px solid rgba(15, 23, 42, 0.92)`; `backdrop-filter: var(--blur-sm)`; `box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.22), inset 0 -8px 18px rgba(3, 7, 18, 0.08), var(--shadow-cta)` |
| `.btn--cta:disabled` | `background: var(--liquid-selected-bg)`; `border-color: rgba(15, 23, 42, 0.16)`; `box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.12), inset 0 -8px 18px rgba(3, 7, 18, 0.04)` |
| `.btn--cta.bonus-game-card__action--repeat, .btn--cta.bonus-game-card__action--repeat:disabled` | `background: var(--liquid-selected-bg)`; `border-color: #0f172a`; `color: #ffffff`; `box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.2), inset 0 -8px 18px rgba(3, 7, 18, 0.08), var(--shadow-cta)` |
| `.btn--duel-blocked:disabled` | `background: var(--liquid-inset-bg)`; `border-color: rgba(148, 163, 184, 0.54)`; `color: rgba(255, 255, 255, 0.96)`; `box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.18), inset 0 -8px 18px rgba(15, 23, 42, 0.12)` |
| `.btn--primary` | `background: var(--blue-accent)`; `color: #ffffff`; `padding: 16px` |
| `.duel-stumble-notice, .duel-fatigue-notice, .initial-training-feedback-notice` | `gap: 9px`; `max-width: calc(100% - 40px)`; `padding: 9px 13px 10px`; `border-radius: clamp(14px, 5cqw, 22px)`; `border: 1px solid rgba(205, 232, 255, 0.46)`; `background: var(--liquid-inset-bg)`; `color: rgba(255, 255, 255, 0.96)`; `font-size: 12px`; `font-weight: 500`; `letter-spacing: 0`; `line-height: 1`; `box-shadow: 0 3px 10px rgba(0, 10, 27, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(112, 182, 247, 0.12)`; `backdrop-filter: blur(18px) saturate(1.45)` |
| `.duel-stumble-notice::before, .duel-fatigue-notice::before, .initial-training-feedback-notice::before` | `width: 3px`; `height: 18px`; `border-radius: 2px` |
| `.duel-stumble-notice::before` | `background: #facc15` |
| `.bonus-game-endurance-timer` | `width: auto`; `min-width: clamp(120px, 34%, 180px)`; `gap: clamp(3px, 1.2cqw, 5px)`; `padding: 10px 22px 11px`; `color: #6fac78` |
| `.bonus-game-endurance-timer__value` | `font-size: clamp(34px, 8vw, 48px)`; `font-weight: 900`; `letter-spacing: -0.025em`; `line-height: 1` |
| `.bonus-game-endurance-timer--warning` | `color: #d9ae3d` |
| `.bonus-game-endurance-timer--danger` | `color: #df6b6b` |
| `.duel-fatigue-notice::before` | `background: #fb923c` |
| `.initial-training-feedback-notice` | `width: min(440px, calc(100% - 40px))`; `line-height: 1.35` |
| `.initial-training-feedback-notice::before` | `background: #34d399` |
| `.initial-training-feedback-notice--warning::before` | `background: #facc15` |
| `.initial-training-feedback-notice--error::before` | `background: #fb7185` |
| `.initial-training-feedback-notice--scoreboard` | `width: max-content`; `max-width: min(86%, 404px)` |
| `.duel-fatigue-notice.initial-training-feedback-notice--scoreboard` | `max-width: min(calc(100% - 40px), 316px)`; `font-size: clamp(9px, 2.75vw, 12px)` |
| `.bonus-challenge-environment-notice.initial-training-feedback-notice--scoreboard` | `width: max-content`; `max-width: min(calc(100% - 40px), 404px)`; `padding-inline: clamp(8px, 2.4cqw, 13px)`; `font-size: clamp(8px, 2.25cqw, 11px)`; `line-height: 1` |
| `.fitted-scoreboard-notice.initial-training-feedback-notice--scoreboard` | `width: 100%`; `max-width: 100%`; `min-width: 0`; `padding-inline: 13px`; `font-size: 12px`; `line-height: 1` |
| `.duel-fatigue-notice.fitted-scoreboard-notice.initial-training-feedback-notice--scoreboard` | `width: max-content`; `max-width: 100%` |
| `.fitted-scoreboard-notice > span` | `min-width: 0` |
| `.duel-heavy-fatigue-notice::before` | `background: #f97316` |
| `.duel-rest-notice::before` | `background: #94a3b8` |
| `.duel-stumble-notice, .duel-fatigue-notice, .initial-training-feedback-notice`<br>@media (prefers-reduced-transparency: reduce) | `background: var(--liquid-inset-bg)`; `backdrop-filter: none` |
| `.duel-stumble-notice, .duel-fatigue-notice, .initial-training-feedback-notice`<br>@media (prefers-contrast: more) | `border-color: rgba(255, 255, 255, 0.72)`; `background: var(--liquid-inset-bg)` |
| `.btn--accent` | `background: var(--blue-accent)`; `color: #ffffff`; `border: 1px solid rgba(34, 158, 217, 0.92)`; `backdrop-filter: var(--blur-sm)`; `box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.24), inset 0 -8px 18px rgba(3, 105, 161, 0.1), 0 10px 22px rgba(34, 158, 217, 0.24)` |
| `.btn--ghost` | `background: var(--glass-bg)`; `border: 1px solid var(--glass-border)`; `color: var(--ink)`; `padding: 16px`; `backdrop-filter: var(--blur-md)` |
| `.icon-btn` | `width: 34px`; `height: 34px`; `border-radius: var(--r-pill)`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(15, 23, 42, 0.1)`; `color: var(--liquid-muted)`; `padding: 0`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.36), 0 4px 10px rgba(15, 23, 42, 0.04)`; `backdrop-filter: none` |
| `.icon-btn--dark` | `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(15, 23, 42, 0.9)`; `color: #ffffff` |
| `.app-shell--arena .icon-btn:is([aria-label='Назад'], [aria-label='К списку чатов']), .catalog-header-back, .icon-btn--page-back` | `width: 38px`; `height: 38px`; `min-width: 38px`; `min-height: 38px`; `background: var(--chrome-surface-bg)`; `border-color: var(--chrome-surface-border)`; `color: var(--liquid-ink)`; `box-shadow: 0 7px 18px rgba(2, 8, 23, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.82)`; `backdrop-filter: blur(12px) saturate(140%)` |
| `.home-arena-modal-card` | `width: min(430px, calc(100vw - 28px))`; `max-height: min(76vh, 680px)`; `gap: 14px` |
| `.home-arena-options` | `min-width: 0`; `margin: 0`; `padding: 0`; `border: 0`; `gap: 8px` |
| `.home-arena-option` | `min-height: 70px`; `padding: 8px`; `grid-template-columns: auto 72px minmax(0, 1fr)`; `gap: 10px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 16px`; `color: var(--ink)`; `background: rgba(255, 255, 255, 0.28)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.66)` |
| `.home-arena-option:has(input:checked)` | `border-color: rgba(15, 23, 42, 0.82)`; `color: #ffffff`; `background: rgba(15, 23, 42, 0.76)` |
| `.home-arena-option input` | `margin: 0 0 0 4px` |
| `.home-arena-option img` | `width: 72px`; `height: 52px`; `border-radius: 11px`; `border: 1px solid rgba(255, 255, 255, 0.66)` |
| `.home-arena-option span` | `min-width: 0`; `font-size: 15px`; `font-weight: 900`; `line-height: 1.2` |
| `.home-arena-modal-error` | `margin: 0`; `color: var(--red-deep)`; `font-size: 13px`; `font-weight: 800`; `line-height: 1.35` |
| `.home-arena-modal-status` | `margin: 0`; `padding: 11px 13px`; `border: 1px solid rgba(15, 23, 42, 0.2)`; `border-radius: 14px`; `color: var(--ink)`; `background: rgba(255, 255, 255, 0.44)`; `font-size: 13px`; `font-weight: 850`; `line-height: 1.35` |
| `.profile-screen, .profile-detail-screen` | `min-height: 100%`; `padding: calc(14px + var(--app-safe-top)) 14px calc(98px + var(--app-safe-bottom))`; `color: var(--ink)` |
| `.profile-screen--locker-bg, .mode-shell--locker` | `background-color: var(--liquid-inset-bg)` |
| `.locker-room-bg--beginner` | `background: linear-gradient(180deg, rgba(7, 20, 39, 0.12), rgba(7, 20, 39, 0.38)), url('/backgrounds/locker-room-beginner.webp') center top / cover no-repeat` |
| `.locker-room-bg--amateur` | `background: linear-gradient(180deg, rgba(7, 20, 39, 0.12), rgba(7, 20, 39, 0.38)), url('/backgrounds/locker-room-amateur.webp') center top / cover no-repeat` |
| `.locker-room-bg--professional` | `background: linear-gradient(180deg, rgba(7, 20, 39, 0.12), rgba(7, 20, 39, 0.38)), url('/backgrounds/locker-room-detailed.webp') center top / cover no-repeat` |
| `.profile-screen--status, .profile-detail-screen--status` | `color: var(--muted)`; `font-size: 14px`; `font-weight: 800` |
| `.profile-error-state` | `width: min(100%, 340px)`; `gap: 10px`; `padding: 22px`; `border: 1px solid rgba(255, 255, 255, 0.86)`; `border-radius: 24px`; `background: var(--liquid-inset-bg)`; `box-shadow: var(--shadow-glass)` |
| `.profile-error-state h1, .profile-error-state p, .profile-detail-card h2, .profile-detail-card p, .profile-equipment-slot p, .profile-equipment-slot h2, .profile-equipment-slot span, .profile-arena-preview p, .profile-arena-preview h2` | `margin: 0` |
| `.profile-error-state h1` | `font-size: 18px` |
| `.profile-error-state p, .profile-detail-card p:not(.profile-detail-card__eyebrow)` | `color: var(--muted)`; `font-size: 13px`; `font-weight: 650`; `line-height: 1.45` |
| `.profile-passport` | `gap: 12px`; `padding: 14px`; `border-radius: 24px` |
| `.profile-passport__top` | `gap: 12px` |
| `.profile-identity__main` | `min-width: 0`; `gap: 12px` |
| `.profile-early-player-badge` | `width: 34px`; `height: 34px`; `min-width: 34px`; `margin: 0 3px 0 auto`; `padding: 0`; `border: 0`; `color: var(--reward-experience)`; `background: transparent` |
| `.profile-early-player-badge svg` | `width: 21px`; `height: 21px` |
| `.profile-early-player-badge:focus-visible` | `border-radius: 12px` |
| `.profile-early-player-modal__badge` | `width: 112px`; `height: 112px`; `margin: -2px auto 2px` |
| `.profile-early-player-modal__badge img` | `width: 100%`; `height: 100%` |
| `.profile-identity__avatar` | `width: 56px`; `height: 56px`; `padding: 0`; `border: 2px solid rgba(255, 255, 255, 0.9)`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 18px rgba(15, 43, 68, 0.18)` |
| `.profile-identity__avatar img, .profile-identity__avatar span` | `width: 100%`; `height: 100%` |
| `.profile-identity__avatar span` | `color: var(--liquid-muted)`; `font-size: 21px`; `font-weight: 950` |
| `.profile-identity__copy` | `min-width: 0`; `gap: 5px` |
| `.profile-identity__name` | `font-size: 20px`; `font-weight: 900`; `line-height: 1.1` |
| `.profile-identity__level` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 750` |
| `.profile-balances` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)` |
| `.profile-balance` | `min-width: 0`; `gap: 3px`; `padding: 10px 6px` |
| `.profile-balance__label` | `color: var(--muted-soft)`; `font-size: 9px`; `font-weight: 850`; `letter-spacing: 0.04em` |
| `.profile-balance__amount` | `min-width: 0`; `gap: 4px`; `font-size: clamp(14px, 4vw, 18px)`; `line-height: 1.05` |
| `.profile-balance__value` | `min-width: 0` |
| `.profile-fitted-number` | `width: 100%`; `min-width: 0` |
| `.profile-balance__amount svg` | `width: 14px`; `height: 14px` |
| `.profile-balance__amount--coins` | `color: var(--reward-coin)` |
| `.profile-balance__amount--stars` | `color: var(--reward-star)` |
| `.profile-balance__amount--experience` | `color: var(--reward-experience)` |
| `.profile-screen__heading` | `margin: 18px 0 11px` |
| `.profile-screen__heading-title` | `margin: 0` |
| `.profile-hub-grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 12px` |
| `.profile-hub-card` | `min-width: 0` |
| `.profile-trophy-showcase` | `padding: 12px 2px 0`; `grid-template-columns: repeat(4, minmax(0, 1fr))`; `gap: 4px` |
| `.profile-trophy-showcase__item` | `border: 0`; `background: transparent`; `padding: 0`; `min-width: 0`; `gap: 3px` |
| `.profile-trophy-history` | `gap: 10px` |
| `.modal-card.profile-trophy-history-modal` | `width: min(560px, calc(100vw - 32px))`; `max-height: min( 80dvh, calc(var(--app-viewport-height, 100dvh) - var(--app-safe-top) - var(--app-safe-bottom) - 32px), 760px )`; `grid-template-rows: auto minmax(0, 1fr)` |
| `.profile-trophy-history-modal > div:last-child` | `min-height: 0`; `max-height: min( calc(80dvh - 74px), calc(var(--app-viewport-height, 100dvh) - var(--app-safe-top) - var(--app-safe-bottom) - 106px), 660px )` |
| `.profile-trophy-history__tournament` | `min-width: 0`; `grid-template-columns: 72px minmax(0, 1fr)`; `gap: 10px`; `padding: 10px`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.5)` |
| `.profile-trophy-history__tournament img` | `width: 72px`; `height: 72px`; `border-radius: 12px` |
| `.profile-trophy-history__tournament-copy` | `min-width: 0`; `gap: 4px` |
| `.profile-trophy-history__tournament strong` | `color: var(--ink)` |
| `.profile-trophy-history__tournament small, .profile-trophy-history__challenge-summary small` | `color: var(--muted)`; `font-size: 12px` |
| `.profile-trophy-history__tournament em, .profile-trophy-history__challenge p` | `color: var(--ink)`; `font-size: 12px`; `font-weight: 800`; `line-height: 1.25` |
| `.profile-trophy-history__challenge` | `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.5)` |
| `.profile-trophy-history__challenge-toggle` | `width: 100%`; `min-width: 0`; `grid-template-columns: minmax(0, 1fr) auto`; `gap: 10px`; `padding: 15px 16px`; `border: 0`; `border-radius: 15px`; `background: transparent`; `color: inherit` |
| `.profile-trophy-history__challenge-toggle:focus-visible` | `border-radius: 10px` |
| `.profile-trophy-history__challenge-summary` | `min-width: 0`; `color: var(--muted)`; `font-size: 13px`; `font-weight: 850` |
| `.profile-trophy-history__challenge-chevron` | `width: 18px`; `height: 18px`; `color: var(--liquid-muted)` |
| `.profile-trophy-history__challenge-toggle[aria-expanded='true']` | `border-radius: 15px 15px 0 0` |
| `.profile-trophy-history__challenge-details` | `gap: 10px`; `padding: 10px 16px 16px`; `background: var(--liquid-inset-bg)` |
| `.profile-trophy-history__challenge-details > strong` | `color: var(--ink)`; `font-size: 16px`; `line-height: 1.25` |
| `.profile-trophy-history__challenge-tasks` | `gap: 7px`; `margin: 0`; `padding: 0` |
| `.weekly-challenge-failure-modal__tasks` | `gap: 8px`; `margin: 8px 0 4px` |
| `.weekly-challenge-failure-modal__task` | `grid-template-columns: 22px minmax(0, 1fr) auto`; `gap: 8px`; `padding: 10px 12px`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 800` |
| `.weekly-challenge-failure-modal__status` | `width: 20px`; `height: 20px`; `border: 1px solid rgba(15, 23, 42, 0.2)`; `border-radius: 50%` |
| `.weekly-challenge-failure-modal__task--completed .weekly-challenge-failure-modal__status` | `border-color: #16a34a`; `background: #16a34a`; `color: white` |
| `.profile-trophy-history__challenge-tasks li` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 12px`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 750`; `line-height: 1.3` |
| `.profile-trophy-history__challenge-tasks li > strong` | `min-width: 30px` |
| `.profile-trophy-showcase__item svg` | `width: 18px`; `height: 18px`; `color: #e0a92c` |
| `.profile-trophy-showcase__item strong` | `width: 100%`; `min-width: 0`; `color: var(--ink)`; `font-size: 18px`; `line-height: 1` |
| `.profile-trophy-showcase__number` | `color: inherit`; `line-height: inherit` |
| `.profile-trophy-showcase__item > span` | `color: var(--muted)`; `font-size: 9px`; `line-height: 1.12`; `font-weight: 800` |
| `.profile-sporting-metrics` | `grid-template-columns: repeat(4, minmax(0, 1fr))`; `border-radius: 17px`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.13)` |
| `.profile-sporting-metrics__item` | `min-width: 0`; `gap: 4px`; `min-height: 58px`; `padding: 8px 3px`; `color: #fff` |
| `.profile-sporting-metrics__item--button` | `border: 0`; `background: transparent`; `color: inherit` |
| `.profile-sporting-metrics__item--button:active` | `background: var(--liquid-selected-bg)` |
| `.stat-rating__eligibility` | `gap: 3px`; `margin: 0 0 10px`; `padding: 10px 12px`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)`; `font-size: 12px` |
| `.profile-sporting-metrics__item strong` | `width: 100%`; `max-width: 100%`; `color: #fff`; `font-size: 17px`; `line-height: 1` |
| `.profile-sporting-metrics__item .profile-fitted-number` | `color: #fff` |
| `.profile-sporting-metrics__item .profile-streak-record` | `color: rgba(230, 242, 250, 0.56)`; `font-size: 0.72em`; `font-weight: 500` |
| `.profile-sporting-metrics__item .profile-registration-date` | `color: #ffffff`; `font-size: 0.67em`; `font-weight: 600` |
| `.profile-sporting-metrics__item .profile-registration-date__prefix` | `color: rgba(230, 242, 250, 0.58)`; `font-size: 0.72em`; `font-weight: 500` |
| `.profile-sporting-metrics__item span` | `color: rgba(230, 242, 250, 0.74)`; `font-size: 8px`; `line-height: 1.12`; `font-weight: 850`; `letter-spacing: 0.025em` |
| `.profile-sports-data` | `gap: 12px`; `margin-top: 14px` |
| `.profile-equipment-section, .profile-referral-section, .profile-career-section, .profile-settings-section, .profile-community-section` | `gap: 7px` |
| `.profile-referral-panel` | `width: 100%`; `height: 116px`; `min-width: 0`; `padding: 14px`; `border: 1px solid var(--glass-border)`; `border-radius: 24px`; `grid-template-columns: 86px minmax(0, 1fr) 20px`; `gap: 10px`; `color: var(--ink)` |
| `.profile-referral-panel__open` | `width: 100%`; `padding: 0`; `border: 0`; `border-radius: inherit`; `background: transparent` |
| `.profile-referral-panel__artwork` | `width: 86px`; `height: 86px`; `border: 1px solid rgba(255,255,255,.82)`; `border-radius: 22px`; `background: var(--liquid-card-bg)` |
| `.profile-referral-panel__artwork img` | `width: 100%`; `height: 100%` |
| `.profile-referral-panel__attention` | `width: 7px`; `height: 7px`; `margin-top: 8px`; `border-radius: 999px`; `background: rgba(220, 38, 38, .94)` |
| `.profile-referral-panel__side` | `width: 20px`; `height: 86px`; `grid-template-rows: 1fr auto 1fr` |
| `.profile-referral-section__count` | `color: rgba(255,255,255,.94)` |
| `.profile-referral-panel__copy` | `min-width: 0`; `height: 86px`; `gap: 12px` |
| `.profile-referral-panel__copy > strong` | `font-size: 19px`; `font-weight: 950`; `line-height: 1.05` |
| `.profile-referral-panel__copy > small` | `color: var(--muted)`; `font-size: 8.5px`; `line-height: 1.15`; `font-weight: 750` |
| `.profile-referral-actions` | `min-width: 0`; `gap: 5px` |
| `.profile-referral-actions__group` | `min-width: 0` |
| `.profile-referral-actions__label` | `color: var(--muted-soft)`; `font-size: 8px`; `font-weight: 850`; `line-height: 1`; `letter-spacing: .05em` |
| `.profile-referral-actions__value` | `height: 30px`; `font-size: 15px`; `line-height: 1`; `letter-spacing: .035em` |
| `.profile-referral-actions__buttons` | `height: 30px`; `gap: 4px` |
| `.profile-referral-actions__buttons > button` | `width: 72px`; `min-width: 0`; `padding: 0 7px`; `border: 1px solid rgba(255,255,255,.22)`; `border-radius: 9px`; `background: var(--liquid-inset-bg)`; `color: #fff`; `box-shadow: 0 3px 8px rgba(15,48,77,.2)`; `gap: 3px` |
| `.referrals-screen` | `width: 100%`; `max-width: 100%`; `min-width: 0`; `gap: 14px`; `padding-bottom: calc(var(--bottom-nav-space) + 14px)` |
| `.referral-invite-card` | `width: 100%`; `min-width: 0`; `padding: 16px`; `border-radius: 24px`; `gap: 15px` |
| `.referral-invite-card__copy` | `gap: 6px` |
| `.referral-invite-card__copy h2` | `margin: 0`; `color: var(--ink)`; `font-size: 17px`; `line-height: 1.1` |
| `.referral-invite-card__copy p` | `margin: 0`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 700`; `line-height: 1.35` |
| `.referral-invite-card__fields` | `min-width: 0`; `gap: 8px` |
| `.referral-invite-field` | `min-width: 0`; `min-height: 52px`; `padding: 8px 8px 8px 11px`; `border: 1px solid rgba(255,255,255,.62)`; `border-radius: 15px`; `background: var(--liquid-inset-bg)`; `gap: 9px` |
| `.referral-invite-field > span` | `min-width: 0`; `gap: 3px` |
| `.referral-invite-field small` | `color: var(--muted-soft)`; `font-size: 8px`; `font-weight: 850`; `letter-spacing: .05em` |
| `.referral-invite-field strong` | `min-width: 0`; `color: var(--ink)`; `font-size: 13px`; `line-height: 1.1` |
| `.referral-invite-field:first-child strong` | `font-size: 17px`; `letter-spacing: .05em` |
| `.referral-invite-field button` | `height: 34px`; `padding: 0 11px`; `border: 1px solid rgba(255,255,255,.22)`; `border-radius: 10px`; `background: var(--liquid-inset-bg)`; `color: #fff`; `box-shadow: 0 3px 8px rgba(15,48,77,.2)`; `gap: 5px` |
| `.referral-rewards-section` | `width: 100%`; `max-width: 100%`; `min-width: 0`; `gap: 7px` |
| `.referral-rewards-section > .section-label` | `width: max-content`; `margin: 0`; `padding: 2px 8px` |
| `.referral-rewards` | `width: 100%`; `max-width: 100%`; `min-width: 0`; `padding: 14px`; `border-radius: 24px` |
| `.referral-rewards__track` | `width: 100%`; `min-width: 0`; `gap: 7px`; `padding: 2px` |
| `.referral-reward` | `min-width: 66px`; `padding: 9px 6px`; `border: 1px solid var(--glass-border)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `gap: 5px` |
| `.referral-reward > span` | `width: 26px`; `height: 26px`; `border-radius: 50%`; `background: var(--liquid-inset-bg)` |
| `.referral-reward strong` | `gap: 3px`; `color: var(--reward-star)`; `font-size: 12px` |
| `.referral-reward small` | `font-size: 9px`; `font-weight: 850` |
| `.referral-reward--claimable` | `border-color: rgba(217,119,6,.45)`; `box-shadow: 0 6px 16px rgba(217,119,6,.14)` |
| `.referral-rewards__progress` | `height: 23px`; `margin-top: 11px`; `border: 1px solid rgba(255,255,255,.72)`; `border-radius: 999px`; `background: rgba(92,115,137,.17)`; `box-shadow: inset 0 1px 3px rgba(15,23,42,.08)` |
| `.referral-rewards__progress > span` | `border-radius: inherit`; `background: linear-gradient(90deg,#3d8fc4,#64b7da)` |
| `.referral-rewards__progress > strong` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 950` |
| `.referral-list-section` | `width: 100%`; `max-width: 100%`; `min-width: 0`; `gap: 7px` |
| `.referral-list-section > .section-label` | `width: max-content`; `margin: 0`; `padding: 2px 8px` |
| `.referral-list-section > .section-label` | `gap: 4px` |
| `.referral-list-section__count` | `color: rgba(255,255,255,.94)` |
| `.referral-player-list` | `width: 100%`; `max-width: 100%`; `min-width: 0`; `border-radius: 24px` |
| `.referral-player` | `width: 100%`; `min-height: 64px`; `padding: 10px 13px`; `border: 0`; `background: transparent`; `color: var(--ink)`; `gap: 10px` |
| `.referral-player__avatar` | `width: 42px`; `height: 42px`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `font-weight: 850` |
| `.referral-player__avatar img` | `width: 100%`; `height: 100%` |
| `.referral-player__copy` | `min-width: 0`; `gap: 3px` |
| `.referral-player__copy strong` | `font-size: 13px` |
| `.referral-player__copy small` | `min-width: 0`; `color: var(--muted)`; `font-size: 10px`; `font-weight: 700`; `gap: 4px` |
| `.referral-player__experience` | `color: var(--reward-experience)`; `gap: 2px`; `font-weight: 900` |
| `.referral-player__experience svg` | `width: 12px`; `height: 12px` |
| `.referral-empty` | `margin: 0`; `padding: 18px`; `color: var(--muted)`; `font-size: 12px` |
| `.referral-empty--inline` | `padding: 5px 8px 3px`; `color: rgba(255,255,255,.78)` |
| `.referrals-empty-state` | `padding: 18px`; `border-radius: 24px`; `gap: 5px` |
| `.referrals-empty-state strong` | `font-size: 14px` |
| `.referrals-empty-state span` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 700` |
| `.referral-load-more` | `width: calc(100% - 24px)`; `margin: 10px 12px 12px` |
| `.profile-community-story-grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 8px` |
| `.profile-community-settings-column, .profile-story-section` | `min-width: 0`; `gap: 14px` |
| `.profile-story-section` | `gap: 7px` |
| `.official-account-hero` | `min-height: 200px`; `border: 1px solid rgba(255, 255, 255, 0.88)`; `border-radius: 20px`; `background-color: var(--liquid-inset-bg)`; `box-shadow: 0 14px 28px rgba(15, 23, 42, 0.16)` |
| `.official-account-hero__caption` | `width: calc(100% - 24px)`; `margin: 0 12px 12px`; `padding: 10px 14px 11px`; `border: 1px solid rgba(255, 255, 255, 0.22)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 22px rgba(3, 8, 18, 0.24)`; `color: #fff`; `backdrop-filter: blur(9px)` |
| `.official-account-hero__caption h3` | `margin: 0 0 2px`; `color: #fff`; `font-size: clamp(18px, 5.3vw, 21px)`; `line-height: 1.15` |
| `.official-account-hero__caption div` | `color: rgba(240, 246, 255, 0.9)`; `font-size: 12px`; `font-weight: 700`; `line-height: 1.35` |
| `.profile-sports-data .profile-section-label` | `width: max-content`; `margin: 0`; `padding: 2px 8px`; `border: 0`; `background: transparent` |
| `.profile-equipment-panel, .profile-career-panel, .profile-utility-card` | `min-width: 0`; `border: 1px solid var(--glass-border)`; `color: var(--ink)` |
| `.profile-equipment-panel, .profile-career-panel` | `width: 100%`; `padding: 13px`; `border-radius: 24px` |
| `.profile-section-heading, .profile-loadout-slot, .profile-career-award, .profile-picker-item` | `border: 0` |
| `.profile-section-heading` | `width: 100%`; `padding: 0`; `background: transparent` |
| `.profile-loadout-slot` | `padding: 0`; `background: transparent`; `color: var(--ink)` |
| `.profile-section-heading` | `min-width: 0`; `gap: 12px` |
| `.profile-section-heading > span` | `min-width: 0`; `gap: 2px` |
| `.profile-section-heading strong` | `font-size: 18px`; `font-weight: 950`; `line-height: 1.05` |
| `.profile-section-heading small` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 750` |
| `.profile-section-heading > svg` | `width: 18px`; `height: 18px`; `color: var(--muted-soft)` |
| `.profile-loadout` | `gap: 10px`; `padding: 1px 10% 5px 1px` |
| `.profile-loadout-slot` | `min-width: 0`; `gap: 3px` |
| `.recovery-kit-options` | `gap: 8px`; `margin: 12px 0` |
| `.recovery-kit-option` | `width: 100%`; `min-width: 0`; `grid-template-columns: 64px minmax(0, 1fr) 22px`; `gap: 10px`; `padding: 8px`; `border: 1px solid rgba(148, 163, 184, 0.42)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)` |
| `.recovery-kit-option--selected` | `border-color: #2563eb`; `box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.28)` |
| `.recovery-kit-option img` | `width: 64px`; `height: 64px`; `border-radius: 14px` |
| `.recovery-kit-option > span` | `min-width: 0`; `gap: 3px` |
| `.recovery-kit-option strong` | `font-size: 15px`; `font-weight: 950` |
| `.recovery-kit-option small` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 760` |
| `.profile-loadout-slot__image` | `border: 1px solid rgba(255, 255, 255, 0.84)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 7px 16px rgba(19, 49, 75, 0.12)` |
| `.profile-loadout-slot__image img` | `width: 100%`; `height: 100%` |
| `.profile-loadout-slot__image strong` | `max-width: calc(100% - 10px)`; `padding: 3px 6px`; `border: 1px solid rgba(255, 255, 255, 0.28)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: #fff`; `font-size: 9px`; `line-height: 1` |
| `.profile-loadout-slot__kind` | `margin-top: 3px`; `color: var(--muted-soft)`; `font-size: 8px`; `font-weight: 850`; `letter-spacing: 0.05em` |
| `.profile-loadout-slot__title` | `font-size: 10px`; `font-weight: 850`; `line-height: 1.15` |
| `.profile-career-list--scroll` | `min-height: 95px`; `gap: 12px` |
| `.profile-career-award` | `width: 84px`; `gap: 6px`; `padding: 0`; `background: transparent`; `color: var(--ink)` |
| `.profile-career-award__image` | `width: 64px`; `height: 64px` |
| `.profile-career-award img` | `width: 64px`; `height: 64px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 18px`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 18px rgba(15, 23, 42, 0.12)` |
| `.profile-career-award > .profile-achievement-title` | `height: 25px`; `width: 100%`; `color: var(--muted)`; `font-size: 10px`; `font-weight: 700`; `line-height: 1.25` |
| `.profile-career-award__level` | `width: auto`; `height: auto`; `padding: 2px 5px`; `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: #fff`; `font-size: 8px`; `font-weight: 800`; `line-height: 1`; `box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22)` |
| `.profile-achievement-title` | `font-size: 10px` |
| `.profile-career-award .profile-achievement-title--compact, .profile-achievement-title--compact` | `font-size: 8px`; `letter-spacing: -0.02em` |
| `.profile-career-empty-copy` | `width: 100%`; `padding: 14px 6px`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 750` |
| `.profile-picker-list` | `min-height: 0`; `max-height: min(54dvh, 430px)`; `gap: 8px` |
| `.profile-picker-list .duel-equipment-option` | `width: 100%`; `grid-template-columns: 56px minmax(0, 1fr) 22px`; `gap: 10px`; `min-height: 78px`; `padding: 10px`; `border-radius: 16px`; `color: var(--ink)` |
| `.profile-picker-list .duel-equipment-option > img` | `width: 56px`; `height: 56px`; `border: 1px solid rgba(255, 255, 255, 0.8)`; `border-radius: 14px` |
| `.profile-picker-list .duel-equipment-option > span:not(.duel-equipment-option__check)` | `min-width: 0`; `gap: 5px` |
| `.profile-picker-list .duel-equipment-option strong` | `font-size: 15px`; `font-weight: 950`; `line-height: 1.12` |
| `.profile-picker-list .duel-equipment-option small` | `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 760`; `line-height: 1.25` |
| `.profile-haptic-diagnostic` | `gap: 8px`; `margin-top: 10px`; `padding-top: 10px` |
| `.profile-haptic-diagnostic .btn` | `min-height: 38px` |
| `.profile-haptic-diagnostic p` | `margin: 0`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 750`; `line-height: 1.35` |
| `.achievement-details-modal__content` | `gap: 12px`; `color: var(--ink)` |
| `.modal-card.achievement-details-modal--crisp` | `background: var(--liquid-modal-bg)`; `backdrop-filter: none` |
| `.achievement-details-modal__image` | `width: 100%`; `border-radius: 18px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 18px rgba(15, 23, 42, 0.12)` |
| `.achievement-details-modal__level` | `padding: 4px 8px`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: #fff`; `font-size: 10px`; `font-weight: 800`; `line-height: 1`; `box-shadow: 0 2px 8px rgba(15, 23, 42, 0.22)` |
| `.achievement-details-modal__content p` | `margin: 0`; `color: var(--muted)`; `font-size: 14px`; `line-height: 1.45` |
| `.achievement-details-modal__requirement` | `color: var(--muted)`; `font-size: 13px`; `line-height: 1.5` |
| `.achievement-details-modal__requirement strong` | `color: var(--ink)`; `font-weight: 900` |
| `.profile-utility-grid` | `grid-template-columns: minmax(0, 1fr)`; `gap: 10px` |
| `.profile-utility-card` | `grid-template-columns: 42px minmax(0, 1fr) 14px`; `gap: 8px`; `padding: 10px`; `border-radius: 19px` |
| `.profile-utility-card--settings` | `min-height: 70px`; `grid-template-columns: 50px minmax(0, 1fr) 14px` |
| `.profile-utility-card__visual` | `width: 42px`; `height: 42px`; `border-radius: 13px`; `background: var(--liquid-card-bg)` |
| `.profile-utility-card--settings .profile-utility-card__visual` | `width: 50px`; `height: 50px` |
| `.profile-utility-card__visual img` | `width: 100%`; `height: 100%` |
| `.profile-utility-card__visual--icon` | `background: var(--liquid-card-bg)` |
| `.profile-utility-card__visual svg` | `width: 20px`; `height: 20px`; `color: var(--liquid-muted)` |
| `.profile-utility-card__visual--icon svg` | `color: rgba(255, 255, 255, 0.92)` |
| `.profile-utility-card__copy` | `min-width: 0`; `gap: 3px` |
| `.profile-utility-card__copy strong` | `font-size: 11px`; `font-weight: 900` |
| `.profile-utility-card__copy .profile-settings-card__title` | `color: var(--ink)`; `font-size: 13px`; `font-weight: 900` |
| `.profile-utility-card__copy small` | `color: var(--muted)`; `font-size: 8px`; `font-weight: 750` |
| `.profile-utility-card__copy .profile-utility-card__subtitle` | `color: var(--muted-soft)`; `font-size: 8px`; `font-weight: 850`; `letter-spacing: 0.05em` |
| `.profile-utility-card > svg` | `width: 14px`; `height: 14px`; `color: var(--muted-soft)` |
| `.profile-community-icon-grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 4px`; `padding: 12px 2px 0` |
| `.profile-community-icon-card` | `min-width: 0`; `min-height: 50px`; `padding: 0`; `color: var(--ink)` |
| `.profile-community-card__icon` | `width: 50px`; `height: 50px`; `border-radius: 16px`; `color: #fff`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28)` |
| `.profile-community-card__icon--vk img` | `width: 100%`; `height: 100%` |
| `.profile-community-card__icon--telegram` | `background: linear-gradient(145deg, #38bdf8, #168acd)` |
| `.profile-community-card__icon--telegram img` | `width: 100%`; `height: 100%` |
| `.profile-story-card` | `min-width: 0`; `min-height: 0`; `border: 1px solid rgba(255, 255, 255, 0.88)`; `border-radius: 19px`; `padding: 0`; `background: var(--liquid-card-bg)`; `color: #fff`; `box-shadow: 0 10px 22px rgba(15, 23, 42, 0.16)` |
| `.profile-story-card > img, .profile-story-card__shade` | `width: calc(100% - 16px)`; `height: calc(100% - 16px)`; `border-radius: 13px` |
| `.profile-story-card > img` | `border: 1px solid rgba(255, 255, 255, 0.88)` |
| `.profile-story-card__shade` | `background: var(--liquid-card-bg)` |
| `.profile-story-card > svg` | `width: 14px`; `height: 14px` |
| `.profile-story-series-list` | `gap: 14px` |
| `.profile-story-series` | `gap: 7px` |
| `.profile-story-series > h2` | `margin: 0 0 -2px -14px` |
| `.profile-story-series-card` | `min-width: 0`; `min-height: 76px`; `grid-template-columns: 58px minmax(0, 1fr)`; `gap: 12px`; `padding: 8px`; `border: 1px solid var(--glass-border)`; `border-radius: 19px` |
| `button.profile-story-series-card` | `width: 100%`; `color: inherit` |
| `.profile-story-series-card--unlocked` | `min-height: 96px`; `grid-template-columns: 76px minmax(0, 1fr)` |
| `.profile-story-series-card--unlocked .profile-story-series-card__visual` | `width: 76px`; `height: 76px` |
| `.profile-story-series-card--unlocked .profile-story-series-card__visual img` | `width: 100%`; `height: 100%` |
| `.profile-story-series-card__copy > span` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.25` |
| `.profile-story-series-card--unlocked .profile-story-series-card__copy small` | `color: #2d7b52` |
| `.profile-story-series-card__visual` | `width: 58px`; `height: 58px`; `border-radius: 13px`; `background: radial-gradient(circle at 30% 22%, rgba(96, 165, 250, 0.3), transparent 48%), linear-gradient(145deg, #31445d, #162438)`; `color: rgba(226, 232, 240, 0.92)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16)` |
| `.profile-story-series-card__visual svg` | `width: 22px`; `height: 22px` |
| `.profile-story-series-card__copy` | `min-width: 0`; `gap: 5px` |
| `.profile-story-series-card__copy strong` | `color: var(--ink)`; `font-size: 14px`; `font-weight: 900` |
| `.profile-story-series-card__copy small` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 750` |
| `.profile-equipment-preview` | `width: 100%`; `gap: 4px`; `margin-top: 4px` |
| `.profile-equipment-preview__item` | `min-width: 0`; `grid-template-columns: 45px minmax(0, 1fr) auto`; `gap: 6px`; `font-size: 10px`; `line-height: 1.15` |
| `.profile-equipment-preview__label` | `color: var(--muted-soft)`; `font-weight: 750` |
| `.profile-equipment-preview__value` | `font-weight: 800` |
| `.profile-equipment-preview__item strong` | `min-width: 20px`; `color: var(--ink)` |
| `.profile-detail-screen` | `gap: 14px` |
| `.profile-page-header` | `min-height: 38px`; `grid-template-columns: 38px minmax(0, 1fr) 38px`; `column-gap: 12px` |
| `.profile-page-header h1` | `margin: 0`; `font-size: 19px`; `font-weight: 900`; `letter-spacing: -0.02em` |
| `.profile-detail-screen .profile-page-header h1` | `color: rgba(244, 250, 255, 0.98)` |
| `.profile-detail-card` | `gap: 12px`; `padding: 16px`; `border-radius: 22px` |
| `.profile-detail-card h2` | `font-size: 16px` |
| `.profile-detail-card__eyebrow, .profile-equipment-slot p, .profile-arena-preview p` | `color: var(--muted-soft)`; `font-size: 10px`; `font-weight: 850`; `letter-spacing: 0.05em` |
| `.profile-equipment-list` | `gap: 16px` |
| `.profile-equipment-group` | `gap: 7px` |
| `.profile-equipment-slot` | `min-height: 90px`; `grid-template-columns: 72px minmax(0, 1fr)`; `gap: 12px`; `padding: 10px`; `border-radius: 20px` |
| `.profile-equipment-slot__image` | `width: 72px`; `height: 68px`; `border-radius: 15px`; `background: var(--liquid-inset-bg)` |
| `.profile-equipment-slot__image img` | `width: 100%`; `height: 100%` |
| `.profile-equipment-slot h2` | `margin-top: 3px`; `font-size: 15px`; `line-height: 1.2` |
| `.profile-equipment-slot span` | `margin-top: 4px`; `color: var(--muted)`; `font-size: 12px`; `font-weight: 650` |
| `.profile-arena-preview` | `border-radius: 22px` |
| `.profile-arena-preview img` | `width: 100%` |
| `.profile-arena-preview div` | `gap: 3px`; `padding: 14px` |
| `.profile-arena-preview h2` | `font-size: 18px` |
| `.inventory-bank-grid` | `grid-template-columns: minmax(0, 1fr)`; `gap: 8px` |
| `.inventory-product-card` | `padding: 10px`; `border-radius: 22px`; `gap: 8px` |
| `.inventory-bank-card__icon` | `width: 52px`; `height: 52px`; `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 17px`; `color: var(--reward-coin)`; `background: var(--liquid-card-bg)` |
| `.inventory-bank-card__copy` | `min-width: 0`; `gap: 5px` |
| `.inventory-bank-card__meta` | `min-width: 0`; `gap: 5px` |
| `.inventory-bank-card__note` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 800`; `line-height: 1.2` |
| `.inventory-bank-card__bonus` | `min-height: 19px`; `padding: 3px 7px`; `border-radius: var(--r-pill)`; `font-size: 9px`; `font-weight: 950`; `line-height: 1` |
| `.inventory-bank-card__bonus` | `color: var(--liquid-muted)`; `border: 1px solid rgba(30, 91, 151, 0.18)`; `background: var(--liquid-card-bg)` |
| `.inventory-bank-card__marker` | `min-width: 27px`; `height: 18px`; `padding: 0 6px`; `border-radius: var(--r-pill)`; `font-size: 8px`; `font-weight: 950`; `line-height: 1`; `letter-spacing: 0.03em`; `color: #fff`; `border: 1px solid rgba(255, 255, 255, 0.22)`; `background: var(--ink)`; `box-shadow: 0 3px 8px rgba(15, 23, 42, 0.2)` |
| `.inventory-bank-card__marker--premium` | `color: #563b00`; `border-color: rgba(255, 255, 255, 0.58)`; `background: linear-gradient(135deg, #ffe18a, #f4b942)`; `box-shadow: 0 3px 9px rgba(180, 117, 10, 0.3)` |
| `.inventory-bank-card__action` | `min-width: 78px`; `gap: 8px` |
| `.inventory-bank-card__action strong` | `color: var(--ink)`; `font-size: 13px`; `font-weight: 950`; `line-height: 1.1` |
| `.inventory-bank-card__action .btn` | `width: 100%`; `min-width: 0`; `min-height: 34px`; `padding: 0 10px`; `font-size: 12px` |
| `.prices-screen` | `padding: calc(24px + var(--app-safe-top)) 14px calc(28px + var(--app-safe-bottom))` |
| `.prices-screen__content` | `width: min(100%, 520px)`; `margin: auto`; `gap: 14px` |
| `.prices-screen__header` | `gap: 7px` |
| `.prices-screen__header .section-label` | `margin: 0` |
| `.prices-screen__header h1` | `margin: 0`; `color: var(--ink)`; `font-size: clamp(25px, 7vw, 31px)`; `font-weight: 950`; `letter-spacing: -0.045em`; `line-height: 1.04` |
| `.prices-screen__header p` | `max-width: 38ch`; `margin: 0`; `color: var(--muted)`; `font-size: 13px`; `font-weight: 750`; `line-height: 1.4` |
| `.prices-screen__grid` | `gap: 10px` |
| `.prices-package-card` | `min-width: 0`; `min-height: 112px`; `padding: 12px`; `border-radius: 22px`; `grid-template-columns: 54px minmax(0, 1fr) auto`; `gap: 11px` |
| `.prices-package-card__icon` | `width: 54px`; `height: 54px`; `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 18px`; `color: var(--reward-coin)`; `background: var(--liquid-card-bg)` |
| `.prices-package-card__marker` | `min-width: 27px`; `height: 18px`; `padding: 0 6px`; `border: 1px solid rgba(255, 255, 255, 0.22)`; `border-radius: var(--r-pill)`; `color: #fff`; `background: var(--ink)`; `box-shadow: 0 3px 8px rgba(15, 23, 42, 0.2)`; `font-size: 8px`; `font-weight: 950`; `letter-spacing: 0.03em`; `line-height: 1` |
| `.prices-package-card__marker--premium` | `color: #563b00`; `border-color: rgba(255, 255, 255, 0.58)`; `background: linear-gradient(135deg, #ffe18a, #f4b942)`; `box-shadow: 0 3px 9px rgba(180, 117, 10, 0.3)` |
| `.prices-package-card__copy` | `min-width: 0`; `gap: 3px` |
| `.prices-package-card__copy h2, .prices-package-card__copy p` | `margin: 0` |
| `.prices-package-card__copy h2` | `color: var(--ink)`; `font-size: 14px`; `font-weight: 950`; `line-height: 1.15` |
| `.prices-package-card__copy strong` | `color: var(--reward-coin)`; `font-size: 19px`; `font-weight: 950`; `line-height: 1` |
| `.prices-package-card__copy p` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 750`; `line-height: 1.25` |
| `.prices-package-card__badge` | `width: fit-content`; `min-height: 19px`; `padding: 3px 7px`; `border: 1px solid rgba(30, 91, 151, 0.18)`; `border-radius: var(--r-pill)`; `color: var(--liquid-muted)`; `background: rgba(213, 233, 249, 0.82)`; `font-size: 9px`; `font-weight: 950`; `line-height: 1` |
| `.prices-package-card__price` | `color: var(--ink)`; `font-size: 15px`; `font-weight: 950`; `line-height: 1.15` |
| `.prices-screen__state` | `padding: 14px`; `border-radius: 18px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 800`; `line-height: 1.4` |
| `.prices-screen__legal, .legal-screen__section` | `padding: 20px`; `color: var(--liquid-muted)` |
| `.prices-screen__legal` | `margin-top: 20px` |
| `.prices-screen__legal h2, .legal-screen__section h2` | `margin: 0 0 10px`; `color: var(--liquid-ink)`; `font-size: 18px` |
| `.prices-screen__legal h2:not(:first-child)` | `margin-top: 22px` |
| `.prices-screen__legal p, .legal-screen__section p` | `margin: 8px 0`; `line-height: 1.55` |
| `.prices-screen__legal a, .legal-screen a` | `color: #075985`; `font-weight: 700` |
| `.legal-screen__content` | `gap: 14px` |
| `.legal-screen__back` | `padding: 10px 2px` |
| `.prices-screen__legal-links, .legal-screen__links` | `gap: 8px 14px` |
| `.legal-screen__links` | `padding: 18px 20px` |
| `.prices-package-card`<br>@media (max-width: 360px) | `grid-template-columns: 48px minmax(0, 1fr) auto`; `gap: 9px`; `padding: 10px`; `border-radius: 19px` |
| `.prices-package-card__icon`<br>@media (max-width: 360px) | `width: 48px`; `height: 48px`; `border-radius: 16px` |
| `.prices-package-card__copy h2`<br>@media (max-width: 360px) | `font-size: 13px` |
| `.prices-package-card__copy strong`<br>@media (max-width: 360px) | `font-size: 17px` |
| `.prices-package-card__price`<br>@media (max-width: 360px) | `font-size: 13px` |
| `.inventory-history-filters .segmented-tabs` | `width: 100%` |
| `.inventory-history-groups` | `gap: 16px` |
| `.inventory-history-group` | `gap: 7px` |
| `.inventory-history-group > h3` | `margin: 0`; `padding: 2px 0` |
| `.inventory-history-list` | `gap: 7px` |
| `.inventory-history-row` | `min-width: 0`; `min-height: 68px`; `padding: 10px 11px`; `border-radius: 19px`; `grid-template-columns: 38px minmax(0, 1fr) auto`; `gap: 10px` |
| `.inventory-history-row__icon` | `width: 38px`; `height: 38px`; `border-radius: 14px`; `color: var(--ink)`; `background: var(--liquid-inset-bg)` |
| `.inventory-history-row__icon--reward` | `color: var(--liquid-muted)`; `background: rgba(13, 148, 136, 0.12)` |
| `.inventory-history-row__icon--inventory` | `color: var(--reward-coin)`; `background: rgba(255, 184, 0, 0.12)` |
| `.inventory-history-row__copy` | `min-width: 0`; `gap: 4px` |
| `.inventory-history-row__copy strong` | `min-width: 0`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 900`; `line-height: 1.2` |
| `.inventory-history-row__copy span` | `color: var(--muted)`; `font-size: 10.5px`; `font-weight: 750`; `line-height: 1.25` |
| `.inventory-history-row__amounts` | `gap: 4px` |
| `.inventory-history-empty` | `margin: 10px 4px 0`; `color: rgba(240, 246, 255, 0.86)`; `font-size: 14px`; `font-weight: 750`; `line-height: 1.45` |
| `.inventory-history-load-more` | `width: 100%`; `min-height: 42px` |
| `.inventory-shop-screen` | `background: linear-gradient(180deg, rgba(7, 18, 34, 0.2), rgba(7, 18, 34, 0.56)), var(--shop-category-artwork, url('/shop/shop-background.webp')) center top / cover fixed no-repeat` |
| `.inventory-shop-header` | `grid-template-columns: 40px minmax(0, 1fr) auto`; `gap: 10px` |
| `.inventory-shop-header > h1` | `min-width: 0` |
| `.inventory-shop-header > .inventory-shop-balance` | `min-width: 0` |
| `.inventory-shop-header__fitted-title` | `line-height: 1.05` |
| `.inventory-category-grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 10px` |
| `.amateur-hub-card.inventory-category-card` | `min-width: 0`; `min-height: 0`; `padding: 8px`; `grid-template-columns: minmax(0, 1fr) 18px`; `grid-template-rows: auto auto`; `column-gap: 0`; `row-gap: 8px` |
| `.inventory-category-card .amateur-hub-card__art` | `width: 100%`; `height: auto`; `border-radius: 18px` |
| `.inventory-category-card .amateur-hub-card__copy` | `gap: 5px`; `padding: 0 0 2px 4px` |
| `.inventory-category-card .amateur-hub-card__copy strong` | `font-size: clamp(12px, 3.65vw, 16px)`; `letter-spacing: -0.025em` |
| `.inventory-category-catalog` | `min-width: 0` |
| `.inventory-product-card > button:first-child` | `height: 96px`; `border-radius: 18px` |
| `.inventory-product-card h2` | `font-size: 13px` |
| `.inventory-product-card h2 + div` | `font-size: 11px` |
| `.inventory-shop-header`<br>@media (max-width: 360px) | `gap: 6px` |
| `.inventory-shop-header > h1`<br>@media (max-width: 360px) | `font-size: 21px !important` |
| `.inventory-shop-balance`<br>@media (max-width: 360px) | `padding: 7px 9px !important`; `gap: 9px !important` |
| `.inventory-shop-balance > span`<br>@media (max-width: 360px) | `gap: 4px !important`; `font-size: 12px !important` |
| `.inventory-product-card`<br>@media (max-width: 360px) | `padding: 8px`; `border-radius: 19px`; `gap: 7px` |
| `.inventory-product-card > button:first-child`<br>@media (max-width: 360px) | `height: 104px`; `border-radius: 16px` |
| `.inventory-product-card h2`<br>@media (max-width: 360px) | `font-size: 12px` |
| `.inventory-product-card h2 + div`<br>@media (max-width: 360px) | `font-size: 10px` |
| `.inventory-bank-card`<br>@media (max-width: 360px) | `min-height: 96px !important`; `padding: 10px !important`; `border-radius: 19px !important` |
| `.inventory-history-row`<br>@media (max-width: 360px) | `grid-template-columns: 34px minmax(0, 1fr) auto`; `gap: 8px` |
| `.inventory-history-row__icon`<br>@media (max-width: 360px) | `width: 34px`; `height: 34px`; `border-radius: 12px` |
| `.section-info-btn` | `width: 28px`; `height: 28px`; `border: 0`; `border-radius: var(--r-pill)`; `background: transparent`; `color: var(--liquid-muted)`; `padding: 0` |
| `.achievement-card` | `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 18px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 8px 22px rgba(15, 23, 42, 0.09)` |
| `.achievement-list` | `grid-template-columns: minmax(0, 1fr)`; `gap: 10px`; `padding-bottom: 80px` |
| `.achievement-card--claimable` | `border-color: rgba(14, 165, 233, 0.48)`; `box-shadow: 0 10px 26px rgba(14, 116, 144, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.46)` |
| `.achievement-card__open` | `width: 100%`; `min-width: 0`; `border: 0`; `padding: 11px`; `grid-template-columns: 72px minmax(0, 1fr)`; `gap: 11px`; `background: transparent`; `color: var(--ink)`; `min-height: 94px` |
| `.achievement-card__open:focus-visible` | `border-radius: 17px` |
| `.achievement-card__thumbnail` | `width: 72px`; `height: 72px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 14px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 5px 14px rgba(15, 23, 42, 0.12)` |
| `.achievement-card__thumbnail img` | `width: 100%`; `height: 100%` |
| `.achievement-card__status` | `width: 22px`; `height: 22px`; `border-radius: 999px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `background: var(--liquid-card-bg)`; `color: var(--liquid-muted)`; `box-shadow: 0 3px 10px rgba(15, 23, 42, 0.18)` |
| `.achievement-card__status--claimed` | `background: var(--liquid-card-bg)`; `color: white` |
| `.achievement-card__body` | `min-width: 0`; `gap: 6px`; `color: var(--liquid-ink)` |
| `.achievement-card__heading` | `min-width: 0`; `gap: 8px` |
| `.achievement-card__title` | `min-width: 0`; `font-size: 14px`; `line-height: 1.18`; `font-weight: 900` |
| `.achievement-card__rewards` | `gap: 2px`; `font-size: 9px`; `line-height: 1.1`; `font-weight: 900` |
| `.achievement-card__rewards--inline` | `gap: 10px`; `min-height: 14px` |
| `.achievement-card__rewards > span` | `gap: 3px` |
| `.achievement-card__rewards svg` | `width: 12px`; `height: 12px` |
| `.achievement-card__stage` | `width: max-content`; `max-width: 100%`; `padding: 3px 7px`; `border-radius: 999px`; `background: var(--liquid-card-bg)`; `color: var(--liquid-muted)`; `font-size: 9px`; `line-height: 1.1`; `font-weight: 800`; `letter-spacing: 0.02em` |
| `.achievement-card__status-copy` | `color: var(--liquid-muted)`; `font-size: 9px`; `line-height: 1.1`; `font-weight: 750` |
| `.achievement-card--claimable .achievement-card__status-copy` | `color: #16745f` |
| `.achievement-card__requirement` | `color: var(--liquid-muted)`; `font-size: 11px`; `line-height: 1.25`; `font-weight: 650` |
| `.achievement-card__stage-progress` | `height: 23px`; `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 999px`; `background: rgba(92, 115, 137, 0.17)`; `box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.08)` |
| `.achievement-card__stage-progress-fill` | `min-width: 0`; `border-radius: inherit`; `background: linear-gradient(90deg, #3d8fc4, #64b7da)` |
| `.achievement-card__stage-progress strong` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 950` |
| `.advanced-training-catalog, .advanced-training-exercise-list` | `min-width: 0`; `gap: 12px` |
| `.advanced-training-course-summary` | `gap: 8px` |
| `.advanced-training-course-progress` | `height: 34px`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 999px`; `background: rgba(119, 137, 156, 0.48)`; `box-shadow: inset 0 1px 4px rgba(15, 23, 42, 0.14)` |
| `.advanced-training-course-progress > span` | `min-width: 0`; `border-radius: inherit`; `background: linear-gradient(90deg, #399bc8 0%, #59b9de 72%, #7ccbe8 100%)` |
| `.advanced-training-course-progress > strong` | `color: var(--liquid-ink)`; `font-size: 14px`; `font-weight: 950`; `letter-spacing: 0.04em` |
| `.achievement-card__thumbnail.advanced-training-preview` | `min-height: 0` |
| `.advanced-training-preview__court` | `width: 100%`; `height: 100%` |
| `.advanced-training-preview__number` | `width: 52px`; `height: 52px`; `border: 2px solid rgba(255, 255, 255, 0.9)`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 4px 12px rgba(15, 23, 42, 0.32)`; `color: #fff`; `font-size: 29px`; `font-weight: 950`; `line-height: 1` |
| `.advanced-training-exercise-card__skill` | `color: var(--liquid-ink)`; `font-weight: 850` |
| `.advanced-training-exercise-card__rewards--claimed` | `color: var(--liquid-muted)` |
| `.advanced-training-exercise-card__meta` | `min-width: 0`; `min-height: 14px`; `gap: 6px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.25` |
| `.training-exercise-card__stage--complete` | `background: rgba(32, 122, 82, 0.13)`; `color: #287457` |
| `.training-exercise-card__stage--available` | `background: rgba(180, 137, 38, 0.14)`; `color: #87681f` |
| `.training-exercise-card__stage--locked` | `background: var(--liquid-card-bg)`; `color: var(--liquid-muted)` |
| `.advanced-training-start-modal` | `width: min(100%, 520px)` |
| `.advanced-training-start-modal__goal` | `margin: 0`; `color: var(--liquid-ink)`; `font-size: 14px`; `line-height: 1.4` |
| `.advanced-training-start-modal__button` | `width: 100%`; `margin-top: 16px` |
| `.achievement-card__claim` | `width: calc(100% - 22px)`; `min-height: 36px`; `margin: 0 11px 11px`; `font-size: 12px` |
| `.achievement-card__complete` | `color: #16745f`; `font-size: 10px`; `font-weight: 850` |
| `.achievement-card__open`<br>@media (max-width: 350px) | `grid-template-columns: 62px minmax(0, 1fr)`; `gap: 9px`; `padding: 9px` |
| `.achievement-card__thumbnail`<br>@media (max-width: 350px) | `width: 62px`; `height: 62px` |
| `.achievement-card__title`<br>@media (max-width: 350px) | `font-size: 13px` |
| `.achievement-card__rewards`<br>@media (max-width: 350px) | `font-size: 8px` |
| `.section-label` | `padding: 2px 22px`; `font-size: 10px`; `font-weight: 600`; `color: var(--liquid-muted)`; `letter-spacing: 0.14em` |
| `.section-label--page` | `margin: 0 0 -2px -14px` |
| `.app-shell--arena .section-label` | `color: rgba(240, 248, 255, 0.92)` |
| `.app-shell--arena .glass .section-label, .app-shell--arena .modal-card .section-label` | `color: var(--liquid-muted)` |
| `.mode-shell__title, .screen-title-on-arena` | `color: rgba(244, 250, 255, 0.96)` |
| `.mode-info-card, .mode-setup-card` | `gap: 14px`; `padding: 16px`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 26px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 16px 36px rgba(2, 8, 23, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.86)`; `backdrop-filter: blur(20px) saturate(120%)` |
| `.mode-setup-card .segmented-tabs` | `background: var(--liquid-card-bg)`; `border-color: rgba(255, 255, 255, 0.74)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72)` |
| `.app-shell--arena .mode-setup-card .section-label` | `color: var(--liquid-muted)` |
| `.duel-creation-card > .section-label--page` | `margin: 0 0 2px` |
| `.duel-creation-card` | `gap: 10px`; `min-width: 0` |
| `.duel-section` | `gap: 8px`; `min-width: 0` |
| `.duel-game-layout` | `gap: 16px`; `min-width: 0` |
| `.duel-section-title` | `padding: 2px 8px`; `color: rgba(240, 248, 255, 0.92)`; `font-size: 10px`; `font-weight: 600`; `line-height: normal`; `letter-spacing: 0.14em` |
| `.duel-section-info-btn` | `color: rgba(240, 248, 255, 0.92)` |
| `.duel-form-section-title` | `margin: -2px 0`; `padding: 2px 32px 2px 8px`; `line-height: normal` |
| `.duel-locker-kind-list` | `grid-template-columns: minmax(0, 1fr)`; `gap: 16px` |
| `.duel-locker-kind-section` | `min-width: 0`; `gap: 8px` |
| `.duel-locker-slot` | `min-width: 0`; `min-height: 96px`; `padding: 10px`; `grid-template-columns: clamp(68px, 22vw, 84px) minmax(0, 1fr) 20px`; `gap: 12px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 22px`; `color: var(--ink)` |
| `.duel-locker-slot[data-empty='true']` | `border-color: rgba(255, 255, 255, 0.62)` |
| `.duel-locker-slot__artwork` | `width: 100%`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78), 0 10px 18px rgba(15, 23, 42, 0.1)` |
| `.duel-locker-slot__copy` | `min-width: 0`; `gap: 5px` |
| `.duel-locker-slot__title` | `min-width: 0` |
| `.duel-locker-slot__status` | `min-width: 0` |
| `.duel-equipment-empty` | `padding: 8px 2px 4px` |
| `.duel-equipment-empty__message` | `color: var(--liquid-muted)`; `font-size: 13px`; `font-weight: 700`; `line-height: 1.4` |
| `.duel-equipment-empty__action` | `width: 100%`; `min-height: 46px`; `margin-top: 6px`; `font-size: 13px`; `font-weight: 850` |
| `.duel-equipment-option` | `color: var(--ink)`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56)` |
| `.duel-equipment-option--selected` | `border-color: rgba(255, 255, 255, 0.92)`; `background: var(--liquid-selected-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86), 0 8px 18px rgba(15, 23, 42, 0.1)` |
| `.duel-equipment-option__check` | `width: 18px`; `height: 18px`; `border: 2px solid rgba(71, 85, 105, 0.34)`; `border-radius: 999px`; `background: rgba(255, 255, 255, 0.42)`; `color: #ffffff`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62)` |
| `.duel-equipment-option__check--selected` | `width: 20px`; `height: 20px`; `border: 0`; `background: #1f2a3d`; `box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.1)` |
| `.duel-rating-month-nav` | `min-height: 0`; `padding: 0` |
| `.modal-card.duel-rating-info-modal` | `max-height: calc(100dvh - 40px)`; `padding: 22px 22px 18px`; `background: var(--glass-bg)`; `border: 1px solid var(--glass-border)`; `box-shadow: var(--shadow-glass)` |
| `.duel-rating-info-modal .modal-title` | `font-size: 15px`; `font-weight: 700` |
| `.duel-rating-info-modal > div:last-child` | `margin-top: 10px !important`; `color: var(--muted)`; `font-size: 13px`; `line-height: 1.6` |
| `.duel-rating-info-modal p` | `margin: 0 0 10px` |
| `.duel-rating-info-modal p:last-child` | `margin-bottom: 0` |
| `.duel-rating-info-modal__confirm.btn--cta` | `width: 100%`; `margin-top: 18px`; `padding: 12px 0`; `font-size: 14px` |
| `.tournament-details__content.duel-rating-table-card` | `gap: 10px`; `padding: 14px`; `border-radius: 22px` |
| `.duel-rating-empty` | `margin: 0`; `padding: 8px 0 2px`; `color: var(--liquid-muted)`; `font-size: 14px`; `font-weight: 750`; `line-height: 1.4` |
| `.duel-card-heading` | `gap: 8px` |
| `.duel-card-opponent-name` | `min-width: 0` |
| `.duel-card-status` | `max-width: 100%`; `padding: 5px 8px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 999px`; `background: var(--liquid-card-bg)`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 850`; `line-height: 1` |
| `.duel-card-details` | `min-width: 0`; `gap: 5px` |
| `.duel-card-meta` | `min-width: 0`; `gap: 2px`; `color: var(--muted)`; `font-size: 12px`; `line-height: 1.15` |
| `.duel-card-venue` | `width: fit-content`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 760` |
| `.duel-invite-action` | `box-shadow: none` |
| `.duel-invite-action--decline` | `border: 1px solid rgba(128, 49, 61, 0.2)`; `background: rgba(163, 72, 83, 0.16)`; `color: #6f2933` |
| `.duel-invite-action--accept` | `border: 1px solid rgba(42, 100, 68, 0.2)`; `background: rgba(65, 128, 91, 0.18)`; `color: #244f38` |
| `.arena-duel-invite-action` | `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08)` |
| `.arena-duel-invite-action--decline` | `border: 1px solid rgba(221, 127, 139, 0.52)`; `background: rgba(119, 48, 61, 0.64)`; `color: rgba(255, 238, 241, 0.96)` |
| `.arena-duel-invite-action--accept` | `border: 1px solid rgba(114, 177, 139, 0.52)`; `background: rgba(43, 96, 65, 0.68)`; `color: rgba(239, 255, 245, 0.96)` |
| `.glass .duel-section-title, .modal-card .duel-section-title` | `color: var(--liquid-muted)` |
| `.duel-empty-current` | `padding: 6px 0 2px`; `color: rgba(240, 248, 255, 0.86)`; `font-size: 13px`; `font-weight: 700`; `line-height: 1.35` |
| `.duel-limits-card` | `padding: 4px 14px`; `border-radius: 22px` |
| `.duel-limits-period__toggle` | `gap: 7px`; `width: 100%`; `min-height: 86px`; `padding: 12px 2px 13px`; `border: 0`; `background: transparent`; `color: var(--ink)` |
| `.duel-limits-period__heading, .duel-limits-period__meta` | `min-width: 0` |
| `.duel-limits-period__heading` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 10px` |
| `.duel-limits-period__title` | `font-size: 15px`; `font-weight: 850`; `line-height: 1.2` |
| `.duel-limits-period__meta` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 10px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.25` |
| `.duel-limits-period__timer` | `min-width: 0` |
| `.duel-limits-period__remaining` | `color: var(--liquid-muted)`; `font-weight: 750` |
| `.duel-limits-period__progress` | `width: 100%`; `height: 7px`; `border-radius: 999px`; `background: rgba(15, 23, 42, 0.14)`; `box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.12)` |
| `.duel-limits-period__progress-fill` | `height: 100%`; `border-radius: inherit`; `background: var(--blue-accent)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2)` |
| `.duel-limits-period__formats` | `gap: 6px`; `padding: 0 2px 12px`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 650` |
| `.duel-limits-period__format-name` | `color: var(--ink)`; `font-weight: 800` |
| `.duel-limits-card__loading` | `padding: 12px 2px`; `color: var(--liquid-muted)`; `font-size: 13px` |
| `.duel-state-card` | `min-height: 64px`; `padding: 14px`; `border-radius: 18px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `background: var(--liquid-card-bg)`; `color: var(--liquid-muted)`; `font-size: 14px`; `font-weight: 750` |
| `.duel-state-card--error` | `color: #7f1d1d` |
| `.tournament-standing-player--button` | `width: 100%`; `min-width: 0`; `min-height: 44px`; `padding: 0`; `border: 0`; `background: transparent`; `color: inherit` |
| `.tournament-standing-table tbody tr.tournament-standing-table__current-user` | `color: var(--ink)`; `background: rgba(147, 197, 253, 0.38)` |
| `.duel-history-summary` | `gap: 10px`; `padding: 14px`; `border: 1px solid rgba(255, 255, 255, 0.94)`; `border-radius: 22px`; `background: linear-gradient( 135deg, rgba(147, 197, 253, 0.72), rgba(219, 234, 254, 0.86) 52%, rgba(255, 255, 255, 0.72) )`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 18px 42px rgba(37, 99, 235, 0.2)` |
| `.duel-history-summary__header` | `min-width: 0`; `gap: 10px` |
| `.duel-history-summary__header h2, .duel-history-summary__header strong` | `margin: 0`; `color: var(--ink)`; `font-size: 14px`; `font-weight: 950`; `line-height: 1.05` |
| `.duel-history-summary__header h2` | `min-width: 0`; `font-size: 15px` |
| `.duel-history-summary__tiles` | `grid-template-columns: repeat(4, minmax(0, 1fr))`; `gap: 6px`; `margin: 0` |
| `.duel-history-summary__tiles > div` | `min-width: 0`; `padding: 9px 3px`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.duel-history-summary__tiles dt` | `color: var(--muted)`; `font-size: 8px`; `font-weight: 900`; `line-height: 1.05` |
| `.duel-history-summary__tiles dd` | `margin: 5px 0 0`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 950`; `line-height: 1.05` |
| `.duel-day-dialog` | `width: min(430px, calc(100vw - 28px))`; `max-height: min(720px, calc(100dvh - 140px))`; `grid-template-columns: minmax(0, 1fr)`; `grid-template-rows: auto minmax(0, 1fr) auto`; `gap: 14px` |
| `.duel-day-dialog__header` | `gap: 12px` |
| `.duel-day-dialog__header .modal-title` | `min-width: 0`; `margin: 0` |
| `.duel-day-list` | `min-height: 0`; `gap: 8px` |
| `.duel-day-scroll-hint` | `height: 46px`; `padding-bottom: 4px`; `background: var(--liquid-inset-bg)` |
| `.duel-day-scroll-hint button` | `width: 28px`; `height: 20px`; `border: 1px solid rgba(15, 23, 42, 0.12)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12)`; `color: var(--liquid-muted)`; `padding: 0` |
| `.duel-day-match` | `width: 100%`; `min-height: 60px`; `padding: 8px 10px`; `border: 1px solid rgba(15, 23, 42, 0.08)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `grid-template-columns: 40px minmax(0, 1fr) auto`; `gap: 10px`; `color: var(--liquid-ink)` |
| `.duel-day-match-group` | `border: 1px solid rgba(15, 23, 42, 0.08)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)` |
| `.duel-day-match-group .duel-day-match` | `border: 0`; `border-radius: 0`; `background: transparent` |
| `.duel-day-match-group:not(.duel-day-match-group--expanded) .duel-day-match` | `border-radius: 17px` |
| `.duel-day-match-group--expanded .duel-day-match` | `border-radius: 17px 17px 0 0` |
| `.duel-day-match__copy` | `min-width: 0`; `gap: 3px` |
| `.duel-earned-rewards` | `gap: 8px` |
| `.duel-earned-rewards__item` | `gap: 3px`; `font-size: 13px`; `font-weight: 700`; `line-height: 1` |
| `.duel-day-match__copy .duel-earned-rewards__item` | `font-size: 12px` |
| `.duel-day-match__copy strong` | `font-size: 14px` |
| `.duel-day-match__copy span` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 750` |
| `.duel-day-match__result` | `font-size: 11px`; `font-weight: 900` |
| `.duel-day-match__aside` | `gap: 3px` |
| `.duel-day-match__chevron` | `color: var(--liquid-muted)` |
| `.duel-day-match__result--win` | `color: #166534` |
| `.duel-day-match__result--draw` | `color: #854d0e` |
| `.duel-day-match__result--loss` | `color: #991b1b` |
| `.duel-inline-result .duel-result-card` | `width: 100%`; `max-height: none !important`; `padding: 12px`; `border: 0`; `border-radius: 0 0 17px 17px`; `background: var(--liquid-card-bg)`; `box-shadow: none` |
| `.duel-result-card__compact-meta` | `grid-template-columns: minmax(0, 1fr)`; `row-gap: 7px`; `padding: 1px 2px 2px` |
| `.duel-result-card__points-rewards` | `gap: 10px` |
| `.duel-result-card__compact-fact` | `min-width: 0`; `gap: 6px` |
| `.duel-result-card__compact-fact span` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 900`; `letter-spacing: 0.1em`; `line-height: 1` |
| `.duel-result-card__compact-fact strong` | `min-width: 0`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 850`; `line-height: 1.1` |
| `.duel-result-card__compact-summary` | `margin-top: 12px` |
| `.duel-result-card__compact-summary .duel-result-compact-period__table` | `margin-top: 6px` |
| `.duel-result-card__compact-details` | `gap: 5px`; `margin-top: 9px` |
| `.duel-result-compact-period` | `min-width: 0`; `padding-top: 2px` |
| `.duel-result-compact-period + .duel-result-compact-period` | `margin-top: 8px`; `padding-top: 8px` |
| `.duel-result-compact-period__heading, .duel-result-compact-period__toggle` | `width: 100%`; `grid-template-columns: minmax(0, 1fr) auto auto`; `gap: 7px`; `padding: 0 2px 6px`; `color: var(--ink)` |
| `.duel-result-compact-period__toggle` | `border: 0`; `background: transparent` |
| `.duel-result-compact-period__heading strong, .duel-result-compact-period__toggle strong` | `min-width: 0`; `font-size: 12px`; `font-weight: 950`; `line-height: 1.1` |
| `.duel-result-compact-period__heading span, .duel-result-compact-period__toggle span` | `font-size: 11px`; `font-weight: 850` |
| `.duel-result-compact-period__table` | `width: 100%`; `color: var(--ink)` |
| `.duel-result-compact-period__table th, .duel-result-compact-period__table td` | `padding: 5px 3px` |
| `.duel-result-compact-period__table thead th` | `color: var(--liquid-muted)`; `font-size: 8px`; `font-weight: 900`; `letter-spacing: 0.05em`; `line-height: 1` |
| `.duel-result-compact-period__table thead th:first-child, .duel-result-compact-period__table tbody th` | `width: 32%` |
| `.duel-result-compact-period__table tbody th` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 900` |
| `.duel-result-compact-period__table tbody td` | `font-size: 10px`; `font-weight: 850` |
| `.duel-inline-result__status` | `gap: 8px`; `padding: 14px`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 750` |
| `.duel-inline-result__status .btn` | `min-height: 40px` |
| `.duel-kind-picker, .duel-quick-pick` | `border: 1px solid rgba(255, 255, 255, 0.92)`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 18px rgba(4, 15, 28, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.92)` |
| `.duel-kind-picker__info-icon` | `color: var(--liquid-muted)` |
| `.duel-quick-pick__opponent, .duel-quick-pick__empty` | `color: var(--liquid-muted)` |
| `.duel-quick-pick__opponent--active` | `color: var(--liquid-ink)` |
| `.duel-quick-pick__name` | `letter-spacing: 0.01em` |
| `.duel-opponent-search` | `background: var(--liquid-inset-bg)`; `border-color: rgba(255, 255, 255, 0.96)`; `box-shadow: 0 8px 18px rgba(4, 15, 28, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.92)` |
| `.duel-format-warning` | `margin: 0`; `padding: 10px 12px`; `border: 1px solid rgba(255, 255, 255, 0.88)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)`; `box-shadow: 0 8px 18px rgba(4, 15, 28, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.9)` |
| `.duel-opponent-search__icon` | `color: var(--liquid-muted)` |
| `.duel-opponent-search__input` | `min-width: 0`; `color: var(--liquid-ink)` |
| `.duel-opponent-search__input::placeholder` | `color: var(--liquid-muted)` |
| `.duel-challenge-submit:disabled` | `background: var(--liquid-inset-bg)`; `border-color: rgba(15, 23, 42, 0.78)`; `color: rgba(248, 252, 255, 0.9)`; `box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.16), 0 8px 18px rgba(4, 15, 28, 0.14)` |
| `.training-summary-grid` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 8px` |
| `.training-info-overview` | `grid-template-columns: 86px minmax(0, 1fr)`; `gap: 12px` |
| `.training-info-artwork` | `width: 86px`; `height: 86px`; `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 22px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 18px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.78)` |
| `.training-info-artwork img` | `width: 100%`; `height: 100%` |
| `.training-info-overview__copy` | `min-width: 0` |
| `.training-info-copy` | `color: var(--liquid-muted)`; `font-size: 14px`; `font-weight: 700`; `line-height: 1.45` |
| `.training-info-error` | `color: var(--red-deep, #b91c1c)`; `font-size: 13px`; `font-weight: 800` |
| `.initial-training-hub, .initial-training-catalog, .initial-training-exercise-list` | `min-width: 0`; `gap: 12px` |
| `.initial-training-course-summary` | `gap: 8px` |
| `.initial-training-course-progress` | `height: 34px`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 999px`; `background: rgba(119, 137, 156, 0.48)`; `box-shadow: inset 0 1px 4px rgba(15, 23, 42, 0.14)` |
| `.initial-training-course-progress > span` | `min-width: 0`; `border-radius: inherit`; `background: linear-gradient(90deg, #399bc8 0%, #59b9de 72%, #7ccbe8 100%)` |
| `.initial-training-course-progress > strong` | `color: var(--liquid-ink)`; `font-size: 14px`; `font-weight: 950`; `letter-spacing: 0.04em` |
| `.achievement-card__thumbnail.initial-training-preview` | `min-height: 0` |
| `.initial-training-preview__court` | `width: 100%`; `height: 100%` |
| `.initial-training-preview__number` | `width: 52px`; `height: 52px`; `border: 2px solid rgba(255, 255, 255, 0.9)`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 4px 12px rgba(15, 23, 42, 0.32)`; `color: #fff`; `font-size: 29px`; `font-weight: 950`; `line-height: 1` |
| `.initial-training-exercise-card__skill` | `color: var(--liquid-ink)`; `font-weight: 850` |
| `.initial-training-exercise-card__rewards--claimed` | `color: var(--liquid-muted)` |
| `.initial-training-exercise-card__meta` | `min-width: 0`; `min-height: 14px`; `gap: 6px`; `color: var(--liquid-muted)`; `font-size: 11px`; `line-height: 1.25`; `font-weight: 650` |
| `.initial-training-play-state` | `gap: 12px`; `min-height: 100dvh`; `padding: 24px` |
| `.initial-training-result` | `width: min(100%, 370px)` |
| `.initial-training-result h2` | `margin-top: 8px` |
| `.initial-training-result__rewards` | `gap: 18px`; `min-height: 28px`; `margin: 4px 0 10px`; `font-size: 18px`; `font-weight: 900` |
| `.initial-training-result__rewards > span` | `gap: 6px` |
| `.initial-training-result__rewards svg` | `width: 22px`; `height: 22px` |
| `.daily-calendar` | `gap: 10px`; `padding: 14px`; `border-radius: 22px` |
| `.daily-calendar__header` | `grid-template-columns: 34px minmax(0, 1fr) 34px`; `gap: 8px` |
| `.daily-calendar__nav` | `width: 34px`; `height: 34px`; `min-width: 34px`; `min-height: 34px` |
| `.daily-calendar__month` | `margin: 0`; `color: var(--ink)`; `font-size: 16px`; `font-weight: 950` |
| `.daily-calendar__weekdays, .daily-calendar__grid` | `grid-template-columns: repeat(7, minmax(0, 1fr))`; `gap: 6px` |
| `.daily-calendar__weekdays span` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 900` |
| `.daily-calendar__day, .daily-calendar__empty` | `min-width: 0` |
| `.daily-calendar__day` | `border: 1px solid var(--surface-calendar-day-border, rgba(255, 255, 255, 0.72))`; `border-radius: 12px`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 900`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72)` |
| `.daily-calendar__day--neutral` | `background: var(--surface-calendar-day-bg, rgba(255, 255, 255, 0.42))`; `color: var(--liquid-muted)` |
| `.daily-calendar__day--completed` | `background: linear-gradient(145deg, rgba(134, 239, 172, 0.9), rgba(74, 222, 128, 0.68))`; `color: #14532d` |
| `.daily-calendar__day--duel` | `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.daily-calendar__day-number` | `line-height: 1` |
| `.daily-calendar__duel-count` | `color: var(--liquid-muted)`; `font-size: 6px`; `font-weight: 900`; `line-height: 1` |
| `.daily-calendar__goal-count` | `color: currentColor`; `font-size: 7px`; `font-weight: 900`; `line-height: 1` |
| `.daily-calendar__duel-results` | `gap: 1px` |
| `.daily-calendar__duel-results-row` | `gap: 1px` |
| `.daily-calendar__duel-result` | `width: var(--duel-result-size, 4px)`; `height: var(--duel-result-size, 4px)`; `border-radius: 50%`; `box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.78)` |
| `.daily-calendar__duel-result--win` | `background: #2fbf71` |
| `.daily-calendar__duel-result--loss` | `background: #d45f67` |
| `.daily-calendar__duel-result--draw` | `background: #e1ad24` |
| `.daily-calendar__day--incomplete` | `background: linear-gradient(145deg, rgba(253, 230, 138, 0.92), rgba(250, 204, 21, 0.7))`; `color: #713f12` |
| `.training-history` | `gap: 8px` |
| `.training-settings` | `gap: 8px` |
| `.training-period-speeds__title.section-label` | `margin: 0`; `padding: 0` |
| `.training-history__content` | `gap: 8px` |
| `.training-history__state` | `color: var(--muted)`; `font-size: 13px`; `font-weight: 800` |
| `.training-history .daily-history-summary` | `gap: 10px`; `padding: 14px`; `border-radius: 22px` |
| `.training-history-summary__header` | `gap: 10px` |
| `.training-history-summary__header h2` | `margin: 0`; `color: var(--ink)`; `font-size: 15px`; `font-weight: 950` |
| `.training-history-summary__header > strong` | `color: var(--ink)`; `font-size: 13px`; `font-weight: 950` |
| `.training-history-summary__tiles` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 6px` |
| `.training-history-summary__tile` | `min-width: 0`; `padding: 9px 5px`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.training-history-summary__tile span` | `color: var(--muted)`; `font-size: 8px`; `font-weight: 900` |
| `.training-history-summary__tile strong` | `margin-top: 5px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 950` |
| `.training-result-modal__summary` | `grid-template-columns: repeat(3, minmax(0, 1fr))` |
| `.daily-calendar__day--missed` | `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.daily-calendar__legend` | `gap: 8px 12px`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 800` |
| `.daily-calendar__legend span` | `gap: 5px` |
| `.daily-calendar__dot` | `width: 8px`; `height: 8px`; `border-radius: 50%` |
| `.daily-calendar__dot--completed` | `background: #4ade80` |
| `.daily-calendar__dot--duel` | `background: #1681bd` |
| `.daily-calendar__dot--win` | `background: #2fbf71` |
| `.daily-calendar__dot--loss` | `background: #d45f67` |
| `.daily-calendar__dot--draw` | `background: #e1ad24` |
| `.daily-calendar__dot--incomplete` | `background: #facc15` |
| `.daily-calendar__dot--missed` | `background: #94a3b8` |
| `.daily-calendar__loading` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 750` |
| `.daily-result-modal__summary, .daily-result-modal__periods` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 7px` |
| `.daily-result-modal__periods` | `margin-top: 10px` |
| `.daily-result-modal__summary > div, .daily-result-modal__period` | `min-width: 0`; `padding: 10px 6px`; `border: 1px solid rgba(255, 255, 255, 0.68)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.daily-result-modal__summary span, .daily-result-modal__period span` | `color: var(--muted)`; `font-size: 9px`; `font-weight: 900` |
| `.daily-result-modal__summary strong, .daily-result-modal__period strong` | `margin-top: 5px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 900` |
| `.daily-result-modal__period small` | `margin-top: 3px`; `color: var(--muted)`; `font-size: 9px`; `font-weight: 750` |
| `.daily-result-modal__period--empty` | `background: var(--liquid-inset-bg)` |
| `.daily-result-modal__period--empty strong` | `color: var(--liquid-muted)`; `font-size: 11px` |
| `.section-card-surface` | `background: var(--liquid-card-bg)`; `backdrop-filter: blur(20px) saturate(116%)` |
| `.section-card-surface--active, .sections-quick-card--active` | `background: var(--liquid-selected-bg)` |
| `.section-card-surface--muted` | `background: var(--liquid-card-bg)` |
| `.sections-group` | `min-width: 0`; `gap: 10px` |
| `.sections-group__title` | `margin: 0` |
| `.sections-quick-grid` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 10px` |
| `.sections-quick-card` | `min-width: 0`; `min-height: 88px`; `padding: 8px`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `border-radius: 22px`; `grid-template-columns: 68px minmax(0, 1fr)`; `gap: 9px`; `color: inherit`; `background: var(--liquid-card-bg)`; `box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)` |
| `.sections-quick-card--active` | `background: var(--liquid-selected-bg)` |
| `.sections-quick-card:active` | `box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.76)` |
| `.sections-quick-card__art` | `width: 68px`; `height: 68px`; `border: 1px solid rgba(255, 255, 255, 0.82)`; `border-radius: 18px`; `background: var(--liquid-card-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84), 0 6px 14px rgba(15, 23, 42, 0.12)` |
| `.sections-quick-card__art img` | `width: 100%`; `height: 100%` |
| `.sections-quick-card__content` | `min-width: 0`; `gap: 5px` |
| `.sections-quick-card__title-row` | `min-width: 0` |
| `.sections-quick-card__title` | `color: var(--ink)`; `font-size: clamp(14px, 3.5vw, 16px)`; `font-weight: 950`; `line-height: 1.08`; `letter-spacing: -0.015em` |
| `.sections-quick-card__meta` | `min-width: 0`; `color: var(--liquid-muted)`; `font-size: 10.5px`; `font-weight: 850`; `line-height: 1.25` |
| `.sections-quick-card__meta--multiline` | `gap: 1px` |
| `.sections-quick-card--wide` | `min-height: 116px`; `padding: 14px`; `grid-template-columns: 86px minmax(0, 1fr) 20px`; `gap: 12px` |
| `.sections-quick-card--wide .sections-quick-card__art` | `width: 86px`; `height: 86px`; `border-radius: 22px` |
| `.sections-quick-card--wide .sections-quick-card__title` | `font-size: 19px` |
| `.sections-quick-card--wide .sections-quick-card__meta` | `font-size: 12px` |
| `.sections-quick-card__attention` | `width: 7px`; `height: 7px`; `margin: 0 0 1px 6px`; `border-radius: 999px`; `background: rgba(220, 38, 38, 0.92)`; `box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14)` |
| `.sections-mode-list` | `gap: 12px` |
| `.amateur-sections-tabs .segmented-tabs` | `grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.42fr) minmax(0, 0.96fr) !important` |
| `.amateur-hub-grid` | `gap: 12px` |
| `.amateur-hub-card` | `width: 100%`; `min-height: 116px`; `padding: 14px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 22px`; `grid-template-columns: 86px minmax(0, 1fr) 20px`; `gap: 12px`; `color: var(--ink)`; `box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.84)` |
| `.card-chevron` | `color: var(--card-chevron-color)` |
| `.amateur-hub-card__art` | `width: 86px`; `height: 86px`; `border: 1px solid rgba(255, 255, 255, 0.84)`; `border-radius: 20px` |
| `.amateur-hub-card__art img` | `width: 100%`; `height: 100%` |
| `.initial-training-mode-card:disabled .card-chevron` | `color: var(--liquid-muted)` |
| `.amateur-hub-card__copy` | `min-width: 0`; `gap: 7px` |
| `.amateur-hub-card__copy strong` | `font-size: 19px`; `font-weight: 950`; `line-height: 1.05` |
| `.amateur-hub-card__copy span` | `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 750`; `line-height: 1.25` |
| `.level-placeholder-copy` | `color: rgba(244, 250, 255, 0.88)`; `font-size: 16px`; `font-weight: 650`; `line-height: 1.45` |
| `.amateur-sections-tabs .segmented-tabs__item` | `padding-inline: 8px`; `font-size: clamp(10px, 2.8vw, 12px)` |
| `.sections-quick-card`<br>@media (max-width: 390px) | `min-height: 82px`; `padding: 7px`; `grid-template-columns: 60px minmax(0, 1fr)`; `gap: 8px` |
| `.sections-quick-card__art`<br>@media (max-width: 390px) | `width: 60px`; `height: 60px`; `border-radius: 17px` |
| `.sections-quick-card--wide`<br>@media (max-width: 390px) | `min-height: 116px`; `padding: 14px`; `grid-template-columns: 86px minmax(0, 1fr)`; `gap: 12px` |
| `.sections-quick-card--wide .sections-quick-card__art`<br>@media (max-width: 390px) | `width: 86px`; `height: 86px`; `border-radius: 22px` |
| `.sections-quick-card.profile-hub-card` | `background: var(--glass-bg)`; `border-color: var(--glass-border)`; `box-shadow: var(--shadow-glass)`; `backdrop-filter: var(--blur-md)` |
| `.sections-quick-card.profile-hub-card--wide` | `min-height: 116px`; `grid-template-columns: 86px minmax(0, 1fr)`; `gap: 12px`; `padding: 14px` |
| `.profile-hub-card--wide .profile-hub-card__art` | `width: 86px`; `height: 86px`; `border-radius: 22px` |
| `.profile-hub-card--wide .profile-hub-card__title` | `font-size: 19px`; `line-height: 1.05`; `font-weight: 950` |
| `.profile-hub-card--wide .profile-hub-card__copy` | `font-size: 12px`; `font-weight: 750` |
| `.sections-quick-grid`<br>@media (max-width: 360px) | `gap: 8px` |
| `.sections-quick-card`<br>@media (max-width: 360px) | `min-height: 66px`; `padding: 5px`; `grid-template-columns: 46px minmax(0, 1fr)`; `gap: 5px`; `border-radius: 19px` |
| `.sections-quick-card__art`<br>@media (max-width: 360px) | `width: 46px`; `height: 46px`; `border-radius: 14px` |
| `.sections-quick-card__content`<br>@media (max-width: 360px) | `gap: 3px` |
| `.sections-quick-card__title`<br>@media (max-width: 360px) | `max-width: 100%`; `font-size: 11px`; `line-height: 1.08` |
| `.sections-quick-card__meta`<br>@media (max-width: 360px) | `font-size: 8.5px`; `line-height: 1.2` |
| `.sections-quick-card--wide`<br>@media (max-width: 360px) | `min-height: 104px`; `padding: 11px`; `grid-template-columns: 76px minmax(0, 1fr)`; `gap: 10px` |
| `.sections-quick-card--wide .sections-quick-card__art`<br>@media (max-width: 360px) | `width: 76px`; `height: 76px`; `border-radius: 20px` |
| `.sections-quick-card--wide .sections-quick-card__title`<br>@media (max-width: 360px) | `font-size: 18px` |
| `.sections-quick-card--tall` | `height: 186px`; `min-height: 0`; `padding: 8px`; `grid-template-columns: minmax(0, 1fr) 18px`; `grid-template-rows: minmax(0, 1fr) auto`; `row-gap: 8px` |
| `.sections-quick-card--tall .sections-quick-card__art` | `width: 100%`; `height: 120px`; `min-height: 0`; `border-radius: 18px` |
| `.sections-quick-card--tall .sections-quick-card__content` | `padding: 0 4px 4px` |
| `.sections-quick-card--tall .sections-quick-card__title` | `font-size: 16px` |
| `.header-bar` | `margin: calc(10px + var(--app-safe-top)) 14px 10px`; `padding: 8px 10px`; `border-radius: var(--r-pill)`; `gap: 8px` |
| `.header-bar__title` | `font-size: 15px`; `font-weight: 700`; `letter-spacing: -0.01em`; `color: var(--ink)`; `min-width: 0` |
| `.screen` | `min-height: 100vh`; `min-height: 100dvh`; `color: var(--ink)` |
| `.arena-video-cube__background` | `width: 100%`; `height: 100%` |
| `.arena-video-cube__plate` | `width: min(77.5%, 340px)` |
| `.arena-video-cube__cube` | `width: 100%`; `height: 100%` |
| `.arena-video-cube__screen` | `height: 49.8%` |
| `.arena-video-cube__plate--amateur` | `width: min(85.5%, 374px)` |
| `.arena-video-cube__plate--beginner .arena-video-cube__screen` | `height: 48.2%` |
| `.arena-video-cube__plate--amateur .arena-video-cube__screen` | `height: 47.2%` |
| `.arena-video-cube__plate`<br>@media (max-height: 700px) | `width: min(76%, 312px)` |
| `.arena-video-cube__plate--amateur`<br>@media (max-height: 700px) | `width: min(84%, 344px)` |
| `.chat-bubble--flash`<br>@media (prefers-reduced-motion: reduce) | `background-color: rgba(255, 215, 0, 0.18)` |
| `.glass, .glass-dark, .glass-dock-surface, .modal-card, .modal-backdrop`<br>@media (prefers-reduced-transparency: reduce) | `backdrop-filter: none !important` |
| `.glass, .glass-dock-surface, .modal-card`<br>@media (prefers-reduced-transparency: reduce) | `background: var(--liquid-modal-bg)` |
| `.glass, .glass-dock-surface, .modal-card`<br>@media (prefers-contrast: more) | `background: var(--liquid-modal-bg)`; `border-color: rgba(15, 23, 42, 0.58)` |
| `.btn, .icon-btn, .chip, .segmented-tabs__item`<br>@media (prefers-contrast: more) | `border-color: currentColor` |
| `.admin-screen input:not([type='checkbox']):not([type='file']), .admin-screen select, .admin-screen textarea` | `width: 100%`; `min-width: 0`; `height: 44px`; `border-radius: 14px`; `border: 1px solid rgba(255, 255, 255, 0.88)`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `padding: 0 12px`; `font-size: 13px`; `font-weight: 800`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.84), 0 8px 20px rgba(4, 18, 36, 0.08)` |
| `.admin-screen input:not([type='checkbox']):not([type='file']):focus, .admin-screen select:focus, .admin-screen textarea:focus` | `border-color: rgba(30, 91, 151, 0.72)`; `box-shadow: 0 0 0 3px rgba(92, 157, 215, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)` |
| `.admin-screen__toolbar` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 10px`; `min-height: 44px`; `padding: 3px 0`; `background: var(--liquid-inset-bg)`; `border-radius: 999px`; `backdrop-filter: blur(10px) saturate(120%)` |
| `.admin-screen__current-section` | `min-width: 0` |
| `.admin-screen__menu-button` | `width: 38px`; `height: 38px` |
| `.admin-drawer-backdrop` | `background: var(--liquid-modal-bg)`; `backdrop-filter: blur(8px)` |
| `.admin-drawer` | `width: min(84vw, 320px)`; `min-width: min(84vw, 280px)`; `height: 100%`; `min-height: 0`; `grid-template-rows: auto minmax(0, 1fr)`; `gap: 14px`; `padding: calc(16px + var(--app-safe-top)) 14px calc(16px + var(--app-safe-bottom))`; `background: var(--liquid-modal-bg)`; `box-shadow: 22px 0 56px rgba(2, 10, 23, 0.34)`; `color: var(--liquid-ink)` |
| `.admin-drawer__header` | `gap: 12px`; `padding: 0 2px` |
| `.admin-drawer__header h2` | `margin: 0`; `font-size: 20px`; `font-weight: 950` |
| `.admin-drawer__navigation` | `min-height: 0`; `gap: 7px` |
| `.admin-drawer__item` | `min-height: 44px`; `width: 100%`; `border: 1px solid rgba(255, 255, 255, 0.9)`; `border-radius: 14px`; `padding: 9px 14px`; `background: var(--liquid-modal-bg)`; `color: var(--liquid-ink)`; `font-size: 14px`; `font-weight: 900`; `line-height: 1.2`; `gap: 10px`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7)` |
| `.admin-attention-dot` | `width: 9px`; `height: 9px`; `border-radius: 999px`; `background: rgb(220, 38, 38)`; `box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.14)` |
| `.admin-attention-dot--toolbar` | `box-shadow: 0 0 0 2px rgba(9, 22, 45, 0.94)` |
| `.admin-broadcast-card` | `border-radius: 20px`; `padding: 16px`; `gap: 14px` |
| `.admin-broadcast-card__title` | `color: var(--ink)`; `font-size: 16px`; `font-weight: 950` |
| `.admin-broadcast-card__audience` | `margin-top: 5px`; `color: #1d4ed8`; `font-size: 13px`; `font-weight: 900` |
| `.admin-broadcast-card p` | `margin: 0`; `color: var(--muted)`; `font-size: 13px`; `font-weight: 700`; `line-height: 1.45` |
| `.admin-broadcast-card__field` | `gap: 7px`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 900` |
| `.admin-broadcast-card__field textarea` | `height: auto`; `min-height: 132px`; `padding: 12px`; `line-height: 1.45` |
| `.admin-broadcast-card__field small` | `color: var(--muted)` |
| `.admin-broadcast-card__success` | `color: #166534`; `font-size: 13px`; `font-weight: 900` |
| `.admin-broadcast-preview` | `max-height: 180px`; `padding: 12px`; `border: 1px solid rgba(15, 23, 42, 0.14)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 13px`; `line-height: 1.45` |
| `.admin-drawer__item--active` | `background: var(--liquid-modal-bg)`; `border-color: rgba(7, 20, 40, 0.86)`; `color: #ffffff`; `box-shadow: 0 8px 20px rgba(3, 14, 30, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.12)` |
| `.admin-screen .glass` | `background: var(--liquid-inset-bg)`; `border-color: rgba(255, 255, 255, 0.9)`; `box-shadow: 0 14px 34px rgba(3, 15, 31, 0.17), inset 0 1px 0 rgba(255, 255, 255, 0.88)`; `backdrop-filter: blur(22px) saturate(118%)` |
| `.admin-screen > nav.glass` | `background: var(--chrome-surface-bg)`; `box-shadow: var(--chrome-surface-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.92)` |
| `.admin-screen .chip:not(.chip--active)` | `background: var(--liquid-selected-bg)`; `border-color: rgba(255, 255, 255, 0.9)`; `color: var(--liquid-ink)` |
| `.admin-screen .chip--active, .admin-screen .pill--dark` | `background: var(--liquid-selected-bg)`; `border-color: rgba(7, 20, 40, 0.86)`; `box-shadow: 0 8px 20px rgba(3, 14, 30, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.12)` |
| `.admin-screen .pill:not(.pill--dark)` | `background: var(--liquid-selected-bg)`; `border-color: rgba(255, 255, 255, 0.92)` |
| `.admin-screen .glass, .admin-screen input, .admin-screen select`<br>@media (prefers-reduced-transparency: reduce) | `background: var(--liquid-inset-bg)`; `backdrop-filter: none` |
| `.admin-card-actions--single-row` | `grid-template-columns: minmax(0, 1.45fr) repeat(2, minmax(0, 0.72fr)) minmax(0, 1fr)`; `gap: 6px`; `min-width: 0` |
| `.admin-compact-btn` | `min-width: 0`; `min-height: 34px`; `padding: 6px 7px`; `border: 1px solid rgba(100, 116, 139, 0.2)`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 11px`; `font-weight: 850`; `line-height: 1` |
| `.tournament-structured-editor` | `gap: 8px`; `min-width: 0`; `margin: 0`; `padding: 12px`; `border: 1px solid rgba(79, 101, 130, 0.2)`; `border-radius: 16px` |
| `.tournament-table-head, .tournament-table-row` | `grid-template-columns: minmax(72px, 1fr) minmax(70px, 0.8fr) auto`; `gap: 7px` |
| `.tournament-table-head, .tournament-table-row--rewards` | `grid-template-columns: repeat(4, minmax(56px, 1fr)) auto` |
| `.tournament-table-head` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 800` |
| `.tournament-table-row input` | `min-width: 0` |
| `.tournament-notification-card` | `gap: 8px`; `padding: 12px`; `border-radius: 14px`; `background: var(--liquid-card-bg)` |
| `.tournament-picker img` | `width: 24px`; `height: 24px`; `border-radius: 50%` |
| `.modal-backdrop--nested` | `border-radius: inherit` |
| `.tournament-table-head, .tournament-table-row--rewards`<br>@media (max-width: 520px) | `grid-template-columns: repeat(4, minmax(44px, 1fr)) auto`; `gap: 4px` |
| `.app-shell--unified-glass :is( .glass, .bonus-game-card, .bonus-game-mode-card, .mode-info-card, .mode-setup-card, .duel-state-card, .section-card-surface, .sections-quick-card, .achievement-card, .tournament-playoff-round, .tournament-review-card, .tournament-picker__result, .tournament-ordered-list__row, .tournament-notification-card, .tournament-overview-grid > button, .tournament-standing-list > div, .tournament-fixture-card, .tournament-bracket__round-tabs button, .tournament-bracket-series, .tournament-bracket-player, .tournament-participants-list__row, .tournament-player-search__results > button, .tournament-participant-admin-row, .tournament-operation-list-row, .tournament-schedule-upcoming, .tournament-schedule-fixture, .tournament-admin-series, .tournament-matchday-row, .daily-result-modal__period, .duel-history-summary__tiles > div, .duel-day-match, .admin-official-dialog__message, .admin-official-dialog__attachment, .tournament-operation-rewards__row > span, .tournament-dispatch-message )` | `background: var(--surface-card-bg)`; `border-color: var(--surface-border)`; `box-shadow: var(--surface-card-shadow)`; `backdrop-filter: var(--surface-blur)` |
| `.app-shell--unified-glass :is( .bonus-game-card--featured, .section-card-surface--active, .sections-quick-card--active, .achievement-card--claimable, .duel-equipment-option--selected, .modal-card, .admin-drawer, .tournament-player-search__results )` | `background: var(--surface-elevated-bg)`; `border-color: rgba(255, 255, 255, 0.94)`; `box-shadow: var(--surface-elevated-shadow)`; `backdrop-filter: var(--surface-blur)` |
| `.app-shell--unified-glass :is( .segmented-tabs, .glass-dock-surface, .glass-dock-field, .chat-create-search, .header-bar.glass, .chat-dock-header:not(.chat-dock-header--bare), .chip:not(.chip--active), .pill:not(.pill--dark), .admin-screen input:not([type='checkbox']):not([type='file']), .admin-screen select, .admin-screen textarea, .bonus-game-inventory-fields select )` | `background: var(--surface-filter-bg)`; `border-color: rgba(255, 255, 255, 0.9)`; `box-shadow: var(--surface-filter-shadow)`; `backdrop-filter: var(--surface-control-blur)` |
| `.app-shell--unified-glass .admin-screen .glass` | `background: var(--surface-card-bg)` |
| `.bonus-game-editor-modal` | `height: min(860px, calc(var(--app-viewport-height, 100dvh) - 24px))`; `max-height: calc(var(--app-viewport-height, 100dvh) - 24px) !important`; `padding-bottom: 0 !important` |
| `.bonus-game-editor-modal > div:last-child` | `min-height: 0`; `margin-top: 12px !important` |
| `.bonus-game-editor` | `width: 100%`; `min-height: 0`; `grid-template-rows: minmax(0, 1fr) auto` |
| `.bonus-game-editor__scroll` | `min-height: 0`; `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 12px`; `padding: 0 4px 18px` |
| `.bonus-game-editor__scroll > .admin-form-section-title` | `margin-top: 8px`; `padding-top: 16px`; `font-size: 16px`; `letter-spacing: -0.01em` |
| `.bonus-game-editor__scroll > .admin-form-section-title:first-child` | `margin-top: 0`; `padding-top: 0` |
| `.bonus-game-editor__period` | `padding: 14px !important`; `border-radius: 18px !important` |
| `.bonus-game-editor__media` | `gap: 8px` |
| `.bonus-game-editor__upload-row` | `min-width: 0`; `gap: 10px`; `padding: 8px 10px`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72)` |
| `.bonus-game-editor__upload-label` | `min-width: 0`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 850`; `line-height: 1.3` |
| `.bonus-game-editor__upload-button` | `min-height: 34px`; `padding: 7px 13px`; `border: 1px solid rgba(255, 255, 255, 0.92)`; `border-radius: 999px`; `color: var(--liquid-ink)`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 6px 16px rgba(4, 18, 36, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.88)`; `font-size: 11px`; `font-weight: 900` |
| `.bonus-game-editor label:has(> input[type='checkbox'])` | `min-height: 44px`; `gap: 10px !important`; `padding: 9px 11px`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.bonus-game-editor input[type='checkbox']` | `width: 24px`; `height: 24px`; `margin: 0` |
| `.bonus-game-editor__alert` | `padding: 11px 12px`; `border: 1px solid rgba(190, 45, 45, 0.22)`; `border-radius: 14px`; `color: #9f1d1d`; `background: rgba(255, 232, 232, 0.72)`; `font-size: 12px`; `font-weight: 800`; `line-height: 1.4` |
| `.bonus-game-editor__actions` | `grid-template-columns: 1fr 1fr`; `gap: 10px`; `margin: 0`; `padding: 14px 4px calc(16px + var(--app-safe-bottom))`; `background: var(--liquid-inset-bg)` |
| `.bonus-game-editor__actions .btn, .bonus-game-editor__actions .modal-primary` | `min-height: 48px` |
| `.bonus-game-editor-modal`<br>@media (max-width: 620px) | `width: calc(100vw - 20px) !important`; `height: calc(var(--app-viewport-height, 100dvh) - 20px)`; `max-height: calc(var(--app-viewport-height, 100dvh) - 20px) !important`; `padding-inline: 16px !important` |
| `.bonus-game-editor__scroll`<br>@media (max-width: 620px) | `grid-template-columns: minmax(0, 1fr)`; `gap: 10px` |
| `.bonus-game-editor__upload-button`<br>@media (max-width: 620px) | `width: 100%` |
| `.app-shell--unified-glass :is(.section-card-surface--muted, .daily-result-modal__period--empty)` | `background: rgba(226, 233, 241, 0.62)` |
| `.app-shell--unified-glass :is(.glass, .modal-card, .segmented-tabs, .glass-dock-surface)`<br>@media (prefers-reduced-transparency: reduce) | `backdrop-filter: none` |
| `.venue-badge` | `min-height: 20px`; `padding: 0 8px`; `border: 1px solid rgba(100, 116, 139, 0.22)`; `border-radius: 999px`; `color: var(--liquid-muted)`; `background: var(--liquid-inset-bg)`; `font-size: 10px`; `font-weight: 900`; `line-height: 1` |
| `.venue-badge--home` | `border-color: rgba(37, 99, 235, 0.26)`; `background: var(--liquid-inset-bg)`; `color: #1d4ed8` |
| `.venue-badge--away` | `border-color: rgba(234, 88, 12, 0.26)`; `background: rgba(255, 237, 213, 0.76)`; `color: #c2410c` |
| `.venue-badge--neutral` | `border-color: rgba(100, 116, 139, 0.24)`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.venue-badge--dark` | `border-color: rgba(174, 231, 255, 0.34)`; `background: var(--liquid-inset-bg)`; `color: rgba(233, 251, 255, 0.94)`; `box-shadow: 0 0 8px rgba(92, 211, 255, 0.16)` |
| `.tournament-fixture-summary` | `min-width: 0`; `gap: 8px` |
| `.tournament-catalog, .tournament-details` | `gap: 10px`; `min-width: 0` |
| `.tournament-catalog__empty` | `margin: 12px 4px 0`; `padding: 0`; `color: rgba(244, 250, 255, 0.94)`; `font-size: 14px`; `font-weight: 750`; `line-height: 1.45` |
| `.tournament-catalog__section-title` | `margin: 2px 0 -2px`; `padding-inline: 0` |
| `.tournament-wizard input[type='number']::-webkit-inner-spin-button, .tournament-wizard input[type='number']::-webkit-outer-spin-button, .tournament-operation-rewards input[type='number']::-webkit-inner-spin-button, .tournament-operation-rewards input[type='number']::-webkit-outer-spin-button` | `margin: 0` |
| `.tournament-catalog__section, .tournament-catalog__cards` | `gap: 8px`; `min-width: 0` |
| `.tournament-catalog-card` | `grid-template-columns: 76px minmax(0, 1fr)`; `gap: 12px`; `width: 100%`; `padding: 14px 15px`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 20px`; `color: var(--ink)` |
| `.tournament-catalog-card__image` | `width: 76px`; `border-radius: 15px`; `box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14)` |
| `.tournament-catalog-card__content` | `min-width: 0` |
| `.tournament-catalog-card__topline, .tournament-details__status-row` | `gap: 8px`; `min-width: 0` |
| `.tournament-catalog-card .section-label, .tournament-details__status-row .section-label` | `min-width: 0`; `margin: 0`; `padding: 0`; `font-size: 10px`; `font-weight: 700`; `letter-spacing: 0.08em` |
| `.tournament-catalog-card__title` | `margin-top: 6px`; `font-size: 18px`; `font-weight: 780` |
| `.tournament-catalog-card__meta` | `margin-top: 4px`; `color: var(--muted)`; `font-size: 12px`; `font-weight: 620` |
| `.tournament-catalog-card__date` | `margin-top: 3px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 700` |
| `.tournament-participation-badge` | `min-width: 0`; `max-width: 100%`; `min-height: 22px`; `padding: 0 8px`; `border: 1px solid rgba(30, 91, 151, 0.18)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 900`; `line-height: 1.25` |
| `.tournament-back-btn` | `min-height: 32px`; `padding: 0 10px`; `border: 1px solid rgba(100, 116, 139, 0.2)`; `border-radius: 11px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 11px`; `font-weight: 850` |
| `.tournament-details__hero, .tournament-details__content` | `border-radius: 20px`; `padding: 14px 15px` |
| `.tournament-details__hero h2` | `margin: 6px 0 4px`; `color: var(--ink)`; `font-size: 24px`; `line-height: 1.15` |
| `.tournament-details__description` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 560`; `line-height: 1.5` |
| `.tournament-details__description p` | `margin: 0` |
| `.tournament-details__description p + p` | `margin-top: 7px` |
| `.tournament-details__description strong` | `color: var(--ink)`; `font-weight: 760` |
| `.tournament-details__timing` | `margin-top: 7px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.4` |
| `.tournament-details__content` | `min-height: 150px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 560`; `line-height: 1.5` |
| `.tournament-overview-grid` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 8px` |
| `.tournament-overview-layout` | `gap: 12px` |
| `.tournament-overview-layout + .tournament-rules` | `margin-top: 18px` |
| `.tournament-overview-dates` | `padding-bottom: 12px` |
| `.tournament-overview-dates h3` | `margin: 0 0 8px`; `font-size: 14px` |
| `.tournament-overview-dates dl` | `margin: 0`; `gap: 14px` |
| `.tournament-overview-dates dl > div` | `grid-template-columns: minmax(110px, 0.35fr) minmax(0, 1fr)`; `gap: 10px` |
| `.tournament-overview-dates dt` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 700` |
| `.tournament-overview-dates dd` | `margin: 0`; `color: var(--ink)`; `font-size: 11px`; `font-weight: 650` |
| `.tournament-overview-grid > div, .tournament-overview-grid > button` | `gap: 4px`; `min-width: 0`; `padding: 10px`; `border-radius: 13px`; `background: var(--liquid-inset-bg)` |
| `.tournament-overview-grid > button` | `border: 0`; `color: inherit` |
| `.tournament-overview-grid span` | `color: var(--muted)`; `font-size: 10px` |
| `.tournament-overview-grid strong` | `font-size: 13px` |
| `.tournament-standing-list, .tournament-fixture-list` | `gap: 7px` |
| `.tournament-standing-list > div` | `grid-template-columns: 24px minmax(0, 1fr) auto`; `gap: 8px`; `min-height: 36px`; `padding: 6px 8px`; `border-radius: 11px`; `background: var(--liquid-inset-bg)` |
| `.tournament-standing-table` | `width: 100%`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 620`; `line-height: 1.25` |
| `.tournament-standing-table th, .tournament-standing-table td` | `padding: 10px 7px` |
| `.tournament-standing-table th` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 880`; `letter-spacing: 0.045em` |
| `.tournament-standing-table th:first-child, .tournament-standing-table td:first-child` | `width: 50px` |
| `.tournament-standing-table th:nth-child(3), .tournament-standing-table td:nth-child(3)` | `width: 44px` |
| `.tournament-standing-table th:last-child, .tournament-standing-table td:last-child` | `width: 64px` |
| `.tournament-standing-table td:nth-child(2)` | `font-size: 13px`; `font-weight: 760` |
| `.tournament-standing-player` | `min-width: 0`; `gap: 7px` |
| `.tournament-standing-player > span` | `min-width: 0` |
| `.tournament-standing-table tbody tr.tournament-standing-table__playoff-place` | `background: rgba(111, 151, 132, 0.14)` |
| `.tournament-standings-progressive__more` | `margin: 12px 0 0`; `color: var(--muted)` |
| `.tournament-standings-progressive__pinned` | `width: min(calc(100vw - 48px), 488px)`; `border-radius: 0`; `background: #c4d5e6` |
| `.tournament-standings-progressive__pinned .tournament-standing-table` | `margin: 0` |
| `.tournament-standings-progressive__pinned .tournament-standing-table tbody tr.tournament-standing-table__current-user` | `background: rgba(147, 197, 253, 0.38)` |
| `.tournament-standing-table--duel-rating` | `font-size: 11px` |
| `.tournament-standing-table--duel-rating th, .tournament-standing-table--duel-rating td` | `padding: 8px 2px` |
| `.tournament-standing-table--duel-rating th` | `font-size: 8px`; `letter-spacing: 0.025em` |
| `.tournament-standing-table--duel-rating th:first-child, .tournament-standing-table--duel-rating td:first-child` | `width: 24px` |
| `.tournament-standing-table--duel-rating th:nth-child(n + 3):nth-child(-n + 6), .tournament-standing-table--duel-rating td:nth-child(n + 3):nth-child(-n + 6)` | `width: 28px` |
| `.tournament-standing-table--duel-rating th:last-child, .tournament-standing-table--duel-rating td:last-child` | `width: 34px` |
| `.tournament-standing-table--duel-rating td:nth-child(2)` | `font-size: 12px`; `font-weight: 740` |
| `.tournament-standing-table--duel-rating .tournament-standing-player` | `gap: 5px` |
| `.tournament-standing-table--duel-rating tbody tr.tournament-standing-table__current-user` | `color: var(--ink)`; `background: transparent`; `box-shadow: none` |
| `.tournament-standing-table--duel-rating tbody tr.tournament-standing-table__current-user td` | `background: rgba(147, 197, 253, 0.38)` |
| `.tournament-standing-table--duel-rating tbody tr.tournament-standing-table__medal-place--gold td` | `background: rgba(250, 204, 21, 0.16)` |
| `.tournament-standing-table tbody tr.tournament-standing-table__medal-place--silver td` | `background: var(--liquid-inset-bg)` |
| `.tournament-standing-table--duel-rating tbody tr.tournament-standing-table__medal-place--bronze td` | `background: rgba(194, 122, 75, 0.16)` |
| `.tournament-standing-table--experience-rating th, .tournament-standing-table--experience-rating td` | `padding-top: 10px`; `padding-bottom: 10px` |
| `.tournament-standing-table--experience-rating th` | `background: var(--liquid-solid-bg)` |
| `.tournament-standing-table--experience-rating th:first-child, .tournament-standing-table--experience-rating td:first-child` | `width: 24px`; `color: var(--ink)` |
| `.tournament-standing-table--experience-rating th:last-child, .tournament-standing-table--experience-rating td:last-child` | `width: 78px`; `font-weight: 800` |
| `.tournament-standing-table--profile-accuracy-rating th` | `font-size: 8px`; `letter-spacing: 0.01em` |
| `.tournament-standing-table--profile-accuracy-rating th:nth-child(n + 3), .tournament-standing-table--profile-accuracy-rating td:nth-child(n + 3)` | `width: 72px` |
| `.tournament-standing-table--profile-goals-rating th:nth-child(n + 3), .tournament-standing-table--profile-goals-rating td:nth-child(n + 3)` | `width: 72px` |
| `.tournament-standing-table--profile-streak-rating th:nth-child(3), .tournament-standing-table--profile-streak-rating td:nth-child(3)` | `width: 82px` |
| `.tournament-standing-table--profile-streak-rating th:nth-child(3)` | `font-size: 8px`; `line-height: 1.1` |
| `.tournament-standing-table--profile-streak-rating th:last-child, .tournament-standing-table--profile-streak-rating td:last-child` | `width: 62px` |
| `.tournament-standing-table--experience-rating tbody tr.tournament-standing-table__current-user` | `color: var(--ink)`; `background: transparent`; `box-shadow: none` |
| `.tournament-standing-table--experience-rating tbody tr.tournament-standing-table__current-user td` | `background: rgba(147, 197, 253, 0.38)` |
| `.experience-rating__pinned .tournament-standing-table--experience-rating tbody tr.tournament-standing-table__current-user td:first-child` | `border-radius: 0 0 0 14px` |
| `.experience-rating__pinned .tournament-standing-table--experience-rating tbody tr.tournament-standing-table__current-user td:last-child` | `border-radius: 0 0 14px 0` |
| `.tournament-fixture-card` | `gap: 6px`; `padding: 10px`; `border: 1px solid rgba(100, 116, 139, 0.14)`; `border-radius: 14px`; `background: var(--liquid-card-bg)` |
| `.tournament-fixture-card--mine` | `border-color: rgba(55, 139, 196, 0.32)`; `background: var(--liquid-card-bg)` |
| `.tournament-calendar` | `gap: 12px`; `min-width: 0` |
| `.tournament-calendar__header` | `grid-template-columns: 34px minmax(0, 1fr) 34px`; `gap: 8px` |
| `.tournament-calendar__header > strong` | `color: var(--ink)`; `font-size: 14px`; `font-weight: 800` |
| `.tournament-calendar__month-button` | `width: 34px`; `min-width: 34px`; `height: 34px` |
| `.tournament-calendar__weekdays, .tournament-calendar__grid` | `grid-template-columns: repeat(7, minmax(0, 1fr))`; `gap: 4px` |
| `.tournament-calendar__weekdays span` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 800` |
| `.tournament-calendar__day, .tournament-calendar__empty-day` | `min-width: 0` |
| `.tournament-calendar__day` | `padding: 0`; `border: 1px solid var(--surface-calendar-day-border, rgba(255, 255, 255, 0.72))`; `border-radius: 11px`; `background: var(--surface-calendar-day-bg, rgba(255, 255, 255, 0.42))`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650` |
| `.tournament-calendar__day--has-events` | `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)`; `font-weight: 780` |
| `.tournament-calendar__day--regular` | `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-calendar__day--playoff` | `border-color: rgba(112, 74, 179, 0.42)`; `background: rgba(210, 199, 244, 0.9)`; `color: #44306f` |
| `.tournament-calendar__day--today` | `border-color: rgba(36, 77, 115, 0.55)` |
| `.tournament-calendar__day--outside-range:disabled` | `background: var(--surface-calendar-day-muted-bg, rgba(255, 255, 255, 0.26))`; `color: #7890a5` |
| `.tournament-calendar__day--selected` | `border-color: #173c5e`; `background: var(--liquid-selected-bg)`; `color: #ffffff`; `box-shadow: 0 6px 14px rgba(23, 60, 94, 0.2)` |
| `.tournament-calendar__day--playoff.tournament-calendar__day--selected` | `border-color: #c8b4ff`; `background: #34265d`; `color: #ffffff`; `box-shadow: inset 0 0 0 2px rgba(206, 190, 255, 0.54), 0 6px 14px rgba(52, 38, 93, 0.24)` |
| `.tournament-calendar__day i` | `width: 3px`; `height: 3px`; `border-radius: 999px`; `background: currentColor` |
| `.tournament-calendar__mine-mark` | `width: 7px`; `height: 3px`; `border-radius: 999px`; `background: #1681bd`; `box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.54)` |
| `.tournament-calendar__legend` | `gap: 7px 12px`; `margin: 0`; `padding: 0`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 750` |
| `.tournament-calendar__legend li` | `gap: 5px` |
| `.tournament-calendar__legend-dot` | `width: 8px`; `height: 8px`; `border: 1px solid transparent`; `border-radius: 999px` |
| `.tournament-calendar__legend-dot--events` | `border-color: rgba(36, 77, 115, 0.14)`; `background: var(--liquid-inset-bg)` |
| `.tournament-calendar__legend-dot--regular` | `background: var(--liquid-inset-bg)` |
| `.tournament-calendar__legend-dot--playoff` | `border-color: rgba(112, 74, 179, 0.42)`; `background: rgba(210, 199, 244, 0.9)` |
| `.tournament-calendar__legend-dot--mine` | `width: 5px`; `height: 5px`; `background: var(--liquid-inset-bg)` |
| `.tournament-calendar__legend-dot--empty-day` | `border-color: rgba(185, 137, 31, 0.3)`; `background: rgba(243, 196, 91, 0.9)` |
| `.tournament-calendar__legend-dot--selected` | `background: var(--liquid-selected-bg)` |
| `.tournament-calendar__details, .tournament-calendar__undated` | `gap: 8px`; `padding-top: 4px` |
| `.tournament-calendar__details > h4, .tournament-calendar__undated > h4` | `margin: 0`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 820` |
| `.tournament-calendar__details > p` | `margin: 0`; `padding: 8px 0`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 620` |
| `.tournament-fixture-sections, .tournament-fixture-section` | `gap: 8px`; `min-width: 0` |
| `.tournament-fixture-section > h5, .tournament-matchday-past > h5` | `margin: 0`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 820` |
| `.tournament-fixture-section--others` | `margin-top: 2px`; `padding-top: 10px` |
| `.tournament-schedule-series` | `border: 1px solid rgba(100, 116, 139, 0.18)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-schedule-series__summary` | `width: 100%`; `gap: 8px`; `padding: 10px 11px`; `border: 0`; `color: var(--ink)`; `background: transparent` |
| `.tournament-schedule-series__time` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 720` |
| `.tournament-schedule-series__matchup` | `grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)`; `gap: 8px`; `font-size: 12px` |
| `.tournament-schedule-series__matchup b` | `font-size: 15px` |
| `.tournament-schedule-series__games` | `gap: 7px`; `padding: 0 8px 8px` |
| `.tournament-playoff-schedule-blocks` | `gap: 8px` |
| `.tournament-playoff-schedule-block` | `gap: 5px`; `padding: 11px 12px`; `border: 1px solid rgba(112, 74, 179, 0.2)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)` |
| `.tournament-playoff-schedule-block__header` | `gap: 12px` |
| `.tournament-playoff-schedule-block__header h5` | `margin: 0`; `font-size: 13px`; `font-weight: 900` |
| `.tournament-playoff-schedule-block__header strong` | `font-size: 13px`; `font-weight: 900` |
| `.tournament-playoff-schedule-block > span, .tournament-playoff-schedule-block > p` | `margin: 0`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 720`; `line-height: 1.35` |
| `.tournament-matchday-result` | `gap: 2px`; `padding: 3px 1px`; `color: var(--liquid-muted)` |
| `.tournament-matchday-result strong` | `font-size: 12px`; `font-weight: 720` |
| `.tournament-matchday-result span` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 520`; `line-height: 1.4` |
| `.tournament-matchday-past` | `gap: 7px`; `margin-top: 3px`; `padding-top: 10px` |
| `.tournament-matchday-past > p` | `margin: 0`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 620` |
| `.tournament-matchday-past__row` | `min-width: 0`; `gap: 9px`; `padding: 7px 0` |
| `.tournament-matchday-past__row > div` | `min-width: 0`; `gap: 2px` |
| `.tournament-matchday-past__row strong` | `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 780` |
| `.tournament-matchday-past__row span` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 620` |
| `.tournament-matchday-past__actions` | `gap: 4px` |
| `.tournament-calendar__expand` | `padding: 5px 10px`; `border: 0`; `background: transparent`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 760` |
| `.tournament-live` | `gap: 12px`; `padding: 14px`; `color: var(--ink)` |
| `.tournament-live__header` | `grid-template-columns: 34px minmax(0, 1fr) 34px`; `gap: 8px` |
| `.tournament-live__header h2` | `margin: 0`; `font-size: 15px`; `font-weight: 820` |
| `.tournament-live__update, .tournament-live__message` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650` |
| `.tournament-live__message--error` | `color: #9a2d2d` |
| `.tournament-live__score > div` | `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 680` |
| `.tournament-live__score > strong` | `margin-top: 3px`; `font-size: 32px`; `font-weight: 900` |
| `.tournament-live__participants` | `gap: 7px` |
| `.tournament-live__participants > div, .tournament-live__proposal` | `gap: 3px`; `padding: 10px`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-live__participants strong, .tournament-live__proposal > strong` | `font-size: 12px`; `font-weight: 800` |
| `.tournament-live__participants span, .tournament-live__proposal p` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 640` |
| `.tournament-live__proposal-actions` | `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)`; `gap: 7px`; `margin-top: 7px` |
| `.tournament-live__proposal-actions .btn` | `min-width: 0`; `padding-inline: 10px`; `font-size: 11px` |
| `.tournament-live__warning` | `padding: 11px`; `border-radius: 14px`; `background: rgba(196, 122, 30, 0.14)` |
| `.tournament-live__warning strong` | `font-size: 12px` |
| `.tournament-live__warning p, .tournament-live__warning ul` | `margin: 5px 0 0`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 640` |
| `.tournament-live__time-field` | `gap: 6px` |
| `.tournament-live__time-field > span` | `font-size: 11px`; `font-weight: 760` |
| `.tournament-live__time-field input` | `min-width: 0` |
| `.tournament-fixture-card__meta` | `grid-template-columns: minmax(0, 1fr) auto auto`; `gap: 8px`; `color: var(--muted)`; `font-size: 10px` |
| `.tournament-fixture-card__meta > span:first-child` | `min-width: 0` |
| `.tournament-fixture-card__meta strong` | `color: var(--liquid-muted)` |
| `.tournament-fixture-card__score` | `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 900` |
| `.tournament-fixture-result` | `font-size: 12px`; `font-weight: 900` |
| `.tournament-fixture-result--win` | `color: #15803d` |
| `.tournament-fixture-result--loss` | `color: #b76d72` |
| `.tournament-fixture-matchup` | `min-width: 0`; `gap: 8px` |
| `.tournament-fixture-matchup__avatars > :last-child` | `box-shadow: 0 0 0 2px rgba(241, 248, 253, 0.95)` |
| `.tournament-fixture-matchup__names` | `min-width: 0`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 760` |
| `.tournament-fixture-card__footer` | `min-height: 25px`; `gap: 8px` |
| `.tournament-fixture-card__footer > div` | `min-width: 0`; `gap: 8px` |
| `.tournament-fixture-card__action--primary` | `border-color: #173c5e`; `background: var(--liquid-card-bg)`; `color: #ffffff`; `box-shadow: 0 7px 16px rgba(23, 60, 94, 0.2)` |
| `.tournament-fixture-card__error` | `color: #9a2d2d`; `font-size: 10px`; `font-weight: 650`; `line-height: 1.35` |
| `.tournament-bracket-row` | `padding: 9px 0` |
| `.tournament-bracket` | `gap: 8px` |
| `.tournament-bracket-overview` | `min-width: 0`; `gap: 8px` |
| `.tournament-bracket-overview__heading-row` | `min-width: 0`; `gap: 12px` |
| `.tournament-bracket-overview__heading-row > h3` | `margin: 0`; `color: var(--ink)`; `font-size: 14px`; `font-weight: 850` |
| `.tournament-bracket-overview__density` | `gap: 2px`; `padding: 2px`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)` |
| `.tournament-bracket-overview__density button` | `width: 24px`; `height: 24px`; `padding: 0`; `border: 0`; `border-radius: 999px`; `background: transparent`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 850` |
| `.tournament-bracket-overview__density button[aria-pressed='true']` | `background: var(--liquid-inset-bg)`; `color: #ffffff` |
| `.tournament-bracket-overview__viewport` | `max-width: 100%` |
| `.tournament-bracket-overview__grid` | `column-gap: var(--playoff-bracket-column-gap)`; `row-gap: 12px`; `min-width: 100%`; `padding: 2px 2px 8px` |
| `.tournament-bracket-overview[data-layout='fit'] .tournament-bracket-overview__grid` | `grid-template-columns: repeat(var(--playoff-round-count), minmax(0, 1.1fr)) minmax(0, 0.9fr)` |
| `.tournament-bracket-overview[data-layout='scroll'][data-visible-columns='2'] .tournament-bracket-overview__grid` | `grid-template-columns: repeat(var(--playoff-column-count), minmax(0, calc(50cqi - 6px)))`; `width: max-content` |
| `.tournament-bracket-overview[data-layout='scroll'][data-visible-columns='3'] .tournament-bracket-overview__grid` | `grid-template-columns: repeat(var(--playoff-column-count), minmax(0, calc(33.3333cqi - 8px)))`; `width: max-content` |
| `.tournament-bracket-overview[data-layout='scroll'][data-visible-columns='4'] .tournament-bracket-overview__grid` | `grid-template-columns: repeat(var(--playoff-column-count), minmax(0, calc(25cqi - 9px)))`; `width: max-content` |
| `.tournament-bracket-overview__column` | `grid-template-rows: auto minmax(min-content, 1fr)`; `min-width: 0`; `gap: 8px` |
| `.tournament-bracket-overview__column > header` | `min-width: 0`; `gap: 2px` |
| `.tournament-bracket-overview__column > header strong` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 850` |
| `.tournament-bracket-overview__column > header span` | `color: var(--liquid-muted)`; `font-size: 8px`; `font-weight: 700` |
| `.tournament-bracket-overview__series-list` | `min-height: 100%`; `gap: 10px` |
| `.tournament-bracket-connector` | `width: var(--playoff-bracket-column-gap)` |
| `.tournament-bracket-connector::before` | `width: 1px`; `background: rgba(67, 98, 126, 0.5)` |
| `.tournament-bracket-connector::after` | `width: 50%`; `height: 1px`; `background: rgba(67, 98, 126, 0.5)` |
| `.tournament-bracket-overview .tournament-bracket-series::after` | `width: calc(var(--playoff-bracket-column-gap) / 2)`; `height: 1px`; `background: rgba(67, 98, 126, 0.5)` |
| `.tournament-bracket-overview__bronze-column` | `min-width: 0`; `gap: 10px` |
| `.tournament-bracket-overview__bronze-lane` | `min-width: 0` |
| `.tournament-bracket-overview__bronze-lane::before` | `width: 1px`; `height: 10px`; `background: rgba(144, 91, 46, 0.4)` |
| `.tournament-bracket-series--mine` | `border-color: rgba(43, 126, 89, 0.62)`; `box-shadow: 0 0 0 2px rgba(43, 126, 89, 0.1), 0 8px 20px rgba(37, 99, 75, 0.1)` |
| `.tournament-bracket-champion` | `grid-template-columns: minmax(0, 1fr)`; `min-width: 0`; `width: 100%`; `gap: 8px`; `padding: 12px`; `border: 1px solid rgba(190, 145, 41, 0.5)`; `border-radius: 16px`; `background: linear-gradient(135deg, rgba(255, 222, 113, 0.72), rgba(255, 246, 211, 0.78))`; `color: #6f5012`; `box-shadow: 0 10px 24px rgba(151, 108, 23, 0.14)` |
| `.tournament-bracket-champion > strong` | `font-size: 11px`; `font-weight: 900` |
| `.tournament-bracket-champion > span` | `min-width: 0`; `width: 100%`; `font-size: 9px`; `font-weight: 700`; `line-height: 1.35` |
| `.tournament-bracket-champion__player` | `grid-template-columns: 14px auto minmax(0, 1fr)`; `min-width: 0`; `gap: 6px` |
| `.tournament-bracket-champion__player > span` | `font-size: 10px`; `font-weight: 850` |
| `.tournament-bracket-champion__player > strong` | `font-size: 12px`; `font-weight: 850` |
| `.tournament-bracket-overview[data-layout='fit'] .tournament-bracket-champion` | `gap: 5px`; `padding: 8px 6px`; `border-radius: 13px` |
| `.tournament-bracket-overview[data-layout='fit'] .tournament-bracket-champion__player` | `grid-template-columns: 10px auto minmax(0, 1fr)`; `gap: 4px` |
| `.tournament-bracket-overview[data-layout='fit'] .tournament-bracket-champion__player > strong` | `font-size: 9px` |
| `.tournament-bracket-series--compact` | `gap: 4px`; `padding: 6px`; `border-radius: 12px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary` | `gap: 5px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary > header` | `gap: 5px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary > header strong` | `font-size: 9px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary > header .tournament-bracket-series__staged-title` | `line-height: 1.1` |
| `.tournament-bracket-series__stage-label` | `margin-bottom: 2px`; `font-size: 8px`; `font-weight: 850` |
| `.tournament-bracket-series__summary > header.tournament-bracket-series__staged-header` | `grid-template-columns: minmax(0, 1fr)`; `gap: 2px` |
| `.tournament-bracket-series__staged-title` | `min-width: 0` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary > header span` | `font-size: 7px` |
| `.tournament-bracket-series--compact .tournament-bracket-player` | `grid-template-columns: 10px auto minmax(0, 1fr) 10px`; `gap: 3px`; `padding: 4px 3px`; `border-radius: 8px` |
| `.tournament-bracket-series--compact .tournament-bracket-player--pending` | `padding: 5px 6px` |
| `.tournament-bracket-series--compact .tournament-bracket-player__placeholder` | `font-size: 9px` |
| `.tournament-bracket-series--compact .tournament-bracket-player__seed, .tournament-bracket-series--compact .tournament-bracket-player__wins` | `font-size: 8px` |
| `.tournament-bracket-series--compact .tournament-bracket-player__identity strong` | `font-size: 9px` |
| `.tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact` | `padding: 5px`; `border-radius: 11px` |
| `.tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact .tournament-bracket-series__summary > header strong, .tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact .tournament-bracket-player__identity strong, .tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact .tournament-bracket-player__placeholder` | `font-size: 8px` |
| `.tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series__stage-label` | `font-size: 7px` |
| `.tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact .tournament-bracket-player` | `grid-template-columns: 8px auto minmax(0, 1fr) 8px`; `gap: 2px`; `padding: 3px 2px` |
| `.tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact .tournament-bracket-player__seed` | `min-width: 0`; `font-size: 6px`; `line-height: 1`; `letter-spacing: -0.04em` |
| `.tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact` | `padding: 4px`; `border-radius: 10px` |
| `.tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact .tournament-bracket-series__summary > header strong, .tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact .tournament-bracket-player__identity strong, .tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact .tournament-bracket-player__placeholder` | `font-size: 7px` |
| `.tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series__stage-label` | `font-size: 6px` |
| `.tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact .tournament-bracket-series__summary > header span, .tournament-bracket-overview[data-visible-columns='3'] .tournament-bracket-series--compact .tournament-bracket-series__summary > header span` | `font-size: 6px` |
| `.tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact .tournament-bracket-player` | `grid-template-columns: 7px auto minmax(0, 1fr) 7px`; `gap: 2px`; `padding: 3px 2px` |
| `.tournament-bracket-overview[data-visible-columns='4'] .tournament-bracket-series--compact .tournament-bracket-player__seed` | `min-width: 0`; `font-size: 5px`; `line-height: 1`; `letter-spacing: -0.06em` |
| `.tournament-bracket-series-modal` | `width: min(520px, calc(100vw - 28px))`; `max-width: min(100%, 520px)`; `max-height: min(82dvh, 720px)` |
| `.tournament-bracket-series-modal__meta` | `gap: 10px`; `margin-bottom: 10px`; `color: var(--liquid-muted)`; `font-size: 10px` |
| `.tournament-bracket-series-modal__meta strong` | `color: var(--liquid-muted)`; `font-size: 11px` |
| `.tournament-bracket-series-modal__empty` | `color: var(--liquid-muted)`; `font-size: 11px`; `line-height: 1.4` |
| `.tournament-bracket-series-modal__players` | `gap: 6px`; `margin-bottom: 8px` |
| `.tournament-bracket-series-modal__player` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 10px`; `min-width: 0`; `padding: 8px 10px`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-bracket-series-modal__identity` | `min-width: 0`; `gap: 8px` |
| `.tournament-bracket-series-modal__seed` | `width: 12px`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 750`; `line-height: 1` |
| `.tournament-bracket-series-modal__name` | `min-width: 0`; `min-height: 30px` |
| `.tournament-bracket-series-modal__score` | `margin-bottom: 8px`; `color: var(--liquid-muted)`; `font-size: 13px` |
| `.tournament-bracket__round-tabs` | `max-width: 100%`; `gap: 5px`; `padding: 2px` |
| `.tournament-bracket__round-tabs button` | `min-height: 30px`; `padding: 5px 10px`; `border: 1px solid rgba(98, 127, 153, 0.2)`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 720` |
| `.tournament-bracket__round-tabs button.is-active` | `border-color: #173c5e`; `background: var(--liquid-selected-bg)`; `color: #ffffff` |
| `.tournament-bracket__round-tabs button.tournament-bracket__round-tab--gold` | `border-color: rgba(190, 145, 41, 0.46)`; `background: linear-gradient(135deg, rgba(255, 225, 132, 0.72), rgba(255, 244, 204, 0.78))`; `color: #765412` |
| `.tournament-bracket__round-tabs button.tournament-bracket__round-tab--bronze` | `border-color: rgba(158, 96, 47, 0.38)`; `background: linear-gradient(135deg, rgba(222, 169, 116, 0.58), rgba(247, 220, 188, 0.72))`; `color: #74451f` |
| `.tournament-bracket__round-tabs button.tournament-bracket__round-tab--gold.is-active` | `border-color: rgba(156, 111, 20, 0.68)`; `background: linear-gradient(135deg, rgba(244, 196, 79, 0.9), rgba(255, 231, 151, 0.94))` |
| `.tournament-bracket__round-tabs button.tournament-bracket__round-tab--bronze.is-active` | `border-color: rgba(132, 75, 33, 0.62)`; `background: linear-gradient(135deg, rgba(200, 132, 75, 0.78), rgba(235, 190, 145, 0.9))` |
| `.tournament-bracket-round` | `gap: 8px` |
| `.tournament-bracket-round > h3` | `margin: 0`; `color: var(--ink)`; `font-size: 14px`; `font-weight: 850` |
| `.tournament-bracket-round > .tournament-rules__muted` | `margin: 0` |
| `.tournament-bracket-round > div` | `gap: 9px` |
| `.tournament-bracket-series` | `gap: 8px`; `padding: 11px`; `border: 1px solid rgba(98, 127, 153, 0.24)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)` |
| `.tournament-bracket-series__summary` | `gap: 8px`; `width: 100%`; `min-width: 0`; `padding: 0`; `border: 0`; `background: transparent`; `color: inherit` |
| `.tournament-bracket-series__summary > header` | `gap: 8px` |
| `.tournament-bracket-series__summary > header strong` | `color: var(--ink)`; `font-size: 11px`; `font-weight: 850` |
| `.tournament-bracket-series__summary > header span` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 700` |
| `.tournament-bracket-series__players` | `gap: 4px` |
| `.tournament-bracket-player` | `grid-template-columns: 18px auto minmax(0, 1fr) 18px`; `gap: 8px`; `min-width: 0`; `padding: 6px 7px`; `border-radius: 11px`; `background: var(--liquid-inset-bg)` |
| `.tournament-bracket-player__seed` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 800` |
| `.tournament-bracket-player--winner` | `background: rgba(148, 219, 189, 0.34)`; `box-shadow: inset 3px 0 0 rgba(43, 126, 89, 0.62)` |
| `.tournament-bracket-player--bronze-winner` | `background: rgba(205, 139, 85, 0.22)`; `box-shadow: inset 0 0 0 1px rgba(158, 96, 47, 0.2)` |
| `.tournament-bracket-player--pending` | `min-width: 0`; `width: 100%`; `color: var(--liquid-muted)`; `background: var(--liquid-inset-bg)` |
| `.tournament-bracket-player__placeholder` | `font-size: 12px`; `font-weight: 800`; `line-height: 1.35` |
| `.tournament-bracket-player__identity` | `min-width: 0`; `gap: 1px` |
| `.tournament-bracket-player__identity strong` | `color: inherit`; `font-size: 13px`; `font-weight: 800` |
| `.tournament-bracket-player__wins` | `color: var(--liquid-muted)`; `font-size: 14px`; `font-weight: 900` |
| `.tournament-bracket-series__score` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 800` |
| `.tournament-bracket-series__games` | `gap: 14px`; `max-height: min(42dvh, 360px)`; `padding-top: 6px` |
| `.tournament-bracket-game-day` | `gap: 7px` |
| `.tournament-bracket-game-day__title` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 800` |
| `.tournament-bracket-game-day__fixtures` | `gap: 10px` |
| `.tournament-bracket-game` | `gap: 5px`; `padding: 9px 10px`; `border: 1px solid rgba(98, 127, 153, 0.16)`; `border-radius: 11px`; `background: var(--liquid-inset-bg)` |
| `.tournament-bracket-game > span` | `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 650` |
| `.tournament-bracket-game__result` | `min-width: 0`; `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 760` |
| `.tournament-bracket-game__participant` | `min-width: 0`; `color: var(--liquid-muted)` |
| `.tournament-bracket-game__score` | `color: var(--liquid-muted)` |
| `.tournament-bracket-game__technical-result` | `min-width: 0` |
| `.tournament-bracket-game__participant--winner` | `color: #1f8a5b` |
| `.tournament-bracket-game__participant--own-loss` | `color: #bd4d4d` |
| `.tournament-duel-result__matchup` | `margin-top: 10px`; `padding: 10px`; `border: 1px solid rgba(255, 255, 255, 0.7)`; `border-radius: 16px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 14px`; `font-weight: 850` |
| `.tournament-duel-result__matchup-main` | `grid-template-columns: minmax(0, max-content) auto minmax(0, 1fr) auto`; `gap: 7px` |
| `.tournament-duel-result__player` | `min-width: 0`; `gap: 6px` |
| `.tournament-duel-result__player-name` | `min-width: 0`; `font-size: inherit`; `font-weight: inherit`; `line-height: 1.1` |
| `.tournament-duel-result__separator` | `color: var(--liquid-muted)`; `font-size: inherit`; `font-weight: inherit` |
| `.tournament-duel-result__seed` | `color: #8793a2`; `font-size: 10px`; `font-weight: 850`; `line-height: 1` |
| `.tournament-duel-result__game-score` | `color: var(--ink)`; `font-size: inherit`; `font-weight: inherit`; `line-height: 1` |
| `.tournament-duel-result__meta` | `gap: 12px`; `margin-top: 8px`; `padding-top: 8px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 700`; `line-height: 1.2` |
| `.duel-result-card__points-rewards--single-line` | `min-width: 0`; `width: 100%`; `gap: 4px`; `font-size: 13px` |
| `.duel-result-card__points-rewards--single-line`<br>@container (max-width: 300px) | `font-size: 11px` |
| `.duel-result-card__points-rewards--single-line`<br>@container (max-width: 250px) | `font-size: 9px` |
| `.duel-result-card__points-rewards--single-line`<br>@container (max-width: 205px) | `font-size: 7px` |
| `.duel-result-card__reward-values` | `gap: clamp(3px, 0.8vw, 8px)` |
| `.duel-result-card__points-rewards--single-line .duel-result-points, .duel-result-card__points-rewards--single-line .duel-result-points strong, .duel-result-card__points-rewards--single-line .duel-earned-rewards__item` | `font-size: inherit` |
| `.duel-result-card__points-rewards--single-line .duel-earned-rewards` | `gap: clamp(3px, 0.8vw, 8px)` |
| `.duel-result-card__points-rewards--single-line .duel-earned-rewards__item svg` | `width: 1.3em`; `height: 1.3em` |
| `.tournament-duel-result__meta strong, .tournament-duel-result__meta b` | `color: var(--liquid-muted)`; `font-weight: 850` |
| `.duel-result-points` | `gap: 5px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 800`; `line-height: 1` |
| `.duel-result-points strong` | `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 900` |
| `.tournament-duel-result__next-game` | `margin-top: 14px`; `color: var(--liquid-muted)`; `font-size: 13px` |
| `.tournament-duel-result__countdown` | `gap: 4px` |
| `.tournament-duel-result__countdown > span` | `color: var(--liquid-muted)`; `font-size: 13px`; `font-weight: 800` |
| `.tournament-duel-result__countdown > strong` | `color: #1677bd`; `font-size: clamp(28px, 8vw, 36px)`; `font-weight: 900`; `letter-spacing: -0.025em`; `line-height: 0.96` |
| `.tournament-playoff-attempt` | `gap: 7px`; `margin-top: 6px`; `padding: 10px`; `border: 1px solid rgba(72, 115, 153, 0.2)`; `border-radius: 13px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-playoff-attempt > strong, .tournament-playoff-attempt__readiness > strong, .tournament-playoff-attempt__progress > strong, .tournament-playoff-attempt__scheduled > strong, .tournament-playoff-attempt__incident > strong, .tournament-playoff-attempt__choice > strong` | `font-size: 11px`; `font-weight: 820`; `line-height: 1.35` |
| `.tournament-playoff-attempt > span, .tournament-playoff-attempt__readiness > span, .tournament-playoff-attempt__progress > span, .tournament-playoff-attempt__scheduled > span, .tournament-playoff-attempt__incident > span, .tournament-playoff-attempt__choice > span` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 560`; `line-height: 1.4` |
| `.tournament-playoff-attempt__readiness, .tournament-playoff-attempt__progress, .tournament-playoff-attempt__scheduled, .tournament-playoff-attempt__incident, .tournament-playoff-attempt__choice` | `gap: 5px` |
| `.tournament-playoff-attempt__choice > div` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 6px` |
| `.tournament-playoff-attempt .btn` | `min-height: 34px`; `padding: 7px 10px`; `font-size: 10px`; `letter-spacing: 0` |
| `.tournament-playoff-attempt__eyebrow` | `color: #70501d` |
| `.tournament-playoff-attempt__result, .tournament-playoff-attempt__series-win` | `color: #1f6a4a` |
| `.tournament-playoff-attempt__incident` | `padding: 8px`; `border-radius: 10px`; `background: rgba(255, 237, 196, 0.72)`; `color: #775414` |
| `.tournament-playoff-attempt__tournament-win` | `padding: 9px 10px`; `border-radius: 11px`; `background: linear-gradient(135deg, rgba(255, 226, 122, 0.8), rgba(255, 244, 204, 0.9))`; `color: #67470d` |
| `.tournament-bracket-round--bronze .tournament-bracket-series` | `border-color: rgba(174, 122, 64, 0.28)`; `background: rgba(255, 244, 225, 0.3)` |
| `.tournament-details__registration` | `margin: 2px 0 0` |
| `.tournament-details__registration--withdraw` | `margin-top: 14px` |
| `.tournament-description-editor__toolbar` | `gap: 6px`; `margin-bottom: 7px` |
| `.tournament-registration-btn--danger` | `background: linear-gradient(180deg, #dc4040 0%, #b91c1c 100%)`; `color: #ffffff`; `box-shadow: 0 10px 22px rgba(185, 28, 28, 0.22)` |
| `.tournament-participants-list` | `gap: 7px` |
| `.tournament-participants-list--scrollable` | `max-height: min(58vh, 460px)` |
| `.tournament-participants-list__row` | `grid-template-columns: 22px 38px minmax(0, 1fr) auto`; `gap: 10px`; `min-height: 52px`; `padding: 7px 9px`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-participants-list__position` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 720` |
| `.tournament-rules` | `gap: 18px` |
| `.tournament-rules__section` | `gap: 8px` |
| `.tournament-rules h3, .tournament-rules h4, .tournament-rules p` | `margin: 0` |
| `.tournament-rules h3` | `font-size: 15px`; `font-weight: 760` |
| `.tournament-rules h4` | `font-size: 13px`; `font-weight: 720` |
| `.tournament-rules p` | `color: var(--liquid-muted)`; `font-size: 13px`; `font-weight: 440`; `line-height: 1.55` |
| `.tournament-rules__rounds` | `gap: 12px` |
| `.tournament-rules__round` | `gap: 6px`; `padding-top: 2px` |
| `.tournament-rules__muted` | `color: var(--muted) !important` |
| `.tournament-participants-list__row img, .tournament-participants-list__avatar` | `width: 38px`; `height: 38px`; `border-radius: 50%`; `background: rgba(30, 91, 151, 0.13)`; `color: var(--liquid-muted)`; `font-size: 14px`; `font-weight: 900` |
| `.tournament-participants-list__row > span:last-child` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 800` |
| `.tournament-artwork-field` | `gap: 8px` |
| `.tournament-artwork-field__preview` | `width: 76px`; `border-radius: 16px`; `box-shadow: 0 8px 18px rgba(15, 23, 42, 0.14)` |
| `.tournament-artwork-field__upload input` | `width: 1px`; `height: 1px` |
| `.tournament-artwork-field__error` | `color: #b91c1c`; `font-size: 11px`; `font-weight: 750` |
| `.tournament-admin-card` | `width: 100%`; `padding: 13px 15px`; `border: 1px solid rgba(255, 255, 255, 0.78)`; `border-radius: 18px`; `color: var(--ink)` |
| `.tournament-admin-card__status, .tournament-operations__heading > span` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 900`; `letter-spacing: 0.08em`; `line-height: 1.2` |
| `.tournament-admin-card__title` | `margin-top: 4px`; `font-size: 17px`; `font-weight: 900`; `line-height: 1.2` |
| `.tournament-admin-card__meta` | `margin-top: 3px`; `color: var(--muted)`; `font-size: 12px`; `font-weight: 720` |
| `.tournament-operations` | `gap: 10px`; `min-width: 0` |
| `.tournament-operations__header` | `grid-template-columns: auto minmax(0, 1fr) auto`; `gap: 10px`; `padding: 11px 12px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08)`; `backdrop-filter: blur(18px) saturate(1.12)` |
| `.tournament-operations__heading` | `min-width: 0` |
| `.tournament-operations__heading h2` | `margin: 2px 0 0`; `color: var(--ink)`; `font-size: 18px`; `line-height: 1.18` |
| `.tournament-operations__actions` | `gap: 5px` |
| `.tournament-operations__actions .icon-btn` | `width: 32px`; `min-width: 32px`; `height: 32px`; `min-height: 32px` |
| `.tournament-operations__notice` | `padding: 0 4px`; `color: rgba(244, 250, 255, 0.94)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.35` |
| `.tournament-icon-btn--danger` | `border-color: rgba(185, 28, 28, 0.22)`; `background: rgba(254, 226, 226, 0.86)`; `color: #b91c1c` |
| `.tournament-operations__panel` | `gap: 10px`; `min-width: 0`; `padding: 13px`; `border-radius: 18px`; `color: var(--ink)` |
| `.tournament-operations__field` | `gap: 5px`; `min-width: 0`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 820` |
| `.tournament-operations__recovery-error` | `color: #9a2d2d`; `font-size: 12px`; `font-weight: 700`; `line-height: 1.4` |
| `.tournament-operations__recovery-actions` | `margin-top: 4px` |
| `.tournament-operations__recovery-actions .modal-primary` | `line-height: 1.25` |
| `.tournament-player-search` | `min-width: 0` |
| `.tournament-player-search > input` | `width: 100%` |
| `.tournament-player-search__results` | `gap: 4px`; `margin-top: 6px`; `padding: 5px`; `border: 1px solid rgba(100, 116, 139, 0.16)`; `border-radius: 14px`; `background: var(--liquid-modal-bg)` |
| `.tournament-player-search__results > button` | `grid-template-columns: 30px minmax(0, 1fr) auto`; `gap: 8px`; `min-width: 0`; `min-height: 40px`; `padding: 5px 8px`; `border: 0`; `border-radius: 10px`; `background: var(--liquid-modal-bg)`; `color: var(--ink)` |
| `.tournament-player-search__results > button > img, .tournament-player-search__results > button > span:first-child` | `width: 30px`; `height: 30px`; `border-radius: 50%`; `background: rgba(30, 91, 151, 0.12)`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 900` |
| `.tournament-player-search__results > span` | `padding: 7px 8px`; `color: var(--muted)`; `font-size: 11px` |
| `.tournament-participant-admin-row` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 8px`; `width: 100%`; `padding: 9px 10px`; `border: 0`; `border-radius: 13px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)` |
| `.tournament-participant-admin-row__identity` | `gap: 2px`; `min-width: 0` |
| `.tournament-participant-admin-row__identity strong` | `font-size: 13px` |
| `.tournament-participant-admin-row__identity span` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 720`; `line-height: 1.35` |
| `.tournament-participant-admin-row__manage` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 720` |
| `.tournament-admin-empty` | `padding: 8px 2px`; `color: rgba(244, 250, 255, 0.92)`; `font-size: 12px`; `font-weight: 600`; `line-height: 1.45` |
| `.tournament-operation-list-row` | `width: 100%`; `padding: 9px 10px`; `border: 1px solid rgba(100, 116, 139, 0.14)`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 11px`; `font-weight: 730` |
| `.tournament-schedule-days` | `gap: 8px` |
| `.tournament-schedule-day, .tournament-schedule-upcoming` | `border: 1px solid rgba(100, 116, 139, 0.14)`; `border-radius: 15px`; `background: var(--liquid-inset-bg)` |
| `.tournament-schedule-day > summary, .tournament-schedule-upcoming > summary` | `gap: 10px`; `min-height: 44px`; `padding: 10px 12px`; `color: var(--ink)` |
| `.tournament-schedule-day > summary::after, .tournament-schedule-upcoming > summary::after` | `color: var(--liquid-muted)`; `font-size: 20px`; `line-height: 1` |
| `.tournament-schedule-day > summary > strong, .tournament-schedule-upcoming > summary > strong` | `font-size: 13px`; `font-weight: 850` |
| `.tournament-schedule-day > summary > span, .tournament-schedule-upcoming > summary > span` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 720` |
| `.tournament-schedule-day__fixtures` | `gap: 7px`; `padding: 0 8px 8px` |
| `.tournament-schedule-fixture` | `gap: 5px`; `width: 100%`; `padding: 10px 11px`; `border: 1px solid rgba(100, 116, 139, 0.12)`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)` |
| `.tournament-schedule-fixture__heading, .tournament-schedule-fixture__meta` | `gap: 5px 8px` |
| `.tournament-schedule-fixture__heading` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 760` |
| `.tournament-schedule-fixture > strong` | `font-size: 13px`; `font-weight: 820`; `line-height: 1.3` |
| `.tournament-schedule-fixture__status` | `padding: 3px 7px`; `border-radius: 999px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)`; `font-size: 9px`; `font-weight: 780` |
| `.tournament-schedule-fixture__status.is-active, .tournament-schedule-fixture__status.is-open` | `background: rgba(30, 113, 74, 0.12)`; `color: #226645` |
| `.tournament-schedule-fixture__status.is-completed, .tournament-schedule-fixture__status.is-settled` | `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-schedule-fixture__meta` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 650` |
| `.tournament-schedule-fixture__meta > span + span::before` | `color: var(--liquid-muted)` |
| `.tournament-schedule-upcoming` | `background: var(--liquid-inset-bg)` |
| `.tournament-schedule-upcoming > p` | `margin: -2px 12px 10px`; `color: var(--muted)`; `font-size: 10px`; `line-height: 1.4` |
| `.tournament-operation-incidents, .tournament-admin-series-list` | `gap: 8px` |
| `.tournament-bracket-series__admin-action` | `width: 100%` |
| `.tournament-operation-incidents` | `padding: 10px`; `border: 1px solid rgba(190, 77, 62, 0.24)`; `border-radius: 14px`; `background: rgba(255, 239, 235, 0.72)` |
| `.tournament-operation-incidents h3, .tournament-operation-incidents p` | `margin: 0` |
| `.tournament-operation-incidents h3` | `color: #802f28`; `font-size: 13px` |
| `.tournament-operation-incidents p` | `color: #76544f`; `font-size: 10px`; `line-height: 1.4` |
| `.tournament-operation-list-row--incident` | `gap: 2px`; `background: var(--liquid-inset-bg)` |
| `.tournament-operation-list-row--incident > span` | `color: #76544f`; `font-size: 10px`; `font-weight: 620` |
| `.tournament-admin-series` | `gap: 8px`; `padding: 11px`; `border: 1px solid rgba(100, 116, 139, 0.14)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)` |
| `.tournament-admin-series__heading, .tournament-admin-series__players, .tournament-series-decision__score` | `gap: 8px` |
| `.tournament-admin-series__heading > div, .tournament-admin-series__players, .tournament-series-decision, .tournament-series-decision__confirmation` | `gap: 6px` |
| `.tournament-admin-series__heading span, .tournament-admin-series__players span` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 650` |
| `.tournament-series-decision__confirmation` | `padding: 10px`; `border: 1px solid rgba(190, 77, 62, 0.22)`; `border-radius: 13px`; `background: rgba(255, 239, 235, 0.7)` |
| `.tournament-series-decision__confirmation p` | `margin: 0`; `color: #674b47`; `font-size: 11px`; `line-height: 1.45` |
| `.tournament-matchday-list` | `gap: 8px` |
| `.tournament-matchday-row` | `gap: 3px`; `padding: 10px 11px`; `border: 1px solid rgba(148, 163, 184, 0.2)`; `border-radius: 13px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-matchday-row strong` | `font-size: 12px`; `font-weight: 720` |
| `.tournament-matchday-row span` | `color: var(--liquid-muted)`; `font-size: 10px`; `font-weight: 560`; `line-height: 1.4` |
| `.tournament-matchday-row__heading` | `gap: 8px` |
| `.tournament-matchday-row .tournament-matchday-row__status` | `padding: 2px 7px`; `border-radius: 999px`; `font-size: 9px`; `font-weight: 760`; `line-height: 1.25` |
| `.tournament-matchday-row--current` | `border-color: rgba(58, 149, 216, 0.5)`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 7px 20px rgba(20, 96, 154, 0.12)` |
| `.tournament-matchday-row--current .tournament-matchday-row__status` | `background: rgba(21, 119, 187, 0.13)`; `color: #12649c` |
| `.tournament-matchday-row--past` | `border-color: rgba(130, 149, 166, 0.16)`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-matchday-row--past .tournament-matchday-row__status` | `background: var(--liquid-inset-bg)`; `color: var(--liquid-muted)` |
| `.tournament-matchday-row--past .tournament-matchday-times span, .tournament-matchday-row--past .tournament-matchday-times b` | `color: var(--liquid-muted)` |
| `.tournament-matchday-times` | `gap: 2px` |
| `.tournament-matchday-times > span` | `grid-template-columns: 46px minmax(0, 1fr)`; `gap: 6px` |
| `.tournament-matchday-times b` | `color: var(--liquid-muted)`; `font-weight: 760` |
| `.tournament-operation-editor` | `gap: 7px`; `padding-top: 3px` |
| `.tournament-operations__empty-panel` | `padding: 8px 2px`; `color: rgba(244, 250, 255, 0.92)`; `font-weight: 600`; `line-height: 1.45` |
| `.weekly-challenge-admin, .weekly-challenge-admin__card, .weekly-challenge-admin__fieldset` | `gap: 12px`; `min-width: 0` |
| `.weekly-challenge-admin__card` | `border-radius: 20px`; `padding: 14px` |
| `.weekly-challenge-admin__fieldset` | `border: 0`; `padding: 0`; `margin: 0` |
| `.weekly-challenge-admin h3, .weekly-challenge-admin h4, .weekly-challenge-admin p` | `margin: 0` |
| `.weekly-challenge-admin__copy, .weekly-challenge-admin__field > span` | `color: var(--muted)`; `font-size: 12px` |
| `.weekly-challenge-admin__toggle` | `gap: 10px`; `font-weight: 800` |
| `.weekly-challenge-admin__toggle input` | `width: 18px`; `height: 18px` |
| `.weekly-challenge-admin__field` | `min-width: 0`; `gap: 5px` |
| `.weekly-challenge-admin__field input, .weekly-challenge-admin__field textarea` | `min-width: 0`; `width: 100%` |
| `.weekly-challenge-admin__rewards, .weekly-challenge-admin__metrics` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 8px` |
| `.weekly-challenge-admin__metrics` | `font-size: 12px` |
| `.weekly-challenge-admin__metrics strong` | `font-size: 18px` |
| `.weekly-challenge-admin-task` | `padding: 10px`; `border-radius: 16px`; `box-shadow: none`; `min-width: 0` |
| `.weekly-challenge-admin-task__fields` | `gap: 8px`; `grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr) minmax(0, 0.5fr) auto` |
| `.weekly-challenge-admin__actions` | `gap: 8px` |
| `.weekly-challenge-admin__tasks, .weekly-challenge-admin__players` | `gap: 8px`; `font-size: 12px` |
| `.weekly-challenge-admin__tasks > div` | `gap: 8px` |
| `.weekly-challenge-admin__stats` | `width: min(720px, calc(100vw - 28px))`; `max-height: 86dvh`; `gap: 14px` |
| `.weekly-challenge-admin__players > div` | `grid-template-columns: minmax(0, 1fr) auto auto`; `gap: 8px` |
| `.weekly-challenge-admin-task__fields`<br>@media (max-width: 640px) | `grid-template-columns: minmax(0, 1fr)` |
| `.weekly-challenge-admin-task__remove.btn`<br>@media (max-width: 640px) | `width: 100%` |
| `.weekly-challenge-admin__rewards`<br>@media (max-width: 640px) | `grid-template-columns: minmax(0, 1fr)` |
| `.admin-section-label` | `margin: 2px 0 -2px` |
| `.admin-communications-toolbar` | `grid-template-columns: minmax(0, 1fr) 160px`; `gap: 10px` |
| `.admin-official-dialog-list` | `gap: 8px` |
| `.admin-official-dialog-row` | `width: 100%`; `grid-template-columns: 42px minmax(0, 1fr) auto`; `gap: 10px`; `padding: 10px`; `border-radius: 16px`; `color: inherit` |
| `.admin-official-dialog-row__body, .admin-official-dialog-row__title, .admin-official-dialog-row__preview` | `min-width: 0` |
| `.admin-official-dialog-row__title` | `color: var(--ink)`; `font-size: 13px`; `font-weight: 800` |
| `.admin-official-dialog-row__preview` | `margin-top: 3px`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 550` |
| `.admin-official-dialog-row > time` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 600` |
| `.admin-official-dialog-row__new` | `padding: 2px 6px`; `border-radius: 999px`; `background: var(--red)`; `color: #fff`; `font-size: 9px`; `font-weight: 800` |
| `.admin-official-dialog` | `width: min(720px, calc(100vw - 24px))`; `height: min(760px, calc(100dvh - 32px))`; `max-width: 720px`; `grid-template-rows: auto minmax(0, 1fr) auto auto`; `gap: 12px`; `padding: 16px` |
| `.admin-official-dialog__header, .admin-official-dialog__person` | `gap: 10px` |
| `.admin-official-dialog__identity` | `margin-top: 2px`; `color: var(--muted)`; `font-size: 10px`; `font-weight: 550` |
| `.admin-official-dialog__messages` | `min-height: 0`; `gap: 7px`; `padding: 2px` |
| `.admin-official-dialog__message` | `max-width: min(82%, 520px)`; `padding: 8px 10px`; `border-radius: 14px 14px 14px 5px`; `background: var(--liquid-card-bg)`; `color: var(--ink)`; `font-size: 12px`; `line-height: 1.4` |
| `.admin-official-dialog__message--official` | `border-radius: 14px 14px 5px 14px`; `background: var(--liquid-card-bg)`; `color: #fff` |
| `.admin-official-dialog__message time` | `margin-top: 4px`; `color: inherit`; `font-size: 9px` |
| `.admin-official-dialog__message audio` | `width: min(280px, 100%)`; `margin-top: 5px` |
| `.admin-official-dialog__message a` | `color: inherit`; `font-weight: 750` |
| `.admin-official-dialog__composer` | `min-width: 0` |
| `.admin-official-dialog__composer > .chat-dock-composer` | `width: 100%`; `margin: 0` |
| `.admin-official-dialog__attachment` | `grid-template-columns: auto minmax(0, 1fr) auto`; `gap: 8px`; `min-width: 0`; `padding: 7px 9px`; `border-radius: 14px`; `background: var(--liquid-card-bg)`; `color: var(--ink)`; `font-size: 11px`; `font-weight: 750` |
| `.admin-official-dialog__attachment .icon-btn` | `width: 28px`; `height: 28px`; `min-width: 28px`; `min-height: 28px` |
| `.admin-official-dialog__composer .btn, .admin-official-dialog > .btn, .admin-official-dialog > .admin-danger-text-btn, .admin-official-account-card .btn` | `min-height: 36px`; `padding: 8px 14px`; `font-size: 11px`; `letter-spacing: 0` |
| `.admin-official-dialog > .admin-danger-text-btn` | `border: 0`; `border-radius: 999px`; `background: transparent`; `color: var(--red-deep)`; `font-weight: 800`; `line-height: 1.2` |
| `.admin-official-dialog__error` | `color: var(--red-deep)`; `font-size: 11px` |
| `.admin-official-account-card` | `grid-template-columns: auto minmax(0, 1fr) auto`; `gap: 14px`; `padding: 14px`; `border-radius: 20px` |
| `.admin-official-account-card__title` | `color: var(--ink)`; `font-size: 15px`; `font-weight: 850` |
| `.admin-official-account-card__copy` | `margin-top: 4px`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 550`; `line-height: 1.45` |
| `.admin-communications-toolbar`<br>@media (max-width: 560px) | `grid-template-columns: 1fr` |
| `.admin-official-dialog`<br>@media (max-width: 560px) | `width: 100vw`; `height: 100dvh`; `max-width: none`; `border-radius: 0`; `padding: calc(12px + var(--app-safe-top)) 12px calc(12px + var(--app-safe-bottom))` |
| `.admin-official-account-card`<br>@media (max-width: 560px) | `grid-template-columns: auto minmax(0, 1fr)` |
| `.tournament-action-list, .tournament-participant-actions, .tournament-reward-status` | `gap: 8px` |
| `.tournament-action-list .admin-compact-btn, .tournament-participant-actions .admin-compact-btn` | `width: 100%` |
| `.admin-compact-btn--danger` | `border-color: rgba(185, 28, 28, 0.24)`; `background: rgba(254, 226, 226, 0.88)`; `color: #b91c1c` |
| `.profile-settings-header` | `grid-template-columns: 38px minmax(0, 1fr)`; `gap: 10px`; `margin: 18px 14px 14px` |
| `.profile-settings-header h1` | `margin: 2px 0 0`; `font-size: 25px`; `font-weight: 950`; `line-height: 1.04` |
| `.profile-settings-loading` | `padding: 24px`; `color: var(--muted)`; `font-size: 13px` |
| `.profile-registration-account` | `gap: 12px`; `margin: 6px 14px 14px`; `padding: 12px 14px`; `border-radius: 16px` |
| `.profile-registration-account img, .profile-registration-account__avatar` | `width: 46px`; `min-width: 46px`; `height: 46px`; `border: 1.5px solid rgba(255, 255, 255, 0.9)`; `border-radius: 50%` |
| `.profile-registration-account__avatar` | `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-weight: 800` |
| `.profile-registration-account__copy` | `min-width: 0`; `gap: 3px` |
| `.profile-registration-account__copy strong` | `color: var(--ink)`; `font-size: 15px`; `font-weight: 800` |
| `.profile-registration-account__copy span` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 600` |
| `.profile-customization-card` | `gap: 14px`; `margin: 6px 14px 14px`; `padding: 16px`; `border-radius: 20px` |
| `.profile-customization-card__avatar-row` | `gap: 14px` |
| `.profile-customization-card__avatar, .profile-customization-card__avatar img, .profile-customization-card__avatar span` | `width: 72px`; `min-width: 72px`; `height: 72px`; `border-radius: 50%` |
| `.profile-customization-card__avatar` | `border: 2px solid rgba(255, 255, 255, 0.82)`; `box-shadow: 0 7px 18px rgba(15, 23, 42, 0.18)` |
| `.profile-customization-card__avatar span` | `background: var(--liquid-card-bg)`; `color: var(--ink)`; `font-size: 24px`; `font-weight: 900` |
| `.profile-customization-card__avatar-copy` | `min-width: 0`; `gap: 4px` |
| `.profile-customization-card__avatar-copy strong` | `color: var(--ink)`; `font-size: 15px`; `font-weight: 850` |
| `.profile-customization-card__avatar-copy > span` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 600`; `line-height: 1.35` |
| `.profile-customization-card__upload` | `margin-top: 3px`; `padding: 0`; `border: 0`; `background: transparent`; `color: var(--liquid-muted)`; `font-size: 12px`; `font-weight: 800` |
| `.profile-customization-card__file-input` | `width: 1px`; `height: 1px` |
| `.profile-customization-card__fields` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 10px` |
| `.profile-customization-card__fields label` | `gap: 6px`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 800` |
| `.profile-customization-card__fields input` | `min-width: 0`; `padding: 11px 12px`; `border: 1px solid rgba(100, 116, 139, 0.24)`; `border-radius: 13px`; `background: var(--liquid-card-bg)`; `color: var(--ink)`; `font-size: 14px` |
| `.profile-customization-card__fields input:focus` | `border-color: rgba(51, 65, 85, 0.52)`; `box-shadow: 0 0 0 3px rgba(51, 65, 85, 0.1)` |
| `.profile-customization-card__save` | `width: 100%`; `min-height: 44px` |
| `.profile-customization-card__error` | `color: #9f1239`; `font-size: 12px`; `font-weight: 700`; `line-height: 1.35` |
| `.profile-settings-grip-label` | `gap: 6px`; `margin-bottom: 6px` |
| `.profile-settings-grip-label button` | `padding: 0`; `border: 0`; `background: none` |
| `.profile-settings-grip-label .profile-settings-grip-info` | `color: rgba(255, 255, 255, 0.94)` |
| `.profile-settings-grip-options` | `gap: 8px`; `margin: 0 14px 14px` |
| `.profile-settings-grip-option__indicator` | `width: 22px`; `height: 22px`; `border: 1.5px solid rgba(255, 255, 255, 0.78)`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `color: #fff`; `box-shadow: 0 2px 7px rgba(15, 23, 42, 0.16)` |
| `.profile-settings-grip-option__indicator[data-selected='true']` | `border-color: rgba(255, 255, 255, 0.94)`; `background: var(--liquid-selected-bg)` |
| `.profile-logout-wrap` | `margin: 4px 14px 0` |
| `.profile-logout-btn` | `width: 100%`; `gap: 8px`; `padding: 14px 0`; `border-radius: 16px`; `font-size: 15px`; `font-weight: 650` |
| `.profile-logout-btn--danger` | `border: 1px solid rgba(104, 35, 35, 0.34)`; `background: rgba(211, 115, 115, 0.9)`; `color: #34202a`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.34), 0 8px 18px rgba(86, 36, 36, 0.15)` |
| `.profile-logout-btn--danger svg` | `color: currentColor` |
| `.tournament-reward-status strong` | `font-size: 13px`; `font-weight: 760` |
| `.tournament-reward-status span` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 560`; `line-height: 1.45` |
| `.tournament-reward-status__header` | `gap: 10px` |
| `.tournament-reward-status__header > div` | `gap: 3px` |
| `.tournament-operation-rewards` | `gap: 7px`; `padding-top: 9px` |
| `.tournament-operation-rewards__heading` | `gap: 8px` |
| `.tournament-operation-rewards__heading > span` | `font-size: 9px` |
| `.tournament-operation-rewards__table` | `gap: 4px` |
| `.tournament-operation-rewards__labels, .tournament-operation-rewards__row` | `grid-template-columns: repeat(4, minmax(44px, 1fr)) 30px`; `gap: 5px` |
| `.tournament-operation-rewards__labels span` | `font-size: 9px`; `font-weight: 700` |
| `.tournament-operation-rewards__row > span` | `min-height: 32px`; `padding: 0 7px`; `border-radius: 9px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 11px` |
| `.tournament-operation-rewards__row input` | `min-width: 0`; `min-height: 32px`; `padding: 6px`; `font-size: 11px` |
| `.tournament-operation-rewards .tournament-admin-empty` | `color: var(--muted)` |
| `.tournament-reward-status__actions` | `gap: 7px` |
| `.admin-compact-btn--primary` | `border-color: rgba(15, 23, 42, 0.28)`; `background: var(--liquid-selected-bg)`; `color: #fff` |
| `.tournament-operation-hint` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 560`; `line-height: 1.45` |
| `.tournament-operation-dates` | `margin: 0`; `gap: 6px` |
| `.tournament-operation-dates > div` | `grid-template-columns: minmax(120px, 0.38fr) minmax(0, 1fr)`; `gap: 8px` |
| `.tournament-operation-dates dt` | `color: var(--muted)`; `font-size: 9px`; `font-weight: 700` |
| `.tournament-operation-dates dd` | `margin: 0`; `color: var(--ink)`; `font-size: 10px`; `font-weight: 650` |
| `.tournament-operations__empty-panel .tournament-operation-dates dt` | `color: rgba(241, 245, 249, 0.82)` |
| `.tournament-operations__empty-panel .tournament-operation-dates dd` | `color: rgb(255, 255, 255)` |
| `.tournament-operations__empty-panel .tournament-operation-hint, .tournament-operations__empty-panel .tournament-operations__hint` | `color: rgba(241, 245, 249, 0.9)` |
| `.tournament-operations__hint` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 720`; `line-height: 1.4` |
| `.tournament-dispatch-recipient-count` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 760` |
| `.admin-screen textarea.tournament-dispatch-message, .tournament-dispatch-message` | `min-height: 104px`; `padding: 11px 12px`; `border: 1px solid rgba(100, 116, 139, 0.18)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `font-size: 13px`; `line-height: 1.42`; `box-shadow: none` |
| `.admin-screen textarea.tournament-dispatch-message:focus, .tournament-dispatch-message:focus` | `border-color: rgba(30, 91, 151, 0.34)`; `box-shadow: 0 0 0 3px rgba(30, 91, 151, 0.08)` |
| `.tournament-dispatch-tournament-button` | `gap: 9px`; `width: fit-content`; `color: var(--ink)`; `font-size: 12px`; `font-weight: 760` |
| `.tournament-dispatch-tournament-button input` | `width: 18px`; `height: 18px`; `margin: 0` |
| `.tournament-announcement-action` | `width: 100%`; `margin-top: 10px`; `padding: 10px 14px`; `font-size: 12px`; `letter-spacing: 0` |
| `.tournament-dispatch-feedback` | `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 650`; `line-height: 1.4` |
| `.tournament-dispatch-feedback--error` | `color: #b91c1c` |
| `.tournament-dispatch-history-row` | `padding-top: 7px`; `color: var(--muted)`; `font-size: 10px`; `font-weight: 720` |
| `.arena-duel-opponent-name` | `font-size: clamp(13px, 1.9vh, 18px)` |
| `.arena-duel-venue-label` | `font-size: clamp(7px, 0.95vh, 9px)` |
| `.arena-duel-format-heading` | `font-size: clamp(7px, 1vh, 9px)`; `font-weight: 950`; `line-height: 1`; `letter-spacing: 0.14em` |
| `.arena-duel-venue-label` | `width: fit-content`; `padding: 0`; `border: 0`; `background: transparent`; `color: rgba(196, 242, 255, 0.82)`; `font-weight: 850`; `line-height: 1` |
| `.tournament-overview-grid`<br>@media (max-width: 520px) | `grid-template-columns: minmax(0, 1fr)` |
| `.tournament-catalog-card`<br>@media (max-width: 520px) | `grid-template-columns: 70px minmax(0, 1fr)`; `gap: 10px`; `padding: 12px` |
| `.tournament-catalog-card__image`<br>@media (max-width: 520px) | `width: 70px` |
| `.tournament-catalog-card__topline, .tournament-details__status-row`<br>@media (max-width: 520px) | `gap: 6px` |
| `.tournament-catalog-card .section-label, .tournament-details__status-row .section-label`<br>@media (max-width: 520px) | `font-size: 9px`; `letter-spacing: 0.04em` |
| `.tournament-participation-badge`<br>@media (max-width: 520px) | `padding-inline: 7px`; `font-size: 9px` |
| `.tournament-operations__header`<br>@media (max-width: 520px) | `grid-template-columns: auto minmax(0, 1fr) auto`; `gap: 7px` |
| `.tournament-operations__actions`<br>@media (max-width: 520px) | `max-width: 148px` |
| `.tournament-operations__actions > .admin-compact-btn`<br>@media (max-width: 520px) | `min-height: 30px`; `padding: 6px 8px`; `font-size: 9px` |
| `.tournament-bracket-overview__heading-row`<br>@media (max-width: 360px) | `gap: 8px` |
| `.tournament-bracket-overview__density button`<br>@media (max-width: 360px) | `width: 22px`; `height: 22px`; `font-size: 9px` |
| `.tournament-bracket-overview__grid`<br>@media (max-width: 360px) | `row-gap: 8px`; `padding-bottom: calc(20px + var(--app-safe-bottom))` |
| `.tournament-bracket-overview[data-layout='scroll'][data-visible-columns='2'] .tournament-bracket-overview__grid`<br>@media (max-width: 360px) | `grid-template-columns: repeat(var(--playoff-column-count), minmax(0, calc(50cqi - 4px)))` |
| `.tournament-bracket-overview__column`<br>@media (max-width: 360px) | `gap: 6px` |
| `.tournament-bracket-overview__column > header strong`<br>@media (max-width: 360px) | `font-size: 9px` |
| `.tournament-bracket-overview__column > header span`<br>@media (max-width: 360px) | `font-size: 7px` |
| `.tournament-bracket-overview__series-list`<br>@media (max-width: 360px) | `gap: 8px` |
| `.tournament-bracket-series--compact`<br>@media (max-width: 360px) | `gap: 3px`; `padding: 4px`; `border-radius: 10px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary`<br>@media (max-width: 360px) | `gap: 3px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary > header strong, .tournament-bracket-series--compact .tournament-bracket-player__identity strong, .tournament-bracket-series--compact .tournament-bracket-player__placeholder`<br>@media (max-width: 360px) | `font-size: 8px` |
| `.tournament-bracket-series--compact .tournament-bracket-series__summary > header span, .tournament-bracket-series__stage-label`<br>@media (max-width: 360px) | `font-size: 6px` |
| `.tournament-bracket-series--compact .tournament-bracket-player`<br>@media (max-width: 360px) | `grid-template-columns: 8px auto minmax(0, 1fr) 8px`; `gap: 2px`; `padding: 3px 2px`; `border-radius: 7px` |
| `.tournament-bracket-series--compact .tournament-bracket-player__seed, .tournament-bracket-series--compact .tournament-bracket-player__wins`<br>@media (max-width: 360px) | `min-width: 0`; `font-size: 7px`; `line-height: 1` |
| `.tournament-bracket__round-tabs button`<br>@media (max-width: 360px) | `min-height: 28px`; `padding: 4px 9px`; `font-size: 9px` |
| `.app-shell--unified-glass :is( .tournament-overview-grid > button, .tournament-standing-list > div, .tournament-fixture-card, .tournament-bracket__round-tabs button, .tournament-bracket-series, .tournament-bracket-player, .tournament-participants-list__row, .tournament-player-search__results > button, .tournament-participant-admin-row, .tournament-operation-list-row, .tournament-schedule-upcoming, .tournament-schedule-fixture, .tournament-admin-series, .tournament-matchday-row, .admin-official-dialog__message, .admin-official-dialog__attachment, .tournament-operation-rewards__row > span, .tournament-dispatch-message )` | `background: var(--surface-card-bg)`; `border-color: var(--surface-border)`; `box-shadow: var(--surface-card-shadow)`; `backdrop-filter: var(--surface-blur)` |
| `.app-shell--unified-glass .tournament-player-search__results` | `background: var(--surface-elevated-bg)`; `border-color: rgba(255, 255, 255, 0.94)`; `box-shadow: var(--surface-elevated-shadow)`; `backdrop-filter: none` |
| `.app-shell--unified-glass .tournament-bracket__round-tabs button.tournament-bracket__round-tab--gold` | `border-color: rgba(190, 145, 41, 0.46)`; `background: linear-gradient(135deg, rgba(255, 225, 132, 0.72), rgba(255, 244, 204, 0.78))`; `color: #765412` |
| `.app-shell--unified-glass .tournament-bracket__round-tabs button.tournament-bracket__round-tab--bronze` | `border-color: rgba(158, 96, 47, 0.38)`; `background: linear-gradient(135deg, rgba(222, 169, 116, 0.58), rgba(247, 220, 188, 0.72))`; `color: #74451f` |
| `.app-shell--unified-glass .tournament-bracket__round-tabs button.is-active` | `border-color: rgba(15, 23, 42, 0.92)`; `background: rgba(15, 23, 42, 0.92)`; `color: #ffffff`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 8px 18px rgba(15, 23, 42, 0.12)`; `backdrop-filter: none` |
| `.app-shell--unified-glass .tournament-bracket-series--mine` | `border-color: rgba(43, 126, 89, 0.62)`; `box-shadow: 0 0 0 2px rgba(43, 126, 89, 0.1), var(--surface-card-shadow)` |
| `.app-shell--unified-glass .tournament-bracket-player--bronze-winner` | `background: rgba(205, 139, 85, 0.22)`; `box-shadow: inset 0 0 0 1px rgba(158, 96, 47, 0.2)` |
| `.weekly-challenge-start-modal` | `max-width: 390px`; `padding: 18px 14px 14px` |
| `.weekly-challenge-start-modal__title` | `gap: 8px` |
| `.weekly-challenge-start-modal__title > svg` | `color: var(--reward-experience)` |
| `.weekly-challenge-start-modal__content` | `gap: 12px`; `padding: 0`; `border: 0`; `border-radius: 0`; `background: transparent`; `box-shadow: none` |
| `.weekly-challenge-start-modal__hero` | `gap: 5px` |
| `.weekly-challenge-start-modal__hero .weekly-challenge-card__title` | `font-size: 16px`; `font-weight: 850`; `line-height: 1.25` |
| `.weekly-challenge-start-modal__hero .weekly-challenge-card__description` | `margin-top: 0`; `font-size: 13px`; `font-weight: 600`; `line-height: 1.4` |
| `.weekly-challenge-start-modal__dates` | `grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr)`; `gap: 7px`; `padding: 11px 12px`; `border: 1px solid rgba(71, 85, 105, 0.14)`; `border-radius: 15px`; `background: var(--liquid-inset-bg)` |
| `.weekly-challenge-start-modal__dates > div` | `gap: 3px` |
| `.weekly-challenge-start-modal__dates span` | `color: var(--muted)`; `font-size: 10px`; `font-weight: 600`; `letter-spacing: 0.14em` |
| `.weekly-challenge-start-modal__dates strong` | `gap: 2px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 700`; `line-height: 1.3` |
| `.weekly-challenge-start-modal__dates strong span` | `color: inherit`; `font-size: inherit`; `font-weight: inherit`; `letter-spacing: normal` |
| `.weekly-challenge-start-modal__date-arrow` | `width: 20px`; `height: 20px`; `color: var(--liquid-muted)` |
| `.weekly-challenge-start-modal__rewards` | `gap: 15px` |
| `.weekly-challenge-start-modal__rewards .weekly-challenge-card__reward` | `gap: 4px`; `font-size: 13px`; `font-weight: 700` |
| `.weekly-challenge-start-modal__rewards .reward--coin` | `color: var(--reward-coin)` |
| `.weekly-challenge-start-modal__rewards .reward--star` | `color: var(--reward-star)` |
| `.weekly-challenge-start-modal__rewards .reward--experience` | `color: var(--reward-experience)` |
| `.weekly-challenge-start-modal__rewards .reward--token` | `color: var(--reward-token)` |
| `.weekly-challenge-start-modal .weekly-challenge-task` | `padding-inline: 1px` |
| `.weekly-challenge-start-modal .weekly-challenge-task__title, .weekly-challenge-start-modal .weekly-challenge-task__value` | `font-size: 13px`; `font-weight: 700` |
| `.weekly-challenge-start-modal__error` | `color: #b91c1c`; `font-size: 13px`; `line-height: 1.4` |
| `.weekly-challenge-start-modal__content > .btn` | `width: 100%` |
| `.weekly-challenge-screen` | `padding: calc(22px + var(--app-safe-top)) 14px 24px` |
| `.weekly-challenge-screen__content` | `width: 100%`; `max-width: 760px`; `margin: 0 auto`; `gap: 14px` |
| `.weekly-challenge-screen__header` | `gap: 10px` |
| `.page-header-standard` | `gap: 10px` |
| `.app-shell--arena .page-header-standard__back.icon-btn` | `width: 40px`; `height: 40px`; `min-width: 40px`; `min-height: 40px` |
| `.page-header-standard .page-header-standard__title` | `min-width: 0`; `margin: 0`; `font-size: 24px`; `font-weight: 800` |
| `.weekly-challenge-screen__back.icon-btn` | `width: 40px`; `height: 40px`; `min-width: 40px`; `min-height: 40px`; `padding: 0` |
| `.weekly-challenge-screen__title` | `min-width: 0`; `margin: 0`; `font-size: 24px`; `font-weight: 800` |
| `.weekly-challenge-filters.segmented-tabs` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 4px`; `width: 100%`; `padding: 4px` |
| `.weekly-challenge-filter.segmented-tabs__item` | `min-width: 0`; `min-height: 38px`; `padding: 0 7px`; `font-size: 12px`; `font-weight: 850` |
| `.weekly-challenge-section-title` | `margin: 2px 0 -2px`; `padding-inline: 0` |
| `.weekly-challenge-empty` | `margin: 12px 4px 0`; `color: rgba(240, 246, 255, 0.86)`; `font-size: 14px`; `font-weight: 750`; `line-height: 1.45` |
| `.weekly-challenge-list` | `gap: 10px` |
| `.weekly-challenge-card` | `padding: 15px 16px 16px`; `border-radius: 22px`; `gap: 10px` |
| `.weekly-challenge-card--completed` | `padding: 0`; `gap: 0` |
| `.weekly-challenge-card__summary` | `width: 100%`; `min-width: 0`; `padding: 15px 16px`; `grid-template-columns: minmax(0, 1fr) auto`; `gap: 12px`; `border: 0`; `border-radius: 21px`; `background: transparent`; `color: var(--ink)` |
| `.weekly-challenge-card__summary-copy` | `min-width: 0`; `gap: 4px` |
| `.weekly-challenge-card__summary-copy strong` | `font-size: 17px`; `font-weight: 950`; `line-height: 1.18` |
| `.weekly-challenge-card__summary-copy span` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 850` |
| `.weekly-challenge-card__summary-chevron` | `color: var(--liquid-muted)` |
| `.weekly-challenge-card__details` | `padding: 10px 16px 16px`; `gap: 10px`; `background: var(--liquid-card-bg)` |
| `.weekly-challenge-card__details > .weekly-challenge-card__description` | `margin-top: 0` |
| `.weekly-challenge-card__topline` | `min-height: 20px`; `gap: 10px` |
| `.weekly-challenge-card__status` | `padding: 4px 8px`; `border-radius: 999px`; `background: var(--liquid-card-bg)`; `color: var(--ink)`; `font-size: 10px`; `font-weight: 900`; `line-height: 1`; `letter-spacing: 0.035em` |
| `.weekly-challenge-card__timer` | `color: var(--muted)`; `font-size: 11px`; `font-weight: 850` |
| `.weekly-challenge-card__title` | `margin: 0`; `color: var(--ink)`; `font-size: 20px`; `font-weight: 950`; `line-height: 1.12` |
| `.weekly-challenge-card__dates` | `margin-top: 4px`; `color: var(--muted)`; `font-size: 11px`; `font-weight: 800`; `line-height: 1.35` |
| `.weekly-challenge-card__description` | `margin: 7px 0 0`; `color: var(--muted)`; `font-size: 13px`; `line-height: 1.35` |
| `.weekly-challenge-card__rewards` | `gap: 14px` |
| `.weekly-challenge-card__reward` | `gap: 4px`; `font-size: 14px`; `font-weight: 950`; `line-height: 1` |
| `.weekly-challenge-card__reward > span:first-child` | `width: 17px`; `height: 17px` |
| `.weekly-challenge-task-list` | `margin: 0`; `padding: 0` |
| `.weekly-challenge-task` | `padding: 10px 0 9px` |
| `.weekly-challenge-task__line` | `grid-template-columns: minmax(0, 1fr) auto`; `gap: 12px` |
| `.weekly-challenge-task__title` | `min-width: 0`; `gap: 5px`; `color: var(--ink)`; `font-size: 13px`; `font-weight: 900` |
| `.weekly-challenge-task__check` | `color: var(--liquid-muted)` |
| `.weekly-challenge-task__value` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 850` |
| `.weekly-challenge-task__track` | `height: 3px`; `margin-top: 7px`; `border-radius: 999px`; `background: rgba(15, 23, 42, 0.1)` |
| `.weekly-challenge-task__track > span` | `height: 100%`; `border-radius: inherit`; `background: var(--blue-accent)` |
| `.weekly-challenge-card__actions` | `grid-template-columns: 0.82fr 1fr`; `gap: 8px` |
| `.weekly-challenge-card__actions .btn, .weekly-challenge-card > .btn` | `min-height: 42px`; `padding: 11px 14px`; `font-size: 13px` |
| `.weekly-challenge-card__decline.btn` | `color: #b91c1c`; `background: var(--liquid-card-bg)`; `border-color: rgba(185, 28, 28, 0.2)`; `box-shadow: none` |
| `.weekly-challenge-card__claimed` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 900` |
| `.weekly-challenge-card__error` | `color: #dc2626`; `font-size: 12px`; `font-weight: 900` |
| `.duel-challenge-toast, .achievement-reward-toast` | `width: min(440px, calc(100vw - 32px))`; `padding: 11px 15px`; `border: 1px solid rgba(255, 255, 255, 0.72)`; `border-radius: 16px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 14px 38px rgba(15, 23, 42, 0.28)`; `color: #fff`; `font-size: 13px`; `line-height: 1.35` |
| `.achievement-reward-toast` | `width: min(398px, calc(100vw - 32px))` |
| `.profile-referral-copy-toast` | `width: max-content`; `max-width: calc(100vw - 32px)`; `padding: 8px 16px` |
| `.profile-referral-copy-toast .achievement-reward-toast__title` | `margin-top: 0` |
| `.achievement-reward-toast__status` | `font-size: 12px`; `font-weight: 650`; `color: rgba(255, 255, 255, 0.72)` |
| `.achievement-reward-toast__title` | `margin-top: 2px`; `font-size: 14px`; `font-weight: 850` |
| `.achievement-reward-toast__values` | `gap: 10px`; `margin-top: 4px` |
| `.achievement-reward-toast__value` | `gap: 4px`; `font-size: 12px`; `font-weight: 700` |
| `.achievement-reward-toast__next-level` | `margin-top: 6px`; `color: rgba(255, 255, 255, 0.86)`; `font-size: 12px`; `font-weight: 700` |
| `.achievement-reward-toast__icon` | `min-width: 23px`; `height: 23px`; `gap: 4px`; `padding: 0 8px 0 5px`; `border: 1px solid rgba(255, 255, 255, 0.76)`; `border-radius: 999px`; `background: var(--liquid-card-bg)`; `box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1), 0 3px 10px rgba(255, 255, 255, 0.2)` |
| `.duel-challenge-toast__title` | `font-weight: 850` |
| `.duel-challenge-toast__copy` | `margin-top: 2px`; `font-weight: 600` |
| `.android-app-card, .android-update-banner` | `padding: 16px`; `gap: 14px` |
| `.android-app-card` | `border-radius: 22px` |
| `.android-app-card h3, .android-update-banner strong` | `margin: 0`; `color: var(--ink)`; `font-size: 15px` |
| `.android-app-card p, .android-update-banner span` | `margin: 4px 0 0`; `color: var(--muted)`; `font-size: 12px`; `font-weight: 700` |
| `.android-app-card__note` | `color: var(--muted)`; `font-size: 12px`; `font-weight: 800` |
| `.android-app-card__action` | `min-height: 42px`; `padding: 0 14px`; `border-radius: 14px`; `font-size: 12px`; `letter-spacing: 0` |
| `.android-update-banner__actions` | `gap: 8px` |
| `.advanced-training-v2-cue` | `width: min(170px, 44vw)`; `min-height: 92px`; `padding: 10px 18px`; `font-size: clamp(24px, 7cqw, 34px)`; `font-weight: 800` |
| `.advanced-training-v2-cue--waiting` | `font-size: 20px`; `line-height: 1.15` |
| `.advanced-training-v2-reset-cover` | `background: var(--liquid-inset-bg)` |
| `.advanced-training-v2-demo-stop` | `gap: 8px`; `max-width: min(340px, 86vw)`; `padding: 12px`; `color: var(--liquid-ink)`; `font-size: 14px`; `line-height: 1.35` |
| `.advanced-training-v2-demo-stop__heading` | `gap: 9px`; `min-width: 0` |
| `.advanced-training-v2-demo-stop__avatar, .advanced-training-v2-modal__avatar` | `border: 2px solid rgba(255, 255, 255, 0.9)`; `border-radius: 50%` |
| `.advanced-training-v2-demo-stop__avatar` | `width: 42px`; `height: 42px` |
| `.advanced-training-v2-modal__avatar` | `width: 44px`; `height: 44px` |
| `.advanced-training-v2-modal .modal-title` | `min-height: 44px` |
| `.advanced-training-v2-demo-stop button` | `width: 100%`; `padding: 8px 14px`; `border-radius: 9px`; `font-weight: 700` |
| `.advanced-training-v2-demo-stop__title` | `min-width: 0`; `font-size: 15px`; `font-weight: 600` |
| `.advanced-training-v2-demo-stop__explanation` | `gap: 6px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 500`; `line-height: 1.35` |
| `.advanced-training-v2-demo-stop__explanation p` | `margin: 0` |
| `.bonus-game-preview-modal__hints` | `margin: 16px 0 20px`; `padding: 0`; `gap: 12px` |
| `.bonus-game-preview-modal__hints li` | `font-size: 12px`; `line-height: 1.45`; `color: var(--liquid-muted)`; `font-weight: 500` |
| `.bonus-challenge-environment-notice.fitted-scoreboard-notice.initial-training-feedback-notice--scoreboard` | `width: max-content`; `max-width: 100%` |
| `.initial-training-feedback-notice--slip::before` | `background: #fb923c` |
| `.cyberpunk-emergency-shade` | `background: rgba(3,4,22,0)` |
| `.cyberpunk-ice--dark .cyberpunk-emergency-shade` | `background: rgba(3,4,22,.78)` |
| `.cyberpunk-strip` | `width: 100%`; `height: 100%` |
| `.cyberpunk-panel` | `width: clamp(48px,11%,78px)` |
| `.cyberpunk-breaker` | `width: 100%`; `padding: 0`; `background: none`; `border: 0` |
| `.cyberpunk-breaker img` | `width: 100%`; `height: auto` |
| `.cyberpunk-breaker:focus-visible` | `border-radius: 5px` |
| `.cyberpunk-breaker__leds i` | `width: 5px`; `height: 5px`; `border-radius: 50%`; `background: #192733` |
| `.cyberpunk-breaker__leds .lit` | `background: #62e5f2`; `box-shadow: 0 0 4px #62e5f2` |
| `.cyberpunk-ice--flicker .cyberpunk-emergency-shade`<br>@media(prefers-reduced-motion:reduce) | `background: rgba(3,4,22,.35)` |
| `.initial-training-feedback-notice--magnetic::before` | `background: #c084fc` |
| `.bonus-game-levels__choices` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 6px`; `margin: 12px 0 10px` |
| `.bonus-game-levels__choices .btn` | `gap: 4px`; `min-width: 0`; `padding: 10px 4px`; `font-size: 12px`; `letter-spacing: 0` |
| `.bonus-game-levels__status` | `font-size: 10px` |
| `.bonus-game-level-choice__check` | `width: 18px`; `height: 18px`; `border: 2px solid rgba(71, 85, 105, .34)`; `border-radius: 999px`; `background: rgba(255, 255, 255, .42)`; `color: white`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, .62)` |
| `.bonus-game-level-choice__check[data-selected="true"]` | `width: 20px`; `height: 20px`; `border: 0`; `background: #1f2a3d`; `box-shadow: 0 0 0 3px rgba(15, 23, 42, .1)` |
| `.bonus-game-levels__choices [aria-pressed="true"]` | `border-color: var(--color-primary, #f7d44a)`; `background: rgba(247, 212, 74, 0.12)` |
| `.bonus-game-levels__received` | `margin: 0`; `color: var(--green-deep)`; `font-size: 12px`; `font-weight: 700` |
| `.bonus-game-preview-modal .modal-actions` | `margin-top: 8px` |
| `.bonus-game-preview-modal__hints` | `margin-bottom: 4px` |
| `.bonus-game-level-reward` | `gap: 20px`; `font-size: 16px`; `font-weight: 800` |
| `.bonus-game-level-reward span` | `gap: 6px` |
| `.bonus-game-level-reward svg` | `width: 20px`; `height: 20px` |
| `.bonus-game-level-reward--received span` | `color: #64748b !important` |
| `.bonus-game-preview-modal .bonus-game-levels__received` | `color: var(--liquid-muted)` |
| `.bonus-game-levels__choices .bonus-game-level-choice--completed` | `background: rgba(34, 197, 94, .10)` |
| `.bonus-game-levels__choices .bonus-game-level-choice--available` | `background: rgba(250, 204, 21, .10)` |
| `.bonus-game-levels__choices .bonus-game-level-choice--locked` | `background: rgba(239, 68, 68, .10)` |
| `.bonus-game-levels__choices .btn, .bonus-game-levels__choices .btn[aria-pressed="true"]` | `border-color: rgba(255, 255, 255, .9)` |
| `.bonus-records-modal .tournament-standing-table th:last-child, .bonus-records-modal .tournament-standing-table td:last-child` | `width: calc(var(--bonus-record-result-chars, 14) * 8px + 20px)` |
| `.bonus-records-modal .tournament-standing-table td:nth-child(2)` | `min-width: 0` |
| `.bonus-records-modal .tournament-standing-player` | `width: 100%` |
| `.bonus-records-entry` | `margin-top: 12px` |
| `.bonus-records-entry .modal-copy` | `margin: 6px 0 0` |
| `.bonus-records-modal__subtitle` | `margin: 0 0 12px` |
| `.bonus-records-modal__explanation` | `margin: 0 0 12px`; `font-size: 12px`; `line-height: 1.4` |
| `.bonus-records-result__secondary` | `margin-top: 3px`; `color: var(--liquid-muted)`; `font-size: 11px`; `font-weight: 500`; `line-height: 1.35` |
| `.bonus-game-record-result` | `margin: 12px 0`; `padding-top: 12px`; `gap: 8px`; `font-size: 13px` |
| `.bonus-game-record-result > div` | `gap: 16px` |
| `.bonus-game-record-result dt` | `color: var(--liquid-muted)` |
| `.bonus-game-record-result dd` | `margin: 0`; `font-weight: 700` |
| `.bonus-game-result-reward-sources` | `gap: 4px`; `margin-top: 8px`; `font-size: 12px`; `color: var(--liquid-muted)` |
| `.bonus-game-result-reward-breakdown` | `margin-top: 14px`; `padding-top: 12px` |
| `.bonus-records-modal__rewards` | `margin: 0 0 12px`; `font-size: 12px`; `line-height: 1.45`; `color: var(--liquid-muted)` |
| `.bonus-records-modal__rewards p` | `margin: 0 0 6px` |
| `.bonus-records-modal__reward` | `gap: 3px`; `font-weight: 700` |
| `.bonus-records-entry__summary` | `margin: 0 0 12px`; `font-size: 12px`; `line-height: 1.45` |
| `.bonus-records-entry__summary > div` | `gap: 12px`; `margin-bottom: 6px` |
| `.bonus-records-entry__summary dt` | `color: var(--liquid-muted)` |
| `.bonus-records-entry__summary dd` | `margin: 0`; `font-weight: 700` |
| `.bonus-records-entry__action-row` | `margin-top: 12px` |
| `.bonus-records-entry .bonus-records-entry__description` | `font-weight: 400`; `margin: 0 0 12px` |
| `.bonus-records-entry__button` | `width: 100%`; `margin: 0`; `padding: 15px 20px`; `font-size: 16px` |

</details>

<details>
<summary>admin/bar-admin.css — 15 элементов и правил</summary>

Источник: [bar-admin.css](../packages/web/src/admin/bar-admin.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.bar-admin` | `padding: 16px` |
| `.bar-admin__layout` | `grid-template-columns: minmax(0, 1fr)`; `gap: 24px` |
| `.bar-admin fieldset` | `border: 0`; `padding: 0`; `margin: 0`; `gap: 12px` |
| `.bar-admin label` | `gap: 6px`; `font-size: 14px` |
| `.bar-admin input, .bar-admin select, .bar-admin textarea` | `width: 100%`; `padding: 10px 12px`; `border-radius: 12px`; `border: 1px solid #ffffff33`; `color: inherit`; `background: #ffffff18` |
| `.bar-admin select option` | `color: var(--liquid-ink)` |
| `.bar-admin input[type='range']` | `padding: 0` |
| `.bar-admin__pages` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 6px`; `padding: 0`; `margin: 0` |
| `.bar-admin__pages button` | `width: 100%`; `padding: 8px`; `border: 1px solid #ffffff30`; `background: #ffffff18`; `border-radius: 10px`; `color: inherit`; `font-size: 13px` |
| `.bar-admin__pages .bar-admin__page--active` | `border-color: #639df5`; `background: #639df530` |
| `.bar-admin__row` | `gap: 8px`; `margin: 12px 0` |
| `.bar-admin__preview` | `max-width: 390px`; `width: 100%` |
| `.bar-admin__preview .bar-space` | `color: white` |
| `.bar-admin small` | `font-size: 12px` |
| `.bar-admin__layout`<br>@media (min-width: 800px) | `grid-template-columns: minmax(280px, 1fr) minmax(300px, 390px)` |

</details>

<details>
<summary>admin/onboarding-admin.css — 8 элементов и правил</summary>

Источник: [onboarding-admin.css](../packages/web/src/admin/onboarding-admin.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.onboarding-admin__step` | `grid-template-columns: 68px minmax(0, 1fr) auto` |
| `.onboarding-admin__thumbnail, .onboarding-admin__thumbnail-fallback` | `width: 68px`; `height: 92px`; `border-radius: 12px`; `background: var(--liquid-card-bg)` |
| `.onboarding-admin__thumbnail-fallback` | `padding: 6px`; `color: var(--muted)`; `font-size: 10px`; `font-weight: 800` |
| `.onboarding-admin__field-error` | `margin-top: 6px`; `color: #9f1239`; `font-size: 12px`; `font-weight: 800` |
| `.onboarding-step-editor__speeds` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 8px` |
| `.onboarding-step-editor__speeds`<br>@media (max-width: 640px) | `grid-template-columns: 1fr` |
| `.onboarding-admin__step`<br>@media (max-width: 640px) | `grid-template-columns: 56px minmax(0, 1fr)` |
| `.onboarding-admin__thumbnail, .onboarding-admin__thumbnail-fallback`<br>@media (max-width: 640px) | `width: 56px`; `height: 76px` |

</details>

<details>
<summary>bar/bar-conversation.css — 24 элементов и правил</summary>

Источник: [bar-conversation.css](../packages/web/src/bar/bar-conversation.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.modal-card.bar-conversation` | `width: min(100%, 560px)`; `height: min(52dvh, 480px)`; `max-height: calc(100dvh - env(safe-area-inset-top) - 12px)`; `padding: 16px 16px calc(12px + env(safe-area-inset-bottom))`; `border-radius: 24px` |
| `.modal-card.bar-conversation--empty` | `height: auto` |
| `.modal-card.bar-conversation--expanded` | `height: calc(100dvh - env(safe-area-inset-top) - 12px)` |
| `.bar-conversation .modal-title` | `font-size: 16px`; `line-height: 1.25`; `color: #f5f7fb` |
| `.bar-conversation__identity` | `gap: 10px` |
| `.bar-conversation__identity > span:last-child` | `min-width: 0` |
| `.bar-conversation__identity small` | `font-size: 11px`; `font-weight: 400`; `color: #aab7c9`; `margin-top: 4px` |
| `.bar-conversation__avatar` | `border: 1px solid rgba(205, 232, 255, 0.46)`; `width: 40px`; `height: 40px`; `border-radius: 50%`; `background: var(--liquid-inset-bg)` |
| `.bar-conversation__avatar img` | `width: 100%`; `height: 100%` |
| `.bar-conversation .icon-btn` | `width: 32px`; `height: 32px`; `min-width: 32px`; `color: #d9e3f1`; `background: #ffffff0d`; `border-color: #ffffff1a`; `box-shadow: none` |
| `.bar-conversation > .modal-header + div` | `min-height: 0` |
| `.bar-conversation__controls` | `gap: 8px` |
| `.bar-conversation__body` | `gap: 10px`; `width: 100%`; `min-width: 0`; `min-height: 0` |
| `.bar-conversation__log` | `min-height: 0`; `padding: 2px` |
| `.bar-conversation__bubble` | `margin: 0 24px 10px 0`; `padding: 6px 9px`; `border-radius: 14px 14px 14px 4px`; `font-size: 13px`; `line-height: 1.3`; `color: var(--ink)` |
| `.bar-conversation__bubble--user` | `color: #ffffff`; `border-radius: 14px 14px 4px 14px` |
| `.bar-conversation__composer` | `padding: 8px 0 0`; `border: 0` |
| `.bar-conversation__composer .chat-dock-composer` | `padding: 0`; `background: none`; `border: 0`; `box-shadow: none`; `backdrop-filter: none` |
| `.bar-conversation__composer textarea` | `min-width: 0` |
| `.bar-conversation__error` | `gap: 6px`; `font-size: 12px`; `line-height: 1.35`; `color: #ffb7ad` |
| `.bar-conversation__retry` | `border: 0`; `padding: 0`; `background: none`; `color: #dce8ff` |
| `.modal-card.bar-conversation`<br>@media (min-width: 900px) | `margin-bottom: 24px`; `height: min(76dvh, 760px)`; `border-radius: 20px` |
| `.modal-card.bar-conversation--empty:not(.bar-conversation--expanded)` | `height: auto` |
| `.modal-card.bar-conversation--expanded` | `height: calc(100dvh - env(safe-area-inset-top) - 12px)` |

</details>

<details>
<summary>bar/bar-panorama.css — 66 элементов и правил</summary>

Источник: [bar-panorama.css](../packages/web/src/bar/bar-panorama.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.bar-space` | `background: #21160e` |
| `.bar-space__track` | `width: 1000%` |
| `.bar-space__background` | `height: 100%`; `width: 40%`; `max-width: none` |
| `.bar-space__background--east` | `width: 20%` |
| `.bar-space__figure` | `width: 10%` |
| `.bar-space__figure img` | `width: 100%`; `height: 100%` |
| `.bar-space__silhouette` | `width: 100%`; `height: 100%` |
| `.bar-space__development` | `margin: 0`; `padding: 8px`; `color: #d5dfeb` |
| `.bar-space::after` | `background: linear-gradient(#080c1266, transparent 28%, transparent 70%, #080c12bb)` |
| `.bar-space__header` | `gap: 12px`; `padding: 16px 14px 8px` |
| `.bar-space__header h1` | `margin: 0`; `font-size: clamp(17px, 4.7vw, 24px)`; `color: white` |
| `.bar-space__places` | `height: clamp( 160px, calc(100% - var(--bar-panel-height) - var(--bar-nav-reserve) - 164px), 280px )`; `width: 40px`; `grid-template-rows: repeat(10, 1fr)` |
| `.bar-space__places > button:not(.bar-place-preview)` | `width: 40px`; `border: 0`; `padding: 0`; `background: transparent` |
| `.bar-space__places > button:not(.bar-place-preview)::before` | `width: 12px`; `height: 3px`; `border-radius: 2px`; `background: #ffffff70`; `box-shadow: 0 1px 4px #0008` |
| `.bar-space__places > button[aria-current]::before` | `width: 24px`; `background: white` |
| `.bar-space__places > button[aria-expanded='true']:not([aria-current])::before` | `width: 18px`; `background: #ffffffdd` |
| `.bar-space button.bar-place-preview` | `width: max-content`; `max-width: calc(100vw - 64px)`; `gap: 8px`; `padding: 8px 10px`; `border-radius: 16px`; `color: white`; `box-shadow: 0 4px 12px rgba(0, 10, 27, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.18)` |
| `.bar-place-preview__avatar` | `width: 32px`; `height: 32px`; `border-radius: 50%`; `border: 1px solid rgba(205, 232, 255, 0.46)`; `background: #ffffff15` |
| `.bar-place-preview__avatar img` | `width: 100%`; `height: 100%` |
| `.bar-place-preview__text` | `min-width: 0`; `gap: 2px` |
| `.bar-place-preview__text strong` | `font-size: 13px` |
| `.bar-place-preview__text span` | `font-size: 11px`; `color: #bfccdd` |
| `.bar-place-preview__text small` | `font-size: 11px`; `color: #d5e5ff` |
| `.bar-space__actions` | `gap: 12px`; `color: white` |
| `.bar-space__actions h2` | `margin: 0`; `font-size: 20px` |
| `.bar-space button.icon-btn` | `color: #fff`; `width: 36px`; `height: 36px`; `border-radius: 50%` |
| `.bar-space__figure` | `padding: 0 12px` |
| `.bar-space .bar-space__actions` | `padding: 14px`; `width: auto`; `border-radius: 24px`; `gap: 8px` |
| `.bar-identity` | `gap: 12px`; `padding: 0`; `background: none`; `color: inherit`; `border: 0`; `width: 100%` |
| `.bar-identity__avatar` | `border: 1px solid rgba(205, 232, 255, 0.46)`; `width: 48px`; `height: 48px`; `border-radius: 50%`; `background: #ffffff1c` |
| `.bar-identity__avatar img` | `width: 100%`; `height: 100%` |
| `.bar-identity__text` | `min-width: 0` |
| `.bar-identity__name` | `font-weight: 700`; `font-size: clamp(16px, 4.3vw, 20px)`; `line-height: 1.2` |
| `.bar-identity__role` | `color: #ffffffb0`; `font-size: 13px`; `margin-top: 3px` |
| `.bar-identity__description` | `margin: 0`; `font-size: 14px`; `line-height: 1.4` |
| `.bar-identity__actions` | `gap: 8px` |
| `.bar-identity__actions .btn` | `min-width: 0`; `font-size: 15px`; `letter-spacing: normal` |
| `.bar-space__notice` | `margin: 6px 16px`; `padding: 8px 12px`; `color: white`; `background: #111a26dd`; `border-radius: 12px`; `font-size: 12px`; `gap: 8px` |
| `.bar-space__notice button` | `color: white`; `background: transparent`; `border: 0` |
| `.bar-space--preview` | `width: 100%`; `height: 680px`; `max-height: none`; `border-radius: 20px` |
| `.bar-space__actions`<br>@media (max-height: 650px) | `padding: 10px` |
| `.bar-identity__avatar`<br>@media (max-height: 650px) | `width: 36px`; `height: 36px` |
| `.bar-identity-row` | `gap: 12px` |
| `.bar-identity-row .bar-identity` | `min-width: 0` |
| `.bar-space .bar-identity__toggle` | `width: 32px`; `height: 32px` |
| `.bar-identity__expanded` | `gap: 10px`; `min-width: 0`; `padding-top: 8px` |
| `.bar-space .bar-identity__toggle` | `padding: 0`; `border: 0`; `border-radius: 0`; `background: transparent`; `box-shadow: none`; `color: inherit` |
| `.bar-space .bar-space__actions--terminal` | `max-height: calc(100dvh - 150px - var(--bar-nav-reserve))` |
| `.bar-space .online-durak-lobby--embedded` | `padding: 0`; `margin: 0`; `width: 100%`; `max-width: none`; `background: none` |
| `.online-durak-lobby--embedded > .bar-content` | `padding: 0`; `margin: 0` |
| `.bar-space .durak-mode-tabs` | `margin-bottom: 12px` |
| `.bar-space .bar-game-filter` | `min-width: 0`; `border-radius: 999px`; `padding: 8px`; `background: var(--liquid-inset-bg)`; `color: white`; `border: 1px solid rgba(205,232,255,.46)` |
| `.bar-space .bar-game-filter--active` | `background: var(--liquid-selected-bg)` |
| `.bar-space .online-durak-lobby--embedded .segmented-tabs, .bar-space .online-durak-lobby--embedded .glass` | `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(205,232,255,.46)`; `color: white` |
| `.bar-space .online-durak-lobby--embedded .segmented-tabs__item` | `color: white` |
| `.bar-space .online-durak-lobby--embedded .segmented-tabs__item--active` | `background: var(--liquid-selected-bg)` |
| `.bar-space .online-durak-lobby--embedded .btn--cta` | `background: var(--liquid-selected-bg)`; `border: 1px solid rgba(205,232,255,.7)`; `color: white` |
| `.bar-space .online-durak-lobby--embedded .section-label` | `color: #fff` |
| `.bar-space .bar-space__actions--terminal` | `background: none`; `border: 0`; `box-shadow: none`; `backdrop-filter: none`; `padding: 0`; `border-radius: 0` |
| `.bar-space .online-durak-lobby--embedded` | `height: auto`; `min-height: 0` |
| `.bar-space .online-durak-lobby--embedded > .bar-content` | `height: auto`; `min-height: 0` |
| `.bar-space:has(.bar-space__actions--terminal) .bar-space__places`<br>@media (max-width: 480px) | `width: 32px` |
| `.bar-space:has(.bar-space__actions--terminal) .bar-space__places > button:not(.bar-place-preview)`<br>@media (max-width: 480px) | `width: 32px` |
| `.bar-space:has(.bar-space__actions--terminal) .bar-space__places` | `width: auto`; `height: 24px`; `grid-template-columns: repeat(10, minmax(0, 1fr))`; `grid-template-rows: 1fr` |
| `.bar-space:has(.bar-space__actions--terminal) .bar-space__places > button:not(.bar-place-preview)` | `width: 100%` |
| `.bar-space:has(.bar-space__actions--terminal) button.bar-place-preview` | `max-width: 100%` |

</details>

<details>
<summary>bar/bar.css — 91 элементов и правил</summary>

Источник: [bar.css](../packages/web/src/bar/bar.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.bar-screen` | `padding: calc(16px + var(--app-safe-top)) 14px calc(24px + var(--app-safe-bottom))`; `background: linear-gradient(rgba(20, 15, 10, 0.35), rgba(20, 15, 10, 0.75)), url('/bar/bar-interior-v4.webp') center/cover` |
| `.bar-header` | `gap: 12px`; `width: 100%`; `max-width: 760px`; `margin: 0 auto 16px`; `color: white` |
| `.bar-header h1` | `margin: 0`; `font-size: 24px`; `font-weight: 800` |
| `.bar-board` | `max-width: 760px`; `width: 100%`; `margin: 0 auto`; `padding: 16px`; `border-radius: 24px` |
| `.bar-content` | `width: 100%`; `max-width: 760px`; `margin: 0 auto` |
| `.bar-filters .segmented-tabs__item:first-child::before` | `width: 8px`; `height: 8px`; `border-radius: 50%`; `background: #38cf79` |
| `.bar-section-label` | `margin: 0 0 10px -14px` |
| `.bar-content .bar-empty, .bar-content .bar-connection, .bar-content .bar-pagination` | `color: white` |
| `.bar-intro` | `margin: 0 0 16px`; `color: var(--muted)`; `font-size: 13px` |
| `.bar-match-group` | `margin-top: 16px` |
| `.bar-match-card` | `width: 100%`; `gap: 6px`; `padding: 8px 12px`; `margin-top: 8px`; `border-radius: 16px` |
| `.bar-match-heading` | `gap: 8px` |
| `.bar-match-start` | `font-size: 10px` |
| `.bar-match-kind` | `font-size: 11px` |
| `.bar-match-players` | `grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)`; `gap: 8px` |
| `.bar-player` | `gap: 6px`; `font-size: 12px`; `font-weight: 700`; `min-width: 0` |
| `.bar-player-copy` | `min-width: 0`; `gap: 3px` |
| `.bar-player-copy small` | `color: rgba(211, 228, 246, 0.78)`; `font-size: 9px`; `font-weight: 600` |
| `.bar-player img, .bar-avatar-fallback` | `width: 28px`; `height: 28px`; `border-radius: 50%` |
| `.bar-avatar-fallback` | `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(221, 240, 255, 0.28)`; `color: #f8fbff`; `font-size: 14px` |
| `.bar-score` | `font-size: 23px` |
| `.bar-match-status` | `font-size: 10px` |
| `.bar-empty, .bar-connection` | `font-size: 13px`; `color: var(--muted)`; `padding: 12px 0` |
| `.bar-pagination` | `gap: 8px`; `margin-top: 20px`; `font-size: 12px` |
| `.bar-rinks` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 10px` |
| `.bar-rink-panel` | `min-width: 0`; `border-radius: 16px`; `background: white`; `border: 1px solid #e1e7ed` |
| `.bar-rink-header` | `gap: 6px`; `padding: 10px`; `font-size: 12px` |
| `.bar-rink-header b` | `font-size: 18px` |
| `.bar-rink-status` | `font-size: 11px`; `color: var(--muted)`; `margin: 8px 4px` |
| `.bar-live-score` | `font-size: 32px`; `font-weight: 800`; `margin: 0 0 16px` |
| `.bar-final` | `font-weight: 700`; `color: #20804c` |
| `.bar-header .icon-btn` | `background: var(--liquid-inset-bg)`; `color: var(--ink)`; `border-color: rgba(255, 255, 255, 0.7)` |
| `.bar-rink-background` | `width: 100%` |
| `.bar-screen--match` | `gap: 12px`; `min-height: 0`; `height: 100%` |
| `.bar-screen--match .bar-header` | `max-width: none`; `margin-bottom: 0` |
| `.bar-screen--match .bar-board` | `padding: 0`; `border-radius: 0` |
| `.bar-match-title` | `margin: 0 0 8px`; `color: white` |
| `.bar-live-score` | `font-size: 30px`; `margin: 0 0 10px` |
| `.bar-rinks` | `gap: 10px` |
| `.bar-rink-panel` | `border: none`; `border-radius: 0`; `background: none` |
| `.bar-rink-header` | `padding: 0 2px 7px`; `color: white`; `font-size: 12px` |
| `.bar-rink-panel .game-scoreboard` | `margin: 0 0 6px`; `border-radius: 12px` |
| `.bar-rink-panel .game-scoreboard__row` | `padding: 7px 2px` |
| `.bar-rink-panel .game-scoreboard__metric` | `padding: 0 3px`; `gap: 4px` |
| `.bar-rink-panel .game-scoreboard__label` | `font-size: 7px`; `letter-spacing: 0.06em` |
| `.bar-rink-panel .game-scoreboard__value` | `font-size: 14px` |
| `.bar-rink` | `border: 3px solid #1e3a5f`; `border-radius: 18px` |
| `.bar-chat` | `width: 100%`; `max-width: 760px`; `margin: 0 auto`; `min-height: 0`; `border-radius: 20px` |
| `.bar-chat > .section-label` | `padding: 12px 14px 8px`; `margin: 0` |
| `.bar-chat-messages` | `min-height: 0`; `padding: 6px 12px 12px`; `gap: 10px` |
| `.bar-chat-input` | `padding: 8px 10px` |
| `.bar-chat-error` | `margin: 0`; `padding: 5px 12px`; `font-size: 12px`; `color: #b42318` |
| `.bar-screen--match`<br>@media (max-height: 650px) | `gap: 8px`; `padding-top: calc(8px + var(--app-safe-top))` |
| `.bar-live-score`<br>@media (max-height: 650px) | `font-size: 24px`; `margin-bottom: 6px` |
| `.bar-screen--match .bar-board` | `max-width: none`; `padding: 12px`; `border-radius: 24px` |
| `.bar-screen--match .bar-board .bar-match-title` | `padding: 0`; `color: rgba(211, 228, 246, 0.78)` |
| `.bar-chat-title` | `width: calc(100% + 14px)`; `max-width: none`; `margin: 0 auto 0 -14px` |
| `.bar-rink-header .bar-player-avatar` | `padding: 2px`; `border-radius: 50%`; `margin: 0` |
| `.bar-screen--match` | `height: var(--app-viewport-height, 100dvh)`; `max-height: var(--app-viewport-height, 100dvh)` |
| `.bar-rink-header .bar-player-avatar` | `width: 30px`; `height: 30px` |
| `.bar-chat` | `width: 100%`; `max-width: 760px`; `margin: 0 auto`; `border-radius: 24px` |
| `.bar-chat-input` | `padding: 8px 12px 12px`; `border: 0` |
| `.bar-chat-input .chat-dock-composer` | `margin: 0`; `padding: 0`; `background: transparent !important`; `border: 0 !important`; `box-shadow: none !important`; `backdrop-filter: none` |
| `.bar-chat-input :is(textarea, button[aria-label='Отправить']), .bar-identity__actions .btn` | `background: var(--liquid-inset-bg)`; `color: #f8fbff !important`; `border: 1px solid rgba(255, 255, 255, 0.78) !important`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5)`; `backdrop-filter: blur(20px) saturate(130%)` |
| `.bar-chat-input textarea` | `min-width: 0` |
| `.bar-chat-messages` | `padding: 8px 10px`; `gap: 6px` |
| `.bar-chat-messages [data-testid='chat-bubble']` | `margin-bottom: 0 !important`; `gap: 6px !important`; `max-width: 94% !important` |
| `.bar-chat-messages [data-testid='chat-bubble'] :is(.glass, .chat-bubble--own)` | `padding: 6px 9px !important`; `font-size: 13px !important`; `line-height: 1.3 !important` |
| `.bar-chat-messages button[aria-label^='Профиль:']` | `font-size: 11px !important` |
| `.bar-chat-messages button[aria-label^='Аватар:']` | `width: 30px`; `height: 30px`; `padding: 2px !important`; `border: 1px solid rgba(205, 232, 255, 0.46) !important`; `border-radius: 50%`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18)` |
| `.bar-chat-messages button[aria-label^='Аватар:'] > *` | `width: 24px !important`; `height: 24px !important` |
| `.bar-chat-messages .pill` | `padding: 2px 7px !important`; `font-size: 11px !important` |
| `.bar-chat-messages .pill > span:first-child` | `font-size: 12px !important` |
| `.bar-chat-input textarea::placeholder` | `color: rgba(248, 251, 255, 0.72)` |
| `.bar-rink .bar-rink-result` | `width: calc(100% - 16px)`; `padding: 10px`; `border-radius: 18px` |
| `.bar-rink-result .modal-title` | `margin: 0 0 8px`; `font-size: clamp(11px, 8cqw, 16px)` |
| `.bar-rink-result .duel-result-card__compact-fact` | `gap: 4px` |
| `.bar-rink-result .duel-result-card__compact-fact span` | `font-size: 8px`; `letter-spacing: 0.04em` |
| `.bar-rink-result .duel-result-card__compact-fact strong` | `font-size: 13px` |
| `.bar-chat-messages` | `padding-bottom: calc(var(--bar-chat-composer-height, 72px) + 8px)` |
| `.bar-chat-input.chat-edge-bottom--overlay` | `padding: 20px 12px 12px`; `margin: 0` |
| `.bar-screen--match .bar-chat` | `max-width: none` |
| `.bar-screen--match .bar-rink` | `width: 100%`; `max-width: 208px`; `margin: 0 auto` |
| `.bar-rink-panel > .game-scoreboard` | `max-width: 320px` |
| `.bar-screen--match .bar-rink`<br>@media (max-height: 650px) | `max-width: 128px` |
| `.bar-rink-scene` | `width: 100%`; `height: 125%` |
| `.bar-entries` | `gap: 14px` |
| `.bar-entries .sections-quick-card--wide` | `grid-template-columns: 86px minmax(0, 1fr) 20px` |
| `.bar-entries .sections-quick-card--wide`<br>@media (max-width: 360px) | `grid-template-columns: 76px minmax(0, 1fr) 20px` |
| `.bar-entries .sections-quick-card__title`<br>@media (max-width: 360px) | `font-size: 16px` |
| `.bar-entries .sections-quick-card__meta`<br>@media (max-width: 360px) | `font-size: 11px` |

</details>

<details>
<summary>bar/cards/durak.css — 193 элементов и правил</summary>

Источник: [durak.css](../packages/web/src/bar/cards/durak.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.durak-screen` | `gap: 8px`; `height: var(--app-viewport-height, 100dvh)`; `padding: calc(10px + var(--app-safe-top, 0px)) 12px calc(10px + var(--app-safe-bottom, 0px))`; `background: #164c3c url('/bar/cards/table-v1.webp') center/cover`; `color: white` |
| `.durak-screen .bar-header` | `margin-bottom: 0`; `max-width: none` |
| `.durak-screen .bar-header h1` | `font-size: var(--font-size-xl, 20px)` |
| `.durak-opponent` | `min-height: 80px`; `max-height: 210px` |
| `.durak-opponent > img` | `height: 100%`; `width: auto`; `max-width: 100%` |
| `.durak-counter` | `padding: 5px 12px`; `border-radius: var(--radius-pill, 999px)`; `background: var(--glass-bg, rgba(19, 36, 46, 0.55))`; `border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.3))`; `backdrop-filter: blur(16px)` |
| `.durak-table` | `min-height: 0`; `gap: 8px`; `max-width: 700px`; `width: 100%`; `margin: auto` |
| `.durak-deck` | `width: 64px`; `gap: 6px`; `font-size: 12px` |
| `.durak-deck > div` | `height: 94px` |
| `.durak-deck img` | `width: 52px`; `border-radius: 6px` |
| `.durak-pairs` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `grid-template-rows: repeat(2, minmax(0, 1fr))`; `gap: 10px`; `width: 100%`; `height: 100%`; `max-height: 310px` |
| `.durak-pair` | `border: 0`; `background: none`; `padding: 0`; `width: 100%`; `height: 100%`; `max-height: 145px`; `min-height: 0` |
| `.durak-pair img` | `width: calc(100% - 14px)`; `height: calc(100% - 14px)` |
| `.durak-pair--target` | `border-radius: 8px` |
| `.durak-controls` | `max-width: 700px`; `width: 100%`; `margin: 0 auto` |
| `.durak-status` | `gap: 8px`; `min-height: 30px`; `font-size: 14px` |
| `.durak-timer` | `font-weight: 700` |
| `.durak-actions` | `min-height: 44px`; `gap: 8px` |
| `.durak-actions .btn` | `min-width: 140px` |
| `.durak-hand` | `min-height: 135px`; `max-width: 700px`; `width: 100%`; `margin: 0 auto`; `padding: 14px 6px 4px` |
| `.durak-card` | `width: 84px`; `padding: 0`; `background: none`; `border: 0`; `border-radius: 7px` |
| `.durak-card img` | `width: 100%`; `border-radius: 7px`; `box-shadow: 0 2px 8px #183b2e` |
| `.durak-entry` | `margin-bottom: 20px` |
| `.durak-entry .bonus-game-card` | `width: 100%` |
| `.durak-opponent`<br>@media (max-height: 650px) | `max-height: 120px` |
| `.durak-hand`<br>@media (max-height: 650px) | `min-height: 109px` |
| `.durak-card`<br>@media (max-height: 650px) | `width: 66px` |
| `.durak-screen`<br>@media (max-height: 650px) | `gap: 4px` |
| `.durak-actions`<br>@media (max-height: 650px) | `min-height: 36px` |
| `.durak-pairs`<br>@media (max-height: 650px) | `gap: 6px` |
| `.durak-deck`<br>@media (max-height: 650px) | `width: 52px`; `font-size: 11px` |
| `.durak-deck img`<br>@media (max-height: 650px) | `width: 42px` |
| `.durak-deck > div`<br>@media (max-height: 650px) | `height: 78px` |
| `.bonus-game-preview-modal__artwork.durak-scene` | `background: url('/bar/cards/table-v1.webp') center top/100% auto no-repeat`; `min-height: 0 !important`; `height: auto !important` |
| `.durak-scene > img` | `height: 90%`; `width: 100%` |
| `.durak-entry .bonus-game-preview-modal__artwork.durak-scene` | `width: 100%`; `max-height: 170px`; `height: 170px !important` |
| `.screen.durak-screen` | `color: #fff` |
| `.durak-deck, .durak-status` | `color: #fff` |
| `.durak-opponent` | `max-height: none`; `min-height: 105px` |
| `.durak-opponent > img` | `height: 140%`; `width: auto`; `max-width: none` |
| `.durak-deck` | `width: 82px`; `font-size: 12px` |
| `.durak-deck > div` | `height: 112px` |
| `.durak-deck img` | `width: 60px`; `border-radius: 8px` |
| `.durak-pair img` | `width: calc(100% - 24px)`; `height: auto`; `max-height: calc(100% - 24px)`; `border-radius: 8px` |
| `.durak-opponent`<br>@media (max-height: 650px) | `max-height: none` |
| `.durak-deck`<br>@media (max-height: 650px) | `width: 72px` |
| `.durak-deck img`<br>@media (max-height: 650px) | `width: 52px` |
| `.durak-deck > div`<br>@media (max-height: 650px) | `height: 98px` |
| `.durak-pair img`<br>@media (max-height: 650px) | `width: calc(100% - 20px)`; `max-height: calc(100% - 20px)` |
| `.durak-pair img` | `width: min(calc(100cqw - var(--card-offset)), calc((100cqh - var(--card-offset)) * 0.65))`; `height: auto`; `max-height: none` |
| `.durak-screen::before` | `background: url('/bar/cards/table-v1.webp') center/cover` |
| `.durak-actions` | `height: 52px`; `min-height: 52px` |
| `.durak-pair img` | `height: min(calc((100cqw - var(--card-offset)) / 0.7), calc(100cqh - var(--card-offset)))`; `width: auto`; `max-width: none`; `max-height: none` |
| `.durak-actions`<br>@media (max-height: 650px) | `height: 44px`; `min-height: 44px` |
| `.durak-scene--result > img` | `height: 95%` |
| `.durak-menu` | `width: 100%`; `max-width: 700px` |
| `.durak-menu .durak-menu__row` | `grid-template-columns: repeat(3, minmax(0, 1fr))` |
| `.durak-menu .durak-menu__links` | `grid-template-columns: 1fr 1fr`; `padding-block: 6px` |
| `.durak-menu__links button` | `border: 0`; `background: none`; `padding: 4px` |
| `.durak-turn-notice` | `margin-top: 6px` |
| `.durak-turn-notice[data-tone='success']::before` | `background: #34d399` |
| `.durak-turn-notice[data-tone='danger']::before` | `background: #fb7185` |
| `.durak-turn-notice[data-tone='warning']::before` | `background: #facc15` |
| `.durak-opponent` | `min-height: 60px` |
| `.durak-opponent > img` | `height: 125%` |
| `.durak-menu .durak-menu__row` | `padding: 7px 8px` |
| `.durak-menu .durak-menu__links` | `padding: 0 8px 4px` |
| `.durak-menu__links button` | `font-size: 9px`; `padding: 3px` |
| `.durak-opponent > img` | `height: calc(35dvh - 65px)` |
| `.durak-menu__identity` | `gap: 5px`; `width: 100%`; `min-width: 0` |
| `.durak-menu__identity .user-avatar` | `border: 1px solid rgba(205, 232, 255, 0.46)` |
| `.durak-menu .game-scoreboard` | `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(112, 182, 247, 0.12), inset 1px 0 0 rgba(255, 255, 255, 0.05), inset -1px 0 0 rgba(255, 255, 255, 0.05)` |
| `.durak-screen .durak-menu .durak-turn-notice` | `width: max-content`; `max-width: 100%`; `padding: 12px 24px`; `gap: 12px`; `line-height: 1.3`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(112, 182, 247, 0.12)` |
| `.durak-menu .durak-menu__row` | `grid-template-columns: 1.4fr 0.8fr 1fr 0.8fr 1.4fr`; `padding-inline: 5px` |
| `.durak-menu .game-scoreboard__metric` | `padding-inline: 3px` |
| `.durak-menu .durak-trump` | `color: #f8fbff` |
| `.durak-menu .durak-trump--red` | `color: #fb7185` |
| `.durak-menu .game-scoreboard__label` | `font-size: clamp(7px, 2.4cqw, 11px)`; `letter-spacing: 0.04em` |
| `.durak-menu .durak-menu__label` | `width: 100%`; `min-width: 0` |
| `.durak-table` | `gap: 20px` |
| `.durak-deck` | `padding: 10px 8px`; `border: 1px solid rgba(205, 232, 255, 0.22)`; `border-radius: 14px`; `background: var(--liquid-inset-bg)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05)` |
| `.durak-table`<br>@media (max-width: 400px) | `gap: 12px` |
| `.durak-deck`<br>@media (max-width: 400px) | `padding: 8px 6px` |
| `.durak-opponent > img` | `height: calc(40dvh - 50px)` |
| `.durak-deck` | `margin-bottom: clamp(12px, 3dvh, 24px)` |
| `.durak-menu [role='timer'][data-tone='success'] .game-scoreboard__value` | `color: #6fac78` |
| `.durak-menu [role='timer'][data-tone='warning'] .game-scoreboard__value` | `color: #d9ae3d` |
| `.durak-menu [role='timer'][data-tone='danger'] .game-scoreboard__value` | `color: #df6b6b` |
| `.durak-menu .durak-menu__row` | `grid-template-columns: 1.5fr 0.8fr 0.8fr 1.5fr` |
| `.durak-deck__count` | `width: 32px`; `height: 32px`; `border-radius: 50%`; `border: 1px solid rgba(205, 232, 255, 0.46)`; `background: var(--liquid-inset-bg)`; `backdrop-filter: blur(12px) saturate(145%)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18)`; `color: #f8fbff`; `font-weight: 900`; `font-size: 17px` |
| `.durak-menu .durak-menu__row` | `grid-template-columns: 1.5fr 1fr 1.5fr` |
| `.durak-controls` | `grid-template-columns: 44px minmax(0, 1fr) 44px`; `gap: 8px` |
| `.durak-tool.icon-btn` | `color: #f8fbff`; `border: 1px solid rgba(205, 232, 255, 0.46)`; `background: var(--liquid-inset-bg)`; `backdrop-filter: blur(18px) saturate(145%)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18)` |
| `.durak-tool.icon-btn` | `color: rgba(205, 232, 255, 0.46)` |
| `.durak-tool__question` | `font-size: 22px`; `line-height: 1`; `font-weight: 500` |
| `.durak-card` | `height: 126px` |
| `.durak-card img` | `height: 100%`; `width: auto`; `max-width: none` |
| `.durak-card`<br>@media (max-height: 650px) | `height: 96px` |
| `.modal-card .durak-rules-copy` | `font-size: 13px`; `font-weight: 400`; `line-height: 1.6` |
| `.durak-info-modal .modal-title` | `font-size: 15px`; `font-weight: 700` |
| `.bonus-game-launch-modal .durak-scene > img` | `height: 105%` |
| `.durak-opponent > .durak-silhouette` | `height: calc(40dvh - 50px)`; `width: auto` |
| `.durak-screen--online .durak-menu__identity--opponent .user-avatar img` | `width: 100%`; `height: 100%` |
| `.durak-network-error` | `border-radius: 14px`; `padding: 8px 12px`; `background: var(--liquid-inset-bg)`; `color: white`; `font-size: 12px` |
| `.online-durak-search` | `gap: 12px`; `margin-top: 14px` |
| `.online-durak-search > .btn` | `width: 100%` |
| `.online-durak-invite` | `padding: 16px`; `border-radius: 24px`; `margin: 12px 0` |
| `.online-durak-player` | `gap: 10px`; `padding: 12px`; `border-radius: 24px` |
| `.online-durak-player strong` | `min-width: 0` |
| `.online-durak-lobby .section-label` | `margin-top: 20px` |
| `.online-durak-lobby .duel-form-section-info-btn svg` | `color: #fff` |
| `.online-durak-maria` | `width: 100%`; `margin-bottom: 20px` |
| `.online-durak-maria.sections-quick-card--wide`<br>@media (max-width: 360px) | `grid-template-columns: 64px minmax(0, 1fr) 19px`; `gap: 8px` |
| `.online-durak-maria.sections-quick-card--wide .sections-quick-card__art`<br>@media (max-width: 360px) | `width: 64px`; `height: 64px` |
| `.online-durak-maria.sections-quick-card--wide .sections-quick-card__title`<br>@media (max-width: 360px) | `font-size: clamp(14px, 4.5vw, 16px)` |
| `.online-durak-maria.sections-quick-card--wide .sections-quick-card__meta`<br>@media (max-width: 360px) | `font-size: 10px` |
| `.online-durak-invite` | `grid-template-columns: 42px minmax(0, 1fr)`; `column-gap: 10px`; `row-gap: 6px`; `border-radius: 18px`; `padding: 10px 12px`; `min-height: 68px`; `border: 1px solid rgba(255, 255, 255, 0.8)` |
| `.online-durak-invite__identity` | `min-width: 0` |
| `.online-durak-invite__identity .duel-card-opponent-name` | `font-size: 15px`; `font-weight: 900`; `color: var(--ink)` |
| `.online-durak-invite__actions` | `grid-template-columns: 1fr 1fr`; `gap: 8px`; `margin-top: 2px` |
| `.online-durak-invite__actions .btn` | `min-height: 36px`; `font-size: 12px` |
| `.online-durak-search .duel-form-section-title` | `color: rgba(240, 248, 255, 0.86)`; `font-size: 10px`; `font-weight: 700`; `letter-spacing: 0.18em` |
| `.online-durak-lobby .duel-form-section-title` | `margin: -2px 0`; `padding: 2px 32px 2px 8px` |
| `.online-durak-new-title` | `margin-bottom: 8px` |
| `.online-durak-lobby .segmented-tabs[aria-label='Способ встречи']` | `margin-top: 16px` |
| `.durak-room-seats` | `gap: 10px` |
| `.durak-room-seats .online-durak-player` | `min-height: 68px` |
| `.durak-room-seats strong` | `font-size: 14px` |
| `.durak-room-picker` | `gap: 8px`; `max-height: 45dvh`; `margin-top: 12px` |
| `.durak-multi-seats` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 8px`; `max-width: 700px`; `width: 100%`; `margin: 5px auto 10px`; `min-height: calc(max(100dvw * 1.77665, 100dvh + 120px) * 0.35 - 105px)` |
| `.durak-multi-seats[data-count='1']` | `grid-template-columns: minmax(0, 1fr)` |
| `.durak-multi-seats[data-count='2']` | `grid-template-columns: repeat(2, minmax(0, 1fr))` |
| `.durak-multi-seats[data-count='3'], .durak-multi-seats[data-count='5']` | `grid-template-columns: repeat(3, minmax(0, 1fr))` |
| `.durak-multi-seats[data-count='4']` | `grid-template-columns: repeat(4, minmax(0, 1fr))` |
| `.durak-multi-seat` | `gap: 5px`; `padding: 8px 10px`; `min-width: 0`; `border-radius: 18px` |
| `.durak-multi-seat .durak-menu__label` | `font-weight: 800`; `letter-spacing: 0.04em`; `width: 100%`; `max-width: 100%`; `min-width: 0` |
| `.durak-multi-seats[data-count='1'] .durak-multi-seat` | `gap: 8px`; `padding: 12px` |
| `.durak-multi-seats[data-count='1'] .durak-menu__label` | `font-size: 16px` |
| `.durak-multi-seats[data-count='1'] .durak-multi-seat > span` | `font-size: 13px` |
| `.durak-multi-seat > span` | `color: rgba(240, 248, 255, 0.75)` |
| `.durak-multi-seat[data-active='true']` | `border-color: #6fac78` |
| `.durak-screen--multi .durak-menu__label` | `font-size: 11px` |
| `.durak-screen--multi .durak-table` | `min-height: 130px` |
| `.durak-multi-seats`<br>@media (max-height: 650px) | `gap: 4px` |
| `.durak-multi-seat`<br>@media (max-height: 650px) | `padding: 4px 8px` |
| `.durak-screen--multi .durak-table`<br>@media (max-height: 650px) | `min-height: 90px` |
| `.durak-computers` | `grid-template-columns: repeat(4, minmax(0, 1fr))`; `gap: 10px`; `margin: 16px 0 22px` |
| `.durak-computer` | `gap: 5px`; `min-width: 0`; `padding: 0`; `border: 0`; `background: transparent`; `color: #fff`; `font-size: 13px` |
| `.durak-computer__portrait` | `width: 100%`; `border-radius: 50%` |
| `.durak-computer__portrait img` | `border-radius: 50%`; `width: 100%`; `height: 100%` |
| `.durak-screen .durak-menu__identity--opponent .user-avatar img` | `height: 100% !important`; `width: 100% !important` |
| `.durak-computers`<br>@media (max-width: 360px) | `gap: 7px` |
| `.durak-computer`<br>@media (max-width: 360px) | `font-size: 12px` |
| `.durak-actions--grigory .btn` | `min-width: 0`; `padding-inline: 6px`; `font-size: clamp(10px, 3.2vw, 14px)`; `letter-spacing: 0` |
| `.durak-mode-tabs` | `margin-bottom: 18px` |
| `.durak-character` | `gap: 12px`; `max-width: 430px`; `width: 100%`; `height: 100%` |
| `.durak-character__scene` | `min-height: 260px` |
| `.durak-character__nav.icon-btn` | `width: 44px`; `height: 44px`; `color: rgba(255, 255, 255, 0.75)`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.16)`; `backdrop-filter: none`; `box-shadow: none` |
| `.durak-character__identity` | `gap: 12px`; `padding-inline: 4px` |
| `.durak-character__identity h2` | `margin: 0`; `color: white`; `font-size: var(--font-size-xl, 20px)` |
| `.durak-character__pages` | `gap: 2px` |
| `.durak-character__pages button` | `width: 28px`; `height: 28px`; `padding: 0`; `border: 0`; `background: transparent` |
| `.durak-character__pages button::before` | `width: 6px`; `height: 6px`; `border-radius: 50%`; `background: rgba(255, 255, 255, 0.35)` |
| `.durak-character__pages button[aria-pressed='true']::before` | `background: white` |
| `.durak-character__pages button:focus-visible` | `border-radius: 50%` |
| `.online-durak-lobby--panorama` | `max-width: 600px`; `background: var(--liquid-inset-bg)` |
| `.durak-panorama-track` | `width: 500%` |
| `.durak-panorama-background` | `width: 100%`; `height: 100%`; `max-width: none` |
| `.durak-panorama-seat` | `width: 20%` |
| `.durak-panorama-seat > img` | `width: 100%`; `height: 100%` |
| `.durak-panorama-view::after` | `background: linear-gradient(rgba(8, 12, 18, 0.45), transparent 30%, transparent 74%, rgba(8, 12, 18, 0.8))` |
| `.online-durak-lobby--online .durak-panorama-view::after` | `background: rgba(8, 12, 18, 0.4)` |
| `.online-durak-lobby--computer > .bar-content` | `min-height: 0` |
| `.durak-character-panel:not([hidden])` | `min-height: 360px` |
| `.durak-character__composition` | `width: 100%`; `height: 100%` |
| `.durak-screen .user-avatar img` | `width: 100% !important`; `height: 100% !important`; `max-width: 100%` |
| `.durak-screen .durak-ready-panel` | `width: auto`; `padding: 16px` |
| `.durak-ready-panel p` | `margin: 0 0 12px` |
| `.durak-room-lobby .bar-header` | `margin-bottom: 16px` |
| `.durak-room-lobby .bar-content > .section-label` | `margin: 0 0 12px`; `padding: 0 8px` |
| `.durak-room-lobby .profile-logout-btn--danger` | `border: 1px solid rgba(104, 35, 35, 0.34)`; `background: rgba(211, 115, 115, 0.9)`; `color: #34202a`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.34), 0 8px 18px rgba(86, 36, 36, 0.15)` |
| `.durak-multi-seats[data-count='4']` | `grid-template-columns: repeat(2, minmax(0, 1fr))` |
| `.durak-multi-seat .durak-seat-position` | `font-size: 11px`; `color: #d5e5ff` |
| `.durak-multi-seat .durak-seat-position` | `font-size: 18px`; `font-weight: 900`; `line-height: 1` |
| `.durak-multi-seat .user-avatar` | `margin-bottom: 7px`; `border: 1px solid rgba(205, 232, 255, 0.46)` |
| `.durak-multi-seat[data-taking='true']` | `border-color: rgba(211, 115, 115, 0.9)`; `background: linear-gradient(135deg, rgba(125, 45, 45, 0.45), rgba(79, 29, 36, 0.28))` |
| `.durak-menu .durak-menu__row` | `grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 0.7fr)` |
| `.durak-menu__trump-symbol` | `font-size: 24px`; `line-height: 1`; `color: #d5e5ff` |
| `.durak-menu .game-scoreboard__metric:nth-child(3)` | `padding-inline: 10px` |
| `.durak-menu .game-scoreboard__metric:nth-child(3) > .durak-menu__label` | `font-size: 9px` |
| `.durak-menu .durak-menu__trump` | `padding-inline: 8px` |
| `.durak-menu .durak-menu__trump .game-scoreboard__label` | `font-size: 8px` |
| `.durak-menu .durak-menu__trump-symbol` | `font-size: 20px` |

</details>

<details>
<summary>game/challengeFinale.css — 4 элементов и правил</summary>

Источник: [challengeFinale.css](../packages/web/src/game/challengeFinale.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.challenge-result-story` | `margin-bottom: 16px` |
| `.challenge-result-story__artwork` | `width: 100%`; `border: 1px solid rgba(255, 255, 255, 0.8)`; `border-radius: 20px`; `background: #7396a9`; `margin-bottom: 14px` |
| `.challenge-result-story__image` | `width: 100%`; `height: 100%` |
| `.challenge-result-story .modal-copy` | `margin: 0` |

</details>

<details>
<summary>game/fight/fight.css — 84 элементов и правил</summary>

Источник: [fight.css](../packages/web/src/game/fight/fight.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.duel-fight-screen` | `color: var(--ink, #18334c)`; `background: radial-gradient(ellipse at 50% 60%, #f4faff 0%, #dbeaf7 52%, #acc9e2 100%)`; `padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom)` |
| `.duel-fight-back.icon-btn` | `font-size: 28px` |
| `.fight-scene` | `width: 100%`; `max-width: 430px`; `margin: auto` |
| `.fight-scoreboard` | `margin: 0 28px`; `min-height: 54px` |
| `.fight-health__name` | `font-size: 12px`; `font-weight: 600` |
| `.fight-health__pips` | `gap: 5px`; `margin-top: 7px` |
| `.fight-health__pips i` | `width: 20px`; `height: 5px`; `border-radius: 5px`; `background: rgba(24, 51, 76, 0.13)` |
| `.fight-health__pips i.is-filled` | `background: #3b789e` |
| `.fight-health--1 .fight-health__pips i.is-filled` | `background: #b96562` |
| `.fight-timer strong` | `font-size: 26px`; `line-height: 1`; `font-weight: 650` |
| `.fight-timer small` | `font-size: 10px`; `margin-top: 5px` |
| `.fight-arena` | `height: min(52dvh, 360px)`; `min-height: 240px` |
| `.fight-notice, .fight-connection` | `font-size: 12px`; `margin: 8px 20px` |
| `.modal-card.duel-fight-card` | `width: min(100%, 480px)`; `padding: 14px 12px 16px`; `height: 90dvh`; `max-height: calc(100dvh - 40px - var(--app-safe-top) - var(--app-safe-bottom))` |
| `.duel-fight-card > div` | `margin-top: 0 !important`; `min-height: 0` |
| `.fight-scoreboard.game-scoreboard` | `margin: 0`; `min-height: 0` |
| `.fight-scoreboard__row` | `grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr)`; `min-height: 88px` |
| `.fight-scoreboard .fight-health` | `min-width: 0` |
| `.fight-scoreboard .fight-health__name` | `width: 100%` |
| `.fight-scoreboard .fight-health__pips` | `margin-top: 1px` |
| `.fight-scoreboard .fight-health__pips i` | `width: 14px`; `height: 4px`; `background: rgba(205, 232, 255, 0.2)` |
| `.fight-scoreboard .fight-health__pips i.is-filled` | `background: #edf8ff`; `box-shadow: 0 0 5px rgba(167, 220, 255, 0.28)` |
| `.fight-scoreboard .fight-timer strong` | `font-weight: 900` |
| `.fight-scoreboard .fight-timer small` | `font-size: 9px`; `margin-top: 0` |
| `.duel-fight-card .fight-scene` | `min-height: 0`; `margin: 0 auto` |
| `.fight-stage` | `min-height: 0` |
| `.duel-fight-card .fight-scoreboard` | `width: calc(100% - 24px)` |
| `.duel-fight-card .fight-arena` | `height: auto`; `min-height: 120px`; `background: #a8bbd0 url('/sprites/fight/amateur-fight-background-v1.png') center / cover no-repeat`; `border-radius: 18px` |
| `.fight-actions` | `grid-template-columns: repeat(2, minmax(0, 1fr))`; `gap: 10px`; `padding-top: 12px` |
| `.fight-action.btn.btn--cta` | `width: 100%`; `min-height: 58px`; `padding: 0 8px`; `letter-spacing: 0.06em`; `font-size: 13px` |
| `.duel-fight-card .fight-connection` | `margin: 0` |
| `.duel-fight-card .fight-offer .modal-title` | `font-size: 18px` |
| `.fight-feedback` | `width: 58px`; `height: 58px`; `color: #fbd475` |
| `.fight-feedback--hit` | `color: #ef7771` |
| `.fight-feedback--guard` | `color: #7dcaff` |
| `.fight-feedback--blocked` | `color: #f6ce87` |
| `.fight-feedback > span` | `border: 2px solid currentColor`; `border-radius: 50%`; `background: radial-gradient(circle, currentColor, transparent 65%)` |
| `.fight-feedback--guard > span` | `border-radius: 45% 45% 55% 55%` |
| `.fight-feedback > i` | `width: 3px`; `height: 12px`; `border-radius: 2px`; `background: currentColor` |
| `.fight-challenge__timer` | `height: 31px`; `min-width: 31px`; `padding: 0 7px`; `border-radius: 999px`; `background: rgba(255, 255, 255, .76)`; `border: 1px solid rgba(255, 255, 255, .82)`; `font-size: 17px`; `font-weight: 700` |
| `.fight-challenge__error` | `width: 180px`; `font-size: 12px` |
| `.modal-card.fight-result-card` | `width: min(calc(100vw - 48px), 300px)`; `padding: 20px` |
| `.fight-result-card .modal-title` | `font-size: 22px` |
| `.fight-result-rewards` | `gap: 20px`; `margin: 12px 0 0`; `font-size: 17px`; `font-weight: 600` |
| `.fight-challenge__label` | `min-width: max-content`; `color: var(--liquid-ink)`; `font-size: 9.5px`; `font-weight: 950`; `line-height: 1`; `letter-spacing: 0` |
| `.fight-movement` | `grid-template-columns: repeat(2,minmax(0,1fr))`; `gap: 10px`; `padding-top: 8px` |
| `.fight-move.btn.btn--cta` | `min-height: 38px`; `padding: 0`; `font-size: 26px` |
| `.fight-move[aria-pressed="true"]` | `background: #386589` |
| `.fight-action__progress` | `width: var(--fight-ready)`; `height: 4px`; `background: #b8e7ff` |
| `.fight-action.is-in-range:not(:disabled)` | `border-color: #b8e7ff` |
| `.fight-challenge__count` | `min-width: 15px`; `height: 15px`; `padding: 0 3px`; `border-radius: 999px`; `color: var(--liquid-ink)`; `background: var(--liquid-selected-bg)`; `border: 1px solid rgba(255,255,255,.95)`; `font-size: 9.5px`; `font-weight: 950`; `line-height: 1` |
| `.modal-card.fight-medical-card` | `width: min(100%, 480px)`; `height: auto`; `max-height: 90dvh` |
| `.fight-medical-art` | `width: 100%`; `margin: 14px 0 0`; `border-radius: 18px` |
| `.fight-medical-art img` | `width: 100%`; `height: 100%` |
| `.fight-medical-timer.game-scoreboard` | `width: 112px`; `height: 112px` |
| `.fight-medical-timer .game-scoreboard__value` | `font-size: 72px` |
| `.fight-responsive-controls` | `grid-template-columns: 1fr 1fr`; `gap: 20px`; `padding-top: 12px` |
| `.fight-control-left` | `grid-template-columns: 1fr 1fr`; `gap: 8px` |
| `.fight-control-right` | `grid-template-columns: 1fr 1fr`; `gap: 8px` |
| `.fight-held.btn.btn--cta` | `width: 100%`; `min-height: 0`; `border-radius: 50%`; `padding: 0`; `font-size: 13px` |
| `.fight-control-left .fight-held.btn.btn--cta` | `width: min(100%,54px)`; `font-size: 27px` |
| `.fight-control-right .fight-held` | `max-width: 88px` |
| `.fight-held.btn.btn--cta[aria-pressed="true"]` | `background: rgba(94,157,196,.82)`; `border-color: rgba(202,237,255,.9)` |
| `.fight-guard-pips` | `gap: 4px`; `margin-top: 4px` |
| `.fight-guard-pips i` | `width: 10px`; `height: 3px`; `border-radius: 2px`; `background: rgba(255,255,255,.22)` |
| `.fight-guard-pips i.is-filled` | `background: #a8dbf3` |
| `.fight-scene--responsive .fight-health__pips i` | `box-shadow: none` |
| `.fight-responsive-controls`<br>@media (max-width:360px) | `gap: 12px` |
| `.fight-guard-reserve` | `gap: 4px`; `margin-top: 5px`; `color: #a8dbf3`; `font-size: 12px`; `line-height: 14px`; `font-weight: 700` |
| `.fight-guard-reserve.is-empty` | `color: #ff9b91` |
| `.fight-scene--responsive .fight-health` | `min-width: 0` |
| `.fight-player-identity` | `gap: 6px`; `width: 100%`; `min-width: 0` |
| `.fight-player-identity .fight-health__name` | `min-width: 0`; `margin: 0` |
| `.fight-reserve` | `gap: 4px`; `margin-top: 5px` |
| `.fight-reserve--health` | `color: #ff858c` |
| `.fight-reserve--guard` | `color: #a8dbf3` |
| `.fight-responsive-flash` | `width: 38px`; `height: 38px`; `background: #ffd47c` |
| `.fight-responsive-flash[data-kind="guard"]` | `background: #8bd9ff` |
| `.fight-scene--responsive .fight-reserve` | `width: 100%` |
| `.fight-scene--responsive .fight-reserve` | `gap: 2px` |
| `.fight-scene--responsive .fight-health` | `gap: 3px` |
| `.fight-scene--responsive .fight-reserve` | `width: min(100%,116px)`; `margin-top: 0`; `gap: 4px` |
| `.fight-scene--responsive .fight-reserve > span` | `width: calc((100% - 16px) / 5)` |
| `.fight-scene--responsive .fight-reserve svg` | `width: 100%`; `height: auto` |

</details>

<details>
<summary>onboarding/onboarding.css — 53 элементов и правил</summary>

Источник: [onboarding.css](../packages/web/src/onboarding/onboarding.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.onboarding-flow` | `width: min(100%, 430px)`; `height: var(--app-viewport-height, 100dvh)`; `max-height: var(--app-viewport-height, 100dvh)`; `margin: 0 auto`; `padding: calc(var(--app-safe-top) + 20px) 20px calc(var(--app-safe-bottom) + 20px)`; `color: #f4f8ff`; `background: radial-gradient(ellipse at 82% 8%, rgba(225, 168, 91, 0.13) 0%, transparent 30%), radial-gradient(ellipse at 18% 58%, rgba(67, 133, 202, 0.2) 0%, transparent 42%), radial-gradient(ellipse at 54% 104%, rgba(76, 151, 224, 0.22) 0%, transparent 46%), repeating-linear-gradient( 118deg, rgba(255, 255, 255, 0.012) 0, rgba(255, 255, 255, 0.012) 1px, transparent 1px, transparent 11px ), linear-gradient(165deg, #14253b 0%, #0b192c 42%, #061323 72%, #07101c 100%)` |
| `.beginner-story` | `width: 100%`; `height: var(--app-viewport-height, 100dvh)`; `color: #f7f8fb`; `background: #081426` |
| `.beginner-story__media, .beginner-story__image, .beginner-story__shade` | `width: 100%`; `height: 100%` |
| `.beginner-story__headlights` | `width: 100%`; `height: 100%` |
| `.beginner-story__shade` | `background: linear-gradient(to bottom, transparent 42%, rgba(3, 9, 18, 0.38) 58%, rgba(3, 9, 18, 0.86) 74%, rgba(3, 9, 18, 0.97))` |
| `.beginner-story__copy p` | `max-width: 336px`; `margin: 0`; `color: rgba(248, 250, 253, 0.94)`; `font-size: 20px`; `font-weight: 540`; `line-height: 1.48`; `letter-spacing: -0.015em` |
| `.beginner-story__dialogue` | `color: #86aeda`; `font-weight: 650` |
| `.beginner-story__narration` | `color: rgba(248, 250, 253, 0.94)`; `font-weight: 540` |
| `.beginner-story__dialogue--player` | `color: rgba(248, 250, 253, 0.94)` |
| `.beginner-story__threshold` | `color: #f6f8fc`; `font-size: 42px`; `font-weight: 800`; `letter-spacing: 0.03em`; `line-height: 1` |
| `.beginner-story__cta` | `min-height: 54px`; `padding: 0 19px`; `color: #fff`; `font-size: 17px`; `font-weight: 650`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.3)`; `border-radius: 16px`; `backdrop-filter: blur(14px)` |
| `.amateur-story__loading` | `color: rgba(248, 250, 253, 0.94)`; `font-size: 14px`; `line-height: 1.35` |
| `.story-replay__nav` | `width: 44px`; `height: 44px`; `color: rgba(255, 255, 255, 0.75)`; `background: var(--liquid-inset-bg)`; `border-color: rgba(255, 255, 255, 0.16)` |
| `.beginner-story__completion-error` | `gap: 12px`; `padding: 12px 14px`; `color: #fff`; `font-size: 14px`; `line-height: 1.35`; `background: rgba(102, 25, 31, 0.92)`; `border: 1px solid rgba(255, 185, 190, 0.45)`; `border-radius: 14px`; `backdrop-filter: blur(14px)` |
| `.beginner-story__completion-error button` | `padding: 8px 10px`; `color: #fff`; `font-weight: 700`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.35)`; `border-radius: 10px` |
| `.beginner-story__close` | `color: #fff`; `background: var(--liquid-inset-bg)`; `border-color: rgba(255, 255, 255, 0.28)`; `backdrop-filter: blur(12px)` |
| `.beginner-story--shot .onboarding-tutorial, .beginner-story--shot .onboarding-tutorial__rink, .beginner-story--shot .play-screen` | `width: 100%`; `height: 100%` |
| `.onboarding-flow__progress` | `color: rgba(218, 231, 247, 0.72)`; `font-size: 14px`; `font-weight: 700`; `letter-spacing: 0.04em` |
| `.onboarding-flow__content` | `min-height: 0`; `gap: 24px`; `padding: 20px 0` |
| `.onboarding-flow__image, .onboarding-flow__image-fallback, .onboarding-flow__tutorial-placeholder` | `width: 100%`; `max-height: min(42vh, 360px)`; `border-radius: var(--r-xl)`; `border: 1px solid rgba(211, 230, 250, 0.34)`; `box-shadow: 0 18px 46px rgba(0, 5, 14, 0.38)` |
| `.onboarding-flow__image-fallback, .onboarding-flow__tutorial-placeholder` | `padding: 24px`; `color: rgba(218, 231, 247, 0.74)`; `background: var(--glass-bg)`; `backdrop-filter: var(--blur-md)` |
| `.onboarding-flow__copy h1` | `margin: 0`; `font-size: clamp(29px, 7vw, 35px)`; `font-weight: 780`; `letter-spacing: -0.032em`; `line-height: 1.06` |
| `.onboarding-flow__copy p` | `margin: 12px 0 0`; `color: rgba(218, 231, 247, 0.78)`; `font-size: 16px`; `font-weight: 450`; `letter-spacing: -0.006em`; `line-height: 1.46` |
| `.onboarding-flow__speech` | `margin: 16px 0 0`; `padding: 14px 16px`; `border: 1px solid rgba(214, 236, 255, 0.28)`; `border-radius: 0 18px 18px 0`; `color: #f4f8ff`; `background: linear-gradient(180deg, rgba(255, 255, 255, 0.13), rgba(126, 177, 224, 0.045) 42%, rgba(8, 30, 53, 0.16)), rgba(122, 169, 213, 0.08)`; `backdrop-filter: blur(18px) saturate(135%)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), inset 4px 0 12px rgba(109, 183, 247, 0.1), 0 12px 30px rgba(0, 7, 19, 0.2)`; `font-size: 17px`; `font-weight: 550`; `letter-spacing: -0.008em`; `line-height: 1.46` |
| `.onboarding-flow__footer` | `gap: 12px`; `padding-top: 12px`; `background: var(--liquid-card-bg)` |
| `.onboarding-flow__actions` | `gap: 12px` |
| `.onboarding-flow__actions .btn--cta` | `color: var(--liquid-ink)`; `background: linear-gradient(180deg, rgba(255, 255, 255, 0.7), rgba(235, 247, 255, 0.2) 38%, rgba(111, 165, 214, 0.2) 100%), rgba(207, 230, 250, 0.76)`; `backdrop-filter: blur(16px) saturate(145%)`; `border-color: rgba(239, 248, 255, 0.82)`; `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), inset 0 -10px 22px rgba(45, 101, 153, 0.16), 0 15px 34px rgba(0, 7, 20, 0.4), 0 0 0 1px rgba(108, 170, 224, 0.18)` |
| `.onboarding-flow__error` | `gap: 10px`; `color: var(--red-deep)`; `font-size: 14px` |
| `.onboarding-flow__error .btn` | `padding: 10px 16px`; `font-size: 14px` |
| `.onboarding-flow__status` | `gap: 18px`; `color: var(--muted)` |
| `.onboarding-flow--startup` | `width: 100%`; `max-width: none`; `background: radial-gradient(ellipse at 68% 12%, rgba(59, 130, 246, 0.2), transparent 36%), radial-gradient(ellipse at 26% 88%, rgba(23, 79, 138, 0.24), transparent 42%), linear-gradient(165deg, #102137 0%, #08182b 52%, #050d18 100%)` |
| `.onboarding-flow__startup` | `gap: 18px`; `color: rgba(238, 246, 255, 0.82)`; `font-size: 16px`; `font-weight: 650`; `letter-spacing: -0.01em` |
| `.onboarding-flow__startup p` | `gap: 4px`; `margin: 0` |
| `.onboarding-tutorial` | `gap: 16px`; `min-height: 0` |
| `.onboarding-tutorial__instruction` | `margin: 0`; `font-weight: 800` |
| `.onboarding-tutorial__rink` | `width: 100%`; `min-height: 420px`; `border-radius: var(--r-xl)` |
| `.onboarding-tutorial--playing` | `background: var(--liquid-card-bg)` |
| `.onboarding-tutorial--playing .onboarding-tutorial__rink` | `min-height: 0`; `border-radius: 0` |
| `.onboarding-tutorial__rink > main` | `min-height: 420px`; `height: 70vh` |
| `.onboarding-tutorial--playing .onboarding-tutorial__rink > main` | `height: auto`; `min-height: 0` |
| `.onboarding-flow__tutorial-status` | `gap: 16px`; `min-height: 320px` |
| `.onboarding-flow__speech`<br>@media (prefers-reduced-transparency: reduce) | `background: var(--liquid-card-bg)`; `backdrop-filter: none` |
| `.onboarding-flow__actions .btn--cta`<br>@media (prefers-reduced-transparency: reduce) | `background: var(--liquid-selected-bg)`; `backdrop-filter: none` |
| `.onboarding-flow__speech`<br>@media (prefers-contrast: more) | `color: #ffffff`; `background: var(--liquid-card-bg)`; `border-color: #d9eeff` |
| `.onboarding-flow__actions .btn--cta`<br>@media (prefers-contrast: more) | `color: var(--liquid-ink)`; `background: var(--liquid-selected-bg)`; `border-color: #ffffff` |
| `.beginner-story__snow i` | `border-radius: 50%`; `background: rgba(240, 247, 255, 0.65)` |
| `.amateur-story .beginner-story__copy p`<br>@media (max-height: 650px) | `font-size: 18px`; `line-height: 1.4` |
| `.amateur-story .beginner-story__shade`<br>@media (max-height: 650px) | `background: linear-gradient(to bottom, transparent 12%, rgba(3, 9, 18, 0.55) 36%, rgba(3, 9, 18, 0.86) 66%, rgba(3, 9, 18, 0.97))` |
| `.amateur-story--long-copy .beginner-story__copy::before` | `background: linear-gradient(to bottom, transparent, rgba(3, 9, 18, 0.64) 16%, rgba(3, 9, 18, 0.88) 68%, rgba(3, 9, 18, 0.96))` |
| `.story-progress` | `gap: 6px` |
| `.story-progress__dot` | `width: 6px`; `height: 6px`; `border-radius: 50%`; `background: rgba(255, 255, 255, 0.35)`; `box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4)` |
| `.story-progress__dot--active` | `background: #fff` |
| `.beginner-story__close.icon-btn, .story-replay__nav.icon-btn` | `width: 44px`; `height: 44px`; `color: rgba(255, 255, 255, 0.75)`; `background: var(--liquid-inset-bg)`; `border: 1px solid rgba(255, 255, 255, 0.16)`; `backdrop-filter: none`; `box-shadow: none` |

</details>

<details>
<summary>screens/MarksmanshipConstructorScreen.css — 44 элементов и правил</summary>

Источник: [MarksmanshipConstructorScreen.css](../packages/web/src/screens/MarksmanshipConstructorScreen.css).

| Элемент / состояние | Размеры, текст и оформление |
| --- | --- |
| `.marksmanship-constructor-screen` | `min-height: 100dvh`; `gap: 12px`; `padding: max(12px, env(safe-area-inset-top)) 14px max(24px, env(safe-area-inset-bottom))`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-ink)` |
| `.marksmanship-constructor-header` | `width: min(100%, 760px)` |
| `.marksmanship-constructor-header .page-header-standard__title` | `font-size: clamp(19px, 5vw, 24px)` |
| `.marksmanship-replay-tabs` | `grid-template-columns: repeat(3, minmax(0, 1fr))`; `gap: 6px`; `width: min(100%, 760px)` |
| `.marksmanship-replay-tabs button` | `min-width: 0`; `min-height: 44px`; `padding: 8px 5px`; `border: 1px solid #aabfd2`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-ink)`; `font-size: clamp(11px, 2.6vw, 15px)`; `font-weight: 800` |
| `.marksmanship-replay-tabs button[aria-selected='true']` | `border-color: #1e3a5f`; `background: var(--liquid-selected-bg)`; `color: #fff` |
| `.marksmanship-constructor-playback button` | `width: 100%`; `min-height: 50px`; `background: var(--liquid-inset-bg)`; `color: #fff !important` |
| `.marksmanship-replay-note` | `margin: 0`; `color: var(--liquid-muted)`; `font-size: 12px`; `line-height: 1.4` |
| `.marksmanship-constructor-court-wrap` | `width: min(100%, 760px)`; `border: 3px solid #1e3a5f`; `border-radius: 36px`; `background: #eaf1f8` |
| `.marksmanship-constructor-result` | `width: max-content`; `max-width: min(420px, calc(100% - 40px))`; `padding: clamp(14px, 2vmin, 18px) clamp(24px, 5vmin, 36px)`; `border-radius: 24px`; `border: 1.5px solid rgba(255, 255, 255, 0.86)`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 0 0 2px var(--result-glow-soft), 0 0 34px var(--result-glow), 0 0 86px var(--result-glow-soft), 0 22px 58px rgba(15, 23, 42, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.38)`; `backdrop-filter: blur(18px) saturate(115%)` |
| `.marksmanship-constructor-result__top` | `font-weight: 900`; `font-size: clamp(38px, 6vmin, 58px)`; `line-height: 1`; `letter-spacing: 0.06em`; `color: var(--liquid-ink)` |
| `.marksmanship-constructor-controls` | `gap: 10px`; `width: min(100%, 760px)` |
| `.marksmanship-constructor-row` | `gap: 8px` |
| `.marksmanship-constructor-primary-controls > *` | `min-width: 0` |
| `.marksmanship-constructor-primary-controls` | `width: min(100%, 760px)` |
| `:is(.marksmanship-constructor-controls, .marksmanship-constructor-primary-controls) button, :is(.marksmanship-constructor-controls, .marksmanship-constructor-primary-controls) select, .marksmanship-constructor-controls input[type='number']` | `min-height: 44px`; `padding: 8px 12px`; `border: 1px solid rgba(255, 255, 255, 0.86)`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 4px 12px rgba(15, 42, 71, 0.12)`; `color: var(--liquid-ink)`; `font-weight: 800` |
| `.marksmanship-constructor-primary-controls button[aria-pressed='true']` | `background: var(--liquid-inset-bg)`; `color: #fff` |
| `.marksmanship-constructor-controls label` | `gap: 5px`; `font-weight: 800` |
| `.marksmanship-constructor-steps .marksmanship-constructor-step` | `min-width: 112px`; `min-height: 56px`; `font-size: 28px`; `line-height: 1` |
| `.marksmanship-constructor-step-input` | `gap: 3px !important`; `font-size: 12px` |
| `.marksmanship-constructor-step-input input` | `width: 86px`; `min-height: 40px !important` |
| `.marksmanship-constructor-time` | `grid-template-columns: minmax(0, 1fr)`; `gap: 6px`; `width: 100%` |
| `.marksmanship-constructor-time__heading` | `width: 100%`; `font-weight: 800` |
| `.marksmanship-constructor-time input` | `width: 100%`; `min-height: 28px`; `margin: 0` |
| `.marksmanship-constructor-details` | `gap: 8px`; `padding: 14px`; `border: 1px solid rgba(255, 255, 255, 0.86)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 24px rgba(15, 42, 71, 0.1)` |
| `.marksmanship-constructor-details__grid` | `gap: 6px`; `font-size: 13px` |
| `.marksmanship-constructor-detail-label` | `color: var(--liquid-ink)`; `font-weight: 900` |
| `.marksmanship-constructor-points-row` | `font-size: clamp(20px, 3.2vw, 26px)`; `line-height: 1.2` |
| `.marksmanship-constructor-points` | `color: #176036`; `font-weight: 900` |
| `.marksmanship-constructor-episodes` | `padding: 14px`; `border: 1px solid rgba(255, 255, 255, 0.86)`; `border-radius: 18px`; `background: var(--liquid-inset-bg)`; `box-shadow: 0 8px 24px rgba(15, 42, 71, 0.1)` |
| `.marksmanship-constructor-episodes h2` | `margin: 0 0 12px`; `font-size: 20px` |
| `.marksmanship-constructor-episodes select` | `width: 100%`; `min-height: 44px`; `margin-bottom: 12px`; `padding: 8px 12px`; `border: 1px solid #c8d9e8`; `border-radius: 12px`; `background: var(--liquid-inset-bg)`; `color: var(--liquid-ink)`; `font-weight: 800` |
| `.marksmanship-constructor-episodes ol` | `gap: 10px`; `padding: 0`; `margin: 0` |
| `.marksmanship-constructor-episodes li` | `gap: 10px`; `padding: 9px 12px`; `border: 1px solid #c8d9e8`; `border-radius: 12px`; `background: var(--liquid-inset-bg)` |
| `.marksmanship-constructor-episodes__copy` | `min-width: 0`; `font-size: 13px`; `line-height: 1.25` |
| `.marksmanship-constructor-episodes li p` | `margin: 3px 0 0` |
| `.marksmanship-constructor-episodes li button` | `width: 44px`; `min-height: 44px`; `padding: 0`; `border-radius: 50%` |
| `.marksmanship-constructor-screen`<br>@media (max-width: 430px) | `padding-inline: 8px`; `gap: 8px` |
| `.marksmanship-constructor-court-wrap`<br>@media (max-width: 430px) | `border-radius: 22px` |
| `.marksmanship-constructor-controls`<br>@media (max-width: 430px) | `gap: 8px` |
| `.marksmanship-constructor-row`<br>@media (max-width: 430px) | `gap: 5px` |
| `:is(.marksmanship-constructor-controls, .marksmanship-constructor-primary-controls) button, .marksmanship-constructor-primary-controls select, .marksmanship-constructor-controls input[type='number']`<br>@media (max-width: 430px) | `padding-inline: 8px`; `font-size: 12px` |
| `.marksmanship-constructor-controls label`<br>@media (max-width: 430px) | `font-size: 12px` |
| `.marksmanship-constructor-steps .marksmanship-constructor-step`<br>@media (max-width: 430px) | `min-width: 96px` |

</details>

## Локальные размеры React-компонентов

Часть компонентов задаёт геометрию через `style`. Для них ниже указаны декларации размера и формы по исходному компоненту. Цвета материала берутся из `--liquid-*`; условные размеры и состояния сохраняют выражения из кода. Компоненты с одинаковым именем в разных файлах различаются путём.

<details>
<summary>achievements/AchievementStageDetails.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `formatNumber` | [66](../packages/web/src/achievements/AchievementStageDetails.tsx#L66) | `style={{ width: &#96;${progressPercent}%&#96; }}` |

</details>

<details>
<summary>admin/AdminScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `adminInventoryHintStyle` | [637](../packages/web/src/admin/AdminScreen.tsx#L637) | `fontSize: 9.5,` |
| `adminInventoryHintStyle` | [638](../packages/web/src/admin/AdminScreen.tsx#L638) | `fontWeight: 500,` |
| `adminInventoryHintStyle` | [639](../packages/web/src/admin/AdminScreen.tsx#L639) | `lineHeight: 1.18,` |
| `adminInventoryFieldBodyStyle` | [645](../packages/web/src/admin/AdminScreen.tsx#L645) | `gap: 6,` |
| `AdminPlainState` | [668](../packages/web/src/admin/AdminScreen.tsx#L668) | `padding: '8px 2px',` |
| `AdminPlainState` | [670](../packages/web/src/admin/AdminScreen.tsx#L670) | `fontSize: 14,` |
| `AdminPlainState` | [671](../packages/web/src/admin/AdminScreen.tsx#L671) | `fontWeight: 800,` |
| `AdminPlainState` | [672](../packages/web/src/admin/AdminScreen.tsx#L672) | `lineHeight: 1.35,` |
| `AdminMetric` | [683](../packages/web/src/admin/AdminScreen.tsx#L683) | `<div className="glass" style={{ borderRadius: 16, padding: 10, boxShadow: 'none' }}>` |
| `AdminMetric` | [684](../packages/web/src/admin/AdminScreen.tsx#L684) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>{label}</div>` |
| `AdminMetric` | [685](../packages/web/src/admin/AdminScreen.tsx#L685) | `<div style={{ marginTop: 3, color: 'var(--ink)', fontSize: 17, fontWeight: 950 }}>` |
| `resetPaymentFilters` | [936](../packages/web/src/admin/AdminScreen.tsx#L936) | `<main className="screen" style={{ padding: 'calc(22px + var(--app-safe-top)) 14px' }}>` |
| `resetPaymentFilters` | [937](../packages/web/src/admin/AdminScreen.tsx#L937) | `<section style={{ padding: '10px 2px' }}>` |
| `resetPaymentFilters` | [938](../packages/web/src/admin/AdminScreen.tsx#L938) | `<div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)' }}>Нет доступа</div>` |
| `resetPaymentFilters` | [939](../packages/web/src/admin/AdminScreen.tsx#L939) | `<div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>` |
| `resetPaymentFilters` | [951](../packages/web/src/admin/AdminScreen.tsx#L951) | `height: '100%',` |
| `resetPaymentFilters` | [952](../packages/web/src/admin/AdminScreen.tsx#L952) | `minHeight: 0,` |
| `resetPaymentFilters` | [954](../packages/web/src/admin/AdminScreen.tsx#L954) | `padding: 'calc(14px + var(--app-safe-top)) 14px 18px',` |
| `resetPaymentFilters` | [955](../packages/web/src/admin/AdminScreen.tsx#L955) | `gap: 12,` |
| `header` | [1256](../packages/web/src/admin/AdminScreen.tsx#L1256) | `gridTemplateColumns: 'minmax(0, 1fr) 126px',` |
| `header` | [1257](../packages/web/src/admin/AdminScreen.tsx#L1257) | `gap: 8,` |
| `DashboardHero` | [1341](../packages/web/src/admin/AdminScreen.tsx#L1341) | `borderRadius: 22,` |
| `DashboardHero` | [1342](../packages/web/src/admin/AdminScreen.tsx#L1342) | `padding: 14,` |
| `DashboardHero` | [1344](../packages/web/src/admin/AdminScreen.tsx#L1344) | `gap: 12,` |
| `DashboardHero` | [1350](../packages/web/src/admin/AdminScreen.tsx#L1350) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `DashboardHero` | [1351](../packages/web/src/admin/AdminScreen.tsx#L1351) | `gap: 10,` |
| `DashboardHero` | [1355](../packages/web/src/admin/AdminScreen.tsx#L1355) | `<div style={{ minWidth: 0 }}>` |
| `DashboardHero` | [1356](../packages/web/src/admin/AdminScreen.tsx#L1356) | `<div style={{ color: 'var(--ink)', fontSize: 19, fontWeight: 950 }}>Ультимейт Хоккей</div>` |
| `DashboardHero` | [1357](../packages/web/src/admin/AdminScreen.tsx#L1357) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontWeight: 750 }}>` |
| `DashboardHero` | [1366](../packages/web/src/admin/AdminScreen.tsx#L1366) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `DashboardHero` | [1367](../packages/web/src/admin/AdminScreen.tsx#L1367) | `gap: 8,` |
| `DashboardMiniStat` | [1403](../packages/web/src/admin/AdminScreen.tsx#L1403) | `borderRadius: 16,` |
| `DashboardMiniStat` | [1404](../packages/web/src/admin/AdminScreen.tsx#L1404) | `padding: '10px 9px',` |
| `DashboardMiniStat` | [1406](../packages/web/src/admin/AdminScreen.tsx#L1406) | `minWidth: 0,` |
| `DashboardMiniStat` | [1412](../packages/web/src/admin/AdminScreen.tsx#L1412) | `fontSize: 10,` |
| `DashboardMiniStat` | [1413](../packages/web/src/admin/AdminScreen.tsx#L1413) | `fontWeight: 850,` |
| `DashboardMiniStat` | [1425](../packages/web/src/admin/AdminScreen.tsx#L1425) | `fontSize: 17,` |
| `DashboardMiniStat` | [1426](../packages/web/src/admin/AdminScreen.tsx#L1426) | `fontWeight: 950,` |
| `DashboardMiniStat` | [1438](../packages/web/src/admin/AdminScreen.tsx#L1438) | `fontSize: 10,` |
| `DashboardMiniStat` | [1439](../packages/web/src/admin/AdminScreen.tsx#L1439) | `fontWeight: 750,` |
| `DashboardMetricGrid` | [1514](../packages/web/src/admin/AdminScreen.tsx#L1514) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `DashboardMetricGrid` | [1515](../packages/web/src/admin/AdminScreen.tsx#L1515) | `gap: 8,` |
| `DashboardMetricCard` | [1538](../packages/web/src/admin/AdminScreen.tsx#L1538) | `borderRadius: 18,` |
| `DashboardMetricCard` | [1539](../packages/web/src/admin/AdminScreen.tsx#L1539) | `padding: 12,` |
| `DashboardMetricCard` | [1540](../packages/web/src/admin/AdminScreen.tsx#L1540) | `minHeight: 96,` |
| `DashboardMetricCard` | [1544](../packages/web/src/admin/AdminScreen.tsx#L1544) | `minWidth: 0,` |
| `DashboardMetricCard` | [1550](../packages/web/src/admin/AdminScreen.tsx#L1550) | `fontSize: 23,` |
| `DashboardMetricCard` | [1551](../packages/web/src/admin/AdminScreen.tsx#L1551) | `lineHeight: 1,` |
| `DashboardMetricCard` | [1552](../packages/web/src/admin/AdminScreen.tsx#L1552) | `fontWeight: 950,` |
| `DashboardMetricCard` | [1561](../packages/web/src/admin/AdminScreen.tsx#L1561) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 850 }}>{label}</div>` |
| `DashboardMetricCard` | [1566](../packages/web/src/admin/AdminScreen.tsx#L1566) | `fontSize: 11,` |
| `DashboardMetricCard` | [1567](../packages/web/src/admin/AdminScreen.tsx#L1567) | `fontWeight: 750,` |
| `DashboardMetricCard` | [1568](../packages/web/src/admin/AdminScreen.tsx#L1568) | `lineHeight: 1.25,` |
| `DashboardChartCard` | [1602](../packages/web/src/admin/AdminScreen.tsx#L1602) | `<section className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>` |
| `DashboardChartCard` | [1604](../packages/web/src/admin/AdminScreen.tsx#L1604) | `<div style={{ minWidth: 0 }}>` |
| `DashboardChartCard` | [1605](../packages/web/src/admin/AdminScreen.tsx#L1605) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>{title}</div>` |
| `DashboardChartCard` | [1606](../packages/web/src/admin/AdminScreen.tsx#L1606) | `<div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>` |
| `DashboardChartCard` | [1610](../packages/web/src/admin/AdminScreen.tsx#L1610) | `<span className="pill" style={{ fontSize: 11 }}>` |
| `DashboardChartCard` | [1627](../packages/web/src/admin/AdminScreen.tsx#L1627) | `fontSize: 10,` |
| `DashboardChartCard` | [1628](../packages/web/src/admin/AdminScreen.tsx#L1628) | `fontWeight: 750,` |
| `handlePointer` | [1722](../packages/web/src/admin/AdminScreen.tsx#L1722) | `style={{ width: '100%', height: 154, display: 'block', touchAction: 'none' }}` |
| `UsersPanel` | [1896](../packages/web/src/admin/AdminScreen.tsx#L1896) | `borderRadius: 999,` |
| `UsersPanel` | [1897](../packages/web/src/admin/AdminScreen.tsx#L1897) | `padding: '0 14px',` |
| `UsersPanel` | [1898](../packages/web/src/admin/AdminScreen.tsx#L1898) | `height: 46,` |
| `UsersPanel` | [1899](../packages/web/src/admin/AdminScreen.tsx#L1899) | `minHeight: 46,` |
| `UsersPanel` | [1902](../packages/web/src/admin/AdminScreen.tsx#L1902) | `gap: 10,` |
| `UsersPanel` | [1914](../packages/web/src/admin/AdminScreen.tsx#L1914) | `minWidth: 0,` |
| `UsersPanel` | [1915](../packages/web/src/admin/AdminScreen.tsx#L1915) | `width: 'auto',` |
| `UsersPanel` | [1916](../packages/web/src/admin/AdminScreen.tsx#L1916) | `height: 24,` |
| `UsersPanel` | [1917](../packages/web/src/admin/AdminScreen.tsx#L1917) | `padding: 0,` |
| `UsersPanel` | [1922](../packages/web/src/admin/AdminScreen.tsx#L1922) | `fontSize: 14,` |
| `UsersPanel` | [1923](../packages/web/src/admin/AdminScreen.tsx#L1923) | `fontWeight: 600,` |
| `UsersPanel` | [1925](../packages/web/src/admin/AdminScreen.tsx#L1925) | `lineHeight: '24px',` |
| `UsersPanel` | [1933](../packages/web/src/admin/AdminScreen.tsx#L1933) | `borderRadius: 18,` |
| `UsersPanel` | [1934](../packages/web/src/admin/AdminScreen.tsx#L1934) | `padding: 10,` |
| `UsersPanel` | [1936](../packages/web/src/admin/AdminScreen.tsx#L1936) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `UsersPanel` | [1937](../packages/web/src/admin/AdminScreen.tsx#L1937) | `gap: 8,` |
| `UsersPanel` | [1960](../packages/web/src/admin/AdminScreen.tsx#L1960) | `gridTemplateColumns: 'minmax(0, 1fr) 104px',` |
| `UsersPanel` | [1961](../packages/web/src/admin/AdminScreen.tsx#L1961) | `gap: 8,` |
| `UsersPanel` | [1962](../packages/web/src/admin/AdminScreen.tsx#L1962) | `minWidth: 0,` |
| `UsersPanel` | [1989](../packages/web/src/admin/AdminScreen.tsx#L1989) | `width: '100%',` |
| `UsersPanel` | [1990](../packages/web/src/admin/AdminScreen.tsx#L1990) | `height: 44,` |
| `UsersPanel` | [1991](../packages/web/src/admin/AdminScreen.tsx#L1991) | `borderRadius: 14,` |
| `UsersPanel` | [1993](../packages/web/src/admin/AdminScreen.tsx#L1993) | `gap: 7,` |
| `UsersPanel` | [1994](../packages/web/src/admin/AdminScreen.tsx#L1994) | `fontSize: 12,` |
| `UsersPanel` | [1995](../packages/web/src/admin/AdminScreen.tsx#L1995) | `fontWeight: 850,` |
| `UsersPanel` | [2027](../packages/web/src/admin/AdminScreen.tsx#L2027) | `height: 38,` |
| `UsersPanel` | [2028](../packages/web/src/admin/AdminScreen.tsx#L2028) | `borderRadius: 14,` |
| `UsersPanel` | [2032](../packages/web/src/admin/AdminScreen.tsx#L2032) | `gap: 7,` |
| `UsersPanel` | [2042](../packages/web/src/admin/AdminScreen.tsx#L2042) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `UsersPanel` | [2050](../packages/web/src/admin/AdminScreen.tsx#L2050) | `borderRadius: 18,` |
| `UsersPanel` | [2051](../packages/web/src/admin/AdminScreen.tsx#L2051) | `padding: 12,` |
| `UsersPanel` | [2057](../packages/web/src/admin/AdminScreen.tsx#L2057) | `gridTemplateColumns: '42px minmax(0, 1fr) 22px',` |
| `UsersPanel` | [2058](../packages/web/src/admin/AdminScreen.tsx#L2058) | `gap: 10,` |
| `UsersPanel` | [2066](../packages/web/src/admin/AdminScreen.tsx#L2066) | `<div style={{ minWidth: 0 }}>` |
| `UsersPanel` | [2070](../packages/web/src/admin/AdminScreen.tsx#L2070) | `fontSize: 14,` |
| `UsersPanel` | [2071](../packages/web/src/admin/AdminScreen.tsx#L2071) | `fontWeight: 900,` |
| `UsersPanel` | [2079](../packages/web/src/admin/AdminScreen.tsx#L2079) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>` |
| `UsersPanel` | [2087](../packages/web/src/admin/AdminScreen.tsx#L2087) | `fontSize: 10,` |
| `UsersPanel` | [2088](../packages/web/src/admin/AdminScreen.tsx#L2088) | `fontWeight: 800,` |
| `UsersPanel` | [2091](../packages/web/src/admin/AdminScreen.tsx#L2091) | `gap: 5,` |
| `UsersPanel` | [2092](../packages/web/src/admin/AdminScreen.tsx#L2092) | `minWidth: 0,` |
| `UsersPanel` | [2098](../packages/web/src/admin/AdminScreen.tsx#L2098) | `minWidth: 0,` |
| `UsersPanel` | [2108](../packages/web/src/admin/AdminScreen.tsx#L2108) | `<span className="pill" style={{ marginTop: 7, padding: '3px 8px', fontSize: 10 }}>` |
| `UserNotificationStats` | [2137](../packages/web/src/admin/AdminScreen.tsx#L2137) | `borderRadius: 18,` |
| `UserNotificationStats` | [2138](../packages/web/src/admin/AdminScreen.tsx#L2138) | `padding: 12,` |
| `UserNotificationStats` | [2140](../packages/web/src/admin/AdminScreen.tsx#L2140) | `gap: 10,` |
| `UserNotificationStats` | [2146](../packages/web/src/admin/AdminScreen.tsx#L2146) | `gridTemplateColumns: '32px minmax(0, 1fr) auto',` |
| `UserNotificationStats` | [2147](../packages/web/src/admin/AdminScreen.tsx#L2147) | `gap: 10,` |
| `UserNotificationStats` | [2153](../packages/web/src/admin/AdminScreen.tsx#L2153) | `width: 32,` |
| `UserNotificationStats` | [2154](../packages/web/src/admin/AdminScreen.tsx#L2154) | `height: 32,` |
| `UserNotificationStats` | [2155](../packages/web/src/admin/AdminScreen.tsx#L2155) | `borderRadius: 12,` |
| `UserNotificationStats` | [2165](../packages/web/src/admin/AdminScreen.tsx#L2165) | `<div style={{ minWidth: 0 }}>` |
| `UserNotificationStats` | [2166](../packages/web/src/admin/AdminScreen.tsx#L2166) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>Уведомления</div>` |
| `UserNotificationStats` | [2167](../packages/web/src/admin/AdminScreen.tsx#L2167) | `<div style={{ marginTop: 2, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>` |
| `UserNotificationStats` | [2175](../packages/web/src/admin/AdminScreen.tsx#L2175) | `style={{ padding: '6px 10px', fontSize: 13, fontWeight: 950 }}` |
| `UserNotificationStats` | [2183](../packages/web/src/admin/AdminScreen.tsx#L2183) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `UserNotificationStats` | [2184](../packages/web/src/admin/AdminScreen.tsx#L2184) | `gap: 7,` |
| `UserNotificationStats` | [2194](../packages/web/src/admin/AdminScreen.tsx#L2194) | `borderRadius: 14,` |
| `UserNotificationStats` | [2195](../packages/web/src/admin/AdminScreen.tsx#L2195) | `padding: '8px 9px',` |
| `UserNotificationStats` | [2197](../packages/web/src/admin/AdminScreen.tsx#L2197) | `minWidth: 0,` |
| `UserNotificationStats` | [2203](../packages/web/src/admin/AdminScreen.tsx#L2203) | `fontSize: 10,` |
| `UserNotificationStats` | [2204](../packages/web/src/admin/AdminScreen.tsx#L2204) | `fontWeight: 850,` |
| `UserNotificationStats` | [2212](../packages/web/src/admin/AdminScreen.tsx#L2212) | `<div style={{ marginTop: 3, color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>` |
| `UserNotificationStats` | [2215](../packages/web/src/admin/AdminScreen.tsx#L2215) | `<div style={{ marginTop: 1, color: 'var(--muted)', fontSize: 10, fontWeight: 750 }}>` |
| `UserAvatar` | [2233](../packages/web/src/admin/AdminScreen.tsx#L2233) | `style={{ width: 42, height: 42, borderRadius: 999, objectFit: 'cover' }}` |
| `UserAvatar` | [2240](../packages/web/src/admin/AdminScreen.tsx#L2240) | `width: 42,` |
| `UserAvatar` | [2241](../packages/web/src/admin/AdminScreen.tsx#L2241) | `height: 42,` |
| `UserAvatar` | [2242](../packages/web/src/admin/AdminScreen.tsx#L2242) | `borderRadius: 999,` |
| `UserAvatar` | [2245](../packages/web/src/admin/AdminScreen.tsx#L2245) | `fontSize: 16,` |
| `UserAvatar` | [2246](../packages/web/src/admin/AdminScreen.tsx#L2246) | `fontWeight: 950,` |
| `buildUserPatch` | [2381](../packages/web/src/admin/AdminScreen.tsx#L2381) | `padding: 'calc(16px + var(--app-safe-top)) 14px calc(16px + var(--app-safe-bottom))',` |
| `buildUserPatch` | [2388](../packages/web/src/admin/AdminScreen.tsx#L2388) | `width: '100%',` |
| `buildUserPatch` | [2389](../packages/web/src/admin/AdminScreen.tsx#L2389) | `maxWidth: 430,` |
| `buildUserPatch` | [2390](../packages/web/src/admin/AdminScreen.tsx#L2390) | `maxHeight: '100%',` |
| `buildUserPatch` | [2392](../packages/web/src/admin/AdminScreen.tsx#L2392) | `borderRadius: 24,` |
| `buildUserPatch` | [2393](../packages/web/src/admin/AdminScreen.tsx#L2393) | `padding: 16,` |
| `buildUserPatch` | [2407](../packages/web/src/admin/AdminScreen.tsx#L2407) | `width: 34,` |
| `buildUserPatch` | [2408](../packages/web/src/admin/AdminScreen.tsx#L2408) | `height: 34,` |
| `buildUserPatch` | [2415](../packages/web/src/admin/AdminScreen.tsx#L2415) | `<div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 42 }}>` |
| `buildUserPatch` | [2417](../packages/web/src/admin/AdminScreen.tsx#L2417) | `<div style={{ minWidth: 0, flex: 1 }}>` |
| `buildUserPatch` | [2420](../packages/web/src/admin/AdminScreen.tsx#L2420) | `fontSize: 19,` |
| `buildUserPatch` | [2421](../packages/web/src/admin/AdminScreen.tsx#L2421) | `fontWeight: 950,` |
| `buildUserPatch` | [2428](../packages/web/src/admin/AdminScreen.tsx#L2428) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>` |
| `buildUserPatch` | [2434](../packages/web/src/admin/AdminScreen.tsx#L2434) | `<div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>` |
| `buildUserPatch` | [2455](../packages/web/src/admin/AdminScreen.tsx#L2455) | `<section className="glass" style={{ marginTop: 10, borderRadius: 18, padding: 12 }}>` |
| `buildUserPatch` | [2457](../packages/web/src/admin/AdminScreen.tsx#L2457) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `buildUserPatch` | [2473](../packages/web/src/admin/AdminScreen.tsx#L2473) | `<section style={{ marginTop: 8, display: 'grid', gap: 8 }}>` |
| `buildUserPatch` | [2490](../packages/web/src/admin/AdminScreen.tsx#L2490) | `<section style={{ marginTop: 14, display: 'grid', gap: 10 }}>` |
| `buildUserPatch` | [2494](../packages/web/src/admin/AdminScreen.tsx#L2494) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>` |
| `buildUserPatch` | [2512](../packages/web/src/admin/AdminScreen.tsx#L2512) | `<fieldset style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 8 }}>` |
| `buildUserPatch` | [2513](../packages/web/src/admin/AdminScreen.tsx#L2513) | `<legend style={{ fontWeight: 850, marginBottom: 6 }}>Прохождение онбординга</legend>` |
| `buildUserPatch` | [2531](../packages/web/src/admin/AdminScreen.tsx#L2531) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>` |
| `buildUserPatch` | [2539](../packages/web/src/admin/AdminScreen.tsx#L2539) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>` |
| `buildUserPatch` | [2553](../packages/web/src/admin/AdminScreen.tsx#L2553) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>` |
| `buildUserPatch` | [2564](../packages/web/src/admin/AdminScreen.tsx#L2564) | `<div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `buildUserPatch` | [2570](../packages/web/src/admin/AdminScreen.tsx#L2570) | `style={{ padding: '12px 10px', fontSize: 12, letterSpacing: 0 }}` |
| `buildUserPatch` | [2580](../packages/web/src/admin/AdminScreen.tsx#L2580) | `style={{ padding: '12px 10px', fontSize: 12, letterSpacing: 0 }}` |
| `buildUserPatch` | [2590](../packages/web/src/admin/AdminScreen.tsx#L2590) | `style={{ padding: '12px 10px', fontSize: 12, letterSpacing: 0 }}` |
| `buildUserPatch` | [2598](../packages/web/src/admin/AdminScreen.tsx#L2598) | `<div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>` |
| `UserStatsRow` | [2655](../packages/web/src/admin/AdminScreen.tsx#L2655) | `gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',` |
| `UserStatsRow` | [2656](../packages/web/src/admin/AdminScreen.tsx#L2656) | `gap: 6,` |
| `UserStatsRow` | [2657](../packages/web/src/admin/AdminScreen.tsx#L2657) | `borderRadius: 18,` |
| `UserStatsRow` | [2658](../packages/web/src/admin/AdminScreen.tsx#L2658) | `padding: '10px 8px',` |
| `UserStatsRow` | [2662](../packages/web/src/admin/AdminScreen.tsx#L2662) | `<div key={item.label} style={{ minWidth: 0, textAlign: 'center' }}>` |
| `UserStatsRow` | [2666](../packages/web/src/admin/AdminScreen.tsx#L2666) | `fontSize: 9,` |
| `UserStatsRow` | [2667](../packages/web/src/admin/AdminScreen.tsx#L2667) | `fontWeight: 850,` |
| `UserStatsRow` | [2680](../packages/web/src/admin/AdminScreen.tsx#L2680) | `fontSize: 19,` |
| `UserStatsRow` | [2681](../packages/web/src/admin/AdminScreen.tsx#L2681) | `lineHeight: 1,` |
| `UserStatsRow` | [2682](../packages/web/src/admin/AdminScreen.tsx#L2682) | `fontWeight: 950,` |
| `AdminAchievementsRow` | [2708](../packages/web/src/admin/AdminScreen.tsx#L2708) | `style={{ marginTop: 10, borderRadius: 18, padding: '10px 10px 8px' }}` |
| `AdminAchievementsRow` | [2713](../packages/web/src/admin/AdminScreen.tsx#L2713) | `fontSize: 11,` |
| `AdminAchievementsRow` | [2714](../packages/web/src/admin/AdminScreen.tsx#L2714) | `fontWeight: 900,` |
| `AdminAchievementsRow` | [2727](../packages/web/src/admin/AdminScreen.tsx#L2727) | `gap: 10,` |
| `AdminAchievementsRow` | [2732](../packages/web/src/admin/AdminScreen.tsx#L2732) | `minHeight: 95,` |
| `AdminAchievementsRow` | [2744](../packages/web/src/admin/AdminScreen.tsx#L2744) | `<div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>` |
| `IdentityCards` | [2758](../packages/web/src/admin/AdminScreen.tsx#L2758) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `IdentityCards` | [2759](../packages/web/src/admin/AdminScreen.tsx#L2759) | `gap: 8,` |
| `IdentityCard` | [2776](../packages/web/src/admin/AdminScreen.tsx#L2776) | `minWidth: 0,` |
| `IdentityCard` | [2777](../packages/web/src/admin/AdminScreen.tsx#L2777) | `borderRadius: 16,` |
| `IdentityCard` | [2778](../packages/web/src/admin/AdminScreen.tsx#L2778) | `padding: 9,` |
| `IdentityCard` | [2786](../packages/web/src/admin/AdminScreen.tsx#L2786) | `gap: 7,` |
| `IdentityCard` | [2794](../packages/web/src/admin/AdminScreen.tsx#L2794) | `gap: 6,` |
| `IdentityCard` | [2795](../packages/web/src/admin/AdminScreen.tsx#L2795) | `minWidth: 0,` |
| `IdentityCard` | [2798](../packages/web/src/admin/AdminScreen.tsx#L2798) | `<span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>` |
| `IdentityCard` | [2802](../packages/web/src/admin/AdminScreen.tsx#L2802) | `<span className="pill pill--dark" style={{ padding: '2px 6px', fontSize: 9 }}>` |
| `IdentityCard` | [2808](../packages/web/src/admin/AdminScreen.tsx#L2808) | `<div style={{ minWidth: 0 }}>` |
| `IdentityCard` | [2812](../packages/web/src/admin/AdminScreen.tsx#L2812) | `fontSize: 11,` |
| `IdentityCard` | [2813](../packages/web/src/admin/AdminScreen.tsx#L2813) | `fontWeight: 900,` |
| `IdentityCard` | [2826](../packages/web/src/admin/AdminScreen.tsx#L2826) | `fontSize: 10,` |
| `IdentityCard` | [2827](../packages/web/src/admin/AdminScreen.tsx#L2827) | `fontWeight: 800,` |
| `IdentityAvatar` | [2849](../packages/web/src/admin/AdminScreen.tsx#L2849) | `width: 36,` |
| `IdentityAvatar` | [2850](../packages/web/src/admin/AdminScreen.tsx#L2850) | `height: 36,` |
| `IdentityAvatar` | [2851](../packages/web/src/admin/AdminScreen.tsx#L2851) | `borderRadius: 999,` |
| `IdentityAvatar` | [2860](../packages/web/src/admin/AdminScreen.tsx#L2860) | `width: 36,` |
| `IdentityAvatar` | [2861](../packages/web/src/admin/AdminScreen.tsx#L2861) | `height: 36,` |
| `IdentityAvatar` | [2862](../packages/web/src/admin/AdminScreen.tsx#L2862) | `borderRadius: 999,` |
| `IdentityAvatar` | [2866](../packages/web/src/admin/AdminScreen.tsx#L2866) | `fontSize: 14,` |
| `IdentityAvatar` | [2867](../packages/web/src/admin/AdminScreen.tsx#L2867) | `fontWeight: 950,` |
| `MetaPair` | [2890](../packages/web/src/admin/AdminScreen.tsx#L2890) | `borderRadius: 16,` |
| `MetaPair` | [2891](../packages/web/src/admin/AdminScreen.tsx#L2891) | `padding: '10px 12px',` |
| `MetaPair` | [2893](../packages/web/src/admin/AdminScreen.tsx#L2893) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `MetaPair` | [2894](../packages/web/src/admin/AdminScreen.tsx#L2894) | `gap: 10,` |
| `MetaPair` | [2898](../packages/web/src/admin/AdminScreen.tsx#L2898) | `<div key={item.label} style={{ minWidth: 0 }}>` |
| `MetaPair` | [2899](../packages/web/src/admin/AdminScreen.tsx#L2899) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>{item.label}</div>` |
| `MetaPair` | [2904](../packages/web/src/admin/AdminScreen.tsx#L2904) | `fontSize: 12,` |
| `MetaPair` | [2905](../packages/web/src/admin/AdminScreen.tsx#L2905) | `fontWeight: 900,` |
| `PushNotificationCard` | [2931](../packages/web/src/admin/AdminScreen.tsx#L2931) | `borderRadius: 16,` |
| `PushNotificationCard` | [2932](../packages/web/src/admin/AdminScreen.tsx#L2932) | `padding: 12,` |
| `PushNotificationCard` | [2934](../packages/web/src/admin/AdminScreen.tsx#L2934) | `gap: 9,` |
| `PushNotificationCard` | [2937](../packages/web/src/admin/AdminScreen.tsx#L2937) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `PushNotificationCard` | [2939](../packages/web/src/admin/AdminScreen.tsx#L2939) | `<div style={{ fontSize: 13, fontWeight: 950 }}>Уведомления</div>` |
| `PushNotificationCard` | [2949](../packages/web/src/admin/AdminScreen.tsx#L2949) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `PushNotificationCard` | [2952](../packages/web/src/admin/AdminScreen.tsx#L2952) | `<span key={label} className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `PushNotificationCard` | [2957](../packages/web/src/admin/AdminScreen.tsx#L2957) | `<span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 750 }}>` |
| `PurchasesCard` | [2989](../packages/web/src/admin/AdminScreen.tsx#L2989) | `width: '100%',` |
| `PurchasesCard` | [2990](../packages/web/src/admin/AdminScreen.tsx#L2990) | `borderRadius: 18,` |
| `PurchasesCard` | [2991](../packages/web/src/admin/AdminScreen.tsx#L2991) | `padding: 12,` |
| `PurchasesCard` | [2998](../packages/web/src/admin/AdminScreen.tsx#L2998) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `PurchasesCard` | [3000](../packages/web/src/admin/AdminScreen.tsx#L3000) | `<div style={{ fontSize: 14, fontWeight: 950 }}>Покупки</div>` |
| `PurchasesCard` | [3014](../packages/web/src/admin/AdminScreen.tsx#L3014) | `<div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>` |
| `PurchasesCard` | [3018](../packages/web/src/admin/AdminScreen.tsx#L3018) | `<div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>` |
| `PurchasesCard` | [3025](../packages/web/src/admin/AdminScreen.tsx#L3025) | `<div style={{ marginTop: 8, display: 'grid', gap: 8 }}>` |
| `InfoRow` | [3044](../packages/web/src/admin/AdminScreen.tsx#L3044) | `borderRadius: 14,` |
| `InfoRow` | [3045](../packages/web/src/admin/AdminScreen.tsx#L3045) | `padding: '9px 10px',` |
| `InfoRow` | [3047](../packages/web/src/admin/AdminScreen.tsx#L3047) | `gridTemplateColumns: '108px minmax(0, 1fr)',` |
| `InfoRow` | [3048](../packages/web/src/admin/AdminScreen.tsx#L3048) | `gap: 8,` |
| `InfoRow` | [3052](../packages/web/src/admin/AdminScreen.tsx#L3052) | `<span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>` |
| `InfoRow` | [3056](../packages/web/src/admin/AdminScreen.tsx#L3056) | `fontSize: 12,` |
| `InfoRow` | [3057](../packages/web/src/admin/AdminScreen.tsx#L3057) | `fontWeight: 800,` |
| `ConfirmAction` | [3089](../packages/web/src/admin/AdminScreen.tsx#L3089) | `borderRadius: 18,` |
| `ConfirmAction` | [3090](../packages/web/src/admin/AdminScreen.tsx#L3090) | `padding: 12,` |
| `ConfirmAction` | [3092](../packages/web/src/admin/AdminScreen.tsx#L3092) | `gap: 10,` |
| `ConfirmAction` | [3095](../packages/web/src/admin/AdminScreen.tsx#L3095) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `ConfirmAction` | [3097](../packages/web/src/admin/AdminScreen.tsx#L3097) | `<div style={{ fontSize: 14, fontWeight: 950 }}>{title}</div>` |
| `ConfirmAction` | [3099](../packages/web/src/admin/AdminScreen.tsx#L3099) | `<div style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.4 }}>{text}</div>` |
| `ConfirmAction` | [3100](../packages/web/src/admin/AdminScreen.tsx#L3100) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `ConfirmAction` | [3106](../packages/web/src/admin/AdminScreen.tsx#L3106) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `ConfirmAction` | [3115](../packages/web/src/admin/AdminScreen.tsx#L3115) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `NotificationsPanel` | [3148](../packages/web/src/admin/AdminScreen.tsx#L3148) | `borderRadius: 20,` |
| `NotificationsPanel` | [3149](../packages/web/src/admin/AdminScreen.tsx#L3149) | `padding: 12,` |
| `NotificationsPanel` | [3151](../packages/web/src/admin/AdminScreen.tsx#L3151) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `NotificationsPanel` | [3152](../packages/web/src/admin/AdminScreen.tsx#L3152) | `gap: 8,` |
| `NotificationsPanel` | [3158](../packages/web/src/admin/AdminScreen.tsx#L3158) | `borderRadius: 16,` |
| `NotificationsPanel` | [3159](../packages/web/src/admin/AdminScreen.tsx#L3159) | `padding: 10,` |
| `NotificationsPanel` | [3163](../packages/web/src/admin/AdminScreen.tsx#L3163) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>Активные</div>` |
| `NotificationsPanel` | [3164](../packages/web/src/admin/AdminScreen.tsx#L3164) | `<div style={{ marginTop: 5, color: 'var(--ink)', fontSize: 22, fontWeight: 950 }}>` |
| `NotificationsPanel` | [3171](../packages/web/src/admin/AdminScreen.tsx#L3171) | `borderRadius: 16,` |
| `NotificationsPanel` | [3172](../packages/web/src/admin/AdminScreen.tsx#L3172) | `padding: 10,` |
| `NotificationsPanel` | [3176](../packages/web/src/admin/AdminScreen.tsx#L3176) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>Всего</div>` |
| `NotificationsPanel` | [3177](../packages/web/src/admin/AdminScreen.tsx#L3177) | `<div style={{ marginTop: 5, color: 'var(--ink)', fontSize: 22, fontWeight: 950 }}>` |
| `NotificationsPanel` | [3197](../packages/web/src/admin/AdminScreen.tsx#L3197) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `eventTitle` | [3240](../packages/web/src/admin/AdminScreen.tsx#L3240) | `style={{ borderRadius: 20, padding: 12, display: 'grid', gap: 10 }}` |
| `eventTitle` | [3249](../packages/web/src/admin/AdminScreen.tsx#L3249) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `eventTitle` | [3250](../packages/web/src/admin/AdminScreen.tsx#L3250) | `gap: 8,` |
| `eventTitle` | [3274](../packages/web/src/admin/AdminScreen.tsx#L3274) | `<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>` |
| `eventTitle` | [3276](../packages/web/src/admin/AdminScreen.tsx#L3276) | `<span key={item.status} className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3280](../packages/web/src/admin/AdminScreen.tsx#L3280) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3283](../packages/web/src/admin/AdminScreen.tsx#L3283) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3288](../packages/web/src/admin/AdminScreen.tsx#L3288) | `<div style={{ display: 'grid', gap: 7 }}>` |
| `eventTitle` | [3293](../packages/web/src/admin/AdminScreen.tsx#L3293) | `borderRadius: 15,` |
| `eventTitle` | [3294](../packages/web/src/admin/AdminScreen.tsx#L3294) | `padding: '9px 10px',` |
| `eventTitle` | [3297](../packages/web/src/admin/AdminScreen.tsx#L3297) | `fontSize: 11,` |
| `eventTitle` | [3298](../packages/web/src/admin/AdminScreen.tsx#L3298) | `fontWeight: 850,` |
| `eventTitle` | [3312](../packages/web/src/admin/AdminScreen.tsx#L3312) | `borderRadius: 15,` |
| `eventTitle` | [3313](../packages/web/src/admin/AdminScreen.tsx#L3313) | `padding: '9px 10px',` |
| `eventTitle` | [3320](../packages/web/src/admin/AdminScreen.tsx#L3320) | `<div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 950 }}>` |
| `eventTitle` | [3327](../packages/web/src/admin/AdminScreen.tsx#L3327) | `fontSize: 11,` |
| `eventTitle` | [3328](../packages/web/src/admin/AdminScreen.tsx#L3328) | `fontWeight: 800,` |
| `eventTitle` | [3329](../packages/web/src/admin/AdminScreen.tsx#L3329) | `lineHeight: 1.35,` |
| `eventTitle` | [3340](../packages/web/src/admin/AdminScreen.tsx#L3340) | `<div style={{ display: 'grid', gap: 7 }}>` |
| `eventTitle` | [3346](../packages/web/src/admin/AdminScreen.tsx#L3346) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `eventTitle` | [3347](../packages/web/src/admin/AdminScreen.tsx#L3347) | `gap: 8,` |
| `eventTitle` | [3350](../packages/web/src/admin/AdminScreen.tsx#L3350) | `borderRadius: 15,` |
| `eventTitle` | [3351](../packages/web/src/admin/AdminScreen.tsx#L3351) | `padding: '9px 10px',` |
| `eventTitle` | [3355](../packages/web/src/admin/AdminScreen.tsx#L3355) | `<div style={{ minWidth: 0 }}>` |
| `eventTitle` | [3359](../packages/web/src/admin/AdminScreen.tsx#L3359) | `fontSize: 12,` |
| `eventTitle` | [3360](../packages/web/src/admin/AdminScreen.tsx#L3360) | `fontWeight: 950,` |
| `eventTitle` | [3372](../packages/web/src/admin/AdminScreen.tsx#L3372) | `fontSize: 10,` |
| `eventTitle` | [3373](../packages/web/src/admin/AdminScreen.tsx#L3373) | `fontWeight: 800,` |
| `eventTitle` | [3381](../packages/web/src/admin/AdminScreen.tsx#L3381) | `style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'end' }}` |
| `eventTitle` | [3383](../packages/web/src/admin/AdminScreen.tsx#L3383) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3386](../packages/web/src/admin/AdminScreen.tsx#L3386) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3389](../packages/web/src/admin/AdminScreen.tsx#L3389) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3400](../packages/web/src/admin/AdminScreen.tsx#L3400) | `<div style={{ display: 'grid', gap: 7 }}>` |
| `eventTitle` | [3401](../packages/web/src/admin/AdminScreen.tsx#L3401) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>` |
| `eventTitle` | [3409](../packages/web/src/admin/AdminScreen.tsx#L3409) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `eventTitle` | [3410](../packages/web/src/admin/AdminScreen.tsx#L3410) | `gap: 8,` |
| `eventTitle` | [3416](../packages/web/src/admin/AdminScreen.tsx#L3416) | `<div style={{ minWidth: 0 }}>` |
| `eventTitle` | [3420](../packages/web/src/admin/AdminScreen.tsx#L3420) | `fontSize: 12,` |
| `eventTitle` | [3421](../packages/web/src/admin/AdminScreen.tsx#L3421) | `fontWeight: 900,` |
| `eventTitle` | [3433](../packages/web/src/admin/AdminScreen.tsx#L3433) | `fontSize: 10,` |
| `eventTitle` | [3434](../packages/web/src/admin/AdminScreen.tsx#L3434) | `fontWeight: 800,` |
| `eventTitle` | [3445](../packages/web/src/admin/AdminScreen.tsx#L3445) | `fontSize: 10,` |
| `eventTitle` | [3446](../packages/web/src/admin/AdminScreen.tsx#L3446) | `fontWeight: 850,` |
| `eventTitle` | [3455](../packages/web/src/admin/AdminScreen.tsx#L3455) | `style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'end' }}` |
| `eventTitle` | [3460](../packages/web/src/admin/AdminScreen.tsx#L3460) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `eventTitle` | [3463](../packages/web/src/admin/AdminScreen.tsx#L3463) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `NotificationTemplateCard` | [3486](../packages/web/src/admin/AdminScreen.tsx#L3486) | `<article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>` |
| `NotificationTemplateCard` | [3490](../packages/web/src/admin/AdminScreen.tsx#L3490) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `NotificationTemplateCard` | [3491](../packages/web/src/admin/AdminScreen.tsx#L3491) | `gap: 10,` |
| `NotificationTemplateCard` | [3495](../packages/web/src/admin/AdminScreen.tsx#L3495) | `<div style={{ minWidth: 0 }}>` |
| `NotificationTemplateCard` | [3496](../packages/web/src/admin/AdminScreen.tsx#L3496) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>` |
| `NotificationTemplateCard` | [3500](../packages/web/src/admin/AdminScreen.tsx#L3500) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `NotificationTemplateCard` | [3503](../packages/web/src/admin/AdminScreen.tsx#L3503) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `NotificationTemplateCard` | [3507](../packages/web/src/admin/AdminScreen.tsx#L3507) | `<div style={{ marginTop: 8, color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>` |
| `NotificationTemplateCard` | [3514](../packages/web/src/admin/AdminScreen.tsx#L3514) | `fontSize: 13,` |
| `NotificationTemplateCard` | [3515](../packages/web/src/admin/AdminScreen.tsx#L3515) | `fontWeight: 750,` |
| `NotificationTemplateCard` | [3516](../packages/web/src/admin/AdminScreen.tsx#L3516) | `lineHeight: 1.35,` |
| `NotificationTemplateCard` | [3530](../packages/web/src/admin/AdminScreen.tsx#L3530) | `style={{ width: 44, height: 44 }}` |
| `NotificationTemplateCard` | [3535](../packages/web/src/admin/AdminScreen.tsx#L3535) | `<div style={{ display: 'grid', gap: 7 }}>` |
| `NotificationTemplateCard` | [3539](../packages/web/src/admin/AdminScreen.tsx#L3539) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `NotificationTemplateCard` | [3540](../packages/web/src/admin/AdminScreen.tsx#L3540) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `NotificationTemplateCard` | [3544](../packages/web/src/admin/AdminScreen.tsx#L3544) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `NotificationInfo` | [3558](../packages/web/src/admin/AdminScreen.tsx#L3558) | `borderRadius: 14,` |
| `NotificationInfo` | [3559](../packages/web/src/admin/AdminScreen.tsx#L3559) | `padding: '8px 9px',` |
| `NotificationInfo` | [3561](../packages/web/src/admin/AdminScreen.tsx#L3561) | `minWidth: 0,` |
| `NotificationInfo` | [3564](../packages/web/src/admin/AdminScreen.tsx#L3564) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{label}</div>` |
| `NotificationInfo` | [3569](../packages/web/src/admin/AdminScreen.tsx#L3569) | `fontSize: 12,` |
| `NotificationInfo` | [3570](../packages/web/src/admin/AdminScreen.tsx#L3570) | `fontWeight: 850,` |
| `NotificationInfo` | [3572](../packages/web/src/admin/AdminScreen.tsx#L3572) | `lineHeight: 1.35,` |
| `NotificationEditor` | [3619](../packages/web/src/admin/AdminScreen.tsx#L3619) | `<section className="glass" style={{ borderRadius: 20, padding: 14, display: 'grid', gap: 10 }}>` |
| `NotificationEditor` | [3620](../packages/web/src/admin/AdminScreen.tsx#L3620) | `<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>` |
| `NotificationEditor` | [3621](../packages/web/src/admin/AdminScreen.tsx#L3621) | `<div style={{ minWidth: 0 }}>` |
| `NotificationEditor` | [3622](../packages/web/src/admin/AdminScreen.tsx#L3622) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>` |
| `NotificationEditor` | [3629](../packages/web/src/admin/AdminScreen.tsx#L3629) | `fontSize: 11,` |
| `NotificationEditor` | [3630](../packages/web/src/admin/AdminScreen.tsx#L3630) | `fontWeight: 800,` |
| `NotificationEditor` | [3660](../packages/web/src/admin/AdminScreen.tsx#L3660) | `style={{ resize: 'vertical', minHeight: 84, lineHeight: 1.35 }}` |
| `NotificationEditor` | [3669](../packages/web/src/admin/AdminScreen.tsx#L3669) | `style={{ resize: 'vertical', minHeight: 84, lineHeight: 1.35 }}` |
| `NotificationEditor` | [3679](../packages/web/src/admin/AdminScreen.tsx#L3679) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `NotificationEditor` | [3684](../packages/web/src/admin/AdminScreen.tsx#L3684) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `NotificationEditor` | [3693](../packages/web/src/admin/AdminScreen.tsx#L3693) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `NotificationEditor` | [3699](../packages/web/src/admin/AdminScreen.tsx#L3699) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>` |
| `AdminChatAvatarControl` | [3726](../packages/web/src/admin/AdminScreen.tsx#L3726) | `borderRadius: 16,` |
| `AdminChatAvatarControl` | [3727](../packages/web/src/admin/AdminScreen.tsx#L3727) | `padding: 10,` |
| `AdminChatAvatarControl` | [3731](../packages/web/src/admin/AdminScreen.tsx#L3731) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `AdminChatAvatarControl` | [3732](../packages/web/src/admin/AdminScreen.tsx#L3732) | `gap: 8,` |
| `AdminChatAvatarControl` | [3734](../packages/web/src/admin/AdminScreen.tsx#L3734) | `minWidth: 0,` |
| `AdminChatAvatarControl` | [3737](../packages/web/src/admin/AdminScreen.tsx#L3737) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>` |
| `AdminChatAvatarControl` | [3742](../packages/web/src/admin/AdminScreen.tsx#L3742) | `style={{ width: 38, height: 38, borderRadius: 999, objectFit: 'cover', flexShrink: 0 }}` |
| `AdminChatAvatarControl` | [3747](../packages/web/src/admin/AdminScreen.tsx#L3747) | `width: 38,` |
| `AdminChatAvatarControl` | [3748](../packages/web/src/admin/AdminScreen.tsx#L3748) | `height: 38,` |
| `AdminChatAvatarControl` | [3749](../packages/web/src/admin/AdminScreen.tsx#L3749) | `borderRadius: 999,` |
| `AdminChatAvatarControl` | [3754](../packages/web/src/admin/AdminScreen.tsx#L3754) | `fontWeight: 950,` |
| `AdminChatAvatarControl` | [3761](../packages/web/src/admin/AdminScreen.tsx#L3761) | `<div style={{ minWidth: 0 }}>` |
| `AdminChatAvatarControl` | [3762](../packages/web/src/admin/AdminScreen.tsx#L3762) | `<div style={{ fontSize: 12, fontWeight: 950, color: 'var(--ink)' }}>{title}</div>` |
| `AdminChatAvatarControl` | [3766](../packages/web/src/admin/AdminScreen.tsx#L3766) | `fontSize: 11,` |
| `AdminChatAvatarControl` | [3767](../packages/web/src/admin/AdminScreen.tsx#L3767) | `fontWeight: 800,` |
| `AdminChatAvatarControl` | [3778](../packages/web/src/admin/AdminScreen.tsx#L3778) | `<div style={{ display: 'flex', gap: 6 }}>` |
| `AdminChatAvatarControl` | [3786](../packages/web/src/admin/AdminScreen.tsx#L3786) | `style={{ width: 36, height: 36, minWidth: 36 }}` |
| `AdminChatAvatarControl` | [3797](../packages/web/src/admin/AdminScreen.tsx#L3797) | `style={{ width: 36, height: 36, minWidth: 36 }}` |
| `ChatProfileEditorModal` | [4395](../packages/web/src/admin/AdminScreen.tsx#L4395) | `padding: 'calc(16px + var(--app-safe-top)) 14px calc(16px + var(--app-safe-bottom))',` |
| `ChatProfileEditorModal` | [4402](../packages/web/src/admin/AdminScreen.tsx#L4402) | `width: '100%',` |
| `ChatProfileEditorModal` | [4403](../packages/web/src/admin/AdminScreen.tsx#L4403) | `maxWidth: 420,` |
| `ChatProfileEditorModal` | [4404](../packages/web/src/admin/AdminScreen.tsx#L4404) | `borderRadius: 24,` |
| `ChatProfileEditorModal` | [4405](../packages/web/src/admin/AdminScreen.tsx#L4405) | `padding: 16,` |
| `ChatProfileEditorModal` | [4407](../packages/web/src/admin/AdminScreen.tsx#L4407) | `gap: 10,` |
| `ChatProfileEditorModal` | [4410](../packages/web/src/admin/AdminScreen.tsx#L4410) | `<div style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>{profile.title}</div>` |
| `ChatProfileEditorModal` | [4419](../packages/web/src/admin/AdminScreen.tsx#L4419) | `style={{ resize: 'vertical', minHeight: 96, lineHeight: 1.35 }}` |
| `ChatProfileEditorModal` | [4422](../packages/web/src/admin/AdminScreen.tsx#L4422) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `ChatProfileEditorModal` | [4428](../packages/web/src/admin/AdminScreen.tsx#L4428) | `style={{ padding: 10, fontSize: 12, letterSpacing: 0 }}` |
| `ChatProfileEditorModal` | [4437](../packages/web/src/admin/AdminScreen.tsx#L4437) | `style={{ padding: 10, fontSize: 12, letterSpacing: 0 }}` |
| `ChatProfileEditorModal` | [4443](../packages/web/src/admin/AdminScreen.tsx#L4443) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>` |
| `ChannelPanel` | [4592](../packages/web/src/admin/AdminScreen.tsx#L4592) | `style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}` |
| `ChannelPanel` | [4594](../packages/web/src/admin/AdminScreen.tsx#L4594) | `<div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 148px', gap: 10 }}>` |
| `ChannelPanel` | [4595](../packages/web/src/admin/AdminScreen.tsx#L4595) | `<div style={{ minWidth: 0 }}>` |
| `ChannelPanel` | [4596](../packages/web/src/admin/AdminScreen.tsx#L4596) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>` |
| `ChannelPanel` | [4603](../packages/web/src/admin/AdminScreen.tsx#L4603) | `fontSize: 11,` |
| `ChannelPanel` | [4604](../packages/web/src/admin/AdminScreen.tsx#L4604) | `fontWeight: 800,` |
| `ChannelPanel` | [4605](../packages/web/src/admin/AdminScreen.tsx#L4605) | `lineHeight: 1.3,` |
| `ChannelPanel` | [4624](../packages/web/src/admin/AdminScreen.tsx#L4624) | `gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',` |
| `ChannelPanel` | [4625](../packages/web/src/admin/AdminScreen.tsx#L4625) | `gap: 10,` |
| `ChannelPanel` | [4629](../packages/web/src/admin/AdminScreen.tsx#L4629) | `<div style={{ display: 'grid', gap: 8 }}>` |
| `ChannelPanel` | [4654](../packages/web/src/admin/AdminScreen.tsx#L4654) | `style={{ justifySelf: 'end', width: 34, height: 34 }}` |
| `ChannelPanel` | [4661](../packages/web/src/admin/AdminScreen.tsx#L4661) | `<div style={{ display: 'grid', gap: 8 }}>` |
| `ChannelPanel` | [4686](../packages/web/src/admin/AdminScreen.tsx#L4686) | `style={{ justifySelf: 'end', width: 34, height: 34 }}` |
| `ChannelPanel` | [4695](../packages/web/src/admin/AdminScreen.tsx#L4695) | `<div style={{ color: 'var(--red-deep)', fontSize: 11, fontWeight: 800 }}>` |
| `ChannelPanel` | [4717](../packages/web/src/admin/AdminScreen.tsx#L4717) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `ChannelPanel` | [4718](../packages/web/src/admin/AdminScreen.tsx#L4718) | `gap: 10,` |
| `ChannelPanel` | [4728](../packages/web/src/admin/AdminScreen.tsx#L4728) | `minHeight: 132,` |
| `ChannelPanel` | [4729](../packages/web/src/admin/AdminScreen.tsx#L4729) | `borderRadius: 20,` |
| `ChannelPanel` | [4730](../packages/web/src/admin/AdminScreen.tsx#L4730) | `padding: 14,` |
| `ChannelPanel` | [4736](../packages/web/src/admin/AdminScreen.tsx#L4736) | `gap: 12,` |
| `ChannelPanel` | [4742](../packages/web/src/admin/AdminScreen.tsx#L4742) | `<span className="pill pill--dark" style={{ padding: 8 }}>` |
| `ChannelPanel` | [4747](../packages/web/src/admin/AdminScreen.tsx#L4747) | `<div style={{ minWidth: 0 }}>` |
| `ChannelPanel` | [4748](../packages/web/src/admin/AdminScreen.tsx#L4748) | `<div style={{ color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>` |
| `ChannelPanel` | [4755](../packages/web/src/admin/AdminScreen.tsx#L4755) | `fontSize: 24,` |
| `ChannelPanel` | [4756](../packages/web/src/admin/AdminScreen.tsx#L4756) | `fontWeight: 950,` |
| `ChannelPanel` | [4762](../packages/web/src/admin/AdminScreen.tsx#L4762) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>` |
| `ChannelPanel` | [4766](../packages/web/src/admin/AdminScreen.tsx#L4766) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>` |
| `ChannelPanel` | [4785](../packages/web/src/admin/AdminScreen.tsx#L4785) | `padding: '8px 12px',` |
| `ChannelPanel` | [4788](../packages/web/src/admin/AdminScreen.tsx#L4788) | `gap: 6,` |
| `ChannelPanel` | [4795](../packages/web/src/admin/AdminScreen.tsx#L4795) | `style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}` |
| `ChannelPanel` | [4798](../packages/web/src/admin/AdminScreen.tsx#L4798) | `<div key={card.label} className="glass" style={{ borderRadius: 18, padding: 12 }}>` |
| `ChannelPanel` | [4800](../packages/web/src/admin/AdminScreen.tsx#L4800) | `style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--muted)' }}` |
| `ChannelPanel` | [4803](../packages/web/src/admin/AdminScreen.tsx#L4803) | `<span style={{ fontSize: 10, fontWeight: 900 }}>{card.label}</span>` |
| `ChannelPanel` | [4809](../packages/web/src/admin/AdminScreen.tsx#L4809) | `fontSize: 22,` |
| `ChannelPanel` | [4810](../packages/web/src/admin/AdminScreen.tsx#L4810) | `fontWeight: 950,` |
| `ChannelPanel` | [4816](../packages/web/src/admin/AdminScreen.tsx#L4816) | `<div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>` |
| `ChannelPanel` | [4824](../packages/web/src/admin/AdminScreen.tsx#L4824) | `style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}` |
| `ChannelPanel` | [4830](../packages/web/src/admin/AdminScreen.tsx#L4830) | `gap: 8,` |
| `ChannelPanel` | [4834](../packages/web/src/admin/AdminScreen.tsx#L4834) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>` |
| `ChannelPanel` | [4837](../packages/web/src/admin/AdminScreen.tsx#L4837) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `ChannelPanel` | [4853](../packages/web/src/admin/AdminScreen.tsx#L4853) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `ChannelPanel` | [4860](../packages/web/src/admin/AdminScreen.tsx#L4860) | `padding: '8px 12px',` |
| `ChannelPanel` | [4863](../packages/web/src/admin/AdminScreen.tsx#L4863) | `gap: 6,` |
| `ChannelPeriodRow` | [4918](../packages/web/src/admin/AdminScreen.tsx#L4918) | `borderRadius: 14,` |
| `ChannelPeriodRow` | [4919](../packages/web/src/admin/AdminScreen.tsx#L4919) | `padding: '10px 11px',` |
| `ChannelPeriodRow` | [4921](../packages/web/src/admin/AdminScreen.tsx#L4921) | `gridTemplateColumns: '86px minmax(0, 1fr) auto',` |
| `ChannelPeriodRow` | [4922](../packages/web/src/admin/AdminScreen.tsx#L4922) | `gap: 8,` |
| `ChannelPeriodRow` | [4926](../packages/web/src/admin/AdminScreen.tsx#L4926) | `<div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>` |
| `ChannelPeriodRow` | [4929](../packages/web/src/admin/AdminScreen.tsx#L4929) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `ChannelPeriodRow` | [4930](../packages/web/src/admin/AdminScreen.tsx#L4930) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `ChannelPeriodRow` | [4933](../packages/web/src/admin/AdminScreen.tsx#L4933) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `ChannelPeriodRow` | [4936](../packages/web/src/admin/AdminScreen.tsx#L4936) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `ChannelPeriodRow` | [4940](../packages/web/src/admin/AdminScreen.tsx#L4940) | `<span className="pill pill--dark" style={{ fontSize: 10 }}>` |
| `AdminChannelPostCard` | [4957](../packages/web/src/admin/AdminScreen.tsx#L4957) | `<article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>` |
| `AdminChannelPostCard` | [4958](../packages/web/src/admin/AdminScreen.tsx#L4958) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 850, lineHeight: 1.45 }}>` |
| `AdminChannelPostCard` | [4961](../packages/web/src/admin/AdminScreen.tsx#L4961) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `AdminChannelPostCard` | [4962](../packages/web/src/admin/AdminScreen.tsx#L4962) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `AdminChannelPostCard` | [4965](../packages/web/src/admin/AdminScreen.tsx#L4965) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `AdminChannelPostCard` | [4968](../packages/web/src/admin/AdminScreen.tsx#L4968) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `AdminChannelPostCard` | [4971](../packages/web/src/admin/AdminScreen.tsx#L4971) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `AdminChannelPostCard` | [4976](../packages/web/src/admin/AdminScreen.tsx#L4976) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `AdminChannelPostCard` | [4978](../packages/web/src/admin/AdminScreen.tsx#L4978) | `<span key={reaction.emoji} className="pill pill--dark" style={{ fontSize: 10 }}>` |
| `AdminChannelPostCard` | [4987](../packages/web/src/admin/AdminScreen.tsx#L4987) | `gridTemplateColumns: 'minmax(0, 1fr) 44px 44px',` |
| `AdminChannelPostCard` | [4988](../packages/web/src/admin/AdminScreen.tsx#L4988) | `gap: 8,` |
| `AdminChannelPostCard` | [4992](../packages/web/src/admin/AdminScreen.tsx#L4992) | `<div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `AdminChannelPostCard` | [5002](../packages/web/src/admin/AdminScreen.tsx#L5002) | `style={{ width: 44, height: 44 }}` |
| `AdminChannelPostCard` | [5012](../packages/web/src/admin/AdminScreen.tsx#L5012) | `style={{ width: 44, height: 44 }}` |
| `AnticheatPanel` | [5056](../packages/web/src/admin/AdminScreen.tsx#L5056) | `gridTemplateColumns: 'minmax(0, 1fr) 126px',` |
| `AnticheatPanel` | [5057](../packages/web/src/admin/AdminScreen.tsx#L5057) | `gap: 8,` |
| `AnticheatPanel` | [5073](../packages/web/src/admin/AdminScreen.tsx#L5073) | `style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}` |
| `AnticheatPanel` | [5076](../packages/web/src/admin/AdminScreen.tsx#L5076) | `<div key={card.label} className="glass" style={{ borderRadius: 18, padding: 11 }}>` |
| `AnticheatPanel` | [5077](../packages/web/src/admin/AdminScreen.tsx#L5077) | `<div style={{ color: 'var(--ink)', fontSize: 21, fontWeight: 950 }}>` |
| `AnticheatPanel` | [5080](../packages/web/src/admin/AdminScreen.tsx#L5080) | `<div style={{ marginTop: 7, color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>` |
| `AnticheatPanel` | [5083](../packages/web/src/admin/AdminScreen.tsx#L5083) | `<div style={{ marginTop: 3, color: 'var(--ink)', fontSize: 10, fontWeight: 750 }}>` |
| `AnticheatPanel` | [5089](../packages/web/src/admin/AdminScreen.tsx#L5089) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `MismatchLogCard` | [5111](../packages/web/src/admin/AdminScreen.tsx#L5111) | `<article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>` |
| `MismatchLogCard` | [5115](../packages/web/src/admin/AdminScreen.tsx#L5115) | `gridTemplateColumns: '42px minmax(0, 1fr) auto',` |
| `MismatchLogCard` | [5116](../packages/web/src/admin/AdminScreen.tsx#L5116) | `gap: 10,` |
| `MismatchLogCard` | [5124](../packages/web/src/admin/AdminScreen.tsx#L5124) | `style={{ width: 42, height: 42, borderRadius: 999, objectFit: 'cover' }}` |
| `MismatchLogCard` | [5129](../packages/web/src/admin/AdminScreen.tsx#L5129) | `width: 42,` |
| `MismatchLogCard` | [5130](../packages/web/src/admin/AdminScreen.tsx#L5130) | `height: 42,` |
| `MismatchLogCard` | [5131](../packages/web/src/admin/AdminScreen.tsx#L5131) | `borderRadius: 999,` |
| `MismatchLogCard` | [5137](../packages/web/src/admin/AdminScreen.tsx#L5137) | `fontSize: 16,` |
| `MismatchLogCard` | [5138](../packages/web/src/admin/AdminScreen.tsx#L5138) | `fontWeight: 950,` |
| `MismatchLogCard` | [5144](../packages/web/src/admin/AdminScreen.tsx#L5144) | `<div style={{ minWidth: 0 }}>` |
| `MismatchLogCard` | [5148](../packages/web/src/admin/AdminScreen.tsx#L5148) | `fontSize: 14,` |
| `MismatchLogCard` | [5149](../packages/web/src/admin/AdminScreen.tsx#L5149) | `fontWeight: 950,` |
| `MismatchLogCard` | [5157](../packages/web/src/admin/AdminScreen.tsx#L5157) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>` |
| `MismatchLogCard` | [5161](../packages/web/src/admin/AdminScreen.tsx#L5161) | `<span className="pill pill--dark" style={{ fontSize: 10 }}>` |
| `MismatchLogCard` | [5168](../packages/web/src/admin/AdminScreen.tsx#L5168) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `MismatchLogCard` | [5169](../packages/web/src/admin/AdminScreen.tsx#L5169) | `gap: 8,` |
| `MismatchLogCard` | [5177](../packages/web/src/admin/AdminScreen.tsx#L5177) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `MismatchLogCard` | [5178](../packages/web/src/admin/AdminScreen.tsx#L5178) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `MismatchLogCard` | [5181](../packages/web/src/admin/AdminScreen.tsx#L5181) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `MismatchLogCard` | [5184](../packages/web/src/admin/AdminScreen.tsx#L5184) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `MismatchLogCard` | [5188](../packages/web/src/admin/AdminScreen.tsx#L5188) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `MismatchLogCard` | [5194](../packages/web/src/admin/AdminScreen.tsx#L5194) | `<summary style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>` |
| `MismatchLogCard` | [5200](../packages/web/src/admin/AdminScreen.tsx#L5200) | `padding: 10,` |
| `MismatchLogCard` | [5201](../packages/web/src/admin/AdminScreen.tsx#L5201) | `borderRadius: 14,` |
| `MismatchLogCard` | [5205](../packages/web/src/admin/AdminScreen.tsx#L5205) | `fontSize: 10,` |
| `MismatchLogCard` | [5206](../packages/web/src/admin/AdminScreen.tsx#L5206) | `lineHeight: 1.45,` |
| `MismatchInfo` | [5221](../packages/web/src/admin/AdminScreen.tsx#L5221) | `borderRadius: 14,` |
| `MismatchInfo` | [5222](../packages/web/src/admin/AdminScreen.tsx#L5222) | `padding: '8px 9px',` |
| `MismatchInfo` | [5224](../packages/web/src/admin/AdminScreen.tsx#L5224) | `minWidth: 0,` |
| `MismatchInfo` | [5227](../packages/web/src/admin/AdminScreen.tsx#L5227) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{label}</div>` |
| `MismatchInfo` | [5232](../packages/web/src/admin/AdminScreen.tsx#L5232) | `fontSize: 13,` |
| `MismatchInfo` | [5233](../packages/web/src/admin/AdminScreen.tsx#L5233) | `fontWeight: 950,` |
| `PaymentsPanel` | [5305](../packages/web/src/admin/AdminScreen.tsx#L5305) | `<section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>` |
| `PaymentsPanel` | [5307](../packages/web/src/admin/AdminScreen.tsx#L5307) | `<div key={card.label} className="glass" style={{ borderRadius: 18, padding: 10 }}>` |
| `PaymentsPanel` | [5308](../packages/web/src/admin/AdminScreen.tsx#L5308) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{card.label}</div>` |
| `PaymentsPanel` | [5309](../packages/web/src/admin/AdminScreen.tsx#L5309) | `<div style={{ marginTop: 5, color: 'var(--ink)', fontSize: 16, fontWeight: 950 }}>` |
| `PaymentsPanel` | [5312](../packages/web/src/admin/AdminScreen.tsx#L5312) | `<div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>` |
| `PaymentsPanel` | [5320](../packages/web/src/admin/AdminScreen.tsx#L5320) | `style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}` |
| `PaymentsPanel` | [5325](../packages/web/src/admin/AdminScreen.tsx#L5325) | `borderRadius: 999,` |
| `PaymentsPanel` | [5326](../packages/web/src/admin/AdminScreen.tsx#L5326) | `padding: '0 12px',` |
| `PaymentsPanel` | [5327](../packages/web/src/admin/AdminScreen.tsx#L5327) | `height: 40,` |
| `PaymentsPanel` | [5330](../packages/web/src/admin/AdminScreen.tsx#L5330) | `gap: 8,` |
| `PaymentsPanel` | [5342](../packages/web/src/admin/AdminScreen.tsx#L5342) | `minWidth: 0,` |
| `PaymentsPanel` | [5343](../packages/web/src/admin/AdminScreen.tsx#L5343) | `width: 'auto',` |
| `PaymentsPanel` | [5344](../packages/web/src/admin/AdminScreen.tsx#L5344) | `height: 'auto',` |
| `PaymentsPanel` | [5345](../packages/web/src/admin/AdminScreen.tsx#L5345) | `padding: 0,` |
| `PaymentsPanel` | [5350](../packages/web/src/admin/AdminScreen.tsx#L5350) | `fontSize: 14,` |
| `PaymentsPanel` | [5351](../packages/web/src/admin/AdminScreen.tsx#L5351) | `fontWeight: 600,` |
| `PaymentsPanel` | [5356](../packages/web/src/admin/AdminScreen.tsx#L5356) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>` |
| `PaymentsPanel` | [5374](../packages/web/src/admin/AdminScreen.tsx#L5374) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>` |
| `PaymentsPanel` | [5396](../packages/web/src/admin/AdminScreen.tsx#L5396) | `style={{ width: 44, height: 44, alignSelf: 'end', opacity: filtersChanged ? 1 : 0.5 }}` |
| `PaymentsPanel` | [5402](../packages/web/src/admin/AdminScreen.tsx#L5402) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `PaymentCard` | [5418](../packages/web/src/admin/AdminScreen.tsx#L5418) | `borderRadius: 18,` |
| `PaymentCard` | [5419](../packages/web/src/admin/AdminScreen.tsx#L5419) | `padding: 12,` |
| `PaymentCard` | [5421](../packages/web/src/admin/AdminScreen.tsx#L5421) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `PaymentCard` | [5422](../packages/web/src/admin/AdminScreen.tsx#L5422) | `gap: 10,` |
| `PaymentCard` | [5426](../packages/web/src/admin/AdminScreen.tsx#L5426) | `<div style={{ minWidth: 0 }}>` |
| `PaymentCard` | [5427](../packages/web/src/admin/AdminScreen.tsx#L5427) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>{payment.title}</div>` |
| `PaymentCard` | [5428](../packages/web/src/admin/AdminScreen.tsx#L5428) | `<div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `PaymentCard` | [5435](../packages/web/src/admin/AdminScreen.tsx#L5435) | `fontSize: 11,` |
| `PaymentCard` | [5436](../packages/web/src/admin/AdminScreen.tsx#L5436) | `lineHeight: 1.5,` |
| `PaymentCard` | [5448](../packages/web/src/admin/AdminScreen.tsx#L5448) | `<div style={{ display: 'grid', justifyItems: 'end', gap: 6 }}>` |
| `PaymentCard` | [5450](../packages/web/src/admin/AdminScreen.tsx#L5450) | `<span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `openEditor` | [5479](../packages/web/src/admin/AdminScreen.tsx#L5479) | `style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}` |
| `openEditor` | [5509](../packages/web/src/admin/AdminScreen.tsx#L5509) | `style={{ borderRadius: 18, padding: 12, display: 'flex', gap: 10, alignItems: 'start' }}` |
| `openEditor` | [5511](../packages/web/src/admin/AdminScreen.tsx#L5511) | `<div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>` |
| `openEditor` | [5512](../packages/web/src/admin/AdminScreen.tsx#L5512) | `<div style={{ fontWeight: 900 }}>{item.title}</div>` |
| `openEditor` | [5516](../packages/web/src/admin/AdminScreen.tsx#L5516) | `<div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 12 }}>` |
| `openEditor` | [5519](../packages/web/src/admin/AdminScreen.tsx#L5519) | `<div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 11 }}>` |
| `openEditor` | [5522](../packages/web/src/admin/AdminScreen.tsx#L5522) | `<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>` |
| `CoinPackageEditor` | [5586](../packages/web/src/admin/AdminScreen.tsx#L5586) | `style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 12 }}` |
| `CoinPackageEditor` | [5641](../packages/web/src/admin/AdminScreen.tsx#L5641) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>` |
| `CoinPackageEditor` | [5691](../packages/web/src/admin/AdminScreen.tsx#L5691) | `<label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `CoinPackageEditor` | [5699](../packages/web/src/admin/AdminScreen.tsx#L5699) | `<p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>` |
| `FeedbackPanel` | [5755](../packages/web/src/admin/AdminScreen.tsx#L5755) | `borderRadius: 18,` |
| `FeedbackPanel` | [5756](../packages/web/src/admin/AdminScreen.tsx#L5756) | `padding: 12,` |
| `FeedbackPanel` | [5758](../packages/web/src/admin/AdminScreen.tsx#L5758) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `FeedbackPanel` | [5759](../packages/web/src/admin/AdminScreen.tsx#L5759) | `gap: 8,` |
| `FeedbackPanel` | [5766](../packages/web/src/admin/AdminScreen.tsx#L5766) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `FeedbackPanel` | [5767](../packages/web/src/admin/AdminScreen.tsx#L5767) | `gap: 8,` |
| `FeedbackPanel` | [5803](../packages/web/src/admin/AdminScreen.tsx#L5803) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `FeedbackMetric` | [5831](../packages/web/src/admin/AdminScreen.tsx#L5831) | `minWidth: 0,` |
| `FeedbackMetric` | [5833](../packages/web/src/admin/AdminScreen.tsx#L5833) | `borderRadius: 15,` |
| `FeedbackMetric` | [5834](../packages/web/src/admin/AdminScreen.tsx#L5834) | `padding: '8px 8px 9px',` |
| `FeedbackMetric` | [5838](../packages/web/src/admin/AdminScreen.tsx#L5838) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 900 }}>{label}</div>` |
| `FeedbackMetric` | [5844](../packages/web/src/admin/AdminScreen.tsx#L5844) | `fontSize: 18,` |
| `FeedbackMetric` | [5845](../packages/web/src/admin/AdminScreen.tsx#L5845) | `fontWeight: 950,` |
| `FeedbackMetric` | [5846](../packages/web/src/admin/AdminScreen.tsx#L5846) | `lineHeight: 1.05,` |
| `FeedbackMetric` | [5853](../packages/web/src/admin/AdminScreen.tsx#L5853) | `<span style={{ marginLeft: 3, fontSize: 11, fontFamily: 'var(--font-ui)' }}>` |
| `FeedbackCard` | [5875](../packages/web/src/admin/AdminScreen.tsx#L5875) | `borderRadius: 18,` |
| `FeedbackCard` | [5876](../packages/web/src/admin/AdminScreen.tsx#L5876) | `padding: 12,` |
| `FeedbackCard` | [5878](../packages/web/src/admin/AdminScreen.tsx#L5878) | `gap: 10,` |
| `FeedbackCard` | [5885](../packages/web/src/admin/AdminScreen.tsx#L5885) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `FeedbackCard` | [5886](../packages/web/src/admin/AdminScreen.tsx#L5886) | `gap: 10,` |
| `FeedbackCard` | [5890](../packages/web/src/admin/AdminScreen.tsx#L5890) | `<div style={{ minWidth: 0 }}>` |
| `FeedbackCard` | [5891](../packages/web/src/admin/AdminScreen.tsx#L5891) | `<div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>` |
| `FeedbackCard` | [5892](../packages/web/src/admin/AdminScreen.tsx#L5892) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `FeedbackCard` | [5898](../packages/web/src/admin/AdminScreen.tsx#L5898) | `style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}` |
| `FeedbackCard` | [5909](../packages/web/src/admin/AdminScreen.tsx#L5909) | `fontSize: 14,` |
| `FeedbackCard` | [5910](../packages/web/src/admin/AdminScreen.tsx#L5910) | `fontWeight: 900,` |
| `FeedbackCard` | [5916](../packages/web/src/admin/AdminScreen.tsx#L5916) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `FeedbackCard` | [5925](../packages/web/src/admin/AdminScreen.tsx#L5925) | `minHeight: 38,` |
| `FeedbackCard` | [5926](../packages/web/src/admin/AdminScreen.tsx#L5926) | `padding: '0 12px',` |
| `FeedbackCard` | [5927](../packages/web/src/admin/AdminScreen.tsx#L5927) | `borderRadius: 13,` |
| `FeedbackCard` | [5928](../packages/web/src/admin/AdminScreen.tsx#L5928) | `fontSize: 11,` |
| `FeedbackCard` | [5941](../packages/web/src/admin/AdminScreen.tsx#L5941) | `minHeight: 38,` |
| `FeedbackCard` | [5942](../packages/web/src/admin/AdminScreen.tsx#L5942) | `padding: '0 12px',` |
| `FeedbackCard` | [5943](../packages/web/src/admin/AdminScreen.tsx#L5943) | `borderRadius: 13,` |
| `FeedbackCard` | [5944](../packages/web/src/admin/AdminScreen.tsx#L5944) | `fontSize: 11,` |
| `FeedbackCard` | [5956](../packages/web/src/admin/AdminScreen.tsx#L5956) | `fontSize: 13,` |
| `FeedbackCard` | [5957](../packages/web/src/admin/AdminScreen.tsx#L5957) | `fontWeight: 700,` |
| `FeedbackCard` | [5958](../packages/web/src/admin/AdminScreen.tsx#L5958) | `lineHeight: 1.45,` |
| `InventoryPanel` | [5995](../packages/web/src/admin/AdminScreen.tsx#L5995) | `gap: 10,` |
| `InventoryPanel` | [6005](../packages/web/src/admin/AdminScreen.tsx#L6005) | `style={{ padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}` |
| `InventoryPanel` | [6021](../packages/web/src/admin/AdminScreen.tsx#L6021) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `InventoryItemCard` | [6060](../packages/web/src/admin/AdminScreen.tsx#L6060) | `borderRadius: 18,` |
| `InventoryItemCard` | [6061](../packages/web/src/admin/AdminScreen.tsx#L6061) | `padding: 12,` |
| `InventoryItemCard` | [6063](../packages/web/src/admin/AdminScreen.tsx#L6063) | `gridTemplateColumns: '56px minmax(0, 1fr)',` |
| `InventoryItemCard` | [6064](../packages/web/src/admin/AdminScreen.tsx#L6064) | `gap: 10,` |
| `InventoryItemCard` | [6068](../packages/web/src/admin/AdminScreen.tsx#L6068) | `<div style={{ minWidth: 0 }}>` |
| `InventoryItemCard` | [6069](../packages/web/src/admin/AdminScreen.tsx#L6069) | `<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>` |
| `InventoryItemCard` | [6070](../packages/web/src/admin/AdminScreen.tsx#L6070) | `<div style={{ minWidth: 0 }}>` |
| `InventoryItemCard` | [6071](../packages/web/src/admin/AdminScreen.tsx#L6071) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>{item.title}</div>` |
| `InventoryItemCard` | [6072](../packages/web/src/admin/AdminScreen.tsx#L6072) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>` |
| `InventoryItemCard` | [6080](../packages/web/src/admin/AdminScreen.tsx#L6080) | `<div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>` |
| `InventoryItemCard` | [6081](../packages/web/src/admin/AdminScreen.tsx#L6081) | `<span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `InventoryItemCard` | [6084](../packages/web/src/admin/AdminScreen.tsx#L6084) | `<span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `InventoryItemCard` | [6087](../packages/web/src/admin/AdminScreen.tsx#L6087) | `<span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `InventoryItemCard` | [6090](../packages/web/src/admin/AdminScreen.tsx#L6090) | `<span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `InventoryItemCard` | [6093](../packages/web/src/admin/AdminScreen.tsx#L6093) | `<span className="pill" style={{ fontSize: 10, padding: '4px 8px' }}>` |
| `InventoryItemCard` | [6097](../packages/web/src/admin/AdminScreen.tsx#L6097) | `<div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8 }}>` |
| `InventoryItemCard` | [6102](../packages/web/src/admin/AdminScreen.tsx#L6102) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `InventoryItemCard` | [6112](../packages/web/src/admin/AdminScreen.tsx#L6112) | `style={{ width: 44, height: 44 }}` |
| `InventoryThumb` | [6128](../packages/web/src/admin/AdminScreen.tsx#L6128) | `style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }}` |
| `InventoryThumb` | [6135](../packages/web/src/admin/AdminScreen.tsx#L6135) | `width: 56,` |
| `InventoryThumb` | [6136](../packages/web/src/admin/AdminScreen.tsx#L6136) | `height: 56,` |
| `InventoryThumb` | [6137](../packages/web/src/admin/AdminScreen.tsx#L6137) | `borderRadius: 14,` |
| `handleItemKindChange` | [6417](../packages/web/src/admin/AdminScreen.tsx#L6417) | `padding: 'calc(12px + var(--app-safe-top)) 12px calc(12px + var(--app-safe-bottom))',` |
| `handleItemKindChange` | [6423](../packages/web/src/admin/AdminScreen.tsx#L6423) | `width: 'min(520px, calc(100vw - 24px))',` |
| `handleItemKindChange` | [6424](../packages/web/src/admin/AdminScreen.tsx#L6424) | `maxHeight: '100%',` |
| `handleItemKindChange` | [6427](../packages/web/src/admin/AdminScreen.tsx#L6427) | `gap: 10,` |
| `handleItemKindChange` | [6430](../packages/web/src/admin/AdminScreen.tsx#L6430) | `<div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>` |
| `handleItemKindChange` | [6431](../packages/web/src/admin/AdminScreen.tsx#L6431) | `<div style={{ flex: 1, minWidth: 0 }}>` |
| `handleItemKindChange` | [6437](../packages/web/src/admin/AdminScreen.tsx#L6437) | `style={{ marginTop: 4, fontSize: 11, fontWeight: 520, lineHeight: 1.22 }}` |
| `handleItemKindChange` | [6469](../packages/web/src/admin/AdminScreen.tsx#L6469) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `handleItemKindChange` | [6487](../packages/web/src/admin/AdminScreen.tsx#L6487) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `handleItemKindChange` | [6560](../packages/web/src/admin/AdminScreen.tsx#L6560) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `handleItemKindChange` | [6561](../packages/web/src/admin/AdminScreen.tsx#L6561) | `gap: 12,` |
| `handleItemKindChange` | [6628](../packages/web/src/admin/AdminScreen.tsx#L6628) | `<section style={{ display: 'grid', gap: 10 }}>` |
| `handleItemKindChange` | [6629](../packages/web/src/admin/AdminScreen.tsx#L6629) | `<div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ink)' }}>` |
| `handleItemKindChange` | [6635](../packages/web/src/admin/AdminScreen.tsx#L6635) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `handleItemKindChange` | [6746](../packages/web/src/admin/AdminScreen.tsx#L6746) | `<section style={{ display: 'grid', gap: 10 }}>` |
| `handleItemKindChange` | [6747](../packages/web/src/admin/AdminScreen.tsx#L6747) | `<div style={{ fontSize: 12, fontWeight: 900, color: 'var(--ink)' }}>` |
| `handleItemKindChange` | [6753](../packages/web/src/admin/AdminScreen.tsx#L6753) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `handleItemKindChange` | [6878](../packages/web/src/admin/AdminScreen.tsx#L6878) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `handleItemKindChange` | [6883](../packages/web/src/admin/AdminScreen.tsx#L6883) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `handleItemKindChange` | [6892](../packages/web/src/admin/AdminScreen.tsx#L6892) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `handleItemKindChange` | [6898](../packages/web/src/admin/AdminScreen.tsx#L6898) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>` |
| `AchievementsAdminPanel` | [6955](../packages/web/src/admin/AdminScreen.tsx#L6955) | `<section className="glass" style={{ borderRadius: 20, padding: 14 }}>` |
| `AchievementsAdminPanel` | [6959](../packages/web/src/admin/AdminScreen.tsx#L6959) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `AchievementsAdminPanel` | [6960](../packages/web/src/admin/AdminScreen.tsx#L6960) | `gap: 8,` |
| `AchievementsAdminPanel` | [6971](../packages/web/src/admin/AdminScreen.tsx#L6971) | `gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 0.8fr)',` |
| `AchievementsAdminPanel` | [6972](../packages/web/src/admin/AdminScreen.tsx#L6972) | `gap: 8,` |
| `AchievementsAdminPanel` | [7002](../packages/web/src/admin/AdminScreen.tsx#L7002) | `<section style={{ display: 'grid', gap: 10 }}>` |
| `AchievementAdminCard` | [7105](../packages/web/src/admin/AdminScreen.tsx#L7105) | `<article className="glass" style={{ borderRadius: 20, padding: 14 }}>` |
| `AchievementAdminCard` | [7109](../packages/web/src/admin/AdminScreen.tsx#L7109) | `gridTemplateColumns: '58px minmax(0, 1fr) auto',` |
| `AchievementAdminCard` | [7110](../packages/web/src/admin/AdminScreen.tsx#L7110) | `gap: 12,` |
| `AchievementAdminCard` | [7119](../packages/web/src/admin/AdminScreen.tsx#L7119) | `style={{ borderRadius: 8, objectFit: 'cover', background: 'var(--liquid-inset-bg)' }}` |
| `AchievementAdminCard` | [7121](../packages/web/src/admin/AdminScreen.tsx#L7121) | `<div style={{ minWidth: 0 }}>` |
| `AchievementAdminCard` | [7122](../packages/web/src/admin/AdminScreen.tsx#L7122) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>` |
| `AchievementAdminCard` | [7125](../packages/web/src/admin/AdminScreen.tsx#L7125) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `AchievementAdminCard` | [7138](../packages/web/src/admin/AdminScreen.tsx#L7138) | `width: 42,` |
| `AchievementAdminCard` | [7139](../packages/web/src/admin/AdminScreen.tsx#L7139) | `height: 42,` |
| `AchievementAdminCard` | [7151](../packages/web/src/admin/AdminScreen.tsx#L7151) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `AchievementAdminCard` | [7152](../packages/web/src/admin/AdminScreen.tsx#L7152) | `gap: 8,` |
| `AchievementAdminCard` | [7159](../packages/web/src/admin/AdminScreen.tsx#L7159) | `<div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `AchievementAdminCard` | [7281](../packages/web/src/admin/AdminScreen.tsx#L7281) | `<div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>` |
| `AchievementAdminCard` | [7288](../packages/web/src/admin/AdminScreen.tsx#L7288) | `style={{ width: '100%', marginTop: 12 }}` |
| `DuelTemplatesPanel` | [7532](../packages/web/src/admin/AdminScreen.tsx#L7532) | `gap: 10,` |
| `DuelTemplatesPanel` | [7545](../packages/web/src/admin/AdminScreen.tsx#L7545) | `style={{ padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}` |
| `DuelTemplatesPanel` | [7564](../packages/web/src/admin/AdminScreen.tsx#L7564) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `DuelTemplateCard` | [7606](../packages/web/src/admin/AdminScreen.tsx#L7606) | `<article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>` |
| `DuelTemplateCard` | [7610](../packages/web/src/admin/AdminScreen.tsx#L7610) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `DuelTemplateCard` | [7612](../packages/web/src/admin/AdminScreen.tsx#L7612) | `gap: 8,` |
| `DuelTemplateCard` | [7615](../packages/web/src/admin/AdminScreen.tsx#L7615) | `<div style={{ minWidth: 0 }}>` |
| `DuelTemplateCard` | [7616](../packages/web/src/admin/AdminScreen.tsx#L7616) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>{template.title}</div>` |
| `DuelTemplateCard` | [7617](../packages/web/src/admin/AdminScreen.tsx#L7617) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 750 }}>` |
| `DuelTemplateCard` | [7623](../packages/web/src/admin/AdminScreen.tsx#L7623) | `style={{ alignSelf: 'start', minHeight: 34, padding: '0 14px', fontSize: 12 }}` |
| `DuelTemplateCard` | [7628](../packages/web/src/admin/AdminScreen.tsx#L7628) | `<div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>` |
| `DuelTemplateCard` | [7629](../packages/web/src/admin/AdminScreen.tsx#L7629) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7632](../packages/web/src/admin/AdminScreen.tsx#L7632) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7635](../packages/web/src/admin/AdminScreen.tsx#L7635) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7638](../packages/web/src/admin/AdminScreen.tsx#L7638) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7641](../packages/web/src/admin/AdminScreen.tsx#L7641) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7644](../packages/web/src/admin/AdminScreen.tsx#L7644) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7651](../packages/web/src/admin/AdminScreen.tsx#L7651) | `<span className="pill" style={{ fontSize: 10, color: rewardColor('star') }}>` |
| `DuelTemplateCard` | [7655](../packages/web/src/admin/AdminScreen.tsx#L7655) | `<span className="pill" style={{ fontSize: 10 }}>` |
| `DuelTemplateCard` | [7662](../packages/web/src/admin/AdminScreen.tsx#L7662) | `<div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `DuelTemplateCard` | [7667](../packages/web/src/admin/AdminScreen.tsx#L7667) | `<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>` |
| `DuelTemplateCard` | [7674](../packages/web/src/admin/AdminScreen.tsx#L7674) | `style={{ width: 40, height: 40 }}` |
| `DuelTemplateCard` | [7684](../packages/web/src/admin/AdminScreen.tsx#L7684) | `style={{ width: 40, height: 40 }}` |
| `DuelHistoryPanel` | [7755](../packages/web/src/admin/AdminScreen.tsx#L7755) | `<section style={{ display: 'grid', gap: 10 }}>` |
| `DuelHistoryPanel` | [7756](../packages/web/src/admin/AdminScreen.tsx#L7756) | `<div className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>` |
| `DuelHistoryPanel` | [7757](../packages/web/src/admin/AdminScreen.tsx#L7757) | `<div className="search-shell" style={{ minHeight: 42 }}>` |
| `DuelHistoryPanel` | [7769](../packages/web/src/admin/AdminScreen.tsx#L7769) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `DuelHistoryPanel` | [7811](../packages/web/src/admin/AdminScreen.tsx#L7811) | `style={{ alignSelf: 'end', padding: 12, fontSize: 12, letterSpacing: 0 }}` |
| `DuelHistoryPanel` | [7822](../packages/web/src/admin/AdminScreen.tsx#L7822) | `<article key={duel.id} className="glass" style={{ borderRadius: 18, padding: 12 }}>` |
| `DuelHistoryPanel` | [7823](../packages/web/src/admin/AdminScreen.tsx#L7823) | `<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>` |
| `DuelHistoryPanel` | [7824](../packages/web/src/admin/AdminScreen.tsx#L7824) | `<div style={{ minWidth: 0 }}>` |
| `DuelHistoryPanel` | [7825](../packages/web/src/admin/AdminScreen.tsx#L7825) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>` |
| `DuelHistoryPanel` | [7828](../packages/web/src/admin/AdminScreen.tsx#L7828) | `<div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `DuelHistoryPanel` | [7836](../packages/web/src/admin/AdminScreen.tsx#L7836) | `<div style={{ marginTop: 10, display: 'grid', gap: 6 }}>` |
| `DuelHistoryPanel` | [7840](../packages/web/src/admin/AdminScreen.tsx#L7840) | `<div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `DuelHistoryPanel` | [7852](../packages/web/src/admin/AdminScreen.tsx#L7852) | `style={{ padding: 12, fontSize: 12, letterSpacing: 0 }}` |
| `DuelHistoryParticipantRow` | [7870](../packages/web/src/admin/AdminScreen.tsx#L7870) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `DuelHistoryParticipantRow` | [7871](../packages/web/src/admin/AdminScreen.tsx#L7871) | `gap: 8,` |
| `DuelHistoryParticipantRow` | [7875](../packages/web/src/admin/AdminScreen.tsx#L7875) | `<div style={{ minWidth: 0, color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>` |
| `DuelHistoryParticipantRow` | [7878](../packages/web/src/admin/AdminScreen.tsx#L7878) | `<div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `requestSave` | [8151](../packages/web/src/admin/AdminScreen.tsx#L8151) | `padding: 'calc(16px + var(--app-safe-top)) 14px calc(16px + var(--app-safe-bottom))',` |
| `requestSave` | [8158](../packages/web/src/admin/AdminScreen.tsx#L8158) | `width: '100%',` |
| `requestSave` | [8159](../packages/web/src/admin/AdminScreen.tsx#L8159) | `maxWidth: 430,` |
| `requestSave` | [8160](../packages/web/src/admin/AdminScreen.tsx#L8160) | `maxHeight: '100%',` |
| `requestSave` | [8162](../packages/web/src/admin/AdminScreen.tsx#L8162) | `borderRadius: 24,` |
| `requestSave` | [8163](../packages/web/src/admin/AdminScreen.tsx#L8163) | `padding: 16,` |
| `requestSave` | [8165](../packages/web/src/admin/AdminScreen.tsx#L8165) | `gap: 10,` |
| `requestSave` | [8182](../packages/web/src/admin/AdminScreen.tsx#L8182) | `style={{ resize: 'vertical', minHeight: 78, lineHeight: 1.35 }}` |
| `requestSave` | [8188](../packages/web/src/admin/AdminScreen.tsx#L8188) | `borderRadius: 16,` |
| `requestSave` | [8189](../packages/web/src/admin/AdminScreen.tsx#L8189) | `padding: '10px 12px',` |
| `requestSave` | [8193](../packages/web/src/admin/AdminScreen.tsx#L8193) | `gap: 10,` |
| `requestSave` | [8196](../packages/web/src/admin/AdminScreen.tsx#L8196) | `<span style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 900 }}>Активен</span>` |
| `requestSave` | [8201](../packages/web/src/admin/AdminScreen.tsx#L8201) | `style={{ width: 18, height: 18 }}` |
| `requestSave` | [8212](../packages/web/src/admin/AdminScreen.tsx#L8212) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `requestSave` | [8228](../packages/web/src/admin/AdminScreen.tsx#L8228) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `requestSave` | [8280](../packages/web/src/admin/AdminScreen.tsx#L8280) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `requestSave` | [8325](../packages/web/src/admin/AdminScreen.tsx#L8325) | `borderRadius: 18,` |
| `requestSave` | [8326](../packages/web/src/admin/AdminScreen.tsx#L8326) | `padding: 12,` |
| `requestSave` | [8328](../packages/web/src/admin/AdminScreen.tsx#L8328) | `gap: 10,` |
| `requestSave` | [8332](../packages/web/src/admin/AdminScreen.tsx#L8332) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 950 }}>` |
| `requestSave` | [8353](../packages/web/src/admin/AdminScreen.tsx#L8353) | `<div style={{ display: 'grid', gridTemplateColumns: '1.6fr repeat(3, 1fr)', gap: 6 }}>` |
| `requestSave` | [8354](../packages/web/src/admin/AdminScreen.tsx#L8354) | `<span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>Результат</span>` |
| `requestSave` | [8355](../packages/web/src/admin/AdminScreen.tsx#L8355) | `<span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>Монеты</span>` |
| `requestSave` | [8356](../packages/web/src/admin/AdminScreen.tsx#L8356) | `<span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>Звёзды</span>` |
| `requestSave` | [8357](../packages/web/src/admin/AdminScreen.tsx#L8357) | `<span style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 850 }}>Жетоны</span>` |
| `requestSave` | [8361](../packages/web/src/admin/AdminScreen.tsx#L8361) | `style={{ color: 'var(--ink)', fontSize: 11, fontWeight: 800, alignSelf: 'center' }}` |
| `requestSave` | [8386](../packages/web/src/admin/AdminScreen.tsx#L8386) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>` |
| `requestSave` | [8394](../packages/web/src/admin/AdminScreen.tsx#L8394) | `borderRadius: 18,` |
| `requestSave` | [8395](../packages/web/src/admin/AdminScreen.tsx#L8395) | `padding: 12,` |
| `requestSave` | [8397](../packages/web/src/admin/AdminScreen.tsx#L8397) | `gap: 10,` |
| `requestSave` | [8401](../packages/web/src/admin/AdminScreen.tsx#L8401) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 950 }}>` |
| `requestSave` | [8409](../packages/web/src/admin/AdminScreen.tsx#L8409) | `borderRadius: 16,` |
| `requestSave` | [8410](../packages/web/src/admin/AdminScreen.tsx#L8410) | `padding: 10,` |
| `requestSave` | [8412](../packages/web/src/admin/AdminScreen.tsx#L8412) | `gap: 8,` |
| `requestSave` | [8416](../packages/web/src/admin/AdminScreen.tsx#L8416) | `<div style={{ color: 'var(--ink)', fontSize: 12, fontWeight: 950 }}>` |
| `requestSave` | [8422](../packages/web/src/admin/AdminScreen.tsx#L8422) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `requestSave` | [8423](../packages/web/src/admin/AdminScreen.tsx#L8423) | `gap: 8,` |
| `requestSave` | [8445](../packages/web/src/admin/AdminScreen.tsx#L8445) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>` |
| `requestSave` | [8449](../packages/web/src/admin/AdminScreen.tsx#L8449) | `<div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>` |
| `requestSave` | [8455](../packages/web/src/admin/AdminScreen.tsx#L8455) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `requestSave` | [8464](../packages/web/src/admin/AdminScreen.tsx#L8464) | `style={{ padding: '10px', fontSize: 12, letterSpacing: 0 }}` |
| `requestSave` | [8470](../packages/web/src/admin/AdminScreen.tsx#L8470) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 12 }}>` |
| `SettingsPanel` | [8510](../packages/web/src/admin/AdminScreen.tsx#L8510) | `gap: 6,` |
| `SettingsPanel` | [8511](../packages/web/src/admin/AdminScreen.tsx#L8511) | `padding: '8px 12px',` |
| `SettingsPanel` | [8521](../packages/web/src/admin/AdminScreen.tsx#L8521) | `<p className="glass" style={{ padding: 14, margin: 0, borderRadius: 14 }}>` |
| `SettingsPanel` | [8528](../packages/web/src/admin/AdminScreen.tsx#L8528) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>` |
| `SettingsPanel` | [8532](../packages/web/src/admin/AdminScreen.tsx#L8532) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>` |
| `SettingsPanel` | [8535](../packages/web/src/admin/AdminScreen.tsx#L8535) | `<div style={{ marginTop: 5, color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>` |
| `SettingsPanel` | [8560](../packages/web/src/admin/AdminScreen.tsx#L8560) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `SettingsPanel` | [8561](../packages/web/src/admin/AdminScreen.tsx#L8561) | `gap: 10,` |
| `SettingsPanel` | [8575](../packages/web/src/admin/AdminScreen.tsx#L8575) | `minHeight: 120,` |
| `SettingsPanel` | [8576](../packages/web/src/admin/AdminScreen.tsx#L8576) | `borderRadius: 20,` |
| `SettingsPanel` | [8577](../packages/web/src/admin/AdminScreen.tsx#L8577) | `padding: 14,` |
| `SettingsPanel` | [8583](../packages/web/src/admin/AdminScreen.tsx#L8583) | `gap: 12,` |
| `SettingsPanel` | [8591](../packages/web/src/admin/AdminScreen.tsx#L8591) | `width: 30,` |
| `SettingsPanel` | [8592](../packages/web/src/admin/AdminScreen.tsx#L8592) | `height: 30,` |
| `SettingsPanel` | [8593](../packages/web/src/admin/AdminScreen.tsx#L8593) | `borderRadius: 999,` |
| `SettingsPanel` | [8599](../packages/web/src/admin/AdminScreen.tsx#L8599) | `fontSize: 14,` |
| `SettingsPanel` | [8600](../packages/web/src/admin/AdminScreen.tsx#L8600) | `fontWeight: 950,` |
| `SettingsPanel` | [8605](../packages/web/src/admin/AdminScreen.tsx#L8605) | `<span className="pill" style={{ padding: 7 }}>` |
| `SettingsPanel` | [8612](../packages/web/src/admin/AdminScreen.tsx#L8612) | `fontSize: 16,` |
| `SettingsPanel` | [8613](../packages/web/src/admin/AdminScreen.tsx#L8613) | `lineHeight: 1.12,` |
| `SettingsPanel` | [8614](../packages/web/src/admin/AdminScreen.tsx#L8614) | `fontWeight: 950,` |
| `SettingsPanel` | [8619](../packages/web/src/admin/AdminScreen.tsx#L8619) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `SettingsPanel` | [8620](../packages/web/src/admin/AdminScreen.tsx#L8620) | `<span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>` |
| `PeriodSpeedSettings` | [8698](../packages/web/src/admin/AdminScreen.tsx#L8698) | `<section style={{ display: 'flex', flexDirection: 'column', gap: open ? 8 : 0 }}>` |
| `PeriodSpeedSettings` | [8705](../packages/web/src/admin/AdminScreen.tsx#L8705) | `borderRadius: 20,` |
| `PeriodSpeedSettings` | [8706](../packages/web/src/admin/AdminScreen.tsx#L8706) | `padding: '14px 16px',` |
| `PeriodSpeedSettings` | [8712](../packages/web/src/admin/AdminScreen.tsx#L8712) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `PeriodSpeedSettings` | [8714](../packages/web/src/admin/AdminScreen.tsx#L8714) | `gap: 10,` |
| `PeriodSpeedSettings` | [8717](../packages/web/src/admin/AdminScreen.tsx#L8717) | `<span style={{ minWidth: 0 }}>` |
| `PeriodSpeedSettings` | [8722](../packages/web/src/admin/AdminScreen.tsx#L8722) | `fontSize: 15,` |
| `PeriodSpeedSettings` | [8723](../packages/web/src/admin/AdminScreen.tsx#L8723) | `fontWeight: 950,` |
| `PeriodSpeedSettings` | [8733](../packages/web/src/admin/AdminScreen.tsx#L8733) | `fontSize: 11,` |
| `PeriodSpeedSettings` | [8734](../packages/web/src/admin/AdminScreen.tsx#L8734) | `fontWeight: 800,` |
| `PeriodSpeedSettings` | [8746](../packages/web/src/admin/AdminScreen.tsx#L8746) | `width: 38,` |
| `PeriodSpeedSettings` | [8747](../packages/web/src/admin/AdminScreen.tsx#L8747) | `height: 38,` |
| `PeriodSpeedSettings` | [8748](../packages/web/src/admin/AdminScreen.tsx#L8748) | `padding: 0,` |
| `SettingEditor` | [8796](../packages/web/src/admin/AdminScreen.tsx#L8796) | `<div className="glass" style={{ borderRadius: 20, padding: 14 }}>` |
| `SettingEditor` | [8797](../packages/web/src/admin/AdminScreen.tsx#L8797) | `<div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>` |
| `SettingEditor` | [8798](../packages/web/src/admin/AdminScreen.tsx#L8798) | `<div style={{ minWidth: 0 }}>` |
| `SettingEditor` | [8799](../packages/web/src/admin/AdminScreen.tsx#L8799) | `<div style={{ fontSize: 14, fontWeight: 950, color: 'var(--ink)' }}>{setting.label}</div>` |
| `SettingEditor` | [8800](../packages/web/src/admin/AdminScreen.tsx#L8800) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>` |
| `SettingEditor` | [8808](../packages/web/src/admin/AdminScreen.tsx#L8808) | `<div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8 }}>` |
| `SettingEditor` | [8836](../packages/web/src/admin/AdminScreen.tsx#L8836) | `width: 44,` |
| `SettingEditor` | [8837](../packages/web/src/admin/AdminScreen.tsx#L8837) | `height: 44,` |
| `SettingEditor` | [8846](../packages/web/src/admin/AdminScreen.tsx#L8846) | `<div role="alert" style={{ marginTop: 8, color: 'var(--red-deep)', fontSize: 12 }}>` |
| `AdminField` | [8856](../packages/web/src/admin/AdminScreen.tsx#L8856) | `<label style={{ display: 'grid', gap: 5, minWidth: 0 }}>` |
| `AdminField` | [8857](../packages/web/src/admin/AdminScreen.tsx#L8857) | `<span style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 800 }}>{label}</span>` |

</details>

<details>
<summary>admin/BonusGamesAdmin.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `moveActive` | [444](../packages/web/src/admin/BonusGamesAdmin.tsx#L444) | `<section style={{ display: 'grid', gap: 12 }}>` |
| `moveActive` | [446](../packages/web/src/admin/BonusGamesAdmin.tsx#L446) | `style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}` |
| `BonusGameCard` | [566](../packages/web/src/admin/BonusGamesAdmin.tsx#L566) | `<article className="glass" style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}>` |
| `BonusGameCard` | [567](../packages/web/src/admin/BonusGamesAdmin.tsx#L567) | `<div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 12 }}>` |
| `BonusGameCard` | [572](../packages/web/src/admin/BonusGamesAdmin.tsx#L572) | `style={{ width: 84, height: 70, borderRadius: 14, objectFit: 'cover' }}` |
| `BonusGameCard` | [577](../packages/web/src/admin/BonusGamesAdmin.tsx#L577) | `style={{ width: 84, height: 70, borderRadius: 14, background: 'var(--liquid-inset-bg)' }}` |
| `BonusGameCard` | [580](../packages/web/src/admin/BonusGamesAdmin.tsx#L580) | `<div style={{ minWidth: 0 }}>` |
| `BonusGameCard` | [581](../packages/web/src/admin/BonusGamesAdmin.tsx#L581) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 950 }}>{game.title}</div>` |
| `BonusGameCard` | [582](../packages/web/src/admin/BonusGamesAdmin.tsx#L582) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, lineHeight: 1.35 }}>` |
| `BonusGameCard` | [586](../packages/web/src/admin/BonusGamesAdmin.tsx#L586) | `<div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 11 }}>` |
| `PeriodEditor` | [1166](../packages/web/src/admin/BonusGamesAdmin.tsx#L1166) | `style={{ borderRadius: 18, padding: 12, display: 'grid', gap: 10 }}` |
| `PeriodEditor` | [1168](../packages/web/src/admin/BonusGamesAdmin.tsx#L1168) | `<div style={{ fontSize: 13, fontWeight: 950 }}>{period.periodNumber}-й период</div>` |
| `ReorderBonusGamesModal` | [1325](../packages/web/src/admin/BonusGamesAdmin.tsx#L1325) | `<div role="alert" style={{ marginTop: 10, color: 'var(--red-deep)', fontSize: 12 }}>` |
| `ArchiveBonusGameModal` | [1367](../packages/web/src/admin/BonusGamesAdmin.tsx#L1367) | `<div role="alert" style={{ marginTop: 10, color: 'var(--red-deep)', fontSize: 12 }}>` |
| `Modal` | [1405](../packages/web/src/admin/BonusGamesAdmin.tsx#L1405) | `width: 'min(720px, calc(100vw - 24px))',` |
| `Modal` | [1406](../packages/web/src/admin/BonusGamesAdmin.tsx#L1406) | `maxHeight: '100%',` |
| `Field` | [1422](../packages/web/src/admin/BonusGamesAdmin.tsx#L1422) | `gap: 5,` |
| `Field` | [1423](../packages/web/src/admin/BonusGamesAdmin.tsx#L1423) | `minWidth: 0,` |
| `Field` | [1425](../packages/web/src/admin/BonusGamesAdmin.tsx#L1425) | `fontSize: 11,` |
| `Field` | [1426](../packages/web/src/admin/BonusGamesAdmin.tsx#L1426) | `fontWeight: 850,` |
| `Grid` | [1466](../packages/web/src/admin/BonusGamesAdmin.tsx#L1466) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `AdminState` | [1483](../packages/web/src/admin/BonusGamesAdmin.tsx#L1483) | `padding: '10px 2px',` |
| `AdminState` | [1485](../packages/web/src/admin/BonusGamesAdmin.tsx#L1485) | `fontSize: 13,` |
| `AdminState` | [1486](../packages/web/src/admin/BonusGamesAdmin.tsx#L1486) | `fontWeight: 800,` |

</details>

<details>
<summary>admin/OnboardingAdmin.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `loadPreview` | [217](../packages/web/src/admin/OnboardingAdmin.tsx#L217) | `<section style={{ display: 'grid', gap: 12 }} aria-label="Управление онбордингом">` |
| `loadPreview` | [221](../packages/web/src/admin/OnboardingAdmin.tsx#L221) | `<div className="glass" style={{ padding: 6, borderRadius: 18, display: 'flex', gap: 6 }}>` |
| `loadPreview` | [243](../packages/web/src/admin/OnboardingAdmin.tsx#L243) | `<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>` |
| `loadPreview` | [267](../packages/web/src/admin/OnboardingAdmin.tsx#L267) | `<div className="glass" role="alert" style={{ padding: 12, color: '#9f1239' }}>` |
| `loadPreview` | [278](../packages/web/src/admin/OnboardingAdmin.tsx#L278) | `borderRadius: 18,` |
| `loadPreview` | [279](../packages/web/src/admin/OnboardingAdmin.tsx#L279) | `padding: 12,` |
| `loadPreview` | [281](../packages/web/src/admin/OnboardingAdmin.tsx#L281) | `gap: 8,` |
| `loadPreview` | [292](../packages/web/src/admin/OnboardingAdmin.tsx#L292) | `<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>` |
| `loadPreview` | [324](../packages/web/src/admin/OnboardingAdmin.tsx#L324) | `<div role="list" aria-label="Шаги онбординга" style={{ display: 'grid', gap: 8 }}>` |
| `loadPreview` | [343](../packages/web/src/admin/OnboardingAdmin.tsx#L343) | `borderRadius: 18,` |
| `loadPreview` | [344](../packages/web/src/admin/OnboardingAdmin.tsx#L344) | `padding: 12,` |
| `loadPreview` | [346](../packages/web/src/admin/OnboardingAdmin.tsx#L346) | `gap: 10,` |
| `loadPreview` | [389](../packages/web/src/admin/OnboardingAdmin.tsx#L389) | `style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}` |
| `loadPreview` | [449](../packages/web/src/admin/OnboardingAdmin.tsx#L449) | `<div style={{ position: 'relative', minHeight: 640, overflow: 'hidden', borderRadius: 24 }}>` |
| `OnboardingStatistics` | [534](../packages/web/src/admin/OnboardingAdmin.tsx#L534) | `<div style={{ display: 'grid', gap: 12 }}>` |
| `OnboardingStatistics` | [535](../packages/web/src/admin/OnboardingAdmin.tsx#L535) | `<div className="glass" style={{ borderRadius: 18, padding: 16, display: 'grid', gap: 12 }}>` |
| `OnboardingStatistics` | [553](../packages/web/src/admin/OnboardingAdmin.tsx#L553) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>` |
| `OnboardingStatistics` | [586](../packages/web/src/admin/OnboardingAdmin.tsx#L586) | `<div className="glass" role="status" style={{ borderRadius: 16, padding: 12 }}>` |
| `OnboardingStatistics` | [593](../packages/web/src/admin/OnboardingAdmin.tsx#L593) | `gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',` |
| `OnboardingStatistics` | [594](../packages/web/src/admin/OnboardingAdmin.tsx#L594) | `gap: 8,` |
| `OnboardingStatistics` | [598](../packages/web/src/admin/OnboardingAdmin.tsx#L598) | `<div className="glass" style={{ borderRadius: 16, padding: 12 }} key={label}>` |
| `OnboardingStatistics` | [604](../packages/web/src/admin/OnboardingAdmin.tsx#L604) | `<div className="glass" style={{ borderRadius: 18, padding: 12, overflowX: 'auto' }}>` |
| `OnboardingStatistics` | [605](../packages/web/src/admin/OnboardingAdmin.tsx#L605) | `<table style={{ width: '100%', borderCollapse: 'collapse' }}>` |

</details>

<details>
<summary>admin/OnboardingStepEditor.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `submit` | [74](../packages/web/src/admin/OnboardingStepEditor.tsx#L74) | `<section className="glass" style={{ padding: 14, borderRadius: 20, display: 'grid', gap: 12 }}>` |
| `submit` | [130](../packages/web/src/admin/OnboardingStepEditor.tsx#L130) | `{imageUrl && <img src={imageUrl} alt="Предпросмотр изображения" style={{ width: 120 }} />}` |
| `submit` | [159](../packages/web/src/admin/OnboardingStepEditor.tsx#L159) | `<div style={{ display: 'flex', gap: 8 }}>` |

</details>

<details>
<summary>amateur/AmateurAccessToast.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `AmateurAccessToast` | [40](../packages/web/src/amateur/AmateurAccessToast.tsx#L40) | `width: 'min(100%, 360px)',` |
| `AmateurAccessToast` | [41](../packages/web/src/amateur/AmateurAccessToast.tsx#L41) | `padding: '12px 15px',` |
| `AmateurAccessToast` | [42](../packages/web/src/amateur/AmateurAccessToast.tsx#L42) | `borderRadius: 18,` |
| `AmateurAccessToast` | [46](../packages/web/src/amateur/AmateurAccessToast.tsx#L46) | `<div style={{ fontSize: 14, fontWeight: 950, lineHeight: 1.2 }}>` |
| `AmateurAccessToast` | [53](../packages/web/src/amateur/AmateurAccessToast.tsx#L53) | `fontSize: 12,` |
| `AmateurAccessToast` | [54](../packages/web/src/amateur/AmateurAccessToast.tsx#L54) | `fontWeight: 760,` |
| `AmateurAccessToast` | [55](../packages/web/src/amateur/AmateurAccessToast.tsx#L55) | `lineHeight: 1.35,` |

</details>

<details>
<summary>app/App.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `AppExperience` | [372](../packages/web/src/app/App.tsx#L372) | `maxWidth: 430,` |
| `AppExperience` | [374](../packages/web/src/app/App.tsx#L374) | `width: '100%',` |
| `AppExperience` | [375](../packages/web/src/app/App.tsx#L375) | `height: 'var(--app-viewport-height, 100dvh)',` |
| `AppExperience` | [376](../packages/web/src/app/App.tsx#L376) | `minHeight: 'var(--app-viewport-height, 100dvh)',` |

</details>

<details>
<summary>auth/TelegramLoginButton.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `watchFrames` | [134](../packages/web/src/auth/TelegramLoginButton.tsx#L134) | `width: fallbackWidth,` |
| `watchFrames` | [138](../packages/web/src/auth/TelegramLoginButton.tsx#L138) | `gap: 8,` |
| `watchFrames` | [147](../packages/web/src/auth/TelegramLoginButton.tsx#L147) | `minHeight: widgetReady ? undefined : fallbackHeight,` |
| `watchFrames` | [156](../packages/web/src/auth/TelegramLoginButton.tsx#L156) | `width: '100%',` |
| `watchFrames` | [160](../packages/web/src/auth/TelegramLoginButton.tsx#L160) | `gap: 8,` |
| `watchFrames` | [167](../packages/web/src/auth/TelegramLoginButton.tsx#L167) | `fontSize: size === 'large' ? 13 : 12,` |
| `watchFrames` | [168](../packages/web/src/auth/TelegramLoginButton.tsx#L168) | `fontWeight: 700,` |
| `watchFrames` | [169](../packages/web/src/auth/TelegramLoginButton.tsx#L169) | `lineHeight: 1.35,` |
| `watchFrames` | [183](../packages/web/src/auth/TelegramLoginButton.tsx#L183) | `width: '100%',` |
| `watchFrames` | [184](../packages/web/src/auth/TelegramLoginButton.tsx#L184) | `height: fallbackHeight,` |
| `watchFrames` | [185](../packages/web/src/auth/TelegramLoginButton.tsx#L185) | `padding: '0 14px',` |
| `watchFrames` | [186](../packages/web/src/auth/TelegramLoginButton.tsx#L186) | `borderRadius: cornerRadius,` |
| `watchFrames` | [188](../packages/web/src/auth/TelegramLoginButton.tsx#L188) | `fontSize: size === 'large' ? 14 : 13,` |
| `watchFrames` | [189](../packages/web/src/auth/TelegramLoginButton.tsx#L189) | `fontWeight: 800,` |

</details>

<details>
<summary>bar/BarScene.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `finish` | [186](../packages/web/src/bar/BarScene.tsx#L186) | `width: &#96;${s.scale * 100}%&#96;,` |
| `finish` | [187](../packages/web/src/bar/BarScene.tsx#L187) | `height: &#96;${s.scale * 100}%&#96;,` |

</details>

<details>
<summary>bar/SpectatorRink.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `setParticipantsVisible` | [182](../packages/web/src/bar/SpectatorRink.tsx#L182) | `width: GOALIE_SIZE.width,` |
| `setParticipantsVisible` | [183](../packages/web/src/bar/SpectatorRink.tsx#L183) | `height: GOALIE_SIZE.height,` |
| `setParticipantsVisible` | [247](../packages/web/src/bar/SpectatorRink.tsx#L247) | `style={{ height: '100%' }}` |

</details>

<details>
<summary>bar/cards/CardInviteToast.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `CardInviteToast` | [94](../packages/web/src/bar/cards/CardInviteToast.tsx#L94) | `width: 'min(402px, calc(100vw - 24px))',` |
| `CardInviteToast` | [102](../packages/web/src/bar/cards/CardInviteToast.tsx#L102) | `borderRadius: 22,` |
| `CardInviteToast` | [103](../packages/web/src/bar/cards/CardInviteToast.tsx#L103) | `padding: 12,` |
| `CardInviteToast` | [105](../packages/web/src/bar/cards/CardInviteToast.tsx#L105) | `gap: 10,` |
| `CardInviteToast` | [108](../packages/web/src/bar/cards/CardInviteToast.tsx#L108) | `<div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>` |
| `CardInviteToast` | [115](../packages/web/src/bar/cards/CardInviteToast.tsx#L115) | `<div style={{ minWidth: 0 }}>` |
| `CardInviteToast` | [119](../packages/web/src/bar/cards/CardInviteToast.tsx#L119) | `fontSize: 14,` |
| `CardInviteToast` | [120](../packages/web/src/bar/cards/CardInviteToast.tsx#L120) | `fontWeight: 950,` |
| `CardInviteToast` | [128](../packages/web/src/bar/cards/CardInviteToast.tsx#L128) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 760, marginTop: 2 }}>` |
| `CardInviteToast` | [135](../packages/web/src/bar/cards/CardInviteToast.tsx#L135) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `CardInviteToast` | [140](../packages/web/src/bar/cards/CardInviteToast.tsx#L140) | `style={{ minHeight: 38, fontSize: 12, background: '#dc2626', color: '#fff' }}` |
| `CardInviteToast` | [148](../packages/web/src/bar/cards/CardInviteToast.tsx#L148) | `style={{ minHeight: 38, fontSize: 12, background: '#16a34a', color: '#fff' }}` |

</details>

<details>
<summary>bar/cards/OnlineDurakLobby.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `result` | [209](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L209) | `cardStyle={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320 }}` |
| `result` | [349](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L349) | `style={{ borderRadius: 16, padding: '10px 10px 12px', marginTop: 14 }}` |
| `result` | [351](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L351) | `<div className="section-label" style={{ margin: '0 0 8px', padding: '2px 0' }}>` |
| `result` | [355](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L355) | `style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6 }}` |
| `result` | [417](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L417) | `<div className="glass duel-quick-pick" style={{ borderRadius: 18, padding: 12 }}>` |
| `result` | [421](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L421) | `style={{ display: 'flex', gap: 10, overflowX: 'auto' }}` |
| `result` | [434](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L434) | `width: 58,` |
| `result` | [439](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L439) | `gap: 6,` |
| `result` | [440](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L440) | `fontSize: 10,` |
| `result` | [441](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L441) | `fontWeight: 900,` |
| `result` | [442](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L442) | `lineHeight: 1.05,` |
| `result` | [446](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L446) | `padding: 0,` |
| `result` | [462](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L462) | `width: 11,` |
| `result` | [463](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L463) | `height: 11,` |
| `result` | [464](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L464) | `borderRadius: 999,` |
| `result` | [477](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L477) | `width: '100%',` |
| `result` | [502](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L502) | `<div className="glass-dock-field duel-opponent-search" style={{ minHeight: 48 }}>` |
| `result` | [512](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L512) | `fontSize: 14,` |
| `result` | [513](../packages/web/src/bar/cards/OnlineDurakLobby.tsx#L513) | `fontWeight: 800,` |

</details>

<details>
<summary>bar/cards/preview.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `OnlineTablePreview` | [191](../packages/web/src/bar/cards/preview.tsx#L191) | `padding: 16,` |
| `OnlineTablePreview` | [194](../packages/web/src/bar/cards/preview.tsx#L194) | `minHeight: '100vh',` |

</details>

<details>
<summary>chat/components/ChannelPoll.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `onKey` | [83](../packages/web/src/chat/components/ChannelPoll.tsx#L83) | `width: MENU_WIDTH,` |
| `onKey` | [84](../packages/web/src/chat/components/ChannelPoll.tsx#L84) | `padding: 6,` |
| `onKey` | [85](../packages/web/src/chat/components/ChannelPoll.tsx#L85) | `borderRadius: 16,` |
| `onKey` | [98](../packages/web/src/chat/components/ChannelPoll.tsx#L98) | `width: '100%',` |
| `onKey` | [99](../packages/web/src/chat/components/ChannelPoll.tsx#L99) | `minHeight: 44,` |
| `onKey` | [102](../packages/web/src/chat/components/ChannelPoll.tsx#L102) | `gap: 10,` |
| `onKey` | [103](../packages/web/src/chat/components/ChannelPoll.tsx#L103) | `padding: '10px 12px',` |
| `onKey` | [107](../packages/web/src/chat/components/ChannelPoll.tsx#L107) | `fontSize: 14,` |
| `onKey` | [108](../packages/web/src/chat/components/ChannelPoll.tsx#L108) | `fontWeight: 850,` |
| `onKey` | [110](../packages/web/src/chat/components/ChannelPoll.tsx#L110) | `borderRadius: 12,` |
| `ChannelPoll` | [157](../packages/web/src/chat/components/ChannelPoll.tsx#L157) | `gap: 8,` |
| `ChannelPoll` | [174](../packages/web/src/chat/components/ChannelPoll.tsx#L174) | `width: '100%',` |
| `ChannelPoll` | [175](../packages/web/src/chat/components/ChannelPoll.tsx#L175) | `minHeight: 42,` |
| `ChannelPoll` | [179](../packages/web/src/chat/components/ChannelPoll.tsx#L179) | `borderRadius: 14,` |
| `ChannelPoll` | [182](../packages/web/src/chat/components/ChannelPoll.tsx#L182) | `padding: '10px 12px',` |
| `ChannelPoll` | [184](../packages/web/src/chat/components/ChannelPoll.tsx#L184) | `gridTemplateColumns: hasVoted ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',` |
| `ChannelPoll` | [185](../packages/web/src/chat/components/ChannelPoll.tsx#L185) | `gap: 10,` |
| `ChannelPoll` | [189](../packages/web/src/chat/components/ChannelPoll.tsx#L189) | `fontSize: 14,` |
| `ChannelPoll` | [190](../packages/web/src/chat/components/ChannelPoll.tsx#L190) | `fontWeight: option.selectedByMe ? 950 : 820,` |
| `ChannelPoll` | [200](../packages/web/src/chat/components/ChannelPoll.tsx#L200) | `width: &#96;${option.percent}%&#96;,` |
| `ChannelPoll` | [208](../packages/web/src/chat/components/ChannelPoll.tsx#L208) | `<span style={{ position: 'relative', minWidth: 0, wordBreak: 'break-word' }}>` |
| `ChannelPoll` | [212](../packages/web/src/chat/components/ChannelPoll.tsx#L212) | `<span style={{ position: 'relative', color: 'var(--muted)', fontWeight: 950 }}>` |
| `ChannelPoll` | [222](../packages/web/src/chat/components/ChannelPoll.tsx#L222) | `fontSize: 11,` |
| `ChannelPoll` | [223](../packages/web/src/chat/components/ChannelPoll.tsx#L223) | `fontWeight: 800,` |

</details>

<details>
<summary>chat/components/ChannelPollComposerSheet.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `requestClose` | [71](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L71) | `width: '100%',` |
| `requestClose` | [75](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L75) | `gap: 10,` |
| `requestClose` | [78](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L78) | `<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>` |
| `requestClose` | [83](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L83) | `width: 34,` |
| `requestClose` | [84](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L84) | `height: 34,` |
| `requestClose` | [85](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L85) | `minWidth: 34,` |
| `requestClose` | [86](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L86) | `minHeight: 34,` |
| `requestClose` | [87](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L87) | `borderRadius: 10,` |
| `requestClose` | [94](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L94) | `<div style={{ fontSize: 16, fontWeight: 950 }}>Опрос</div>` |
| `requestClose` | [106](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L106) | `width: '100%',` |
| `requestClose` | [108](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L108) | `minHeight: 96,` |
| `requestClose` | [109](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L109) | `maxHeight: '35dvh',` |
| `requestClose` | [112](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L112) | `borderRadius: 16,` |
| `requestClose` | [113](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L113) | `padding: 12,` |
| `requestClose` | [116](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L116) | `fontSize: 15,` |
| `requestClose` | [117](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L117) | `lineHeight: 1.45,` |
| `requestClose` | [123](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L123) | `<div style={{ display: 'grid', gap: 8 }}>` |
| `requestClose` | [129](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L129) | `gridTemplateColumns: options.length > 1 ? 'minmax(0, 1fr) 34px' : 'minmax(0, 1fr)',` |
| `requestClose` | [130](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L130) | `gap: 8,` |
| `requestClose` | [145](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L145) | `height: 40,` |
| `requestClose` | [148](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L148) | `borderRadius: 14,` |
| `requestClose` | [149](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L149) | `padding: '0 12px',` |
| `requestClose` | [152](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L152) | `fontSize: 14,` |
| `requestClose` | [165](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L165) | `width: 34,` |
| `requestClose` | [166](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L166) | `height: 34,` |
| `requestClose` | [167](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L167) | `minWidth: 34,` |
| `requestClose` | [168](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L168) | `minHeight: 34,` |
| `requestClose` | [169](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L169) | `borderRadius: 10,` |
| `requestClose` | [187](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L187) | `style={{ minHeight: 40, letterSpacing: 0 }}` |
| `requestClose` | [197](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L197) | `<div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>` |
| `requestClose` | [212](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L212) | `<div style={{ display: 'flex', gap: 8 }}>` |
| `requestClose` | [218](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L218) | `style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}` |
| `requestClose` | [230](../packages/web/src/chat/components/ChannelPollComposerSheet.tsx#L230) | `style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}` |

</details>

<details>
<summary>chat/components/ChannelPostCard.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ChannelPostCard` | [58](../packages/web/src/chat/components/ChannelPostCard.tsx#L58) | `borderRadius: 18,` |
| `ChannelPostCard` | [59](../packages/web/src/chat/components/ChannelPostCard.tsx#L59) | `padding: 14,` |
| `ChannelPostCard` | [65](../packages/web/src/chat/components/ChannelPostCard.tsx#L65) | `<div style={{ display: 'grid', gap: 8, marginBottom: hasText ? 12 : 0 }}>` |
| `ChannelPostCard` | [83](../packages/web/src/chat/components/ChannelPostCard.tsx#L83) | `width: '100%',` |
| `ChannelPostCard` | [84](../packages/web/src/chat/components/ChannelPostCard.tsx#L84) | `maxHeight: 320,` |
| `ChannelPostCard` | [86](../packages/web/src/chat/components/ChannelPostCard.tsx#L86) | `borderRadius: 16,` |
| `ChannelPostCard` | [101](../packages/web/src/chat/components/ChannelPostCard.tsx#L101) | `style={{ display: 'block', width: 260, maxWidth: '100%' }}` |
| `ChannelPostCard` | [115](../packages/web/src/chat/components/ChannelPostCard.tsx#L115) | `gap: 10,` |
| `ChannelPostCard` | [116](../packages/web/src/chat/components/ChannelPostCard.tsx#L116) | `padding: '10px 12px',` |
| `ChannelPostCard` | [117](../packages/web/src/chat/components/ChannelPostCard.tsx#L117) | `borderRadius: 16,` |
| `ChannelPostCard` | [124](../packages/web/src/chat/components/ChannelPostCard.tsx#L124) | `<span style={{ minWidth: 0 }}>` |
| `ChannelPostCard` | [128](../packages/web/src/chat/components/ChannelPostCard.tsx#L128) | `fontSize: 13,` |
| `ChannelPostCard` | [129](../packages/web/src/chat/components/ChannelPostCard.tsx#L129) | `fontWeight: 900,` |
| `ChannelPostCard` | [138](../packages/web/src/chat/components/ChannelPostCard.tsx#L138) | `<span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>{size}</span>` |
| `ChannelPostCard` | [150](../packages/web/src/chat/components/ChannelPostCard.tsx#L150) | `fontSize: 15,` |
| `ChannelPostCard` | [151](../packages/web/src/chat/components/ChannelPostCard.tsx#L151) | `lineHeight: 1.45,` |
| `ChannelPostCard` | [177](../packages/web/src/chat/components/ChannelPostCard.tsx#L177) | `gap: 8,` |
| `ChannelPostCard` | [190](../packages/web/src/chat/components/ChannelPostCard.tsx#L190) | `style={{ padding: '7px 10px', cursor: 'pointer' }}` |
| `ChannelPostCard` | [200](../packages/web/src/chat/components/ChannelPostCard.tsx#L200) | `style={{ padding: '7px 10px', cursor: 'pointer' }}` |
| `ChannelPostCard` | [209](../packages/web/src/chat/components/ChannelPostCard.tsx#L209) | `style={{ padding: '7px 10px', cursor: 'pointer' }}` |
| `ChannelPostCard` | [221](../packages/web/src/chat/components/ChannelPostCard.tsx#L221) | `fontSize: 11,` |
| `ChannelPostCard` | [222](../packages/web/src/chat/components/ChannelPostCard.tsx#L222) | `lineHeight: 1.2,` |

</details>

<details>
<summary>chat/components/ChannelPostEditorSheet.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `requestClose` | [88](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L88) | `width: '100%',` |
| `requestClose` | [92](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L92) | `gap: 10,` |
| `requestClose` | [95](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L95) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `requestClose` | [104](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L104) | `width: 34,` |
| `requestClose` | [105](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L105) | `height: 34,` |
| `requestClose` | [106](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L106) | `minWidth: 34,` |
| `requestClose` | [107](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L107) | `minHeight: 34,` |
| `requestClose` | [108](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L108) | `borderRadius: 10,` |
| `requestClose` | [123](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L123) | `width: 34,` |
| `requestClose` | [124](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L124) | `height: 34,` |
| `requestClose` | [125](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L125) | `minWidth: 34,` |
| `requestClose` | [126](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L126) | `minHeight: 34,` |
| `requestClose` | [127](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L127) | `borderRadius: 10,` |
| `requestClose` | [144](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L144) | `width: 34,` |
| `requestClose` | [145](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L145) | `height: 34,` |
| `requestClose` | [146](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L146) | `minWidth: 34,` |
| `requestClose` | [147](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L147) | `minHeight: 34,` |
| `requestClose` | [148](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L148) | `borderRadius: 10,` |
| `requestClose` | [166](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L166) | `width: '100%',` |
| `requestClose` | [168](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L168) | `minHeight: 150,` |
| `requestClose` | [169](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L169) | `maxHeight: '45dvh',` |
| `requestClose` | [172](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L172) | `borderRadius: 16,` |
| `requestClose` | [173](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L173) | `padding: 12,` |
| `requestClose` | [176](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L176) | `fontSize: 15,` |
| `requestClose` | [177](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L177) | `lineHeight: 1.45,` |
| `requestClose` | [189](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L189) | `borderRadius: 16,` |
| `requestClose` | [190](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L190) | `padding: 12,` |
| `requestClose` | [192](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L192) | `gap: 10,` |
| `requestClose` | [196](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L196) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>` |
| `requestClose` | [199](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L199) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 750, lineHeight: 1.35 }}>` |
| `requestClose` | [202](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L202) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `requestClose` | [208](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L208) | `style={{ minHeight: 40, letterSpacing: 0 }}` |
| `requestClose` | [218](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L218) | `minHeight: 40,` |
| `requestClose` | [234](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L234) | `<div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>` |
| `requestClose` | [249](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L249) | `<div style={{ display: 'flex', gap: 8 }}>` |
| `requestClose` | [255](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L255) | `style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}` |
| `requestClose` | [264](../packages/web/src/chat/components/ChannelPostEditorSheet.tsx#L264) | `style={{ flex: 1, minHeight: 44, letterSpacing: 0 }}` |

</details>

<details>
<summary>chat/components/ChatBubble.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ImageAttachment` | [65](../packages/web/src/chat/components/ChatBubble.tsx#L65) | `width: '100%',` |
| `ImageAttachment` | [69](../packages/web/src/chat/components/ChatBubble.tsx#L69) | `padding: 0,` |
| `ImageAttachment` | [79](../packages/web/src/chat/components/ChatBubble.tsx#L79) | `width: '100%',` |
| `ImageAttachment` | [80](../packages/web/src/chat/components/ChatBubble.tsx#L80) | `maxWidth: 240,` |
| `ImageAttachment` | [81](../packages/web/src/chat/components/ChatBubble.tsx#L81) | `minHeight: 150,` |
| `ImageAttachment` | [82](../packages/web/src/chat/components/ChatBubble.tsx#L82) | `borderRadius: 14,` |
| `ImageAttachment` | [85](../packages/web/src/chat/components/ChatBubble.tsx#L85) | `fontSize: 12,` |
| `ImageAttachment` | [86](../packages/web/src/chat/components/ChatBubble.tsx#L86) | `fontWeight: 800,` |
| `ImageAttachment` | [98](../packages/web/src/chat/components/ChatBubble.tsx#L98) | `width: '100%',` |
| `ImageAttachment` | [99](../packages/web/src/chat/components/ChatBubble.tsx#L99) | `maxWidth: 240,` |
| `ImageAttachment` | [100](../packages/web/src/chat/components/ChatBubble.tsx#L100) | `maxHeight: 260,` |
| `ImageAttachment` | [102](../packages/web/src/chat/components/ChatBubble.tsx#L102) | `borderRadius: 14,` |
| `onAuthorClick` | [149](../packages/web/src/chat/components/ChatBubble.tsx#L149) | `padding: 0,` |
| `timestamp` | [190](../packages/web/src/chat/components/ChatBubble.tsx#L190) | `gap: 3,` |
| `timestamp` | [191](../packages/web/src/chat/components/ChatBubble.tsx#L191) | `fontSize: 10,` |
| `timestamp` | [192](../packages/web/src/chat/components/ChatBubble.tsx#L192) | `lineHeight: '18px',` |
| `timestamp` | [193](../packages/web/src/chat/components/ChatBubble.tsx#L193) | `fontWeight: 600,` |
| `body` | [212](../packages/web/src/chat/components/ChatBubble.tsx#L212) | `maxWidth: showAvatarAndName ? '100%' : '78%',` |
| `body` | [221](../packages/web/src/chat/components/ChatBubble.tsx#L221) | `padding: '8px 12px',` |
| `body` | [222](../packages/web/src/chat/components/ChatBubble.tsx#L222) | `borderRadius: radius,` |
| `body` | [223](../packages/web/src/chat/components/ChatBubble.tsx#L223) | `fontSize: 14,` |
| `body` | [224](../packages/web/src/chat/components/ChatBubble.tsx#L224) | `lineHeight: 1.4,` |
| `body` | [239](../packages/web/src/chat/components/ChatBubble.tsx#L239) | `fontSize: 12,` |
| `body` | [240](../packages/web/src/chat/components/ChatBubble.tsx#L240) | `fontWeight: 700,` |
| `body` | [243](../packages/web/src/chat/components/ChatBubble.tsx#L243) | `maxWidth: '100%',` |
| `body` | [264](../packages/web/src/chat/components/ChatBubble.tsx#L264) | `<div style={{ display: 'grid', gap: 6, marginBottom: text.length > 0 ? 6 : 0 }}>` |
| `body` | [285](../packages/web/src/chat/components/ChatBubble.tsx#L285) | `width: 230,` |
| `body` | [286](../packages/web/src/chat/components/ChatBubble.tsx#L286) | `maxWidth: '100%',` |
| `body` | [302](../packages/web/src/chat/components/ChatBubble.tsx#L302) | `gap: 8,` |
| `body` | [303](../packages/web/src/chat/components/ChatBubble.tsx#L303) | `padding: '8px 10px',` |
| `body` | [304](../packages/web/src/chat/components/ChatBubble.tsx#L304) | `borderRadius: 14,` |
| `body` | [311](../packages/web/src/chat/components/ChatBubble.tsx#L311) | `<span style={{ minWidth: 0 }}>` |
| `body` | [315](../packages/web/src/chat/components/ChatBubble.tsx#L315) | `fontSize: 12,` |
| `body` | [316](../packages/web/src/chat/components/ChatBubble.tsx#L316) | `fontWeight: 800,` |
| `body` | [325](../packages/web/src/chat/components/ChatBubble.tsx#L325) | `<span style={{ display: 'block', fontSize: 10, opacity: 0.72 }}>{size}</span>` |
| `body` | [339](../packages/web/src/chat/components/ChatBubble.tsx#L339) | `width: timestampReserveWidth,` |
| `body` | [340](../packages/web/src/chat/components/ChatBubble.tsx#L340) | `height: 14,` |
| `body` | [350](../packages/web/src/chat/components/ChatBubble.tsx#L350) | `fontSize: 10,` |
| `body` | [351](../packages/web/src/chat/components/ChatBubble.tsx#L351) | `lineHeight: 1.2,` |
| `body` | [352](../packages/web/src/chat/components/ChatBubble.tsx#L352) | `fontWeight: 700,` |
| `avatar` | [415](../packages/web/src/chat/components/ChatBubble.tsx#L415) | `gap: 8,` |
| `avatar` | [417](../packages/web/src/chat/components/ChatBubble.tsx#L417) | `maxWidth: '85%',` |
| `avatar` | [422](../packages/web/src/chat/components/ChatBubble.tsx#L422) | `<div style={{ display: 'flex', flexDirection: 'column', alignItems: align, minWidth: 0 }}>` |

</details>

<details>
<summary>chat/components/ChatInput.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `submit` | [234](../packages/web/src/chat/components/ChatInput.tsx#L234) | `width: ROW_HEIGHT,` |
| `submit` | [235](../packages/web/src/chat/components/ChatInput.tsx#L235) | `height: ROW_HEIGHT,` |
| `submit` | [236](../packages/web/src/chat/components/ChatInput.tsx#L236) | `minWidth: ROW_HEIGHT,` |
| `submit` | [237](../packages/web/src/chat/components/ChatInput.tsx#L237) | `minHeight: ROW_HEIGHT,` |
| `submit` | [238](../packages/web/src/chat/components/ChatInput.tsx#L238) | `borderRadius: 999,` |
| `submit` | [239](../packages/web/src/chat/components/ChatInput.tsx#L239) | `padding: 0,` |
| `submit` | [269](../packages/web/src/chat/components/ChatInput.tsx#L269) | `<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>` |
| `submit` | [280](../packages/web/src/chat/components/ChatInput.tsx#L280) | `width: 32,` |
| `submit` | [281](../packages/web/src/chat/components/ChatInput.tsx#L281) | `height: 32,` |
| `submit` | [282](../packages/web/src/chat/components/ChatInput.tsx#L282) | `minWidth: 32,` |
| `submit` | [283](../packages/web/src/chat/components/ChatInput.tsx#L283) | `minHeight: 32,` |
| `submit` | [284](../packages/web/src/chat/components/ChatInput.tsx#L284) | `borderRadius: 10,` |
| `submit` | [299](../packages/web/src/chat/components/ChatInput.tsx#L299) | `width: 32,` |
| `submit` | [300](../packages/web/src/chat/components/ChatInput.tsx#L300) | `height: 32,` |
| `submit` | [301](../packages/web/src/chat/components/ChatInput.tsx#L301) | `minWidth: 32,` |
| `submit` | [302](../packages/web/src/chat/components/ChatInput.tsx#L302) | `minHeight: 32,` |
| `submit` | [303](../packages/web/src/chat/components/ChatInput.tsx#L303) | `borderRadius: 10,` |
| `submit` | [315](../packages/web/src/chat/components/ChatInput.tsx#L315) | `<div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>` |
| `submit` | [346](../packages/web/src/chat/components/ChatInput.tsx#L346) | `gap: 6,` |
| `submit` | [347](../packages/web/src/chat/components/ChatInput.tsx#L347) | `minWidth: 176,` |
| `submit` | [348](../packages/web/src/chat/components/ChatInput.tsx#L348) | `padding: 8,` |
| `submit` | [349](../packages/web/src/chat/components/ChatInput.tsx#L349) | `borderRadius: 18,` |
| `submit` | [365](../packages/web/src/chat/components/ChatInput.tsx#L365) | `width: '100%',` |
| `submit` | [366](../packages/web/src/chat/components/ChatInput.tsx#L366) | `minWidth: 0,` |
| `submit` | [367](../packages/web/src/chat/components/ChatInput.tsx#L367) | `height: 40,` |
| `submit` | [368](../packages/web/src/chat/components/ChatInput.tsx#L368) | `minHeight: 40,` |
| `submit` | [369](../packages/web/src/chat/components/ChatInput.tsx#L369) | `padding: '0 12px',` |
| `submit` | [370](../packages/web/src/chat/components/ChatInput.tsx#L370) | `gap: 10,` |
| `submit` | [371](../packages/web/src/chat/components/ChatInput.tsx#L371) | `borderRadius: 14,` |
| `submit` | [373](../packages/web/src/chat/components/ChatInput.tsx#L373) | `fontSize: 13,` |
| `submit` | [374](../packages/web/src/chat/components/ChatInput.tsx#L374) | `fontWeight: 900,` |
| `submit` | [392](../packages/web/src/chat/components/ChatInput.tsx#L392) | `width: '100%',` |
| `submit` | [393](../packages/web/src/chat/components/ChatInput.tsx#L393) | `minWidth: 0,` |
| `submit` | [394](../packages/web/src/chat/components/ChatInput.tsx#L394) | `height: 40,` |
| `submit` | [395](../packages/web/src/chat/components/ChatInput.tsx#L395) | `minHeight: 40,` |
| `submit` | [396](../packages/web/src/chat/components/ChatInput.tsx#L396) | `padding: '0 12px',` |
| `submit` | [397](../packages/web/src/chat/components/ChatInput.tsx#L397) | `gap: 10,` |
| `submit` | [398](../packages/web/src/chat/components/ChatInput.tsx#L398) | `borderRadius: 14,` |
| `submit` | [400](../packages/web/src/chat/components/ChatInput.tsx#L400) | `fontSize: 13,` |
| `submit` | [401](../packages/web/src/chat/components/ChatInput.tsx#L401) | `fontWeight: 900,` |
| `submit` | [433](../packages/web/src/chat/components/ChatInput.tsx#L433) | `padding: '0 14px',` |
| `submit` | [437](../packages/web/src/chat/components/ChatInput.tsx#L437) | `borderRadius: CORNER_RADIUS,` |
| `submit` | [440](../packages/web/src/chat/components/ChatInput.tsx#L440) | `fontSize: 14,` |
| `submit` | [441](../packages/web/src/chat/components/ChatInput.tsx#L441) | `lineHeight: &#96;${ROW_HEIGHT}px&#96;,` |
| `submit` | [442](../packages/web/src/chat/components/ChatInput.tsx#L442) | `height: ROW_HEIGHT,` |
| `submit` | [443](../packages/web/src/chat/components/ChatInput.tsx#L443) | `minHeight: ROW_HEIGHT,` |
| `submit` | [444](../packages/web/src/chat/components/ChatInput.tsx#L444) | `maxHeight: MULTILINE_MAX_HEIGHT,` |

</details>

<details>
<summary>chat/components/ChatListActionsMenu.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `onKey` | [82](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L82) | `width: PANEL_WIDTH,` |
| `onKey` | [83](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L83) | `padding: 6,` |
| `onKey` | [84](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L84) | `borderRadius: 16,` |
| `onKey` | [102](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L102) | `gap: 10,` |
| `onKey` | [103](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L103) | `padding: '10px 12px',` |
| `onKey` | [107](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L107) | `fontSize: 14,` |
| `onKey` | [109](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L109) | `borderRadius: 12,` |
| `onKey` | [129](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L129) | `gap: 10,` |
| `onKey` | [130](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L130) | `padding: '10px 12px',` |
| `onKey` | [134](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L134) | `fontSize: 14,` |
| `onKey` | [136](../packages/web/src/chat/components/ChatListActionsMenu.tsx#L136) | `borderRadius: 12,` |

</details>

<details>
<summary>chat/components/ChatListItem.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ChatListItemImpl` | [111](../packages/web/src/chat/components/ChatListItem.tsx#L111) | `gridTemplateColumns: '40px 1fr auto',` |
| `ChatListItemImpl` | [113](../packages/web/src/chat/components/ChatListItem.tsx#L113) | `gap: 12,` |
| `ChatListItemImpl` | [114](../packages/web/src/chat/components/ChatListItem.tsx#L114) | `width: '100%',` |
| `ChatListItemImpl` | [115](../packages/web/src/chat/components/ChatListItem.tsx#L115) | `padding: '12px 14px',` |
| `ChatListItemImpl` | [116](../packages/web/src/chat/components/ChatListItem.tsx#L116) | `borderRadius: 20,` |
| `ChatListItemImpl` | [138](../packages/web/src/chat/components/ChatListItem.tsx#L138) | `width: 4,` |
| `ChatListItemImpl` | [153](../packages/web/src/chat/components/ChatListItem.tsx#L153) | `width: 40,` |
| `ChatListItemImpl` | [154](../packages/web/src/chat/components/ChatListItem.tsx#L154) | `height: 40,` |
| `ChatListItemImpl` | [155](../packages/web/src/chat/components/ChatListItem.tsx#L155) | `borderRadius: 14,` |
| `ChatListItemImpl` | [174](../packages/web/src/chat/components/ChatListItem.tsx#L174) | `width: 11,` |
| `ChatListItemImpl` | [175](../packages/web/src/chat/components/ChatListItem.tsx#L175) | `height: 11,` |
| `ChatListItemImpl` | [176](../packages/web/src/chat/components/ChatListItem.tsx#L176) | `borderRadius: 999,` |
| `ChatListItemImpl` | [185](../packages/web/src/chat/components/ChatListItem.tsx#L185) | `<div style={{ minWidth: 0 }}>` |
| `ChatListItemImpl` | [188](../packages/web/src/chat/components/ChatListItem.tsx#L188) | `fontSize: 14,` |
| `ChatListItemImpl` | [189](../packages/web/src/chat/components/ChatListItem.tsx#L189) | `fontWeight: 700,` |
| `ChatListItemImpl` | [200](../packages/web/src/chat/components/ChatListItem.tsx#L200) | `fontSize: 12,` |
| `ChatListItemImpl` | [216](../packages/web/src/chat/components/ChatListItem.tsx#L216) | `gap: 4,` |
| `ChatListItemImpl` | [220](../packages/web/src/chat/components/ChatListItem.tsx#L220) | `<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>` |
| `ChatListItemImpl` | [235](../packages/web/src/chat/components/ChatListItem.tsx#L235) | `<span style={{ fontSize: 10, color: 'var(--muted)' }}>` |
| `ChatListItemImpl` | [243](../packages/web/src/chat/components/ChatListItem.tsx#L243) | `fontSize: 11,` |
| `ChatListItemImpl` | [244](../packages/web/src/chat/components/ChatListItem.tsx#L244) | `padding: '3px 9px',` |
| `ChatListItemImpl` | [245](../packages/web/src/chat/components/ChatListItem.tsx#L245) | `minWidth: 22,` |

</details>

<details>
<summary>chat/components/ChatRoomSearchBar.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ChatRoomSearchBar` | [27](../packages/web/src/chat/components/ChatRoomSearchBar.tsx#L27) | `maxHeight: open ? 44 : 0,` |
| `ChatRoomSearchBar` | [51](../packages/web/src/chat/components/ChatRoomSearchBar.tsx#L51) | `fontSize: 14,` |

</details>

<details>
<summary>chat/components/DuelChallengeModal.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DuelChallengeModal` | [229](../packages/web/src/chat/components/DuelChallengeModal.tsx#L229) | `cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}` |
| `DuelChallengeModal` | [242](../packages/web/src/chat/components/DuelChallengeModal.tsx#L242) | `<div style={{ display: 'grid', gap: 16 }}>` |
| `DuelChallengeModal` | [243](../packages/web/src/chat/components/DuelChallengeModal.tsx#L243) | `<div style={{ display: 'grid', gap: 8 }}>` |
| `DuelChallengeModal` | [245](../packages/web/src/chat/components/DuelChallengeModal.tsx#L245) | `<div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>` |
| `DuelChallengeModal` | [254](../packages/web/src/chat/components/DuelChallengeModal.tsx#L254) | `style={{ minHeight: 48 }}` |
| `DuelChallengeModal` | [278](../packages/web/src/chat/components/DuelChallengeModal.tsx#L278) | `borderRadius: 18,` |
| `DuelChallengeModal` | [279](../packages/web/src/chat/components/DuelChallengeModal.tsx#L279) | `padding: '12px 14px',` |
| `DuelChallengeModal` | [282](../packages/web/src/chat/components/DuelChallengeModal.tsx#L282) | `gap: 4,` |
| `DuelChallengeModal` | [283](../packages/web/src/chat/components/DuelChallengeModal.tsx#L283) | `gridTemplateColumns: 'minmax(0, 1fr) 20px',` |
| `DuelChallengeModal` | [298](../packages/web/src/chat/components/DuelChallengeModal.tsx#L298) | `<span style={{ gridColumn: 1, fontSize: 15, fontWeight: 900 }}>` |
| `DuelChallengeModal` | [303](../packages/web/src/chat/components/DuelChallengeModal.tsx#L303) | `fontSize: 12,` |
| `DuelChallengeModal` | [304](../packages/web/src/chat/components/DuelChallengeModal.tsx#L304) | `fontWeight: 700,` |
| `DuelChallengeModal` | [312](../packages/web/src/chat/components/DuelChallengeModal.tsx#L312) | `<span style={{ gridColumn: 1, fontSize: 12, color: 'var(--muted)' }}>` |
| `DuelChallengeModal` | [320](../packages/web/src/chat/components/DuelChallengeModal.tsx#L320) | `<div className="glass" style={{ borderRadius: 18, padding: 14, color: 'var(--muted)' }}>` |
| `DuelChallengeModal` | [327](../packages/web/src/chat/components/DuelChallengeModal.tsx#L327) | `<div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>{error}</div>` |

</details>

<details>
<summary>chat/components/MessageActionsMenu.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `panelPosition` | [25](../packages/web/src/chat/components/MessageActionsMenu.tsx#L25) | `function panelPosition(anchor: DOMRect, height: number): { top: number; left: number } {` |
| `onKey` | [84](../packages/web/src/chat/components/MessageActionsMenu.tsx#L84) | `width: PANEL_WIDTH,` |
| `onKey` | [85](../packages/web/src/chat/components/MessageActionsMenu.tsx#L85) | `padding: 6,` |
| `onKey` | [86](../packages/web/src/chat/components/MessageActionsMenu.tsx#L86) | `borderRadius: 16,` |
| `onKey` | [89](../packages/web/src/chat/components/MessageActionsMenu.tsx#L89) | `gap: 2,` |
| `onKey` | [98](../packages/web/src/chat/components/MessageActionsMenu.tsx#L98) | `gap: 4,` |
| `onKey` | [99](../packages/web/src/chat/components/MessageActionsMenu.tsx#L99) | `padding: '4px 6px',` |
| `onKey` | [114](../packages/web/src/chat/components/MessageActionsMenu.tsx#L114) | `height: 32,` |
| `onKey` | [118](../packages/web/src/chat/components/MessageActionsMenu.tsx#L118) | `fontSize: 20,` |
| `onKey` | [119](../packages/web/src/chat/components/MessageActionsMenu.tsx#L119) | `padding: 0,` |
| `onKey` | [120](../packages/web/src/chat/components/MessageActionsMenu.tsx#L120) | `lineHeight: 1,` |
| `onKey` | [121](../packages/web/src/chat/components/MessageActionsMenu.tsx#L121) | `borderRadius: 8,` |
| `onKey` | [132](../packages/web/src/chat/components/MessageActionsMenu.tsx#L132) | `width: 32,` |
| `onKey` | [133](../packages/web/src/chat/components/MessageActionsMenu.tsx#L133) | `height: 32,` |
| `onKey` | [137](../packages/web/src/chat/components/MessageActionsMenu.tsx#L137) | `padding: 0,` |
| `onKey` | [138](../packages/web/src/chat/components/MessageActionsMenu.tsx#L138) | `borderRadius: 8,` |
| `onKey` | [159](../packages/web/src/chat/components/MessageActionsMenu.tsx#L159) | `gap: 10,` |
| `onKey` | [160](../packages/web/src/chat/components/MessageActionsMenu.tsx#L160) | `padding: '10px 12px',` |
| `onKey` | [164](../packages/web/src/chat/components/MessageActionsMenu.tsx#L164) | `fontSize: 14,` |
| `onKey` | [166](../packages/web/src/chat/components/MessageActionsMenu.tsx#L166) | `borderRadius: 12,` |
| `onKey` | [186](../packages/web/src/chat/components/MessageActionsMenu.tsx#L186) | `gap: 10,` |
| `onKey` | [187](../packages/web/src/chat/components/MessageActionsMenu.tsx#L187) | `padding: '10px 12px',` |
| `onKey` | [191](../packages/web/src/chat/components/MessageActionsMenu.tsx#L191) | `fontSize: 14,` |
| `onKey` | [193](../packages/web/src/chat/components/MessageActionsMenu.tsx#L193) | `borderRadius: 12,` |
| `onKey` | [211](../packages/web/src/chat/components/MessageActionsMenu.tsx#L211) | `gap: 10,` |
| `onKey` | [212](../packages/web/src/chat/components/MessageActionsMenu.tsx#L212) | `padding: '10px 12px',` |
| `onKey` | [216](../packages/web/src/chat/components/MessageActionsMenu.tsx#L216) | `fontSize: 14,` |
| `onKey` | [218](../packages/web/src/chat/components/MessageActionsMenu.tsx#L218) | `borderRadius: 12,` |

</details>

<details>
<summary>chat/components/OfflineBanner.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `onOffline` | [57](../packages/web/src/chat/components/OfflineBanner.tsx#L57) | `maxWidth: 406,` |
| `onOffline` | [58](../packages/web/src/chat/components/OfflineBanner.tsx#L58) | `padding: '6px 14px',` |
| `onOffline` | [60](../packages/web/src/chat/components/OfflineBanner.tsx#L60) | `fontSize: 12,` |
| `onOffline` | [61](../packages/web/src/chat/components/OfflineBanner.tsx#L61) | `fontWeight: 600,` |
| `onOffline` | [64](../packages/web/src/chat/components/OfflineBanner.tsx#L64) | `borderRadius: '0 0 12px 12px',` |

</details>

<details>
<summary>chat/components/ReactionBar.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ReactionBar` | [17](../packages/web/src/chat/components/ReactionBar.tsx#L17) | `gap: 4,` |
| `ReactionBar` | [29](../packages/web/src/chat/components/ReactionBar.tsx#L29) | `style={{ padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}` |
| `ReactionBar` | [31](../packages/web/src/chat/components/ReactionBar.tsx#L31) | `<span style={{ fontSize: 14 }}>{r.emoji}</span>` |

</details>

<details>
<summary>chat/components/ReactionPicker.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `onKey` | [58](../packages/web/src/chat/components/ReactionPicker.tsx#L58) | `width: PANEL_WIDTH,` |
| `onKey` | [59](../packages/web/src/chat/components/ReactionPicker.tsx#L59) | `padding: 8,` |
| `onKey` | [60](../packages/web/src/chat/components/ReactionPicker.tsx#L60) | `borderRadius: 16,` |
| `onKey` | [62](../packages/web/src/chat/components/ReactionPicker.tsx#L62) | `gridTemplateColumns: 'repeat(8, 1fr)',` |
| `onKey` | [63](../packages/web/src/chat/components/ReactionPicker.tsx#L63) | `gap: 6,` |
| `onKey` | [78](../packages/web/src/chat/components/ReactionPicker.tsx#L78) | `width: 28,` |
| `onKey` | [79](../packages/web/src/chat/components/ReactionPicker.tsx#L79) | `height: 28,` |
| `onKey` | [83](../packages/web/src/chat/components/ReactionPicker.tsx#L83) | `fontSize: 22,` |
| `onKey` | [84](../packages/web/src/chat/components/ReactionPicker.tsx#L84) | `padding: 0,` |
| `onKey` | [85](../packages/web/src/chat/components/ReactionPicker.tsx#L85) | `lineHeight: 1,` |

</details>

<details>
<summary>chat/components/ReplyPreview.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ReplyPreview` | [32](../packages/web/src/chat/components/ReplyPreview.tsx#L32) | `padding: '6px 10px 6px 12px',` |
| `ReplyPreview` | [34](../packages/web/src/chat/components/ReplyPreview.tsx#L34) | `borderRadius: 12,` |
| `ReplyPreview` | [37](../packages/web/src/chat/components/ReplyPreview.tsx#L37) | `width: '100%',` |
| `ReplyPreview` | [39](../packages/web/src/chat/components/ReplyPreview.tsx#L39) | `fontSize: 11,` |
| `ReplyPreview` | [43](../packages/web/src/chat/components/ReplyPreview.tsx#L43) | `gap: 8,` |
| `contentNode` | [59](../packages/web/src/chat/components/ReplyPreview.tsx#L59) | `width: 3,` |
| `contentNode` | [60](../packages/web/src/chat/components/ReplyPreview.tsx#L60) | `borderRadius: 2,` |
| `contentNode` | [64](../packages/web/src/chat/components/ReplyPreview.tsx#L64) | `<div style={{ minWidth: 0, flex: 1 }}>` |
| `contentNode` | [65](../packages/web/src/chat/components/ReplyPreview.tsx#L65) | `<div style={{ fontWeight: 700, fontSize: 11, color: senderColor }}>{senderName}</div>` |
| `contentNode` | [87](../packages/web/src/chat/components/ReplyPreview.tsx#L87) | `fontSize: 14,` |
| `contentNode` | [88](../packages/web/src/chat/components/ReplyPreview.tsx#L88) | `padding: 0,` |
| `contentNode` | [89](../packages/web/src/chat/components/ReplyPreview.tsx#L89) | `lineHeight: 1,` |

</details>

<details>
<summary>chat/components/SearchResultsDropdown.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `SearchResultsDropdown` | [83](../packages/web/src/chat/components/SearchResultsDropdown.tsx#L83) | `<span style={{ fontSize: 13 }}>Не удалось загрузить результаты.</span>` |

</details>

<details>
<summary>chat/components/UserAvatar.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `initial` | [30](../packages/web/src/chat/components/UserAvatar.tsx#L30) | `width: size,` |
| `initial` | [31](../packages/web/src/chat/components/UserAvatar.tsx#L31) | `height: size,` |
| `initial` | [32](../packages/web/src/chat/components/UserAvatar.tsx#L32) | `borderRadius: '50%',` |
| `initial` | [38](../packages/web/src/chat/components/UserAvatar.tsx#L38) | `fontSize: fs,` |
| `initial` | [39](../packages/web/src/chat/components/UserAvatar.tsx#L39) | `fontWeight: 800,` |
| `initial` | [55](../packages/web/src/chat/components/UserAvatar.tsx#L55) | `width: '100%',` |
| `initial` | [56](../packages/web/src/chat/components/UserAvatar.tsx#L56) | `height: '100%',` |
| `initial` | [57](../packages/web/src/chat/components/UserAvatar.tsx#L57) | `borderRadius: '50%',` |

</details>

<details>
<summary>chat/components/UserPickerModal.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `UserPickerModal` | [62](../packages/web/src/chat/components/UserPickerModal.tsx#L62) | `cardStyle={{ width: 'min(400px, calc(100vw - 28px))', maxHeight: 'calc(100dvh - 40px)' }}` |
| `UserPickerModal` | [66](../packages/web/src/chat/components/UserPickerModal.tsx#L66) | `width: '100%',` |
| `UserPickerModal` | [69](../packages/web/src/chat/components/UserPickerModal.tsx#L69) | `gap: 12,` |
| `UserPickerModal` | [70](../packages/web/src/chat/components/UserPickerModal.tsx#L70) | `minHeight: 0,` |
| `UserPickerModal` | [73](../packages/web/src/chat/components/UserPickerModal.tsx#L73) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `UserPickerModal` | [84](../packages/web/src/chat/components/UserPickerModal.tsx#L84) | `padding: '8px 10px',` |
| `UserPickerModal` | [85](../packages/web/src/chat/components/UserPickerModal.tsx#L85) | `borderRadius: 12,` |
| `UserPickerModal` | [90](../packages/web/src/chat/components/UserPickerModal.tsx#L90) | `fontSize: 14,` |
| `UserPickerModal` | [95](../packages/web/src/chat/components/UserPickerModal.tsx#L95) | `<div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>` |
| `UserPickerModal` | [97](../packages/web/src/chat/components/UserPickerModal.tsx#L97) | `<div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>` |
| `UserPickerModal` | [102](../packages/web/src/chat/components/UserPickerModal.tsx#L102) | `<div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>` |
| `UserPickerModal` | [116](../packages/web/src/chat/components/UserPickerModal.tsx#L116) | `gap: 10,` |
| `UserPickerModal` | [117](../packages/web/src/chat/components/UserPickerModal.tsx#L117) | `padding: '8px 12px',` |
| `UserPickerModal` | [118](../packages/web/src/chat/components/UserPickerModal.tsx#L118) | `borderRadius: 14,` |
| `UserPickerModal` | [125](../packages/web/src/chat/components/UserPickerModal.tsx#L125) | `<span style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</span>` |

</details>

<details>
<summary>chat/components/UserProfileSheet.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `OfficialAccountSheet` | [280](../packages/web/src/chat/components/UserProfileSheet.tsx#L280) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>` |
| `UserProfileSheetContent` | [419](../packages/web/src/chat/components/UserProfileSheet.tsx#L419) | `gap: 0,` |
| `UserProfileSheetContent` | [434](../packages/web/src/chat/components/UserProfileSheet.tsx#L434) | `minHeight: 74,` |
| `UserProfileSheetContent` | [435](../packages/web/src/chat/components/UserProfileSheet.tsx#L435) | `borderRadius: 16,` |
| `UserProfileSheetContent` | [440](../packages/web/src/chat/components/UserProfileSheet.tsx#L440) | `fontSize: 13,` |
| `UserProfileSheetContent` | [451](../packages/web/src/chat/components/UserProfileSheet.tsx#L451) | `labelStyle={{ margin: '18px 0 6px', padding: '2px 6px' }}` |
| `UserProfileSheetContent` | [461](../packages/web/src/chat/components/UserProfileSheet.tsx#L461) | `padding: '14px 0',` |
| `UserProfileSheetContent` | [462](../packages/web/src/chat/components/UserProfileSheet.tsx#L462) | `fontSize: 15,` |
| `UserProfileSheetContent` | [463](../packages/web/src/chat/components/UserProfileSheet.tsx#L463) | `fontWeight: 600,` |
| `UserProfileSheetContent` | [488](../packages/web/src/chat/components/UserProfileSheet.tsx#L488) | `style={{ marginTop: 14, padding: '14px 0', fontSize: 15, fontWeight: 600 }}` |
| `UserProfileSheetContent` | [500](../packages/web/src/chat/components/UserProfileSheet.tsx#L500) | `padding: '14px 0',` |
| `UserProfileSheetContent` | [501](../packages/web/src/chat/components/UserProfileSheet.tsx#L501) | `fontSize: 15,` |
| `UserProfileSheetContent` | [502](../packages/web/src/chat/components/UserProfileSheet.tsx#L502) | `fontWeight: 600,` |

</details>

<details>
<summary>chat/screens/ChannelPostCommentsScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `CommentRow` | [81](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L81) | `<div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>` |
| `CommentRow` | [94](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L94) | `padding: 0,` |
| `CommentRow` | [108](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L108) | `<div style={{ minWidth: 0, maxWidth: '82%' }}>` |
| `CommentRow` | [116](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L116) | `borderRadius: '16px 16px 16px 4px',` |
| `CommentRow` | [117](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L117) | `padding: '8px 11px',` |
| `CommentRow` | [132](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L132) | `fontSize: 12,` |
| `CommentRow` | [133](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L133) | `fontWeight: 800,` |
| `CommentRow` | [144](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L144) | `<div style={{ display: 'grid', gap: 6, marginBottom: comment.content ? 7 : 0 }}>` |
| `CommentRow` | [162](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L162) | `width: '100%',` |
| `CommentRow` | [163](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L163) | `maxWidth: 240,` |
| `CommentRow` | [164](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L164) | `maxHeight: 240,` |
| `CommentRow` | [166](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L166) | `borderRadius: 14,` |
| `CommentRow` | [180](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L180) | `style={{ display: 'block', width: 220, maxWidth: '100%' }}` |
| `CommentRow` | [194](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L194) | `gap: 8,` |
| `CommentRow` | [195](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L195) | `padding: '8px 10px',` |
| `CommentRow` | [196](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L196) | `borderRadius: 14,` |
| `CommentRow` | [203](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L203) | `<span style={{ minWidth: 0 }}>` |
| `CommentRow` | [207](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L207) | `fontSize: 12,` |
| `CommentRow` | [208](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L208) | `fontWeight: 800,` |
| `CommentRow` | [217](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L217) | `<span style={{ display: 'block', fontSize: 10, opacity: 0.72 }}>` |
| `CommentRow` | [230](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L230) | `fontSize: 14,` |
| `CommentRow` | [231](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L231) | `lineHeight: 1.4,` |
| `CommentRow` | [243](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L243) | `gap: 8,` |
| `CommentRow` | [247](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L247) | `<div style={{ flex: '1 1 auto', minWidth: 0 }}>` |
| `CommentRow` | [258](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L258) | `fontSize: 10,` |
| `CommentRow` | [260](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L260) | `lineHeight: 1.15,` |
| `update` | [542](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L542) | `height: viewportHeight !== null ? &#96;${viewportHeight}px&#96; : '100dvh',` |
| `update` | [550](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L550) | `minHeight: 54,` |
| `update` | [558](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L558) | `style={{ width: 40, height: 40, minWidth: 40, minHeight: 40 }}` |
| `update` | [562](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L562) | `<div style={{ minWidth: 0 }}>` |
| `update` | [563](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L563) | `<div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Комментарии</div>` |
| `update` | [564](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L564) | `<div style={{ fontSize: 12, color: 'var(--muted)' }}>{comments.length}</div>` |
| `update` | [574](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L574) | `minHeight: 0,` |
| `update` | [578](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L578) | `gap: 10,` |
| `update` | [579](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L579) | `padding: 'calc(88px + var(--app-safe-top)) 14px calc(96px + var(--app-safe-bottom))',` |
| `update` | [586](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L586) | `borderRadius: 18,` |
| `update` | [587](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L587) | `padding: 12,` |
| `update` | [588](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L588) | `fontSize: 14,` |
| `update` | [589](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L589) | `lineHeight: 1.42,` |
| `update` | [598](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L598) | `gap: 8,` |
| `update` | [619](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L619) | `width: '100%',` |
| `update` | [620](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L620) | `maxHeight: 320,` |
| `update` | [622](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L622) | `borderRadius: 16,` |
| `update` | [636](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L636) | `style={{ display: 'block', width: 260, maxWidth: '100%' }}` |
| `update` | [650](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L650) | `gap: 10,` |
| `update` | [651](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L651) | `padding: '10px 12px',` |
| `update` | [652](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L652) | `borderRadius: 16,` |
| `update` | [659](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L659) | `<span style={{ minWidth: 0 }}>` |
| `update` | [663](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L663) | `fontSize: 13,` |
| `update` | [664](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L664) | `fontWeight: 900,` |
| `update` | [673](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L673) | `<span style={{ display: 'block', fontSize: 11, opacity: 0.7 }}>` |
| `update` | [687](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L687) | `<div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 18 }}>` |
| `update` | [692](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L692) | `<div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 18 }}>` |
| `update` | [746](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L746) | `gridTemplateColumns: 'auto minmax(0, 1fr) auto',` |
| `update` | [748](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L748) | `gap: 8,` |
| `update` | [749](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L749) | `padding: '8px 10px',` |
| `update` | [750](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L750) | `borderRadius: 16,` |
| `update` | [761](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L761) | `width: 42,` |
| `update` | [762](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L762) | `height: 42,` |
| `update` | [763](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L763) | `borderRadius: 12,` |
| `update` | [770](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L770) | `<div style={{ minWidth: 0 }}>` |
| `update` | [774](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L774) | `fontSize: 12,` |
| `update` | [775](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L775) | `fontWeight: 900,` |
| `update` | [783](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L783) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>` |
| `update` | [793](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L793) | `style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}` |
| `update` | [815](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L815) | `padding: '0 4px',` |
| `update` | [817](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L817) | `fontSize: 11,` |
| `update` | [818](../packages/web/src/chat/screens/ChannelPostCommentsScreen.tsx#L818) | `fontWeight: 800,` |

</details>

<details>
<summary>chat/screens/ChatInfoScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `onAvatarFileChange` | [106](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L106) | `height: '100%',` |
| `onAvatarFileChange` | [107](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L107) | `minHeight: 0,` |
| `onAvatarFileChange` | [116](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L116) | `<div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>` |
| `onAvatarFileChange` | [121](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L121) | `<div style={{ padding: 24, textAlign: 'center' }}>` |
| `onAvatarFileChange` | [122](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L122) | `<div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>` |
| `onAvatarFileChange` | [138](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L138) | `padding: '26px 16px 16px',` |
| `onAvatarFileChange` | [139](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L139) | `borderRadius: 20,` |
| `onAvatarFileChange` | [144](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L144) | `gap: 8,` |
| `onAvatarFileChange` | [156](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L156) | `width: 40,` |
| `onAvatarFileChange` | [157](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L157) | `height: 40,` |
| `onAvatarFileChange` | [158](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L158) | `minWidth: 40,` |
| `onAvatarFileChange` | [159](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L159) | `minHeight: 40,` |
| `onAvatarFileChange` | [160](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L160) | `borderRadius: 999,` |
| `onAvatarFileChange` | [161](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L161) | `padding: 0,` |
| `onAvatarFileChange` | [175](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L175) | `<div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>` |
| `onAvatarFileChange` | [178](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L178) | `<div style={{ fontSize: 12, color: 'var(--muted)' }}>` |
| `onAvatarFileChange` | [185](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L185) | `fontSize: 13,` |
| `onAvatarFileChange` | [189](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L189) | `width: '100%',` |
| `onAvatarFileChange` | [200](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L200) | `gap: 8,` |
| `onAvatarFileChange` | [211](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L211) | `style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}` |
| `onAvatarFileChange` | [230](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L230) | `style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}` |
| `onAvatarFileChange` | [245](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L245) | `style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}` |
| `onAvatarFileChange` | [256](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L256) | `style={{ width: 38, height: 38, minWidth: 38, minHeight: 38 }}` |
| `onAvatarFileChange` | [266](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L266) | `width: '100%',` |
| `onAvatarFileChange` | [267](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L267) | `fontSize: 12,` |
| `onAvatarFileChange` | [277](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L277) | `<h2 className="section-label" style={{ margin: 0, padding: '4px 14px 0' }}>` |
| `onAvatarFileChange` | [284](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L284) | `gap: 8,` |
| `onAvatarFileChange` | [285](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L285) | `padding: '8px 14px',` |
| `onAvatarFileChange` | [305](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L305) | `gridTemplateColumns: '40px minmax(0, 1fr)',` |
| `onAvatarFileChange` | [307](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L307) | `gap: 12,` |
| `onAvatarFileChange` | [308](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L308) | `width: '100%',` |
| `onAvatarFileChange` | [309](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L309) | `padding: removable ? '10px 58px 10px 12px' : '10px 12px',` |
| `onAvatarFileChange` | [310](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L310) | `borderRadius: 16,` |
| `onAvatarFileChange` | [319](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L319) | `minWidth: 0,` |
| `onAvatarFileChange` | [322](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L322) | `gap: 8,` |
| `onAvatarFileChange` | [327](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L327) | `minWidth: 0,` |
| `onAvatarFileChange` | [328](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L328) | `fontSize: 14,` |
| `onAvatarFileChange` | [329](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L329) | `fontWeight: 700,` |
| `onAvatarFileChange` | [341](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L341) | `padding: '3px 8px',` |
| `onAvatarFileChange` | [342](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L342) | `fontSize: 10,` |
| `onAvatarFileChange` | [365](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L365) | `width: 36,` |
| `onAvatarFileChange` | [366](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L366) | `height: 36,` |
| `onAvatarFileChange` | [367](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L367) | `minWidth: 36,` |
| `onAvatarFileChange` | [368](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L368) | `minHeight: 36,` |
| `onAvatarFileChange` | [380](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L380) | `fontSize: 12,` |
| `onAvatarFileChange` | [383](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L383) | `padding: '8px 0',` |
| `GroupChatProfileModal` | [452](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L452) | `cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}` |
| `GroupChatProfileModal` | [465](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L465) | `<div style={{ display: 'grid', gap: 16 }}>` |
| `GroupChatProfileModal` | [466](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L466) | `<label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>` |
| `GroupChatProfileModal` | [476](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L476) | `<label style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>` |
| `GroupChatProfileModal` | [487](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L487) | `{error && <div style={{ color: 'var(--red-deep)', fontSize: 12 }}>{error}</div>}` |
| `toggleUser` | [558](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L558) | `cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}` |
| `toggleUser` | [571](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L571) | `<div style={{ display: 'grid', gap: 16 }}>` |
| `toggleUser` | [572](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L572) | `<div style={{ display: 'grid', gap: 10 }}>` |
| `toggleUser` | [585](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L585) | `<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>` |
| `toggleUser` | [601](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L601) | `<div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8 }}>` |
| `toggleUser` | [603](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L603) | `<div style={{ color: 'var(--muted)', fontSize: 12 }}>Поиск...</div>` |
| `toggleUser` | [618](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L618) | `gap: 10,` |
| `toggleUser` | [619](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L619) | `padding: '9px 12px',` |
| `toggleUser` | [620](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L620) | `borderRadius: 16,` |
| `toggleUser` | [633](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L633) | `<span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{user.displayName}</span>` |
| `toggleUser` | [634](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L634) | `<span style={{ fontSize: 12, color: picked ? '#ffffff' : 'var(--muted)' }}>` |
| `toggleUser` | [641](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L641) | `{error && <div style={{ color: 'var(--red-deep)', fontSize: 12 }}>{error}</div>}` |
| `toggleUser` | [656](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L656) | `width: '100%',` |
| `toggleUser` | [657](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L657) | `borderRadius: 16,` |
| `toggleUser` | [660](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L660) | `padding: '12px 14px',` |
| `toggleUser` | [662](../packages/web/src/chat/screens/ChatInfoScreen.tsx#L662) | `fontWeight: 800,` |

</details>

<details>
<summary>chat/screens/ChatListScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `closePicker` | [226](../packages/web/src/chat/screens/ChatListScreen.tsx#L226) | `gap: 8,` |
| `closePicker` | [248](../packages/web/src/chat/screens/ChatListScreen.tsx#L248) | `fontSize: 14,` |
| `closePicker` | [260](../packages/web/src/chat/screens/ChatListScreen.tsx#L260) | `width: 40,` |
| `closePicker` | [261](../packages/web/src/chat/screens/ChatListScreen.tsx#L261) | `height: 40,` |
| `closePicker` | [262](../packages/web/src/chat/screens/ChatListScreen.tsx#L262) | `minWidth: 40,` |
| `closePicker` | [263](../packages/web/src/chat/screens/ChatListScreen.tsx#L263) | `minHeight: 40,` |
| `closePicker` | [264](../packages/web/src/chat/screens/ChatListScreen.tsx#L264) | `borderRadius: 999,` |
| `closePicker` | [265](../packages/web/src/chat/screens/ChatListScreen.tsx#L265) | `padding: 0,` |
| `closePicker` | [280](../packages/web/src/chat/screens/ChatListScreen.tsx#L280) | `<div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>` |
| `closePicker` | [295](../packages/web/src/chat/screens/ChatListScreen.tsx#L295) | `<div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>` |
| `closePicker` | [305](../packages/web/src/chat/screens/ChatListScreen.tsx#L305) | `gap: 12,` |
| `closePicker` | [306](../packages/web/src/chat/screens/ChatListScreen.tsx#L306) | `padding: '4px 14px 14px',` |
| `closePicker` | [344](../packages/web/src/chat/screens/ChatListScreen.tsx#L344) | `padding: '10px 16px',` |
| `closePicker` | [345](../packages/web/src/chat/screens/ChatListScreen.tsx#L345) | `borderRadius: 999,` |
| `closePicker` | [346](../packages/web/src/chat/screens/ChatListScreen.tsx#L346) | `fontSize: 13,` |
| `closePicker` | [354](../packages/web/src/chat/screens/ChatListScreen.tsx#L354) | `maxWidth: 'calc(100vw - 32px)',` |
| `toggleUser` | [457](../packages/web/src/chat/screens/ChatListScreen.tsx#L457) | `cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}` |
| `toggleUser` | [470](../packages/web/src/chat/screens/ChatListScreen.tsx#L470) | `<div style={{ display: 'grid', gap: 16 }}>` |
| `toggleUser` | [480](../packages/web/src/chat/screens/ChatListScreen.tsx#L480) | `<div style={{ display: 'grid', gap: 10 }}>` |
| `toggleUser` | [493](../packages/web/src/chat/screens/ChatListScreen.tsx#L493) | `<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>` |
| `toggleUser` | [509](../packages/web/src/chat/screens/ChatListScreen.tsx#L509) | `<div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8 }}>` |
| `toggleUser` | [511](../packages/web/src/chat/screens/ChatListScreen.tsx#L511) | `<div style={{ color: 'var(--muted)', fontSize: 12 }}>Поиск...</div>` |
| `toggleUser` | [524](../packages/web/src/chat/screens/ChatListScreen.tsx#L524) | `gap: 10,` |
| `toggleUser` | [525](../packages/web/src/chat/screens/ChatListScreen.tsx#L525) | `padding: '9px 12px',` |
| `toggleUser` | [526](../packages/web/src/chat/screens/ChatListScreen.tsx#L526) | `borderRadius: 16,` |
| `toggleUser` | [538](../packages/web/src/chat/screens/ChatListScreen.tsx#L538) | `<span style={{ flex: 1, fontSize: 14, fontWeight: 800 }}>{user.displayName}</span>` |
| `toggleUser` | [539](../packages/web/src/chat/screens/ChatListScreen.tsx#L539) | `<span style={{ fontSize: 12, color: picked ? '#ffffff' : 'var(--muted)' }}>` |
| `toggleUser` | [547](../packages/web/src/chat/screens/ChatListScreen.tsx#L547) | `{error && <div style={{ color: 'var(--red-deep)', fontSize: 12 }}>{error}</div>}` |

</details>

<details>
<summary>chat/screens/ChatRoomScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DateSeparator` | [250](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L250) | `minHeight: 28,` |
| `DateSeparator` | [251](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L251) | `padding: '6px 14px',` |
| `DateSeparator` | [252](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L252) | `borderRadius: 999,` |
| `DateSeparator` | [254](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L254) | `fontSize: 12,` |
| `DateSeparator` | [255](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L255) | `lineHeight: 1,` |
| `DateSeparator` | [256](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L256) | `fontWeight: 900,` |
| `DuelInviteMetric` | [270](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L270) | `minWidth: 0,` |
| `DuelInviteMetric` | [271](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L271) | `padding: '7px 8px',` |
| `DuelInviteMetric` | [272](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L272) | `borderRadius: 12,` |
| `DuelInviteMetric` | [280](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L280) | `fontSize: 9,` |
| `DuelInviteMetric` | [281](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L281) | `fontWeight: 900,` |
| `DuelInviteMetric` | [288](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L288) | `<div style={{ color: 'var(--ink)', fontSize: 13, fontWeight: 900 }}>{value}</div>` |
| `DuelInviteActions` | [325](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L325) | `gap: 8,` |
| `DuelInviteActions` | [330](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L330) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>` |
| `DuelInviteActions` | [345](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L345) | `padding: '8px 10px',` |
| `DuelInviteActions` | [346](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L346) | `borderRadius: 999,` |
| `DuelInviteActions` | [349](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L349) | `fontSize: 12,` |
| `DuelInviteActions` | [350](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L350) | `fontWeight: 900,` |
| `DuelInviteActions` | [357](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L357) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>` |
| `DuelInviteActions` | [364](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L364) | `minHeight: 36,` |
| `DuelInviteActions` | [365](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L365) | `padding: '8px 10px',` |
| `DuelInviteActions` | [366](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L366) | `fontSize: 12,` |
| `DuelInviteActions` | [381](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L381) | `minHeight: 36,` |
| `DuelInviteActions` | [382](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L382) | `padding: '8px 10px',` |
| `DuelInviteActions` | [383](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L383) | `fontSize: 12,` |
| `itself` | [1373](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1373) | `height: viewportHeight !== null ? &#96;${viewportHeight}px&#96; : '100dvh',` |
| `itself` | [1409](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1409) | `padding: '6px 12px',` |
| `itself` | [1410](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1410) | `borderRadius: 10,` |
| `itself` | [1411](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1411) | `fontSize: 13,` |
| `itself` | [1425](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1425) | `minHeight: 0,` |
| `itself` | [1426](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1426) | `padding: &#96;${searchOpen ? 'calc(158px + var(--app-safe-top))' : 'calc(112px + var(--app-safe-top))'} 14px ${` |
| `itself` | [1444](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1444) | `style={{ alignSelf: 'center', margin: '4px 0 12px', fontSize: 12, padding: '8px 14px' }}` |
| `itself` | [1450](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1450) | `<div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>` |
| `itself` | [1457](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1457) | `style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}` |
| `itself` | [1472](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1472) | `<div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>` |
| `itself` | [1586](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1586) | `width: 42,` |
| `itself` | [1587](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1587) | `height: 42,` |
| `itself` | [1588](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1588) | `minWidth: 42,` |
| `itself` | [1589](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1589) | `minHeight: 42,` |
| `itself` | [1590](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1590) | `borderRadius: 999,` |
| `itself` | [1638](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1638) | `gridTemplateColumns: 'auto minmax(0, 1fr) auto',` |
| `itself` | [1640](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1640) | `gap: 8,` |
| `itself` | [1641](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1641) | `padding: '8px 10px',` |
| `itself` | [1642](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1642) | `borderRadius: 16,` |
| `itself` | [1653](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1653) | `width: 42,` |
| `itself` | [1654](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1654) | `height: 42,` |
| `itself` | [1655](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1655) | `borderRadius: 12,` |
| `itself` | [1662](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1662) | `<div style={{ minWidth: 0 }}>` |
| `itself` | [1666](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1666) | `fontSize: 12,` |
| `itself` | [1667](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1667) | `fontWeight: 900,` |
| `itself` | [1675](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1675) | `<div style={{ color: 'var(--muted)', fontSize: 10, fontWeight: 800 }}>` |
| `itself` | [1685](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1685) | `style={{ width: 30, height: 30, minWidth: 30, minHeight: 30 }}` |
| `itself` | [1700](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1700) | `<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>` |
| `itself` | [1709](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1709) | `width: 32,` |
| `itself` | [1710](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1710) | `height: 32,` |
| `itself` | [1711](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1711) | `minWidth: 32,` |
| `itself` | [1712](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1712) | `minHeight: 32,` |
| `itself` | [1713](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1713) | `borderRadius: 10,` |
| `itself` | [1740](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1740) | `padding: '0 4px',` |
| `itself` | [1742](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1742) | `fontSize: 11,` |
| `itself` | [1743](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1743) | `fontWeight: 800,` |
| `itself` | [1760](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1760) | `padding:` |
| `itself` | [1765](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1765) | `width: 'min(100%, 860px)',` |
| `itself` | [1766](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1766) | `maxHeight: 'calc(100dvh - var(--app-safe-top) - var(--app-dock-safe-bottom) - 28px)',` |
| `itself` | [1767](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1767) | `padding: 10,` |
| `itself` | [1787](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1787) | `width: 'auto',` |
| `itself` | [1788](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1788) | `height: 'auto',` |
| `itself` | [1789](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1789) | `maxWidth: '100%',` |
| `itself` | [1790](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1790) | `maxHeight: 'calc(100dvh - var(--app-safe-top) - var(--app-dock-safe-bottom) - 104px)',` |
| `itself` | [1793](../packages/web/src/chat/screens/ChatRoomScreen.tsx#L1793) | `borderRadius: 18,` |

</details>

<details>
<summary>chat/screens/UserProfileScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `UserProfileScreen` | [115](../packages/web/src/chat/screens/UserProfileScreen.tsx#L115) | `height: '100%',` |
| `UserProfileScreen` | [116](../packages/web/src/chat/screens/UserProfileScreen.tsx#L116) | `minHeight: 0,` |
| `UserProfileScreen` | [128](../packages/web/src/chat/screens/UserProfileScreen.tsx#L128) | `gap: 10,` |
| `UserProfileScreen` | [138](../packages/web/src/chat/screens/UserProfileScreen.tsx#L138) | `width: 40,` |
| `UserProfileScreen` | [139](../packages/web/src/chat/screens/UserProfileScreen.tsx#L139) | `height: 40,` |
| `UserProfileScreen` | [140](../packages/web/src/chat/screens/UserProfileScreen.tsx#L140) | `minWidth: 40,` |
| `UserProfileScreen` | [141](../packages/web/src/chat/screens/UserProfileScreen.tsx#L141) | `minHeight: 40,` |
| `UserProfileScreen` | [142](../packages/web/src/chat/screens/UserProfileScreen.tsx#L142) | `borderRadius: 999,` |
| `UserProfileScreen` | [143](../packages/web/src/chat/screens/UserProfileScreen.tsx#L143) | `padding: 0,` |
| `UserProfileScreen` | [152](../packages/web/src/chat/screens/UserProfileScreen.tsx#L152) | `<div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Профиль</div>` |
| `UserProfileScreen` | [156](../packages/web/src/chat/screens/UserProfileScreen.tsx#L156) | `<div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>` |
| `UserProfileScreen` | [161](../packages/web/src/chat/screens/UserProfileScreen.tsx#L161) | `<div style={{ padding: 24, textAlign: 'center' }}>` |
| `UserProfileScreen` | [162](../packages/web/src/chat/screens/UserProfileScreen.tsx#L162) | `<div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>` |
| `UserProfileScreen` | [177](../packages/web/src/chat/screens/UserProfileScreen.tsx#L177) | `padding: 20,` |
| `UserProfileScreen` | [178](../packages/web/src/chat/screens/UserProfileScreen.tsx#L178) | `borderRadius: 20,` |
| `UserProfileScreen` | [183](../packages/web/src/chat/screens/UserProfileScreen.tsx#L183) | `gap: 10,` |
| `UserProfileScreen` | [192](../packages/web/src/chat/screens/UserProfileScreen.tsx#L192) | `<div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>` |
| `UserProfileScreen` | [195](../packages/web/src/chat/screens/UserProfileScreen.tsx#L195) | `<div style={{ fontSize: 12, color: 'var(--muted)' }}>` |
| `UserProfileScreen` | [198](../packages/web/src/chat/screens/UserProfileScreen.tsx#L198) | `<div style={{ fontSize: 12, color: 'var(--muted)' }}>` |
| `UserProfileScreen` | [201](../packages/web/src/chat/screens/UserProfileScreen.tsx#L201) | `<div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 2 }}>` |
| `UserProfileScreen` | [223](../packages/web/src/chat/screens/UserProfileScreen.tsx#L223) | `style={{ padding: '4px 14px 0', display: 'flex', flexDirection: 'column', gap: 8 }}` |
| `UserProfileScreen` | [242](../packages/web/src/chat/screens/UserProfileScreen.tsx#L242) | `width: '100%',` |
| `UserProfileScreen` | [246](../packages/web/src/chat/screens/UserProfileScreen.tsx#L246) | `padding: '12px 16px',` |
| `UserProfileScreen` | [247](../packages/web/src/chat/screens/UserProfileScreen.tsx#L247) | `borderRadius: 14,` |
| `UserProfileScreen` | [248](../packages/web/src/chat/screens/UserProfileScreen.tsx#L248) | `fontSize: 14,` |
| `UserProfileScreen` | [249](../packages/web/src/chat/screens/UserProfileScreen.tsx#L249) | `fontWeight: 700,` |
| `UserProfileScreen` | [261](../packages/web/src/chat/screens/UserProfileScreen.tsx#L261) | `width: '100%',` |
| `UserProfileScreen` | [265](../packages/web/src/chat/screens/UserProfileScreen.tsx#L265) | `padding: '12px 16px',` |
| `UserProfileScreen` | [266](../packages/web/src/chat/screens/UserProfileScreen.tsx#L266) | `borderRadius: 14,` |
| `UserProfileScreen` | [267](../packages/web/src/chat/screens/UserProfileScreen.tsx#L267) | `fontSize: 14,` |
| `UserProfileScreen` | [268](../packages/web/src/chat/screens/UserProfileScreen.tsx#L268) | `fontWeight: 700,` |
| `UserProfileScreen` | [277](../packages/web/src/chat/screens/UserProfileScreen.tsx#L277) | `style={{ height: 'calc(128px + var(--app-safe-bottom))', flexShrink: 0 }}` |

</details>

<details>
<summary>components/AdvancedTrainingCourse.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `AdvancedTrainingCatalog` | [201](../packages/web/src/components/AdvancedTrainingCourse.tsx#L201) | `<span style={{ width: &#96;${progressPercent}%&#96; }} />` |

</details>

<details>
<summary>components/AdvancedTrainingPlayV2.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DemoFutureEntities` | [71](../packages/web/src/components/AdvancedTrainingPlayV2.tsx#L71) | `style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',` |
| `DemoDirectionOverlay` | [117](../packages/web/src/components/AdvancedTrainingPlayV2.tsx#L117) | `style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',` |

</details>

<details>
<summary>components/BottomNav.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `openAdminRoute` | [338](../packages/web/src/components/BottomNav.tsx#L338) | `padding: '40px 12px var(--bottom-nav-bottom-gap)',` |
| `openAdminRoute` | [348](../packages/web/src/components/BottomNav.tsx#L348) | `width: '100%',` |
| `openAdminRoute` | [349](../packages/web/src/components/BottomNav.tsx#L349) | `maxWidth: 406,` |
| `openAdminRoute` | [351](../packages/web/src/components/BottomNav.tsx#L351) | `height: 54,` |
| `openAdminRoute` | [352](../packages/web/src/components/BottomNav.tsx#L352) | `borderRadius: 19,` |
| `openAdminRoute` | [354](../packages/web/src/components/BottomNav.tsx#L354) | `gridTemplateColumns: &#96;repeat(${navCount}, 1fr)&#96;,` |
| `openAdminRoute` | [356](../packages/web/src/components/BottomNav.tsx#L356) | `padding: '0 6px',` |
| `openAdminRoute` | [365](../packages/web/src/components/BottomNav.tsx#L365) | `width: &#96;calc((100% - 12px) / ${navCount})&#96;,` |
| `openAdminRoute` | [384](../packages/web/src/components/BottomNav.tsx#L384) | `minWidth: 16,` |
| `openAdminRoute` | [385](../packages/web/src/components/BottomNav.tsx#L385) | `height: 16,` |
| `openAdminRoute` | [386](../packages/web/src/components/BottomNav.tsx#L386) | `padding: '0 4px',` |
| `openAdminRoute` | [387](../packages/web/src/components/BottomNav.tsx#L387) | `borderRadius: 999,` |
| `openAdminRoute` | [390](../packages/web/src/components/BottomNav.tsx#L390) | `fontSize: 9,` |
| `openAdminRoute` | [391](../packages/web/src/components/BottomNav.tsx#L391) | `fontWeight: 800,` |
| `openAdminRoute` | [420](../packages/web/src/components/BottomNav.tsx#L420) | `minWidth: 16,` |
| `openAdminRoute` | [421](../packages/web/src/components/BottomNav.tsx#L421) | `height: 16,` |
| `openAdminRoute` | [422](../packages/web/src/components/BottomNav.tsx#L422) | `padding: '0 4px',` |
| `openAdminRoute` | [423](../packages/web/src/components/BottomNav.tsx#L423) | `borderRadius: 999,` |
| `openAdminRoute` | [426](../packages/web/src/components/BottomNav.tsx#L426) | `fontSize: 9,` |
| `openAdminRoute` | [427](../packages/web/src/components/BottomNav.tsx#L427) | `fontWeight: 800,` |
| `openAdminRoute` | [456](../packages/web/src/components/BottomNav.tsx#L456) | `minWidth: 16,` |
| `openAdminRoute` | [457](../packages/web/src/components/BottomNav.tsx#L457) | `height: 16,` |
| `openAdminRoute` | [458](../packages/web/src/components/BottomNav.tsx#L458) | `padding: '0 4px',` |
| `openAdminRoute` | [459](../packages/web/src/components/BottomNav.tsx#L459) | `borderRadius: 999,` |
| `openAdminRoute` | [462](../packages/web/src/components/BottomNav.tsx#L462) | `fontSize: 9,` |
| `openAdminRoute` | [463](../packages/web/src/components/BottomNav.tsx#L463) | `fontWeight: 800,` |

</details>

<details>
<summary>components/DuelInviteToast.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `detail` | [103](../packages/web/src/components/DuelInviteToast.tsx#L103) | `width: 'min(402px, calc(100vw - 24px))',` |
| `detail` | [111](../packages/web/src/components/DuelInviteToast.tsx#L111) | `borderRadius: 22,` |
| `detail` | [112](../packages/web/src/components/DuelInviteToast.tsx#L112) | `padding: 12,` |
| `detail` | [114](../packages/web/src/components/DuelInviteToast.tsx#L114) | `gridTemplateColumns: 'minmax(0, 1fr)',` |
| `detail` | [115](../packages/web/src/components/DuelInviteToast.tsx#L115) | `gap: 10,` |
| `detail` | [120](../packages/web/src/components/DuelInviteToast.tsx#L120) | `<div style={{ minWidth: 0 }}>` |
| `detail` | [121](../packages/web/src/components/DuelInviteToast.tsx#L121) | `<div style={{ color: 'var(--ink)', fontSize: 14, fontWeight: 950 }}>` |
| `detail` | [124](../packages/web/src/components/DuelInviteToast.tsx#L124) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 760, marginTop: 2 }}>` |
| `detail` | [128](../packages/web/src/components/DuelInviteToast.tsx#L128) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>` |
| `detail` | [137](../packages/web/src/components/DuelInviteToast.tsx#L137) | `minHeight: 38,` |
| `detail` | [138](../packages/web/src/components/DuelInviteToast.tsx#L138) | `fontSize: 12,` |
| `detail` | [156](../packages/web/src/components/DuelInviteToast.tsx#L156) | `minHeight: 38,` |
| `detail` | [157](../packages/web/src/components/DuelInviteToast.tsx#L157) | `fontSize: 12,` |

</details>

<details>
<summary>components/DuelKindPreferenceButton.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DuelKindPreferenceButton` | [27](../packages/web/src/components/DuelKindPreferenceButton.tsx#L27) | `minWidth: 0,` |
| `DuelKindPreferenceButton` | [28](../packages/web/src/components/DuelKindPreferenceButton.tsx#L28) | `minHeight: 30,` |
| `DuelKindPreferenceButton` | [29](../packages/web/src/components/DuelKindPreferenceButton.tsx#L29) | `borderRadius: 999,` |
| `DuelKindPreferenceButton` | [36](../packages/web/src/components/DuelKindPreferenceButton.tsx#L36) | `padding: '0 9px',` |
| `DuelKindPreferenceButton` | [37](../packages/web/src/components/DuelKindPreferenceButton.tsx#L37) | `fontSize: 10,` |
| `DuelKindPreferenceButton` | [38](../packages/web/src/components/DuelKindPreferenceButton.tsx#L38) | `fontWeight: 900,` |
| `DuelKindPreferenceButton` | [39](../packages/web/src/components/DuelKindPreferenceButton.tsx#L39) | `lineHeight: 1,` |

</details>

<details>
<summary>components/GlassSelect.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `GlassSelect` | [32](../packages/web/src/components/GlassSelect.tsx#L32) | `const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } \| null>(` |
| `updateMenuRect` | [109](../packages/web/src/components/GlassSelect.tsx#L109) | `width: rect.width,` |
| `onViewportChange` | [148](../packages/web/src/components/GlassSelect.tsx#L148) | `<div ref={ref} style={{ position: 'relative', minWidth: 0 }}>` |
| `onViewportChange` | [165](../packages/web/src/components/GlassSelect.tsx#L165) | `width: '100%',` |
| `onViewportChange` | [166](../packages/web/src/components/GlassSelect.tsx#L166) | `minWidth: 0,` |
| `onViewportChange` | [167](../packages/web/src/components/GlassSelect.tsx#L167) | `height: 44,` |
| `onViewportChange` | [168](../packages/web/src/components/GlassSelect.tsx#L168) | `borderRadius: 14,` |
| `onViewportChange` | [173](../packages/web/src/components/GlassSelect.tsx#L173) | `padding: '0 10px 0 12px',` |
| `onViewportChange` | [175](../packages/web/src/components/GlassSelect.tsx#L175) | `fontSize: 13,` |
| `onViewportChange` | [176](../packages/web/src/components/GlassSelect.tsx#L176) | `fontWeight: 800,` |
| `onViewportChange` | [181](../packages/web/src/components/GlassSelect.tsx#L181) | `gridTemplateColumns: 'minmax(0, 1fr) 18px',` |
| `onViewportChange` | [183](../packages/web/src/components/GlassSelect.tsx#L183) | `gap: 6,` |
| `GlassSelectMenu` | [234](../packages/web/src/components/GlassSelect.tsx#L234) | `rect: { top: number; left: number; width: number };` |
| `GlassSelectMenu` | [258](../packages/web/src/components/GlassSelect.tsx#L258) | `width: rect.width,` |
| `GlassSelectMenu` | [259](../packages/web/src/components/GlassSelect.tsx#L259) | `maxHeight: 'min(280px, calc(var(--app-viewport-height, 100dvh) - 24px))',` |
| `GlassSelectMenu` | [261](../packages/web/src/components/GlassSelect.tsx#L261) | `borderRadius: 18,` |
| `GlassSelectMenu` | [262](../packages/web/src/components/GlassSelect.tsx#L262) | `padding: 6,` |
| `GlassSelectMenu` | [292](../packages/web/src/components/GlassSelect.tsx#L292) | `width: '100%',` |
| `GlassSelectMenu` | [293](../packages/web/src/components/GlassSelect.tsx#L293) | `minWidth: 0,` |
| `GlassSelectMenu` | [294](../packages/web/src/components/GlassSelect.tsx#L294) | `height: 38,` |
| `GlassSelectMenu` | [296](../packages/web/src/components/GlassSelect.tsx#L296) | `borderRadius: 12,` |
| `GlassSelectMenu` | [299](../packages/web/src/components/GlassSelect.tsx#L299) | `padding: '0 10px',` |
| `GlassSelectMenu` | [301](../packages/web/src/components/GlassSelect.tsx#L301) | `gridTemplateColumns: '18px minmax(0, 1fr)',` |
| `GlassSelectMenu` | [303](../packages/web/src/components/GlassSelect.tsx#L303) | `gap: 8,` |
| `GlassSelectMenu` | [305](../packages/web/src/components/GlassSelect.tsx#L305) | `fontSize: 13,` |
| `GlassSelectMenu` | [306](../packages/web/src/components/GlassSelect.tsx#L306) | `fontWeight: 850,` |

</details>

<details>
<summary>components/HomeArenaModal.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `saveSelection` | [103](../packages/web/src/components/HomeArenaModal.tsx#L103) | `<div style={{ display: 'grid', gap: 14 }}>` |

</details>

<details>
<summary>components/InitialTrainingCourse.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `renderExercise` | [265](../packages/web/src/components/InitialTrainingCourse.tsx#L265) | `<span style={{ width: &#96;${progressPercent}%&#96; }} />` |

</details>

<details>
<summary>components/InitialTrainingPlay.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `InitialTrainingResult` | [92](../packages/web/src/components/InitialTrainingPlay.tsx#L92) | `<div className="section-label" style={{ margin: 0, padding: 0 }}>` |

</details>

<details>
<summary>components/OpenWindowObservationPlay.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `goalX` | [45](../packages/web/src/components/OpenWindowObservationPlay.tsx#L45) | `width: '100%', height: '100%', pointerEvents: 'none' }}>` |

</details>

<details>
<summary>components/ResultModal.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ResultModal` | [80](../packages/web/src/components/ResultModal.tsx#L80) | `padding: contained ? '7px 12px' : 'clamp(14px, 2vmin, 18px) clamp(24px, 5vmin, 36px)',` |
| `ResultModal` | [81](../packages/web/src/components/ResultModal.tsx#L81) | `borderRadius: contained ? 12 : 24,` |
| `ResultModal` | [88](../packages/web/src/components/ResultModal.tsx#L88) | `maxWidth: contained ? 'calc(100% - 16px)' : 'min(420px, calc(100vw - 40px))',` |
| `ResultModal` | [103](../packages/web/src/components/ResultModal.tsx#L103) | `fontWeight: 900,` |
| `ResultModal` | [104](../packages/web/src/components/ResultModal.tsx#L104) | `fontSize: contained` |
| `ResultModal` | [107](../packages/web/src/components/ResultModal.tsx#L107) | `lineHeight: 1,` |

</details>

<details>
<summary>components/ScoreBoard.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `GameScoreboard` | [148](../packages/web/src/components/ScoreBoard.tsx#L148) | `style={{ gridTemplateColumns: &#96;repeat(${row.metrics.length}, minmax(0, 1fr))&#96; }}` |

</details>

<details>
<summary>components/SegmentedTabs.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `SegmentedTabs` | [34](../packages/web/src/components/SegmentedTabs.tsx#L34) | `style={scrollable ? undefined : { gridTemplateColumns: columns }}` |

</details>

<details>
<summary>components/SpeedInput.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `SpeedInput` | [30](../packages/web/src/components/SpeedInput.tsx#L30) | `width: '100%',` |
| `SpeedInput` | [32](../packages/web/src/components/SpeedInput.tsx#L32) | `borderRadius: 14,` |
| `SpeedInput` | [33](../packages/web/src/components/SpeedInput.tsx#L33) | `padding: '8px 10px',` |
| `SpeedInput` | [36](../packages/web/src/components/SpeedInput.tsx#L36) | `gap: 4,` |
| `SpeedInput` | [42](../packages/web/src/components/SpeedInput.tsx#L42) | `fontSize: 10,` |
| `SpeedInput` | [46](../packages/web/src/components/SpeedInput.tsx#L46) | `fontWeight: 600,` |
| `SpeedInput` | [51](../packages/web/src/components/SpeedInput.tsx#L51) | `<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>` |
| `SpeedInput` | [52](../packages/web/src/components/SpeedInput.tsx#L52) | `<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>` |
| `SpeedInput` | [62](../packages/web/src/components/SpeedInput.tsx#L62) | `padding: 2,` |
| `SpeedInput` | [82](../packages/web/src/components/SpeedInput.tsx#L82) | `style={{ width: '100%', accentColor: 'var(--ink)', cursor: 'pointer' }}` |

</details>

<details>
<summary>components/StartPeriodModal.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `StartPeriodModal` | [59](../packages/web/src/components/StartPeriodModal.tsx#L59) | `padding: 20,` |
| `StartPeriodModal` | [75](../packages/web/src/components/StartPeriodModal.tsx#L75) | `width: '100%',` |
| `StartPeriodModal` | [76](../packages/web/src/components/StartPeriodModal.tsx#L76) | `maxWidth: 360,` |
| `StartPeriodModal` | [77](../packages/web/src/components/StartPeriodModal.tsx#L77) | `padding: '28px 24px 22px',` |
| `StartPeriodModal` | [78](../packages/web/src/components/StartPeriodModal.tsx#L78) | `borderRadius: 28,` |
| `StartPeriodModal` | [95](../packages/web/src/components/StartPeriodModal.tsx#L95) | `fontSize: 26,` |
| `StartPeriodModal` | [96](../packages/web/src/components/StartPeriodModal.tsx#L96) | `fontWeight: 800,` |
| `StartPeriodModal` | [106](../packages/web/src/components/StartPeriodModal.tsx#L106) | `fontSize: 15,` |
| `StartPeriodModal` | [107](../packages/web/src/components/StartPeriodModal.tsx#L107) | `fontWeight: 600,` |
| `StartPeriodModal` | [118](../packages/web/src/components/StartPeriodModal.tsx#L118) | `fontSize: 14,` |
| `StartPeriodModal` | [119](../packages/web/src/components/StartPeriodModal.tsx#L119) | `lineHeight: 1.5,` |
| `StartPeriodModal` | [130](../packages/web/src/components/StartPeriodModal.tsx#L130) | `gap: 10,` |
| `StartPeriodModal` | [141](../packages/web/src/components/StartPeriodModal.tsx#L141) | `width: 56,` |
| `StartPeriodModal` | [142](../packages/web/src/components/StartPeriodModal.tsx#L142) | `height: 56,` |
| `StartPeriodModal` | [143](../packages/web/src/components/StartPeriodModal.tsx#L143) | `borderRadius: 20,` |
| `StartPeriodModal` | [154](../packages/web/src/components/StartPeriodModal.tsx#L154) | `style={{ flex: 1, minWidth: 0, paddingBlock: 16 }}` |

</details>

<details>
<summary>components/StatCard.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `StatCard` | [12](../packages/web/src/components/StatCard.tsx#L12) | `padding: '12px 14px',` |
| `StatCard` | [13](../packages/web/src/components/StatCard.tsx#L13) | `borderRadius: 16,` |
| `StatCard` | [16](../packages/web/src/components/StatCard.tsx#L16) | `gap: 4,` |
| `StatCard` | [21](../packages/web/src/components/StatCard.tsx#L21) | `fontSize: 9,` |
| `StatCard` | [22](../packages/web/src/components/StatCard.tsx#L22) | `fontWeight: 600,` |
| `StatCard` | [31](../packages/web/src/components/StatCard.tsx#L31) | `style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}` |
| `StatCard` | [35](../packages/web/src/components/StatCard.tsx#L35) | `<small style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{suffix}</small>` |

</details>

<details>
<summary>components/UpdatePrompt.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `reload` | [101](../packages/web/src/components/UpdatePrompt.tsx#L101) | `padding: '20px',` |
| `reload` | [111](../packages/web/src/components/UpdatePrompt.tsx#L111) | `borderRadius: 24,` |
| `reload` | [112](../packages/web/src/components/UpdatePrompt.tsx#L112) | `padding: '22px 22px 18px',` |
| `reload` | [113](../packages/web/src/components/UpdatePrompt.tsx#L113) | `maxWidth: 320,` |
| `reload` | [114](../packages/web/src/components/UpdatePrompt.tsx#L114) | `width: '100%',` |
| `reload` | [121](../packages/web/src/components/UpdatePrompt.tsx#L121) | `fontSize: 15,` |
| `reload` | [122](../packages/web/src/components/UpdatePrompt.tsx#L122) | `fontWeight: 700,` |
| `reload` | [129](../packages/web/src/components/UpdatePrompt.tsx#L129) | `<div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>` |
| `reload` | [139](../packages/web/src/components/UpdatePrompt.tsx#L139) | `width: '100%',` |
| `reload` | [140](../packages/web/src/components/UpdatePrompt.tsx#L140) | `padding: '12px 0',` |
| `reload` | [141](../packages/web/src/components/UpdatePrompt.tsx#L141) | `fontSize: 14,` |

</details>

<details>
<summary>components/duel/DuelLimitsSection.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DuelLimitsSection` | [96](../packages/web/src/components/duel/DuelLimitsSection.tsx#L96) | `style={{ width: &#96;${remainingPercent}%&#96; }}` |

</details>

<details>
<summary>components/duel/DuelLockerTab.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `duelEquipmentStockLineStyle` | [81](../packages/web/src/components/duel/DuelLockerTab.tsx#L81) | `fontSize: 12,` |
| `duelEquipmentStockLineStyle` | [82](../packages/web/src/components/duel/DuelLockerTab.tsx#L82) | `fontWeight: 920,` |
| `duelEquipmentStockLineStyle` | [83](../packages/web/src/components/duel/DuelLockerTab.tsx#L83) | `lineHeight: 1.15,` |
| `DuelLockerTab` | [217](../packages/web/src/components/duel/DuelLockerTab.tsx#L217) | `style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}` |
| `DuelLockerSlotButton` | [306](../packages/web/src/components/duel/DuelLockerTab.tsx#L306) | `width: '100%',` |
| `DuelLockerSlotButton` | [307](../packages/web/src/components/duel/DuelLockerTab.tsx#L307) | `height: '100%',` |
| `selectItem` | [374](../packages/web/src/components/duel/DuelLockerTab.tsx#L374) | `width: 'min(430px, calc(100vw - 28px))',` |
| `selectItem` | [375](../packages/web/src/components/duel/DuelLockerTab.tsx#L375) | `maxHeight: 'calc(100dvh - 112px - var(--app-safe-top) - var(--app-safe-bottom))',` |
| `selectItem` | [378](../packages/web/src/components/duel/DuelLockerTab.tsx#L378) | `gap: 10,` |
| `selectItem` | [392](../packages/web/src/components/duel/DuelLockerTab.tsx#L392) | `<div style={{ minWidth: 0, paddingRight: 42 }}>` |
| `selectItem` | [400](../packages/web/src/components/duel/DuelLockerTab.tsx#L400) | `minHeight: 0,` |
| `selectItem` | [401](../packages/web/src/components/duel/DuelLockerTab.tsx#L401) | `maxHeight: 'min(54dvh, 430px)',` |
| `selectItem` | [404](../packages/web/src/components/duel/DuelLockerTab.tsx#L404) | `gap: 8,` |
| `selectItem` | [417](../packages/web/src/components/duel/DuelLockerTab.tsx#L417) | `minHeight: 78,` |
| `selectItem` | [418](../packages/web/src/components/duel/DuelLockerTab.tsx#L418) | `borderRadius: 16,` |
| `selectItem` | [419](../packages/web/src/components/duel/DuelLockerTab.tsx#L419) | `padding: 10,` |
| `selectItem` | [421](../packages/web/src/components/duel/DuelLockerTab.tsx#L421) | `gridTemplateColumns: '56px minmax(0, 1fr) 22px',` |
| `selectItem` | [423](../packages/web/src/components/duel/DuelLockerTab.tsx#L423) | `gap: 10,` |
| `selectItem` | [431](../packages/web/src/components/duel/DuelLockerTab.tsx#L431) | `width: 56,` |
| `selectItem` | [432](../packages/web/src/components/duel/DuelLockerTab.tsx#L432) | `height: 56,` |
| `selectItem` | [433](../packages/web/src/components/duel/DuelLockerTab.tsx#L433) | `borderRadius: 14,` |
| `selectItem` | [443](../packages/web/src/components/duel/DuelLockerTab.tsx#L443) | `width: '100%',` |
| `selectItem` | [444](../packages/web/src/components/duel/DuelLockerTab.tsx#L444) | `height: '100%',` |
| `selectItem` | [452](../packages/web/src/components/duel/DuelLockerTab.tsx#L452) | `<span style={{ minWidth: 0, display: 'grid', gap: 5 }}>` |
| `selectItem` | [453](../packages/web/src/components/duel/DuelLockerTab.tsx#L453) | `<span style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>` |
| `selectItem` | [459](../packages/web/src/components/duel/DuelLockerTab.tsx#L459) | `fontSize: 12,` |
| `selectItem` | [460](../packages/web/src/components/duel/DuelLockerTab.tsx#L460) | `fontWeight: 760,` |
| `selectItem` | [461](../packages/web/src/components/duel/DuelLockerTab.tsx#L461) | `lineHeight: 1.28,` |
| `selectItem` | [483](../packages/web/src/components/duel/DuelLockerTab.tsx#L483) | `minHeight: 78,` |
| `selectItem` | [484](../packages/web/src/components/duel/DuelLockerTab.tsx#L484) | `borderRadius: 16,` |
| `selectItem` | [485](../packages/web/src/components/duel/DuelLockerTab.tsx#L485) | `padding: 10,` |
| `selectItem` | [487](../packages/web/src/components/duel/DuelLockerTab.tsx#L487) | `gridTemplateColumns: '56px minmax(0, 1fr) 22px',` |
| `selectItem` | [489](../packages/web/src/components/duel/DuelLockerTab.tsx#L489) | `gap: 10,` |
| `selectItem` | [498](../packages/web/src/components/duel/DuelLockerTab.tsx#L498) | `width: 56,` |
| `selectItem` | [499](../packages/web/src/components/duel/DuelLockerTab.tsx#L499) | `height: 56,` |
| `selectItem` | [500](../packages/web/src/components/duel/DuelLockerTab.tsx#L500) | `borderRadius: 14,` |
| `selectItem` | [511](../packages/web/src/components/duel/DuelLockerTab.tsx#L511) | `style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}` |
| `selectItem` | [514](../packages/web/src/components/duel/DuelLockerTab.tsx#L514) | `<span style={{ minWidth: 0, display: 'grid', gap: 5 }}>` |
| `selectItem` | [517](../packages/web/src/components/duel/DuelLockerTab.tsx#L517) | `minWidth: 0,` |
| `selectItem` | [519](../packages/web/src/components/duel/DuelLockerTab.tsx#L519) | `fontSize: 15,` |
| `selectItem` | [520](../packages/web/src/components/duel/DuelLockerTab.tsx#L520) | `fontWeight: 950,` |
| `selectItem` | [521](../packages/web/src/components/duel/DuelLockerTab.tsx#L521) | `lineHeight: 1.12,` |
| `selectItem` | [530](../packages/web/src/components/duel/DuelLockerTab.tsx#L530) | `gap: 2,` |
| `selectItem` | [532](../packages/web/src/components/duel/DuelLockerTab.tsx#L532) | `fontSize: 12,` |
| `selectItem` | [533](../packages/web/src/components/duel/DuelLockerTab.tsx#L533) | `fontWeight: 760,` |
| `selectItem` | [534](../packages/web/src/components/duel/DuelLockerTab.tsx#L534) | `lineHeight: 1.25,` |
| `selectItem` | [575](../packages/web/src/components/duel/DuelLockerTab.tsx#L575) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>` |

</details>

<details>
<summary>components/duel/fight/FightControls.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `FightControls` | [58](../packages/web/src/components/duel/fight/FightControls.tsx#L58) | `style={{ pointerEvents: 'auto', position: 'relative', width: 31, height: 31, flexShrink: 0 }}` |
| `FightControls` | [78](../packages/web/src/components/duel/fight/FightControls.tsx#L78) | `width: 48,` |
| `FightControls` | [79](../packages/web/src/components/duel/fight/FightControls.tsx#L79) | `height: 48,` |
| `FightControls` | [81](../packages/web/src/components/duel/fight/FightControls.tsx#L81) | `padding: 8.5,` |
| `FightControls` | [94](../packages/web/src/components/duel/fight/FightControls.tsx#L94) | `width: 31,` |
| `FightControls` | [95](../packages/web/src/components/duel/fight/FightControls.tsx#L95) | `height: 31,` |
| `FightControls` | [96](../packages/web/src/components/duel/fight/FightControls.tsx#L96) | `borderRadius: 999,` |

</details>

<details>
<summary>game/MarksmanshipConstructorCourt.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `MarksmanshipConstructorCourt` | [153](../packages/web/src/game/MarksmanshipConstructorCourt.tsx#L153) | `width: GOALIE_SIZE.width, height: GOALIE_SIZE.height }` |
| `MarksmanshipConstructorCourt` | [159](../packages/web/src/game/MarksmanshipConstructorCourt.tsx#L159) | `width: GOALIE_SIZE.width, height: GOALIE_SIZE.height };` |
| `x` | [345](../packages/web/src/game/MarksmanshipConstructorCourt.tsx#L345) | `width: '100%', aspectRatio: '1212 / 2000', overflow: 'hidden' }}>` |
| `x` | [347](../packages/web/src/game/MarksmanshipConstructorCourt.tsx#L347) | `style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />` |
| `x` | [357](../packages/web/src/game/MarksmanshipConstructorCourt.tsx#L357) | `style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',` |

</details>

<details>
<summary>game/PixiStage.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `measure` | [48](../packages/web/src/game/PixiStage.tsx#L48) | `width: host.clientWidth \|\| RINK.width,` |
| `measure` | [49](../packages/web/src/game/PixiStage.tsx#L49) | `height: host.clientHeight \|\| RINK.height,` |
| `measure` | [97](../packages/web/src/game/PixiStage.tsx#L97) | `return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;` |

</details>

<details>
<summary>game/PlayView.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `resolveLongCourtBackgroundPlacement` | [509](../packages/web/src/game/PlayView.tsx#L509) | `height: string;` |
| `resolveLongCourtBackgroundPlacement` | [512](../packages/web/src/game/PlayView.tsx#L512) | `? { top: '-0.25%', height: '100.25%' }` |
| `resolveLongCourtBackgroundPlacement` | [513](../packages/web/src/game/PlayView.tsx#L513) | `: { top: '0', height: '100%' };` |
| `TrainingPerspectiveRink` | [534](../packages/web/src/game/PlayView.tsx#L534) | `width: '100%',` |
| `TrainingPerspectiveRink` | [535](../packages/web/src/game/PlayView.tsx#L535) | `height: '100%',` |
| `TrainingPerspectiveRink` | [550](../packages/web/src/game/PlayView.tsx#L550) | `width: '100%',` |
| `TrainingPerspectiveRink` | [551](../packages/web/src/game/PlayView.tsx#L551) | `height: isLong` |
| `TrainingPerspectiveRink` | [565](../packages/web/src/game/PlayView.tsx#L565) | `width: '86%',` |
| `TrainingPerspectiveRink` | [566](../packages/web/src/game/PlayView.tsx#L566) | `maxWidth: 404,` |
| `drawAt` | [1248](../packages/web/src/game/PlayView.tsx#L1248) | `width: GOALIE_SIZE.width,` |
| `drawAt` | [1249](../packages/web/src/game/PlayView.tsx#L1249) | `height: GOALIE_SIZE.height,` |
| `step` | [1306](../packages/web/src/game/PlayView.tsx#L1306) | `width: GOALIE_SIZE.width,` |
| `step` | [1307](../packages/web/src/game/PlayView.tsx#L1307) | `height: GOALIE_SIZE.height,` |
| `step` | [1366](../packages/web/src/game/PlayView.tsx#L1366) | `width: GOALIE_SIZE.width,` |
| `step` | [1367](../packages/web/src/game/PlayView.tsx#L1367) | `height: GOALIE_SIZE.height,` |
| `step` | [1380](../packages/web/src/game/PlayView.tsx#L1380) | `width: GOALIE_SIZE.width,` |
| `step` | [1381](../packages/web/src/game/PlayView.tsx#L1381) | `height: GOALIE_SIZE.height,` |
| `routeRinkStyle` | [2360](../packages/web/src/game/PlayView.tsx#L2360) | `height: &#96;calc(var(--app-viewport-height, 100dvh) - var(--app-safe-top) - 6px - ${bottomInset})&#96;,` |
| `routeRinkStyle` | [2361](../packages/web/src/game/PlayView.tsx#L2361) | `minHeight: 0,` |
| `routeRinkStyle` | [2370](../packages/web/src/game/PlayView.tsx#L2370) | `gap: 8,` |
| `routeRinkStyle` | [2399](../packages/web/src/game/PlayView.tsx#L2399) | `height: playLayout ? &#96;${playLayout.rinkSlotHeight}px&#96; : undefined,` |
| `routeRinkStyle` | [2400](../packages/web/src/game/PlayView.tsx#L2400) | `minHeight: 0,` |
| `routeRinkStyle` | [2404](../packages/web/src/game/PlayView.tsx#L2404) | `padding: '0 14px 8px',` |
| `y` | [2431](../packages/web/src/game/PlayView.tsx#L2431) | `width: playLayout ? &#96;${playLayout.rinkWidth}px&#96; : '100%',` |
| `y` | [2432](../packages/web/src/game/PlayView.tsx#L2432) | `height: playLayout ? &#96;${playLayout.rinkHeight}px&#96; : undefined,` |
| `y` | [2433](../packages/web/src/game/PlayView.tsx#L2433) | `maxWidth: '100%',` |
| `y` | [2435](../packages/web/src/game/PlayView.tsx#L2435) | `borderRadius: rinkBorderRadius,` |
| `y` | [2466](../packages/web/src/game/PlayView.tsx#L2466) | `width: overlayControlsCentered ? 'max-content' : undefined,` |
| `y` | [2467](../packages/web/src/game/PlayView.tsx#L2467) | `maxWidth: 'calc(100% - 20px)',` |
| `y` | [2484](../packages/web/src/game/PlayView.tsx#L2484) | `maxWidth: '34%',` |
| `y` | [2512](../packages/web/src/game/PlayView.tsx#L2512) | `padding: '0 14px 10px',` |
| `y` | [2514](../packages/web/src/game/PlayView.tsx#L2514) | `gridTemplateColumns: '56px minmax(0, 1fr) 56px',` |
| `y` | [2515](../packages/web/src/game/PlayView.tsx#L2515) | `gap: 10,` |
| `y` | [2517](../packages/web/src/game/PlayView.tsx#L2517) | `width: '100%',` |
| `y` | [2518](../packages/web/src/game/PlayView.tsx#L2518) | `maxWidth: 344,` |
| `y` | [2534](../packages/web/src/game/PlayView.tsx#L2534) | `width: 56,` |
| `y` | [2535](../packages/web/src/game/PlayView.tsx#L2535) | `height: 56,` |
| `y` | [2536](../packages/web/src/game/PlayView.tsx#L2536) | `borderRadius: 20,` |
| `y` | [2549](../packages/web/src/game/PlayView.tsx#L2549) | `width: '100%',` |
| `y` | [2550](../packages/web/src/game/PlayView.tsx#L2550) | `minHeight: 58,` |
| `y` | [2551](../packages/web/src/game/PlayView.tsx#L2551) | `padding: '0 22px',` |
| `y` | [2553](../packages/web/src/game/PlayView.tsx#L2553) | `fontSize: 16,` |
| `y` | [2568](../packages/web/src/game/PlayView.tsx#L2568) | `width: 56,` |
| `y` | [2569](../packages/web/src/game/PlayView.tsx#L2569) | `height: 56,` |
| `y` | [2570](../packages/web/src/game/PlayView.tsx#L2570) | `borderRadius: 20,` |
| `y` | [2586](../packages/web/src/game/PlayView.tsx#L2586) | `minHeight: 0,` |
| `y` | [2606](../packages/web/src/game/PlayView.tsx#L2606) | `padding: '10px 16px',` |
| `y` | [2607](../packages/web/src/game/PlayView.tsx#L2607) | `borderRadius: 999,` |
| `y` | [2610](../packages/web/src/game/PlayView.tsx#L2610) | `fontSize: 13,` |
| `y` | [2611](../packages/web/src/game/PlayView.tsx#L2611) | `fontWeight: 700,` |
| `y` | [2617](../packages/web/src/game/PlayView.tsx#L2617) | `maxWidth: 'calc(100vw - 32px)',` |

</details>

<details>
<summary>game/RinkSvg.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `RinkSvg` | [14](../packages/web/src/game/RinkSvg.tsx#L14) | `width: '100%',` |
| `RinkSvg` | [15](../packages/web/src/game/RinkSvg.tsx#L15) | `height: '100%',` |

</details>

<details>
<summary>game/SkiSnowfall.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `SkiSnowfall` | [33](../packages/web/src/game/SkiSnowfall.tsx#L33) | `width: f.size,` |
| `SkiSnowfall` | [34](../packages/web/src/game/SkiSnowfall.tsx#L34) | `height: f.size,` |

</details>

<details>
<summary>onboarding/AmateurOnboardingPreviewScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `AmateurOnboardingPreviewScreen` | [9](../packages/web/src/onboarding/AmateurOnboardingPreviewScreen.tsx#L9) | `maxWidth: 430,` |
| `AmateurOnboardingPreviewScreen` | [11](../packages/web/src/onboarding/AmateurOnboardingPreviewScreen.tsx#L11) | `height: 'var(--app-viewport-height, 100dvh)',` |

</details>

<details>
<summary>onboarding/BeginnerOnboardingPreviewScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `BeginnerOnboardingPreviewScreen` | [9](../packages/web/src/onboarding/BeginnerOnboardingPreviewScreen.tsx#L9) | `<div style={{ maxWidth: 430, margin: '0 auto', height: 'var(--app-viewport-height, 100dvh)', transform: 'translateZ(0)' }}>` |

</details>

<details>
<summary>onboarding/BeginnerStoryFlow.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `renderLines` | [376](../packages/web/src/onboarding/BeginnerStoryFlow.tsx#L376) | `<i key={index} style={{ left: &#96;${(index * 37) % 100}%&#96;, animationDelay: &#96;${-index * 0.73}s&#96;, animationDuration: &#96;${8 + index % 5}s&#96;, width: &#96;${2 + index % 3}px&#96;, height: &#96;${2 + index % 3}px&#96; }} />` |

</details>

<details>
<summary>screens/AchievementsScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `achievementsAttention` | [257](../packages/web/src/screens/AchievementsScreen.tsx#L257) | `padding: 'calc(22px + var(--app-safe-top)) 14px 24px',` |
| `achievementsAttention` | [264](../packages/web/src/screens/AchievementsScreen.tsx#L264) | `width: '100%',` |
| `achievementsAttention` | [265](../packages/web/src/screens/AchievementsScreen.tsx#L265) | `maxWidth: 760,` |
| `achievementsAttention` | [269](../packages/web/src/screens/AchievementsScreen.tsx#L269) | `gap: 14,` |
| `achievementsAttention` | [272](../packages/web/src/screens/AchievementsScreen.tsx#L272) | `<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>` |
| `achievementsAttention` | [280](../packages/web/src/screens/AchievementsScreen.tsx#L280) | `width: 40,` |
| `achievementsAttention` | [281](../packages/web/src/screens/AchievementsScreen.tsx#L281) | `height: 40,` |
| `achievementsAttention` | [282](../packages/web/src/screens/AchievementsScreen.tsx#L282) | `minWidth: 40,` |
| `achievementsAttention` | [283](../packages/web/src/screens/AchievementsScreen.tsx#L283) | `minHeight: 40,` |
| `achievementsAttention` | [284](../packages/web/src/screens/AchievementsScreen.tsx#L284) | `borderRadius: 999,` |
| `achievementsAttention` | [285](../packages/web/src/screens/AchievementsScreen.tsx#L285) | `padding: 0,` |
| `achievementsAttention` | [296](../packages/web/src/screens/AchievementsScreen.tsx#L296) | `style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}` |
| `achievementsAttention` | [328](../packages/web/src/screens/AchievementsScreen.tsx#L328) | `<div style={{ color: 'var(--muted)', fontSize: 14, padding: '32px 0' }}>Загрузка…</div>` |
| `achievementsAttention` | [362](../packages/web/src/screens/AchievementsScreen.tsx#L362) | `width: 'min(320px, calc(100vw - 40px))',` |
| `achievementsAttention` | [363](../packages/web/src/screens/AchievementsScreen.tsx#L363) | `maxHeight: 'calc(100dvh - 20px - var(--app-safe-top) - var(--app-safe-bottom))',` |
| `achievementsAttention` | [387](../packages/web/src/screens/AchievementsScreen.tsx#L387) | `<div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>` |
| `RewardChip` | [470](../packages/web/src/screens/AchievementsScreen.tsx#L470) | `gap: 5,` |
| `RewardChip` | [471](../packages/web/src/screens/AchievementsScreen.tsx#L471) | `padding: '6px 9px',` |
| `RewardChip` | [472](../packages/web/src/screens/AchievementsScreen.tsx#L472) | `fontSize: 11,` |
| `RewardChip` | [473](../packages/web/src/screens/AchievementsScreen.tsx#L473) | `fontWeight: 900,` |
| `formatNumber` | [571](../packages/web/src/screens/AchievementsScreen.tsx#L571) | `<span className="achievement-card__stage-progress-fill" style={{ width: &#96;${progressPercent}%&#96; }} />` |

</details>

<details>
<summary>screens/BonusGamePlayScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `skiPauses` | [1320](../packages/web/src/screens/BonusGamePlayScreen.tsx#L1320) | `{skiRuntime && <style>{&#96;img[src*="ski-resort-slope.webp"] {top:-7.5%!important;height:107.5%!important;object-fit:fill!important;}&#96;}</style>}` |

</details>

<details>
<summary>screens/BonusGamesScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `selectSkill` | [304](../packages/web/src/screens/BonusGamesScreen.tsx#L304) | `padding: 'calc(18px + var(--app-safe-top)) 14px 24px',` |
| `selectSkill` | [361](../packages/web/src/screens/BonusGamesScreen.tsx#L361) | `<span style={{ width: &#96;${gamesProgressPercent}%&#96; }} />` |
| `selectSkill` | [461](../packages/web/src/screens/BonusGamesScreen.tsx#L461) | `left: '50%', transform: 'translateX(-50%)', padding: '12px 18px', borderRadius: 16,` |

</details>

<details>
<summary>screens/DailyOverviewScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DailyOverviewScreen` | [303](../packages/web/src/screens/DailyOverviewScreen.tsx#L303) | `padding: 'calc(18px + var(--app-safe-top)) 14px 24px',` |
| `DailyOverviewScreen` | [310](../packages/web/src/screens/DailyOverviewScreen.tsx#L310) | `width: '100%',` |
| `DailyOverviewScreen` | [311](../packages/web/src/screens/DailyOverviewScreen.tsx#L311) | `maxWidth: 760,` |
| `DailyOverviewScreen` | [315](../packages/web/src/screens/DailyOverviewScreen.tsx#L315) | `gap: 14,` |
| `DailyOverviewScreen` | [331](../packages/web/src/screens/DailyOverviewScreen.tsx#L331) | `<section aria-label="Сегодняшняя игра" style={{ display: 'grid', gap: 8 }}>` |
| `DailyOverviewScreen` | [338](../packages/web/src/screens/DailyOverviewScreen.tsx#L338) | `borderRadius: 26,` |
| `DailyOverviewScreen` | [339](../packages/web/src/screens/DailyOverviewScreen.tsx#L339) | `padding: 16,` |
| `DailyOverviewScreen` | [341](../packages/web/src/screens/DailyOverviewScreen.tsx#L341) | `gap: 14,` |
| `DailyOverviewScreen` | [345](../packages/web/src/screens/DailyOverviewScreen.tsx#L345) | `<div style={{ display: 'grid', gridTemplateColumns: '86px minmax(0, 1fr)', gap: 12 }}>` |
| `DailyOverviewScreen` | [349](../packages/web/src/screens/DailyOverviewScreen.tsx#L349) | `width: 86,` |
| `DailyOverviewScreen` | [350](../packages/web/src/screens/DailyOverviewScreen.tsx#L350) | `height: 86,` |
| `DailyOverviewScreen` | [352](../packages/web/src/screens/DailyOverviewScreen.tsx#L352) | `borderRadius: 22,` |
| `DailyOverviewScreen` | [363](../packages/web/src/screens/DailyOverviewScreen.tsx#L363) | `style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}` |
| `DailyOverviewScreen` | [366](../packages/web/src/screens/DailyOverviewScreen.tsx#L366) | `<div style={{ minWidth: 0 }}>` |
| `DailyOverviewScreen` | [367](../packages/web/src/screens/DailyOverviewScreen.tsx#L367) | `<div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 850 }}>` |
| `DailyOverviewScreen` | [371](../packages/web/src/screens/DailyOverviewScreen.tsx#L371) | `style={{ margin: '3px 0 0', color: 'var(--ink)', fontSize: 20, fontWeight: 950 }}` |
| `DailyOverviewScreen` | [380](../packages/web/src/screens/DailyOverviewScreen.tsx#L380) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `DailyOverviewScreen` | [382](../packages/web/src/screens/DailyOverviewScreen.tsx#L382) | `gap: 10,` |
| `DailyOverviewScreen` | [383](../packages/web/src/screens/DailyOverviewScreen.tsx#L383) | `maxWidth: '100%',` |
| `DailyOverviewScreen` | [384](../packages/web/src/screens/DailyOverviewScreen.tsx#L384) | `padding: 0,` |
| `DailyOverviewScreen` | [392](../packages/web/src/screens/DailyOverviewScreen.tsx#L392) | `minWidth: 0,` |
| `DailyOverviewScreen` | [394](../packages/web/src/screens/DailyOverviewScreen.tsx#L394) | `fontSize: 10,` |
| `DailyOverviewScreen` | [395](../packages/web/src/screens/DailyOverviewScreen.tsx#L395) | `fontWeight: 900,` |
| `DailyOverviewScreen` | [408](../packages/web/src/screens/DailyOverviewScreen.tsx#L408) | `fontSize: 14,` |
| `DailyOverviewScreen` | [409](../packages/web/src/screens/DailyOverviewScreen.tsx#L409) | `fontWeight: 900,` |
| `DailyOverviewScreen` | [410](../packages/web/src/screens/DailyOverviewScreen.tsx#L410) | `lineHeight: 1,` |
| `DailyOverviewScreen` | [424](../packages/web/src/screens/DailyOverviewScreen.tsx#L424) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `DailyOverviewScreen` | [425](../packages/web/src/screens/DailyOverviewScreen.tsx#L425) | `gap: 8,` |
| `DailyOverviewScreen` | [440](../packages/web/src/screens/DailyOverviewScreen.tsx#L440) | `style={{ minHeight: 42, display: 'inline-flex', justifyContent: 'center' }}` |
| `DailyOverviewScreen` | [447](../packages/web/src/screens/DailyOverviewScreen.tsx#L447) | `<section aria-label="История дней" style={{ display: 'grid', gap: 8 }}>` |
| `DailyOverviewScreen` | [452](../packages/web/src/screens/DailyOverviewScreen.tsx#L452) | `<div className="glass" style={{ borderRadius: 22, padding: 16, color: 'var(--muted)' }}>` |
| `DailyOverviewScreen` | [456](../packages/web/src/screens/DailyOverviewScreen.tsx#L456) | `<div style={{ display: 'grid', gap: 8 }}>` |
| `HistorySummaryCard` | [684](../packages/web/src/screens/DailyOverviewScreen.tsx#L684) | `borderRadius: 22,` |
| `HistorySummaryCard` | [685](../packages/web/src/screens/DailyOverviewScreen.tsx#L685) | `padding: 14,` |
| `HistorySummaryCard` | [687](../packages/web/src/screens/DailyOverviewScreen.tsx#L687) | `gap: 10,` |
| `HistorySummaryCard` | [695](../packages/web/src/screens/DailyOverviewScreen.tsx#L695) | `gap: 10,` |
| `HistorySummaryCard` | [696](../packages/web/src/screens/DailyOverviewScreen.tsx#L696) | `minWidth: 0,` |
| `HistorySummaryCard` | [701](../packages/web/src/screens/DailyOverviewScreen.tsx#L701) | `minWidth: 0,` |
| `HistorySummaryCard` | [704](../packages/web/src/screens/DailyOverviewScreen.tsx#L704) | `fontSize: 15,` |
| `HistorySummaryCard` | [705](../packages/web/src/screens/DailyOverviewScreen.tsx#L705) | `fontWeight: 950,` |
| `HistorySummaryCard` | [706](../packages/web/src/screens/DailyOverviewScreen.tsx#L706) | `lineHeight: 1.05,` |
| `HistorySummaryCard` | [715](../packages/web/src/screens/DailyOverviewScreen.tsx#L715) | `fontSize: 14,` |
| `HistorySummaryCard` | [716](../packages/web/src/screens/DailyOverviewScreen.tsx#L716) | `fontWeight: 950,` |
| `HistorySummaryCard` | [717](../packages/web/src/screens/DailyOverviewScreen.tsx#L717) | `lineHeight: 1.05,` |
| `HistorySummaryCard` | [729](../packages/web/src/screens/DailyOverviewScreen.tsx#L729) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `HistorySummaryCard` | [730](../packages/web/src/screens/DailyOverviewScreen.tsx#L730) | `gap: 6,` |
| `SummaryTile` | [761](../packages/web/src/screens/DailyOverviewScreen.tsx#L761) | `minWidth: 0,` |
| `SummaryTile` | [762](../packages/web/src/screens/DailyOverviewScreen.tsx#L762) | `borderRadius: 14,` |
| `SummaryTile` | [763](../packages/web/src/screens/DailyOverviewScreen.tsx#L763) | `padding: '9px 6px',` |
| `SummaryTile` | [772](../packages/web/src/screens/DailyOverviewScreen.tsx#L772) | `fontSize: 8,` |
| `SummaryTile` | [773](../packages/web/src/screens/DailyOverviewScreen.tsx#L773) | `fontWeight: 900,` |
| `SummaryTile` | [774](../packages/web/src/screens/DailyOverviewScreen.tsx#L774) | `lineHeight: 1.05,` |
| `SummaryTile` | [787](../packages/web/src/screens/DailyOverviewScreen.tsx#L787) | `fontSize: 12,` |
| `SummaryTile` | [788](../packages/web/src/screens/DailyOverviewScreen.tsx#L788) | `fontWeight: 950,` |
| `SummaryTile` | [789](../packages/web/src/screens/DailyOverviewScreen.tsx#L789) | `lineHeight: 1.05,` |
| `SummaryTile` | [799](../packages/web/src/screens/DailyOverviewScreen.tsx#L799) | `fontSize: 9,` |
| `SummaryTile` | [800](../packages/web/src/screens/DailyOverviewScreen.tsx#L800) | `fontWeight: 750,` |
| `SummaryTile` | [801](../packages/web/src/screens/DailyOverviewScreen.tsx#L801) | `lineHeight: 1.05,` |
| `StatTile` | [817](../packages/web/src/screens/DailyOverviewScreen.tsx#L817) | `borderRadius: 16,` |
| `StatTile` | [818](../packages/web/src/screens/DailyOverviewScreen.tsx#L818) | `padding: '12px 8px',` |
| `StatTile` | [827](../packages/web/src/screens/DailyOverviewScreen.tsx#L827) | `fontSize: 9,` |
| `StatTile` | [828](../packages/web/src/screens/DailyOverviewScreen.tsx#L828) | `fontWeight: 900,` |
| `StatTile` | [839](../packages/web/src/screens/DailyOverviewScreen.tsx#L839) | `fontSize: 19,` |
| `StatTile` | [840](../packages/web/src/screens/DailyOverviewScreen.tsx#L840) | `fontWeight: 850,` |
| `StatTile` | [841](../packages/web/src/screens/DailyOverviewScreen.tsx#L841) | `lineHeight: 1,` |

</details>

<details>
<summary>screens/DailyScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `DailyScreen` | [689](../packages/web/src/screens/DailyScreen.tsx#L689) | `gap: 12,` |
| `DailyScreen` | [690](../packages/web/src/screens/DailyScreen.tsx#L690) | `padding: 20,` |
| `TournamentGameContextCard` | [994](../packages/web/src/screens/DailyScreen.tsx#L994) | `<main className="screen" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>` |
| `TournamentGameContextCard` | [997](../packages/web/src/screens/DailyScreen.tsx#L997) | `style={{ width: 'min(100%, 420px)', padding: 24, textAlign: 'center' }}` |
| `GameHub` | [1430](../packages/web/src/screens/DailyScreen.tsx#L1430) | `width: '78%',` |
| `GameHub` | [1433](../packages/web/src/screens/DailyScreen.tsx#L1433) | `gridTemplateColumns: '1fr 1fr',` |
| `GameHub` | [1434](../packages/web/src/screens/DailyScreen.tsx#L1434) | `gap: 8,` |
| `GameHub` | [1444](../packages/web/src/screens/DailyScreen.tsx#L1444) | `style={{ minHeight: 34, fontSize: 'clamp(10px, 1.45vh, 12px)', padding: '0 10px' }}` |
| `GameHub` | [1457](../packages/web/src/screens/DailyScreen.tsx#L1457) | `style={{ minHeight: 34, fontSize: 'clamp(10px, 1.45vh, 12px)', padding: '0 10px' }}` |
| `waitingForOpponent` | [1758](../packages/web/src/screens/DailyScreen.tsx#L1758) | `width: '100%',` |
| `waitingForOpponent` | [1759](../packages/web/src/screens/DailyScreen.tsx#L1759) | `height: '100dvh',` |
| `waitingForOpponent` | [1760](../packages/web/src/screens/DailyScreen.tsx#L1760) | `padding: 0,` |
| `waitingForOpponent` | [1771](../packages/web/src/screens/DailyScreen.tsx#L1771) | `width: '100%',` |
| `waitingForOpponent` | [1772](../packages/web/src/screens/DailyScreen.tsx#L1772) | `height: '100%',` |
| `waitingForOpponent` | [1774](../packages/web/src/screens/DailyScreen.tsx#L1774) | `padding: 0,` |
| `normalized` | [1881](../packages/web/src/screens/DailyScreen.tsx#L1881) | `return <div style={{ minHeight: 320 }} />;` |
| `normalized` | [1889](../packages/web/src/screens/DailyScreen.tsx#L1889) | `width: '100%',` |
| `normalized` | [1890](../packages/web/src/screens/DailyScreen.tsx#L1890) | `height: '100%',` |
| `normalized` | [1913](../packages/web/src/screens/DailyScreen.tsx#L1913) | `padding: 'clamp(10px, 1.6vh, 14px) 0 clamp(9px, 1.4vh, 13px)',` |
| `normalized` | [1950](../packages/web/src/screens/DailyScreen.tsx#L1950) | `minWidth: 0,` |
| `normalized` | [1953](../packages/web/src/screens/DailyScreen.tsx#L1953) | `gap: 6,` |
| `normalized` | [1967](../packages/web/src/screens/DailyScreen.tsx#L1967) | `width: 7,` |
| `normalized` | [1968](../packages/web/src/screens/DailyScreen.tsx#L1968) | `height: 7,` |
| `normalized` | [1970](../packages/web/src/screens/DailyScreen.tsx#L1970) | `padding: 0,` |
| `normalized` | [1972](../packages/web/src/screens/DailyScreen.tsx#L1972) | `borderRadius: 999,` |
| `normalized` | [1996](../packages/web/src/screens/DailyScreen.tsx#L1996) | `width: 'min(160px, 70%)',` |
| `normalized` | [1997](../packages/web/src/screens/DailyScreen.tsx#L1997) | `minWidth: 0,` |
| `normalized` | [1998](../packages/web/src/screens/DailyScreen.tsx#L1998) | `minHeight: 'clamp(36px, 4.8vh, 44px)',` |
| `normalized` | [2000](../packages/web/src/screens/DailyScreen.tsx#L2000) | `padding: '0 16px',` |
| `normalized` | [2003](../packages/web/src/screens/DailyScreen.tsx#L2003) | `fontSize:` |
| `normalized` | [2007](../packages/web/src/screens/DailyScreen.tsx#L2007) | `fontWeight: activeEntry.ctaLabel === 'Сократить восстановление' ? 700 : 900,` |
| `normalized` | [2009](../packages/web/src/screens/DailyScreen.tsx#L2009) | `lineHeight: 1,` |
| `ArenaTableauNavButton` | [2044](../packages/web/src/screens/DailyScreen.tsx#L2044) | `width: 28,` |
| `ArenaTableauNavButton` | [2045](../packages/web/src/screens/DailyScreen.tsx#L2045) | `height: 44,` |
| `ArenaTableauNavButton` | [2047](../packages/web/src/screens/DailyScreen.tsx#L2047) | `borderRadius: 0,` |
| `ArenaTableauNavButton` | [2052](../packages/web/src/screens/DailyScreen.tsx#L2052) | `fontSize: 30,` |
| `ArenaTableauNavButton` | [2053](../packages/web/src/screens/DailyScreen.tsx#L2053) | `fontWeight: 950,` |
| `ArenaTableauNavButton` | [2054](../packages/web/src/screens/DailyScreen.tsx#L2054) | `lineHeight: 1,` |
| `ArenaTableauNavButton` | [2055](../packages/web/src/screens/DailyScreen.tsx#L2055) | `padding: 0,` |
| `ArenaCubeFace` | [2076](../packages/web/src/screens/DailyScreen.tsx#L2076) | `width: '100%',` |
| `ArenaCubeFace` | [2077](../packages/web/src/screens/DailyScreen.tsx#L2077) | `height: '100%',` |
| `ArenaCubeFace` | [2078](../packages/web/src/screens/DailyScreen.tsx#L2078) | `minHeight: 0,` |
| `ArenaCubeFace` | [2081](../packages/web/src/screens/DailyScreen.tsx#L2081) | `padding: '0 clamp(38px, 11vw, 46px)',` |
| `ArenaCubeFace` | [2090](../packages/web/src/screens/DailyScreen.tsx#L2090) | `minHeight: 0,` |
| `ArenaCubeFace` | [2091](../packages/web/src/screens/DailyScreen.tsx#L2091) | `height: '100%',` |
| `ArenaCubeFace` | [2096](../packages/web/src/screens/DailyScreen.tsx#L2096) | `gap: 'clamp(4px, 0.7vh, 6px)',` |
| `ArenaCubeFace` | [2098](../packages/web/src/screens/DailyScreen.tsx#L2098) | `padding: 0,` |
| `ArenaCubeFace` | [2101](../packages/web/src/screens/DailyScreen.tsx#L2101) | `<div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>` |
| `ArenaCubeFace` | [2105](../packages/web/src/screens/DailyScreen.tsx#L2105) | `fontSize: 'clamp(7px, 1.08vh, 9px)',` |
| `ArenaCubeFace` | [2106](../packages/web/src/screens/DailyScreen.tsx#L2106) | `fontWeight: 950,` |
| `ArenaCubeFace` | [2109](../packages/web/src/screens/DailyScreen.tsx#L2109) | `lineHeight: 1.05,` |
| `ArenaCubeFace` | [2135](../packages/web/src/screens/DailyScreen.tsx#L2135) | `gridTemplateColumns: 'clamp(38px, 6vh, 54px) minmax(0, 1fr)',` |
| `ArenaCubeFace` | [2137](../packages/web/src/screens/DailyScreen.tsx#L2137) | `gap: 'clamp(5px, 1vh, 8px)',` |
| `ArenaCubeFace` | [2139](../packages/web/src/screens/DailyScreen.tsx#L2139) | `minWidth: 0,` |
| `ArenaCubeFace` | [2140](../packages/web/src/screens/DailyScreen.tsx#L2140) | `maxWidth: 'min(100%, 340px)',` |
| `ArenaCubeFace` | [2154](../packages/web/src/screens/DailyScreen.tsx#L2154) | `<div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>` |
| `ArenaCubeFace` | [2159](../packages/web/src/screens/DailyScreen.tsx#L2159) | `lineHeight: 0.95,` |
| `ArenaCubeFace` | [2160](../packages/web/src/screens/DailyScreen.tsx#L2160) | `fontWeight: 950,` |
| `ArenaCubeFace` | [2183](../packages/web/src/screens/DailyScreen.tsx#L2183) | `fontSize: entry.compactTitle` |
| `ArenaCubeFace` | [2190](../packages/web/src/screens/DailyScreen.tsx#L2190) | `lineHeight: entry.compactTitle ? 1 : entry.title.length > 28 ? 1.02 : 0.95,` |
| `ArenaCubeFace` | [2191](../packages/web/src/screens/DailyScreen.tsx#L2191) | `fontWeight: 950,` |
| `ArenaCubeFace` | [2199](../packages/web/src/screens/DailyScreen.tsx#L2199) | `maxWidth: '100%',` |
| `ArenaCubeFace` | [2208](../packages/web/src/screens/DailyScreen.tsx#L2208) | `maxWidth: entry.compactSubtitle ? 'min(84%, 300px)' : 'min(72%, 280px)',` |
| `ArenaCubeFace` | [2211](../packages/web/src/screens/DailyScreen.tsx#L2211) | `fontSize: entry.compactSubtitle` |
| `ArenaCubeFace` | [2214](../packages/web/src/screens/DailyScreen.tsx#L2214) | `fontWeight: 850,` |
| `ArenaCubeFace` | [2215](../packages/web/src/screens/DailyScreen.tsx#L2215) | `lineHeight: entry.compactSubtitle ? 1.08 : 1.12,` |
| `ArenaCubeFace` | [2234](../packages/web/src/screens/DailyScreen.tsx#L2234) | `width: '100%',` |
| `ArenaCubeFace` | [2240](../packages/web/src/screens/DailyScreen.tsx#L2240) | `width: '100%',` |
| `ArenaCubeFace` | [2241](../packages/web/src/screens/DailyScreen.tsx#L2241) | `maxWidth: 'min(300px, 92%)',` |
| `ArenaCubeFace` | [2249](../packages/web/src/screens/DailyScreen.tsx#L2249) | `width: '100%',` |
| `ArenaCubeFace` | [2251](../packages/web/src/screens/DailyScreen.tsx#L2251) | `fontSize: 'clamp(12px, 1.85vh, 16px)',` |
| `ArenaCubeFace` | [2252](../packages/web/src/screens/DailyScreen.tsx#L2252) | `fontWeight: 950,` |
| `ArenaCubeFace` | [2253](../packages/web/src/screens/DailyScreen.tsx#L2253) | `lineHeight: 1.05,` |
| `DailyHubScoreboard` | [2291](../packages/web/src/screens/DailyScreen.tsx#L2291) | `width: align === 'left' ? 'auto' : '100%',` |
| `DailyHubScoreboard` | [2292](../packages/web/src/screens/DailyScreen.tsx#L2292) | `maxWidth: align === 'left' ? 'none' : spacious ? 360 : 340,` |
| `DailyHubScoreboard` | [2293](../packages/web/src/screens/DailyScreen.tsx#L2293) | `padding: 0,` |
| `DailyHubScoreboard` | [2295](../packages/web/src/screens/DailyScreen.tsx#L2295) | `gridTemplateColumns: timerOnly` |
| `DailyHubScoreboard` | [2305](../packages/web/src/screens/DailyScreen.tsx#L2305) | `gap:` |
| `DailyHubScoreboard` | [2323](../packages/web/src/screens/DailyScreen.tsx#L2323) | `gap: 5,` |
| `DailyHubScoreboard` | [2324](../packages/web/src/screens/DailyScreen.tsx#L2324) | `minWidth: 0,` |
| `DailyHubScoreboard` | [2325](../packages/web/src/screens/DailyScreen.tsx#L2325) | `lineHeight: 1,` |
| `DailyPeriodTabs` | [2667](../packages/web/src/screens/DailyScreen.tsx#L2667) | `gap: 4,` |
| `DailyPeriodTab` | [2691](../packages/web/src/screens/DailyScreen.tsx#L2691) | `width: 20,` |
| `DailyPeriodTab` | [2692](../packages/web/src/screens/DailyScreen.tsx#L2692) | `height: 20,` |
| `DailyPeriodTab` | [2693](../packages/web/src/screens/DailyScreen.tsx#L2693) | `borderRadius: 5,` |
| `DailyPeriodTab` | [2697](../packages/web/src/screens/DailyScreen.tsx#L2697) | `fontSize: 11,` |
| `DailyPeriodTab` | [2698](../packages/web/src/screens/DailyScreen.tsx#L2698) | `fontWeight: 900,` |
| `DailyEventScoreboardColumn` | [2729](../packages/web/src/screens/DailyScreen.tsx#L2729) | `gap: 5,` |
| `DailyEventScoreboardColumn` | [2730](../packages/web/src/screens/DailyScreen.tsx#L2730) | `minWidth: 0,` |
| `DailyEventScoreboardColumn` | [2731](../packages/web/src/screens/DailyScreen.tsx#L2731) | `lineHeight: 1,` |
| `DailyEventScoreboardColumn` | [2732](../packages/web/src/screens/DailyScreen.tsx#L2732) | `width: '100%',` |
| `DailyEventScoreboardColumn` | [2740](../packages/web/src/screens/DailyScreen.tsx#L2740) | `fontSize: 'clamp(13px, 2.05vh, 18px)',` |
| `DailyEventScoreboardColumn` | [2741](../packages/web/src/screens/DailyScreen.tsx#L2741) | `fontWeight: 950,` |
| `DailyEventScoreboardColumn` | [2742](../packages/web/src/screens/DailyScreen.tsx#L2742) | `lineHeight: 1,` |
| `DailyEventScoreboardLabel` | [2766](../packages/web/src/screens/DailyScreen.tsx#L2766) | `fontSize: 'clamp(6px, 0.95vh, 8px)',` |
| `DailyEventScoreboardLabel` | [2767](../packages/web/src/screens/DailyScreen.tsx#L2767) | `fontWeight: 900,` |
| `DailyEventScoreboardLabel` | [2770](../packages/web/src/screens/DailyScreen.tsx#L2770) | `maxWidth: '100%',` |
| `ModeInfoModal` | [2809](../packages/web/src/screens/DailyScreen.tsx#L2809) | `padding: 20,` |
| `ModeInfoModal` | [2815](../packages/web/src/screens/DailyScreen.tsx#L2815) | `style={{ borderRadius: 24, padding: '22px 22px 18px', maxWidth: 320, width: '100%' }}` |
| `ModeInfoModal` | [2819](../packages/web/src/screens/DailyScreen.tsx#L2819) | `fontSize: 15,` |
| `ModeInfoModal` | [2820](../packages/web/src/screens/DailyScreen.tsx#L2820) | `fontWeight: 700,` |
| `ModeInfoModal` | [2828](../packages/web/src/screens/DailyScreen.tsx#L2828) | `<div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{text}</div>` |
| `ModeInfoModal` | [2834](../packages/web/src/screens/DailyScreen.tsx#L2834) | `style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}` |
| `DailyGameStatsModal` | [2881](../packages/web/src/screens/DailyScreen.tsx#L2881) | `padding: 20,` |
| `DailyGameStatsModal` | [2888](../packages/web/src/screens/DailyScreen.tsx#L2888) | `borderRadius: 24,` |
| `DailyGameStatsModal` | [2889](../packages/web/src/screens/DailyScreen.tsx#L2889) | `padding: '18px 18px 20px',` |
| `DailyGameStatsModal` | [2890](../packages/web/src/screens/DailyScreen.tsx#L2890) | `maxWidth: 380,` |
| `DailyGameStatsModal` | [2891](../packages/web/src/screens/DailyScreen.tsx#L2891) | `width: '100%',` |
| `DailyGameStatsModal` | [2899](../packages/web/src/screens/DailyScreen.tsx#L2899) | `gap: 12,` |
| `DailyGameStatsModal` | [2903](../packages/web/src/screens/DailyScreen.tsx#L2903) | `<div style={{ minWidth: 0 }}>` |
| `DailyGameStatsModal` | [2906](../packages/web/src/screens/DailyScreen.tsx#L2906) | `fontSize: 14,` |
| `DailyGameStatsModal` | [2907](../packages/web/src/screens/DailyScreen.tsx#L2907) | `fontWeight: 900,` |
| `DailyGameStatsModal` | [2919](../packages/web/src/screens/DailyScreen.tsx#L2919) | `fontSize: 12,` |
| `DailyGameStatsModal` | [2920](../packages/web/src/screens/DailyScreen.tsx#L2920) | `fontWeight: 800,` |
| `DailyGameStatsModal` | [2935](../packages/web/src/screens/DailyScreen.tsx#L2935) | `fontSize: 13,` |
| `DailyGameStatsModal` | [2936](../packages/web/src/screens/DailyScreen.tsx#L2936) | `fontWeight: 700,` |
| `DailyGameStatsModal` | [2937](../packages/web/src/screens/DailyScreen.tsx#L2937) | `lineHeight: 1.55,` |
| `DailyGameStatsModal` | [2949](../packages/web/src/screens/DailyScreen.tsx#L2949) | `gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',` |
| `DailyGameStatsModal` | [2950](../packages/web/src/screens/DailyScreen.tsx#L2950) | `gap: 8,` |
| `DailyGameStatsModal` | [2967](../packages/web/src/screens/DailyScreen.tsx#L2967) | `gap: 8,` |
| `DailyGameStatsModal` | [2989](../packages/web/src/screens/DailyScreen.tsx#L2989) | `style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}` |
| `DuelStatsModal` | [3027](../packages/web/src/screens/DailyScreen.tsx#L3027) | `padding: 20,` |
| `DuelStatsModal` | [3034](../packages/web/src/screens/DailyScreen.tsx#L3034) | `borderRadius: 24,` |
| `DuelStatsModal` | [3035](../packages/web/src/screens/DailyScreen.tsx#L3035) | `padding: '18px 18px 20px',` |
| `DuelStatsModal` | [3036](../packages/web/src/screens/DailyScreen.tsx#L3036) | `maxHeight: 'min(82vh, 720px)',` |
| `DuelStatsModal` | [3037](../packages/web/src/screens/DailyScreen.tsx#L3037) | `maxWidth: 420,` |
| `DuelStatsModal` | [3039](../packages/web/src/screens/DailyScreen.tsx#L3039) | `width: '100%',` |
| `DuelStatsModal` | [3047](../packages/web/src/screens/DailyScreen.tsx#L3047) | `gap: 12,` |
| `DuelStatsModal` | [3051](../packages/web/src/screens/DailyScreen.tsx#L3051) | `<div style={{ minWidth: 0 }}>` |
| `DuelStatsModal` | [3054](../packages/web/src/screens/DailyScreen.tsx#L3054) | `fontSize: 14,` |
| `DuelStatsModal` | [3055](../packages/web/src/screens/DailyScreen.tsx#L3055) | `fontWeight: 900,` |
| `DuelStatsModal` | [3067](../packages/web/src/screens/DailyScreen.tsx#L3067) | `fontSize: 12,` |
| `DuelStatsModal` | [3068](../packages/web/src/screens/DailyScreen.tsx#L3068) | `fontWeight: 800,` |
| `DuelStatsModal` | [3084](../packages/web/src/screens/DailyScreen.tsx#L3084) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `DuelStatsModal` | [3085](../packages/web/src/screens/DailyScreen.tsx#L3085) | `gap: 8,` |
| `DuelStatsModal` | [3111](../packages/web/src/screens/DailyScreen.tsx#L3111) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>` |
| `DuelStatsModal` | [3125](../packages/web/src/screens/DailyScreen.tsx#L3125) | `style={{ marginTop: 18, width: '100%', padding: '12px 0', fontSize: 14 }}` |
| `DuelStatsInfoGrid` | [3143](../packages/web/src/screens/DailyScreen.tsx#L3143) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `DuelStatsInfoGrid` | [3144](../packages/web/src/screens/DailyScreen.tsx#L3144) | `gap: 8,` |
| `DuelStatsInfoGrid` | [3152](../packages/web/src/screens/DailyScreen.tsx#L3152) | `minWidth: 0,` |
| `DuelStatsInfoGrid` | [3153](../packages/web/src/screens/DailyScreen.tsx#L3153) | `borderRadius: 14,` |
| `DuelStatsInfoGrid` | [3154](../packages/web/src/screens/DailyScreen.tsx#L3154) | `padding: '10px 9px',` |
| `DuelStatsInfoGrid` | [3162](../packages/web/src/screens/DailyScreen.tsx#L3162) | `fontSize: 9,` |
| `DuelStatsInfoGrid` | [3163](../packages/web/src/screens/DailyScreen.tsx#L3163) | `fontWeight: 900,` |
| `DuelStatsInfoGrid` | [3175](../packages/web/src/screens/DailyScreen.tsx#L3175) | `fontSize: item.value.length > 14 ? 11 : 13,` |
| `DuelStatsInfoGrid` | [3176](../packages/web/src/screens/DailyScreen.tsx#L3176) | `fontWeight: 900,` |
| `DuelStatsInfoGrid` | [3177](../packages/web/src/screens/DailyScreen.tsx#L3177) | `lineHeight: 1.15,` |
| `DuelStatsParticipantRow` | [3208](../packages/web/src/screens/DailyScreen.tsx#L3208) | `borderRadius: 16,` |
| `DuelStatsParticipantRow` | [3209](../packages/web/src/screens/DailyScreen.tsx#L3209) | `padding: '11px 12px',` |
| `DuelStatsParticipantRow` | [3218](../packages/web/src/screens/DailyScreen.tsx#L3218) | `gap: 10,` |
| `DuelStatsParticipantRow` | [3224](../packages/web/src/screens/DailyScreen.tsx#L3224) | `minWidth: 0,` |
| `DuelStatsParticipantRow` | [3226](../packages/web/src/screens/DailyScreen.tsx#L3226) | `fontSize: 13,` |
| `DuelStatsParticipantRow` | [3227](../packages/web/src/screens/DailyScreen.tsx#L3227) | `fontWeight: 900,` |
| `DuelStatsParticipantRow` | [3236](../packages/web/src/screens/DailyScreen.tsx#L3236) | `fontSize: 10,` |
| `DuelStatsParticipantRow` | [3237](../packages/web/src/screens/DailyScreen.tsx#L3237) | `fontWeight: 900,` |
| `DuelStatsParticipantRow` | [3248](../packages/web/src/screens/DailyScreen.tsx#L3248) | `gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',` |
| `DuelStatsParticipantRow` | [3249](../packages/web/src/screens/DailyScreen.tsx#L3249) | `gap: 7,` |
| `DuelStatsParticipantRow` | [3253](../packages/web/src/screens/DailyScreen.tsx#L3253) | `<div key={item.label} style={{ minWidth: 0 }}>` |
| `DuelStatsParticipantRow` | [3257](../packages/web/src/screens/DailyScreen.tsx#L3257) | `fontSize: 8,` |
| `DuelStatsParticipantRow` | [3258](../packages/web/src/screens/DailyScreen.tsx#L3258) | `fontWeight: 900,` |
| `DuelStatsParticipantRow` | [3270](../packages/web/src/screens/DailyScreen.tsx#L3270) | `fontSize: item.label === 'Время' ? 13 : 15,` |
| `DuelStatsParticipantRow` | [3271](../packages/web/src/screens/DailyScreen.tsx#L3271) | `fontWeight: 800,` |
| `DuelStatsParticipantRow` | [3273](../packages/web/src/screens/DailyScreen.tsx#L3273) | `lineHeight: 1,` |
| `DailyStatsMetric` | [3302](../packages/web/src/screens/DailyScreen.tsx#L3302) | `borderRadius: 16,` |
| `DailyStatsMetric` | [3303](../packages/web/src/screens/DailyScreen.tsx#L3303) | `padding: '12px 8px',` |
| `DailyStatsMetric` | [3313](../packages/web/src/screens/DailyScreen.tsx#L3313) | `fontSize: 9,` |
| `DailyStatsMetric` | [3314](../packages/web/src/screens/DailyScreen.tsx#L3314) | `fontWeight: 900,` |
| `DailyStatsMetric` | [3326](../packages/web/src/screens/DailyScreen.tsx#L3326) | `fontSize: isTime ? 17 : 20,` |
| `DailyStatsMetric` | [3327](../packages/web/src/screens/DailyScreen.tsx#L3327) | `fontWeight: 800,` |
| `DailyStatsMetric` | [3328](../packages/web/src/screens/DailyScreen.tsx#L3328) | `lineHeight: 1,` |
| `DailyStatsPeriodRow` | [3356](../packages/web/src/screens/DailyScreen.tsx#L3356) | `gridTemplateColumns: 'minmax(0, 1fr) auto auto',` |
| `DailyStatsPeriodRow` | [3358](../packages/web/src/screens/DailyScreen.tsx#L3358) | `gap: 10,` |
| `DailyStatsPeriodRow` | [3359](../packages/web/src/screens/DailyScreen.tsx#L3359) | `borderRadius: 16,` |
| `DailyStatsPeriodRow` | [3360](../packages/web/src/screens/DailyScreen.tsx#L3360) | `padding: '10px 12px',` |
| `DailyStatsPeriodRow` | [3365](../packages/web/src/screens/DailyScreen.tsx#L3365) | `<div style={{ minWidth: 0 }}>` |
| `DailyStatsPeriodRow` | [3369](../packages/web/src/screens/DailyScreen.tsx#L3369) | `fontSize: 13,` |
| `DailyStatsPeriodRow` | [3370](../packages/web/src/screens/DailyScreen.tsx#L3370) | `fontWeight: 900,` |
| `DailyStatsPeriodRow` | [3379](../packages/web/src/screens/DailyScreen.tsx#L3379) | `fontSize: 10,` |
| `DailyStatsPeriodRow` | [3380](../packages/web/src/screens/DailyScreen.tsx#L3380) | `fontWeight: 800,` |
| `DailyStatsPeriodRow` | [3381](../packages/web/src/screens/DailyScreen.tsx#L3381) | `lineHeight: 1.15,` |
| `DailyStatsPeriodRow` | [3391](../packages/web/src/screens/DailyScreen.tsx#L3391) | `fontSize: 14,` |
| `DailyStatsPeriodRow` | [3392](../packages/web/src/screens/DailyScreen.tsx#L3392) | `fontWeight: 800,` |
| `DailyStatsPeriodRow` | [3401](../packages/web/src/screens/DailyScreen.tsx#L3401) | `minWidth: 42,` |
| `DailyStatsPeriodRow` | [3404](../packages/web/src/screens/DailyScreen.tsx#L3404) | `fontSize: 13,` |
| `DailyStatsPeriodRow` | [3405](../packages/web/src/screens/DailyScreen.tsx#L3405) | `fontWeight: 800,` |
| `ModeShell` | [3434](../packages/web/src/screens/DailyScreen.tsx#L3434) | `padding: isSectionHub` |
| `ModeShell` | [3437](../packages/web/src/screens/DailyScreen.tsx#L3437) | `gap: 14,` |
| `ModeShell` | [3442](../packages/web/src/screens/DailyScreen.tsx#L3442) | `width: '100%',` |
| `ModeShell` | [3443](../packages/web/src/screens/DailyScreen.tsx#L3443) | `maxWidth: 760,` |
| `ModeShell` | [3447](../packages/web/src/screens/DailyScreen.tsx#L3447) | `gap: 14,` |
| `ModeShell` | [3452](../packages/web/src/screens/DailyScreen.tsx#L3452) | `style={isSectionHub ? undefined : { display: 'flex', alignItems: 'center', gap: 10 }}` |
| `ModeShell` | [3468](../packages/web/src/screens/DailyScreen.tsx#L3468) | `width: 40,` |
| `ModeShell` | [3469](../packages/web/src/screens/DailyScreen.tsx#L3469) | `height: 40,` |
| `ModeShell` | [3470](../packages/web/src/screens/DailyScreen.tsx#L3470) | `minWidth: 40,` |
| `ModeShell` | [3471](../packages/web/src/screens/DailyScreen.tsx#L3471) | `minHeight: 40,` |
| `ModeShell` | [3472](../packages/web/src/screens/DailyScreen.tsx#L3472) | `borderRadius: 999,` |
| `ModeShell` | [3473](../packages/web/src/screens/DailyScreen.tsx#L3473) | `padding: 0,` |
| `ModeShell` | [3490](../packages/web/src/screens/DailyScreen.tsx#L3490) | `isSectionHub ? undefined : { margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }` |
| `DuelDevStatePanel` | [4281](../packages/web/src/screens/DailyScreen.tsx#L4281) | `maxWidth: 480,` |
| `DuelDevStatePanel` | [4283](../packages/web/src/screens/DailyScreen.tsx#L4283) | `borderRadius: 18,` |
| `DuelDevStatePanel` | [4284](../packages/web/src/screens/DailyScreen.tsx#L4284) | `padding: '12px 14px',` |
| `DuelDevStatePanel` | [4293](../packages/web/src/screens/DailyScreen.tsx#L4293) | `<div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '0.1em', opacity: 0.62 }}>` |
| `DuelDevStatePanel` | [4300](../packages/web/src/screens/DailyScreen.tsx#L4300) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `DuelDevStatePanel` | [4301](../packages/web/src/screens/DailyScreen.tsx#L4301) | `gap: 8,` |
| `DuelDevStatePanel` | [4302](../packages/web/src/screens/DailyScreen.tsx#L4302) | `fontSize: 12,` |
| `DuelDevStatePanel` | [4303](../packages/web/src/screens/DailyScreen.tsx#L4303) | `fontWeight: 850,` |
| `DuelDevStatePanel` | [4304](../packages/web/src/screens/DailyScreen.tsx#L4304) | `lineHeight: 1.25,` |
| `DuelDevStatePanel` | [4318](../packages/web/src/screens/DailyScreen.tsx#L4318) | `fontSize: 12,` |
| `DuelDevStatePanel` | [4319](../packages/web/src/screens/DailyScreen.tsx#L4319) | `fontWeight: 750,` |
| `DuelDevStatePanel` | [4320](../packages/web/src/screens/DailyScreen.tsx#L4320) | `lineHeight: 1.35,` |
| `toggleKind` | [4447](../packages/web/src/screens/DailyScreen.tsx#L4447) | `<div className="glass duel-kind-picker" style={{ borderRadius: 16, padding: '10px 10px 12px' }}>` |
| `toggleKind` | [4453](../packages/web/src/screens/DailyScreen.tsx#L4453) | `gap: 10,` |
| `toggleKind` | [4472](../packages/web/src/screens/DailyScreen.tsx#L4472) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `toggleKind` | [4473](../packages/web/src/screens/DailyScreen.tsx#L4473) | `gap: 6,` |
| `MatchmakingRulesContent` | [4520](../packages/web/src/screens/DailyScreen.tsx#L4520) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>` |
| `MatchmakingRulesContent` | [4521](../packages/web/src/screens/DailyScreen.tsx#L4521) | `<div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45, fontWeight: 700 }}>` |
| `MatchmakingRulesContent` | [4525](../packages/web/src/screens/DailyScreen.tsx#L4525) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `MatchmakingRulesContent` | [4531](../packages/web/src/screens/DailyScreen.tsx#L4531) | `gridTemplateColumns: '92px minmax(0, 1fr)',` |
| `MatchmakingRulesContent` | [4532](../packages/web/src/screens/DailyScreen.tsx#L4532) | `gap: 8,` |
| `MatchmakingRulesContent` | [4539](../packages/web/src/screens/DailyScreen.tsx#L4539) | `fontSize: 12,` |
| `MatchmakingRulesContent` | [4540](../packages/web/src/screens/DailyScreen.tsx#L4540) | `fontWeight: 950,` |
| `MatchmakingRulesContent` | [4541](../packages/web/src/screens/DailyScreen.tsx#L4541) | `lineHeight: 1.25,` |
| `MatchmakingRulesContent` | [4549](../packages/web/src/screens/DailyScreen.tsx#L4549) | `fontSize: 12,` |
| `MatchmakingRulesContent` | [4550](../packages/web/src/screens/DailyScreen.tsx#L4550) | `fontWeight: 700,` |
| `MatchmakingRulesContent` | [4551](../packages/web/src/screens/DailyScreen.tsx#L4551) | `lineHeight: 1.35,` |
| `renderDuelCards` | [5013](../packages/web/src/screens/DailyScreen.tsx#L5013) | `borderRadius: 18,` |
| `renderDuelCards` | [5014](../packages/web/src/screens/DailyScreen.tsx#L5014) | `padding: 12,` |
| `renderDuelCards` | [5016](../packages/web/src/screens/DailyScreen.tsx#L5016) | `gridTemplateColumns: 'minmax(0, 1fr) auto',` |
| `renderDuelCards` | [5018](../packages/web/src/screens/DailyScreen.tsx#L5018) | `gap: 10,` |
| `renderDuelCards` | [5021](../packages/web/src/screens/DailyScreen.tsx#L5021) | `<div style={{ minWidth: 0 }}>` |
| `renderDuelCards` | [5022](../packages/web/src/screens/DailyScreen.tsx#L5022) | `<div style={{ color: 'var(--ink)', fontSize: 15, fontWeight: 900 }}>` |
| `renderDuelCards` | [5027](../packages/web/src/screens/DailyScreen.tsx#L5027) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 700 }}>` |
| `renderDuelCards` | [5041](../packages/web/src/screens/DailyScreen.tsx#L5041) | `style={{ minHeight: 38, padding: '0 14px', fontSize: 12 }}` |
| `renderDuelCards` | [5089](../packages/web/src/screens/DailyScreen.tsx#L5089) | `<div style={{ color: 'var(--muted)', fontSize: 14 }}>Нет активных шаблонов</div>` |
| `renderDuelCards` | [5102](../packages/web/src/screens/DailyScreen.tsx#L5102) | `<div className="glass duel-quick-pick" style={{ borderRadius: 18, padding: 12 }}>` |
| `renderDuelCards` | [5108](../packages/web/src/screens/DailyScreen.tsx#L5108) | `gap: 10,` |
| `renderDuelCards` | [5130](../packages/web/src/screens/DailyScreen.tsx#L5130) | `width: 58,` |
| `renderDuelCards` | [5135](../packages/web/src/screens/DailyScreen.tsx#L5135) | `gap: 6,` |
| `renderDuelCards` | [5136](../packages/web/src/screens/DailyScreen.tsx#L5136) | `fontSize: 10,` |
| `renderDuelCards` | [5137](../packages/web/src/screens/DailyScreen.tsx#L5137) | `fontWeight: 900,` |
| `renderDuelCards` | [5138](../packages/web/src/screens/DailyScreen.tsx#L5138) | `lineHeight: 1.05,` |
| `renderDuelCards` | [5141](../packages/web/src/screens/DailyScreen.tsx#L5141) | `padding: 0,` |
| `renderDuelCards` | [5163](../packages/web/src/screens/DailyScreen.tsx#L5163) | `width: 11,` |
| `renderDuelCards` | [5164](../packages/web/src/screens/DailyScreen.tsx#L5164) | `height: 11,` |
| `renderDuelCards` | [5165](../packages/web/src/screens/DailyScreen.tsx#L5165) | `borderRadius: 999,` |
| `renderDuelCards` | [5176](../packages/web/src/screens/DailyScreen.tsx#L5176) | `width: '100%',` |
| `renderDuelCards` | [5190](../packages/web/src/screens/DailyScreen.tsx#L5190) | `style={{ fontSize: 13, fontWeight: 700 }}` |
| `renderDuelCards` | [5208](../packages/web/src/screens/DailyScreen.tsx#L5208) | `<div className="glass-dock-field duel-opponent-search" style={{ minHeight: 48 }}>` |
| `renderDuelCards` | [5226](../packages/web/src/screens/DailyScreen.tsx#L5226) | `fontSize: 14,` |
| `renderDuelCards` | [5227](../packages/web/src/screens/DailyScreen.tsx#L5227) | `fontWeight: 800,` |
| `renderDuelCards` | [5236](../packages/web/src/screens/DailyScreen.tsx#L5236) | `borderRadius: 16,` |
| `renderDuelCards` | [5237](../packages/web/src/screens/DailyScreen.tsx#L5237) | `padding: '10px 12px',` |
| `renderDuelCards` | [5239](../packages/web/src/screens/DailyScreen.tsx#L5239) | `gridTemplateColumns: 'minmax(0, 1fr) 34px',` |
| `renderDuelCards` | [5240](../packages/web/src/screens/DailyScreen.tsx#L5240) | `gap: 10,` |
| `renderDuelCards` | [5244](../packages/web/src/screens/DailyScreen.tsx#L5244) | `<div style={{ minWidth: 0 }}>` |
| `renderDuelCards` | [5245](../packages/web/src/screens/DailyScreen.tsx#L5245) | `<div className="section-label" style={{ margin: 0, padding: 0 }}>` |
| `renderDuelCards` | [5251](../packages/web/src/screens/DailyScreen.tsx#L5251) | `fontSize: 16,` |
| `renderDuelCards` | [5252](../packages/web/src/screens/DailyScreen.tsx#L5252) | `fontWeight: 900,` |
| `renderDuelCards` | [5272](../packages/web/src/screens/DailyScreen.tsx#L5272) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `renderDuelCards` | [5283](../packages/web/src/screens/DailyScreen.tsx#L5283) | `minHeight: 58,` |
| `renderDuelCards` | [5284](../packages/web/src/screens/DailyScreen.tsx#L5284) | `borderRadius: 20,` |
| `renderDuelCards` | [5285](../packages/web/src/screens/DailyScreen.tsx#L5285) | `padding: '8px 12px',` |
| `renderDuelCards` | [5287](../packages/web/src/screens/DailyScreen.tsx#L5287) | `gridTemplateColumns: '42px minmax(0, 1fr)',` |
| `renderDuelCards` | [5289](../packages/web/src/screens/DailyScreen.tsx#L5289) | `gap: 12,` |
| `renderDuelCards` | [5310](../packages/web/src/screens/DailyScreen.tsx#L5310) | `width: 11,` |
| `renderDuelCards` | [5311](../packages/web/src/screens/DailyScreen.tsx#L5311) | `height: 11,` |
| `renderDuelCards` | [5312](../packages/web/src/screens/DailyScreen.tsx#L5312) | `borderRadius: 999,` |
| `renderDuelCards` | [5320](../packages/web/src/screens/DailyScreen.tsx#L5320) | `<span style={{ minWidth: 0 }}>` |
| `renderDuelCards` | [5325](../packages/web/src/screens/DailyScreen.tsx#L5325) | `fontSize: 16,` |
| `renderDuelCards` | [5326](../packages/web/src/screens/DailyScreen.tsx#L5326) | `fontWeight: 900,` |
| `renderDuelCards` | [5338](../packages/web/src/screens/DailyScreen.tsx#L5338) | `fontSize: 11,` |
| `renderDuelCards` | [5339](../packages/web/src/screens/DailyScreen.tsx#L5339) | `fontWeight: 800,` |
| `renderDuelCards` | [5373](../packages/web/src/screens/DailyScreen.tsx#L5373) | `<div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>` |
| `DuelListCard` | [5507](../packages/web/src/screens/DailyScreen.tsx#L5507) | `borderRadius: 18,` |
| `DuelListCard` | [5508](../packages/web/src/screens/DailyScreen.tsx#L5508) | `padding: '10px 12px',` |
| `DuelListCard` | [5509](../packages/web/src/screens/DailyScreen.tsx#L5509) | `minHeight: 68,` |
| `DuelListCard` | [5510](../packages/web/src/screens/DailyScreen.tsx#L5510) | `width: '100%',` |
| `DuelListCard` | [5520](../packages/web/src/screens/DailyScreen.tsx#L5520) | `gridTemplateColumns: onCancelInvite ? '42px minmax(0, 1fr) 34px' : '42px minmax(0, 1fr)',` |
| `DuelListCard` | [5553](../packages/web/src/screens/DailyScreen.tsx#L5553) | `width: 11,` |
| `DuelListCard` | [5554](../packages/web/src/screens/DailyScreen.tsx#L5554) | `height: 11,` |
| `DuelListCard` | [5555](../packages/web/src/screens/DailyScreen.tsx#L5555) | `borderRadius: 999,` |
| `DuelListCard` | [5562](../packages/web/src/screens/DailyScreen.tsx#L5562) | `<div className="duel-card-heading" style={{ gridColumn: '2 / 3', gridRow: '1', minWidth: 0 }}>` |
| `DuelListCard` | [5566](../packages/web/src/screens/DailyScreen.tsx#L5566) | `fontWeight: 900,` |
| `DuelListCard` | [5568](../packages/web/src/screens/DailyScreen.tsx#L5568) | `fontSize: 15,` |
| `DuelListCard` | [5600](../packages/web/src/screens/DailyScreen.tsx#L5600) | `gridTemplateColumns: '1fr 1fr',` |
| `DuelListCard` | [5601](../packages/web/src/screens/DailyScreen.tsx#L5601) | `gap: 8,` |
| `DuelListCard` | [5610](../packages/web/src/screens/DailyScreen.tsx#L5610) | `style={{ minHeight: 36, fontSize: 12 }}` |
| `DuelListCard` | [5622](../packages/web/src/screens/DailyScreen.tsx#L5622) | `style={{ minHeight: 36, fontSize: 12 }}` |
| `DuelListCard` | [5648](../packages/web/src/screens/DailyScreen.tsx#L5648) | `width: 34,` |
| `DuelListCard` | [5649](../packages/web/src/screens/DailyScreen.tsx#L5649) | `height: 34,` |
| `DuelListCard` | [5650](../packages/web/src/screens/DailyScreen.tsx#L5650) | `minWidth: 34,` |
| `DuelListCard` | [5651](../packages/web/src/screens/DailyScreen.tsx#L5651) | `minHeight: 34,` |
| `refreshOnlineMatch` | [5917](../packages/web/src/screens/DailyScreen.tsx#L5917) | `<div style={{ color: error ? 'var(--red-deep)' : 'var(--muted)', fontSize: 14 }}>` |
| `refreshOnlineMatch` | [6152](../packages/web/src/screens/DailyScreen.tsx#L6152) | `<div style={{ display: 'grid', gap: 14 }}>` |
| `refreshOnlineMatch` | [6156](../packages/web/src/screens/DailyScreen.tsx#L6156) | `<p className="modal-copy" style={{ margin: 0, fontSize: 13 }}>` |
| `refreshOnlineMatch` | [6164](../packages/web/src/screens/DailyScreen.tsx#L6164) | `gap: 10,` |
| `refreshOnlineMatch` | [6166](../packages/web/src/screens/DailyScreen.tsx#L6166) | `fontSize: 14,` |
| `refreshOnlineMatch` | [6167](../packages/web/src/screens/DailyScreen.tsx#L6167) | `fontWeight: 750,` |
| `refreshOnlineMatch` | [6176](../packages/web/src/screens/DailyScreen.tsx#L6176) | `style={{ width: 18, height: 18, margin: 0, accentColor: '#16263a' }}` |
| `refreshOnlineMatch` | [6181](../packages/web/src/screens/DailyScreen.tsx#L6181) | `<div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>{error}</div>` |
| `refreshOnlineMatch` | [6213](../packages/web/src/screens/DailyScreen.tsx#L6213) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>` |
| `refreshOnlineMatch` | [6221](../packages/web/src/screens/DailyScreen.tsx#L6221) | `borderRadius: 18,` |
| `refreshOnlineMatch` | [6222](../packages/web/src/screens/DailyScreen.tsx#L6222) | `padding: 14,` |
| `refreshOnlineMatch` | [6233](../packages/web/src/screens/DailyScreen.tsx#L6233) | `<div style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', marginBottom: 6 }}>` |
| `refreshOnlineMatch` | [6236](../packages/web/src/screens/DailyScreen.tsx#L6236) | `<div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>{readyLead}</div>` |
| `refreshOnlineMatch` | [6240](../packages/web/src/screens/DailyScreen.tsx#L6240) | `<div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>{error}</div>` |
| `refreshOnlineMatch` | [6355](../packages/web/src/screens/DailyScreen.tsx#L6355) | `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>` |
| `refreshOnlineMatch` | [6364](../packages/web/src/screens/DailyScreen.tsx#L6364) | `<div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.45 }}>` |
| `refreshOnlineMatch` | [6368](../packages/web/src/screens/DailyScreen.tsx#L6368) | `<div style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 700 }}>{error}</div>` |
| `DuelResultCard` | [6589](../packages/web/src/screens/DailyScreen.tsx#L6589) | `maxHeight: 'calc(100dvh - 64px)',` |
| `DuelResultCard` | [6598](../packages/web/src/screens/DailyScreen.tsx#L6598) | `minHeight: 0,` |
| `DuelResultCard` | [6616](../packages/web/src/screens/DailyScreen.tsx#L6616) | `<div className="section-label" style={{ margin: 0, padding: 0 }}>` |
| `DuelResultCard` | [6643](../packages/web/src/screens/DailyScreen.tsx#L6643) | `<div className="section-label" style={{ margin: 0, padding: 0 }}>` |
| `DuelResultCard` | [6652](../packages/web/src/screens/DailyScreen.tsx#L6652) | `gap: 12,` |
| `DuelResultCard` | [6659](../packages/web/src/screens/DailyScreen.tsx#L6659) | `fontSize: title.length > 30 ? 16 : title.length > 22 ? 19 : 24,` |
| `DuelResultCard` | [6660](../packages/web/src/screens/DailyScreen.tsx#L6660) | `lineHeight: 1.08,` |
| `DuelResultCard` | [6670](../packages/web/src/screens/DailyScreen.tsx#L6670) | `width: 16,` |
| `DuelResultCard` | [6671](../packages/web/src/screens/DailyScreen.tsx#L6671) | `height: 16,` |
| `DuelResultCard` | [6672](../packages/web/src/screens/DailyScreen.tsx#L6672) | `borderRadius: 999,` |
| `DuelResultCard` | [6736](../packages/web/src/screens/DailyScreen.tsx#L6736) | `<div className="tournament-duel-result__meta" style={match.fight_rewards?.length ? {flexDirection:'column',alignItems:'stretch',gap:6} : undefined}>` |
| `DuelResultCard` | [6774](../packages/web/src/screens/DailyScreen.tsx#L6774) | `gap: 8,` |
| `DuelResultCard` | [6801](../packages/web/src/screens/DailyScreen.tsx#L6801) | `<div className="section-label" style={{ margin: 0, padding: 0 }}>` |
| `DuelResultCard` | [6825](../packages/web/src/screens/DailyScreen.tsx#L6825) | `borderRadius: 16,` |
| `DuelResultCard` | [6826](../packages/web/src/screens/DailyScreen.tsx#L6826) | `padding: '12px 14px',` |
| `DuelResultCard` | [6830](../packages/web/src/screens/DailyScreen.tsx#L6830) | `fontSize: 12,` |
| `DuelResultCard` | [6831](../packages/web/src/screens/DailyScreen.tsx#L6831) | `fontWeight: 750,` |
| `DuelResultCard` | [6832](../packages/web/src/screens/DailyScreen.tsx#L6832) | `lineHeight: 1.35,` |
| `DuelResultPeriodComparison` | [7194](../packages/web/src/screens/DailyScreen.tsx#L7194) | `gap: compact ? 6 : 8,` |
| `heading` | [7283](../packages/web/src/screens/DailyScreen.tsx#L7283) | `borderRadius: 16,` |
| `heading` | [7284](../packages/web/src/screens/DailyScreen.tsx#L7284) | `padding: 10,` |
| `heading` | [7295](../packages/web/src/screens/DailyScreen.tsx#L7295) | `width: '100%',` |
| `heading` | [7297](../packages/web/src/screens/DailyScreen.tsx#L7297) | `gridTemplateColumns: 'minmax(0, 1fr) auto auto',` |
| `heading` | [7298](../packages/web/src/screens/DailyScreen.tsx#L7298) | `gap: 8,` |
| `heading` | [7300](../packages/web/src/screens/DailyScreen.tsx#L7300) | `padding: 0,` |
| `heading` | [7311](../packages/web/src/screens/DailyScreen.tsx#L7311) | `minWidth: 0,` |
| `heading` | [7312](../packages/web/src/screens/DailyScreen.tsx#L7312) | `fontSize: 12,` |
| `heading` | [7313](../packages/web/src/screens/DailyScreen.tsx#L7313) | `fontWeight: 950,` |
| `heading` | [7314](../packages/web/src/screens/DailyScreen.tsx#L7314) | `lineHeight: 1.1,` |
| `heading` | [7321](../packages/web/src/screens/DailyScreen.tsx#L7321) | `borderRadius: 999,` |
| `heading` | [7322](../packages/web/src/screens/DailyScreen.tsx#L7322) | `padding: '5px 9px',` |
| `heading` | [7327](../packages/web/src/screens/DailyScreen.tsx#L7327) | `fontSize: 11,` |
| `heading` | [7328](../packages/web/src/screens/DailyScreen.tsx#L7328) | `fontWeight: 850,` |
| `heading` | [7350](../packages/web/src/screens/DailyScreen.tsx#L7350) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `heading` | [7351](../packages/web/src/screens/DailyScreen.tsx#L7351) | `gap: 8,` |
| `DuelResultParticipantPeriodStats` | [7447](../packages/web/src/screens/DailyScreen.tsx#L7447) | `minWidth: 0,` |
| `DuelResultParticipantPeriodStats` | [7448](../packages/web/src/screens/DailyScreen.tsx#L7448) | `borderRadius: 14,` |
| `DuelResultParticipantPeriodStats` | [7449](../packages/web/src/screens/DailyScreen.tsx#L7449) | `padding: '9px 8px',` |
| `DuelResultParticipantPeriodStats` | [7457](../packages/web/src/screens/DailyScreen.tsx#L7457) | `fontSize: 9,` |
| `DuelResultParticipantPeriodStats` | [7458](../packages/web/src/screens/DailyScreen.tsx#L7458) | `fontWeight: 950,` |
| `DuelResultParticipantPeriodStats` | [7459](../packages/web/src/screens/DailyScreen.tsx#L7459) | `lineHeight: 1.1,` |
| `DuelResultParticipantPeriodStats` | [7473](../packages/web/src/screens/DailyScreen.tsx#L7473) | `gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',` |
| `DuelResultParticipantPeriodStats` | [7474](../packages/web/src/screens/DailyScreen.tsx#L7474) | `gap: '6px 8px',` |
| `DuelResultParticipantPeriodStats` | [7476](../packages/web/src/screens/DailyScreen.tsx#L7476) | `fontSize: 11,` |
| `DuelResultParticipantPeriodStats` | [7477](../packages/web/src/screens/DailyScreen.tsx#L7477) | `fontWeight: 850,` |
| `DuelResultTinyStat` | [7494](../packages/web/src/screens/DailyScreen.tsx#L7494) | `<div style={{ minWidth: 0 }}>` |
| `DuelResultTinyStat` | [7498](../packages/web/src/screens/DailyScreen.tsx#L7498) | `fontSize: 8,` |
| `DuelResultTinyStat` | [7499](../packages/web/src/screens/DailyScreen.tsx#L7499) | `fontWeight: 900,` |
| `DuelResultTinyStat` | [7500](../packages/web/src/screens/DailyScreen.tsx#L7500) | `lineHeight: 1,` |
| `DuelResultTinyStat` | [7511](../packages/web/src/screens/DailyScreen.tsx#L7511) | `fontSize: label === 'Время' ? 10 : 12,` |
| `DuelResultTinyStat` | [7512](../packages/web/src/screens/DailyScreen.tsx#L7512) | `fontWeight: 850,` |
| `DuelResultTinyStat` | [7513](../packages/web/src/screens/DailyScreen.tsx#L7513) | `lineHeight: 1,` |
| `DuelResultDetailRow` | [7548](../packages/web/src/screens/DailyScreen.tsx#L7548) | `gridTemplateColumns: '82px minmax(0, 1fr)',` |
| `DuelResultDetailRow` | [7549](../packages/web/src/screens/DailyScreen.tsx#L7549) | `gap: 10,` |
| `DuelResultDetailRow` | [7552](../packages/web/src/screens/DailyScreen.tsx#L7552) | `fontSize: 13,` |
| `DuelResultDetailRow` | [7553](../packages/web/src/screens/DailyScreen.tsx#L7553) | `fontWeight: 850,` |
| `DuelResultDetailRow` | [7559](../packages/web/src/screens/DailyScreen.tsx#L7559) | `fontSize: 10,` |
| `DuelResultDetailRow` | [7560](../packages/web/src/screens/DailyScreen.tsx#L7560) | `fontWeight: 900,` |
| `DuelResultDetailRow` | [7569](../packages/web/src/screens/DailyScreen.tsx#L7569) | `minWidth: 0,` |
| `DuelRulesPanel` | [7598](../packages/web/src/screens/DailyScreen.tsx#L7598) | `borderRadius: 18,` |
| `DuelRulesPanel` | [7599](../packages/web/src/screens/DailyScreen.tsx#L7599) | `padding: 12,` |
| `DuelRulesPanel` | [7601](../packages/web/src/screens/DailyScreen.tsx#L7601) | `gridTemplateColumns: '72px minmax(0, 1fr)',` |
| `DuelRulesPanel` | [7603](../packages/web/src/screens/DailyScreen.tsx#L7603) | `gap: 10,` |
| `DuelRulesPanel` | [7610](../packages/web/src/screens/DailyScreen.tsx#L7610) | `width: 72,` |
| `DuelRulesPanel` | [7611](../packages/web/src/screens/DailyScreen.tsx#L7611) | `height: 72,` |
| `DuelRulesPanel` | [7612](../packages/web/src/screens/DailyScreen.tsx#L7612) | `borderRadius: 16,` |
| `DuelRulesPanel` | [7618](../packages/web/src/screens/DailyScreen.tsx#L7618) | `<div style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 10 }}>` |
| `DuelRulesPanel` | [7622](../packages/web/src/screens/DailyScreen.tsx#L7622) | `fontSize: 18,` |
| `DuelRulesPanel` | [7623](../packages/web/src/screens/DailyScreen.tsx#L7623) | `fontWeight: 950,` |
| `DuelRulesPanel` | [7624](../packages/web/src/screens/DailyScreen.tsx#L7624) | `lineHeight: 1.05,` |
| `DuelRulesPanel` | [7629](../packages/web/src/screens/DailyScreen.tsx#L7629) | `<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>` |
| `DuelRulesPanel` | [7635](../packages/web/src/screens/DailyScreen.tsx#L7635) | `fontSize: 11,` |
| `DuelRulesPanel` | [7636](../packages/web/src/screens/DailyScreen.tsx#L7636) | `padding: '7px 10px',` |
| `DuelRulesPanel` | [7640](../packages/web/src/screens/DailyScreen.tsx#L7640) | `lineHeight: 1.1,` |
| `DuelOpponentPanel` | [7659](../packages/web/src/screens/DailyScreen.tsx#L7659) | `borderRadius: 18,` |
| `DuelOpponentPanel` | [7660](../packages/web/src/screens/DailyScreen.tsx#L7660) | `padding: 12,` |
| `DuelOpponentPanel` | [7662](../packages/web/src/screens/DailyScreen.tsx#L7662) | `gridTemplateColumns: '48px minmax(0, 1fr) auto',` |
| `DuelOpponentPanel` | [7664](../packages/web/src/screens/DailyScreen.tsx#L7664) | `gap: 10,` |
| `DuelOpponentPanel` | [7677](../packages/web/src/screens/DailyScreen.tsx#L7677) | `<div style={{ minWidth: 0 }}>` |
| `DuelOpponentPanel` | [7681](../packages/web/src/screens/DailyScreen.tsx#L7681) | `fontSize: 18,` |
| `DuelOpponentPanel` | [7682](../packages/web/src/screens/DailyScreen.tsx#L7682) | `fontWeight: 950,` |
| `DuelOpponentPanel` | [7683](../packages/web/src/screens/DailyScreen.tsx#L7683) | `lineHeight: 1.05,` |
| `DuelOpponentPanel` | [7696](../packages/web/src/screens/DailyScreen.tsx#L7696) | `fontSize: 18,` |
| `DuelOpponentPanel` | [7697](../packages/web/src/screens/DailyScreen.tsx#L7697) | `fontWeight: 950,` |
| `DuelOpponentPanel` | [7698](../packages/web/src/screens/DailyScreen.tsx#L7698) | `lineHeight: 1.05,` |
| `DuelOpponentPanel` | [7711](../packages/web/src/screens/DailyScreen.tsx#L7711) | `borderRadius: 999,` |
| `DuelOpponentPanel` | [7712](../packages/web/src/screens/DailyScreen.tsx#L7712) | `padding: '7px 10px 7px 8px',` |
| `DuelOpponentPanel` | [7715](../packages/web/src/screens/DailyScreen.tsx#L7715) | `fontSize: 11,` |
| `DuelOpponentPanel` | [7716](../packages/web/src/screens/DailyScreen.tsx#L7716) | `fontWeight: 900,` |
| `DuelOpponentPanel` | [7720](../packages/web/src/screens/DailyScreen.tsx#L7720) | `gap: 6,` |
| `DuelOpponentPanel` | [7726](../packages/web/src/screens/DailyScreen.tsx#L7726) | `width: 8,` |
| `DuelOpponentPanel` | [7727](../packages/web/src/screens/DailyScreen.tsx#L7727) | `height: 8,` |
| `DuelOpponentPanel` | [7728](../packages/web/src/screens/DailyScreen.tsx#L7728) | `borderRadius: 999,` |
| `DuelLoadoutSummary` | [7797](../packages/web/src/screens/DailyScreen.tsx#L7797) | `style={{ borderRadius: 18, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}` |
| `DuelLoadoutSummary` | [7799](../packages/web/src/screens/DailyScreen.tsx#L7799) | `<div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>` |
| `DuelLoadoutSummary` | [7800](../packages/web/src/screens/DailyScreen.tsx#L7800) | `<div style={{ fontWeight: 900, color: 'var(--ink)', fontSize: 14 }}>Ваш инвентарь</div>` |
| `DuelLoadoutSummary` | [7801](../packages/web/src/screens/DailyScreen.tsx#L7801) | `<div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 900 }}>` |
| `DuelInventoryUsageSummary` | [7830](../packages/web/src/screens/DailyScreen.tsx#L7830) | `<div aria-label={label ?? title} style={{ display: 'grid', gap: compact ? 5 : 6, ...style }}>` |
| `DuelInventoryUsageSummary` | [7835](../packages/web/src/screens/DailyScreen.tsx#L7835) | `? { margin: 0, padding: 0 }` |
| `DuelInventoryUsageSummary` | [7836](../packages/web/src/screens/DailyScreen.tsx#L7836) | `: { color: 'var(--muted)', fontSize: 11, fontWeight: 900 }` |
| `DuelInventoryUsageSummary` | [7841](../packages/web/src/screens/DailyScreen.tsx#L7841) | `<div style={{ display: 'grid', gap: 5 }}>` |
| `DuelInventoryUsageSummary` | [7848](../packages/web/src/screens/DailyScreen.tsx#L7848) | `gap: 8,` |
| `DuelInventoryUsageSummary` | [7849](../packages/web/src/screens/DailyScreen.tsx#L7849) | `fontSize: compact ? 11 : 12,` |
| `DuelInventoryUsageSummary` | [7850](../packages/web/src/screens/DailyScreen.tsx#L7850) | `lineHeight: 1.25,` |
| `DuelInventoryUsageSummary` | [7853](../packages/web/src/screens/DailyScreen.tsx#L7853) | `<span style={{ color: 'var(--muted)', fontWeight: 750 }}>{item.title}</span>` |
| `DuelInventoryUsageSummary` | [7854](../packages/web/src/screens/DailyScreen.tsx#L7854) | `<span style={{ color: 'var(--ink)', fontWeight: 900, textAlign: 'right' }}>` |
| `duelEquipmentStockLineStyle` | [7970](../packages/web/src/screens/DailyScreen.tsx#L7970) | `fontSize: 12,` |
| `duelEquipmentStockLineStyle` | [7971](../packages/web/src/screens/DailyScreen.tsx#L7971) | `fontWeight: 920,` |
| `duelEquipmentStockLineStyle` | [7972](../packages/web/src/screens/DailyScreen.tsx#L7972) | `lineHeight: 1.15,` |
| `DuelInventorySlots` | [8083](../packages/web/src/screens/DailyScreen.tsx#L8083) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `DuelInventorySlots` | [8084](../packages/web/src/screens/DailyScreen.tsx#L8084) | `gap: 8,` |
| `DuelInventorySlots` | [8103](../packages/web/src/screens/DailyScreen.tsx#L8103) | `minHeight: 98,` |
| `DuelInventorySlots` | [8104](../packages/web/src/screens/DailyScreen.tsx#L8104) | `borderRadius: 12,` |
| `DuelInventorySlots` | [8105](../packages/web/src/screens/DailyScreen.tsx#L8105) | `padding: '9px',` |
| `DuelInventorySlots` | [8107](../packages/web/src/screens/DailyScreen.tsx#L8107) | `gridTemplateColumns: '1fr',` |
| `DuelInventorySlots` | [8109](../packages/web/src/screens/DailyScreen.tsx#L8109) | `gap: 7,` |
| `DuelInventorySlots` | [8115](../packages/web/src/screens/DailyScreen.tsx#L8115) | `minWidth: 0,` |
| `DuelInventorySlots` | [8121](../packages/web/src/screens/DailyScreen.tsx#L8121) | `width: iconSize,` |
| `DuelInventorySlots` | [8122](../packages/web/src/screens/DailyScreen.tsx#L8122) | `height: iconSize,` |
| `DuelInventorySlots` | [8123](../packages/web/src/screens/DailyScreen.tsx#L8123) | `borderRadius: 10,` |
| `DuelInventorySlots` | [8136](../packages/web/src/screens/DailyScreen.tsx#L8136) | `width: iconSize,` |
| `DuelInventorySlots` | [8137](../packages/web/src/screens/DailyScreen.tsx#L8137) | `height: iconSize,` |
| `DuelInventorySlots` | [8144](../packages/web/src/screens/DailyScreen.tsx#L8144) | `<div style={{ minWidth: 0, width: '100%', textAlign: 'center' }}>` |
| `DuelInventorySlots` | [8147](../packages/web/src/screens/DailyScreen.tsx#L8147) | `fontSize: 10,` |
| `DuelInventorySlots` | [8148](../packages/web/src/screens/DailyScreen.tsx#L8148) | `fontWeight: 900,` |
| `DuelInventorySlots` | [8151](../packages/web/src/screens/DailyScreen.tsx#L8151) | `lineHeight: 1.08,` |
| `DuelInventorySlots` | [8163](../packages/web/src/screens/DailyScreen.tsx#L8163) | `fontSize: 11,` |
| `DuelInventorySlots` | [8164](../packages/web/src/screens/DailyScreen.tsx#L8164) | `fontWeight: 900,` |
| `DuelInventorySlots` | [8165](../packages/web/src/screens/DailyScreen.tsx#L8165) | `lineHeight: 1.08,` |
| `DuelRinkLoadoutHud` | [8222](../packages/web/src/screens/DailyScreen.tsx#L8222) | `gap: 9,` |
| `DuelRinkLoadoutHud` | [8255](../packages/web/src/screens/DailyScreen.tsx#L8255) | `width: 31,` |
| `DuelRinkLoadoutHud` | [8256](../packages/web/src/screens/DailyScreen.tsx#L8256) | `height: 31,` |
| `DuelRinkLoadoutHud` | [8257](../packages/web/src/screens/DailyScreen.tsx#L8257) | `borderRadius: 999,` |
| `DuelRinkLoadoutHud` | [8259](../packages/web/src/screens/DailyScreen.tsx#L8259) | `padding: 0,` |
| `DuelRinkLoadoutHud` | [8274](../packages/web/src/screens/DailyScreen.tsx#L8274) | `width: '100%',` |
| `DuelRinkLoadoutHud` | [8275](../packages/web/src/screens/DailyScreen.tsx#L8275) | `height: '100%',` |
| `DuelRinkLoadoutHud` | [8277](../packages/web/src/screens/DailyScreen.tsx#L8277) | `borderRadius: 999,` |
| `DuelRinkLoadoutHud` | [8290](../packages/web/src/screens/DailyScreen.tsx#L8290) | `minWidth: 'max-content',` |
| `DuelRinkLoadoutHud` | [8295](../packages/web/src/screens/DailyScreen.tsx#L8295) | `fontSize: 9.5,` |
| `DuelRinkLoadoutHud` | [8296](../packages/web/src/screens/DailyScreen.tsx#L8296) | `fontWeight: 950,` |
| `DuelRinkLoadoutHud` | [8297](../packages/web/src/screens/DailyScreen.tsx#L8297) | `lineHeight: 1,` |
| `DuelRinkLoadoutModal` | [8340](../packages/web/src/screens/DailyScreen.tsx#L8340) | `width: 'min(430px, calc(100vw - 28px))',` |
| `DuelRinkLoadoutModal` | [8341](../packages/web/src/screens/DailyScreen.tsx#L8341) | `maxHeight: 'calc(100dvh - 112px - var(--app-safe-top) - var(--app-safe-bottom))',` |
| `DuelRinkLoadoutModal` | [8344](../packages/web/src/screens/DailyScreen.tsx#L8344) | `gap: 10,` |
| `DuelRinkLoadoutModal` | [8348](../packages/web/src/screens/DailyScreen.tsx#L8348) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `DuelRinkLoadoutModal` | [8349](../packages/web/src/screens/DailyScreen.tsx#L8349) | `<div style={{ flex: 1, minWidth: 0 }}>` |
| `DuelRinkLoadoutModal` | [8360](../packages/web/src/screens/DailyScreen.tsx#L8360) | `minHeight: 0,` |
| `DuelRinkLoadoutModal` | [8361](../packages/web/src/screens/DailyScreen.tsx#L8361) | `maxHeight: 'min(54dvh, 430px)',` |
| `DuelRinkLoadoutModal` | [8364](../packages/web/src/screens/DailyScreen.tsx#L8364) | `gap: 8,` |
| `DuelRinkLoadoutModal` | [8375](../packages/web/src/screens/DailyScreen.tsx#L8375) | `minHeight: 78,` |
| `DuelRinkLoadoutModal` | [8376](../packages/web/src/screens/DailyScreen.tsx#L8376) | `borderRadius: 16,` |
| `DuelRinkLoadoutModal` | [8377](../packages/web/src/screens/DailyScreen.tsx#L8377) | `padding: 10,` |
| `DuelRinkLoadoutModal` | [8379](../packages/web/src/screens/DailyScreen.tsx#L8379) | `gridTemplateColumns: '56px minmax(0, 1fr) 22px',` |
| `DuelRinkLoadoutModal` | [8381](../packages/web/src/screens/DailyScreen.tsx#L8381) | `gap: 10,` |
| `DuelRinkLoadoutModal` | [8388](../packages/web/src/screens/DailyScreen.tsx#L8388) | `width: 56,` |
| `DuelRinkLoadoutModal` | [8389](../packages/web/src/screens/DailyScreen.tsx#L8389) | `height: 56,` |
| `DuelRinkLoadoutModal` | [8390](../packages/web/src/screens/DailyScreen.tsx#L8390) | `borderRadius: 14,` |
| `DuelRinkLoadoutModal` | [8400](../packages/web/src/screens/DailyScreen.tsx#L8400) | `width: '100%',` |
| `DuelRinkLoadoutModal` | [8401](../packages/web/src/screens/DailyScreen.tsx#L8401) | `height: '100%',` |
| `DuelRinkLoadoutModal` | [8409](../packages/web/src/screens/DailyScreen.tsx#L8409) | `<span style={{ minWidth: 0, display: 'grid', gap: 5 }}>` |
| `DuelRinkLoadoutModal` | [8410](../packages/web/src/screens/DailyScreen.tsx#L8410) | `<span style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>` |
| `DuelRinkLoadoutModal` | [8417](../packages/web/src/screens/DailyScreen.tsx#L8417) | `fontSize: 12,` |
| `DuelRinkLoadoutModal` | [8418](../packages/web/src/screens/DailyScreen.tsx#L8418) | `fontWeight: 760,` |
| `DuelRinkLoadoutModal` | [8419](../packages/web/src/screens/DailyScreen.tsx#L8419) | `lineHeight: 1.25,` |
| `DuelRinkLoadoutModal` | [8438](../packages/web/src/screens/DailyScreen.tsx#L8438) | `minHeight: 78,` |
| `DuelRinkLoadoutModal` | [8439](../packages/web/src/screens/DailyScreen.tsx#L8439) | `borderRadius: 16,` |
| `DuelRinkLoadoutModal` | [8440](../packages/web/src/screens/DailyScreen.tsx#L8440) | `padding: 10,` |
| `DuelRinkLoadoutModal` | [8442](../packages/web/src/screens/DailyScreen.tsx#L8442) | `gridTemplateColumns: '56px minmax(0, 1fr) 22px',` |
| `DuelRinkLoadoutModal` | [8444](../packages/web/src/screens/DailyScreen.tsx#L8444) | `gap: 10,` |
| `DuelRinkLoadoutModal` | [8452](../packages/web/src/screens/DailyScreen.tsx#L8452) | `width: 56,` |
| `DuelRinkLoadoutModal` | [8453](../packages/web/src/screens/DailyScreen.tsx#L8453) | `height: 56,` |
| `DuelRinkLoadoutModal` | [8454](../packages/web/src/screens/DailyScreen.tsx#L8454) | `borderRadius: 14,` |
| `DuelRinkLoadoutModal` | [8459](../packages/web/src/screens/DailyScreen.tsx#L8459) | `<span style={{ minWidth: 0, display: 'grid', gap: 5 }}>` |
| `DuelRinkLoadoutModal` | [8462](../packages/web/src/screens/DailyScreen.tsx#L8462) | `minWidth: 0,` |
| `DuelRinkLoadoutModal` | [8464](../packages/web/src/screens/DailyScreen.tsx#L8464) | `fontSize: 15,` |
| `DuelRinkLoadoutModal` | [8465](../packages/web/src/screens/DailyScreen.tsx#L8465) | `fontWeight: 950,` |
| `DuelRinkLoadoutModal` | [8466](../packages/web/src/screens/DailyScreen.tsx#L8466) | `lineHeight: 1.12,` |
| `DuelRinkLoadoutModal` | [8475](../packages/web/src/screens/DailyScreen.tsx#L8475) | `gap: 2,` |
| `DuelRinkLoadoutModal` | [8477](../packages/web/src/screens/DailyScreen.tsx#L8477) | `fontSize: 12,` |
| `DuelRinkLoadoutModal` | [8478](../packages/web/src/screens/DailyScreen.tsx#L8478) | `fontWeight: 760,` |
| `DuelRinkLoadoutModal` | [8479](../packages/web/src/screens/DailyScreen.tsx#L8479) | `lineHeight: 1.25,` |
| `DuelInventoryMiniHud` | [8712](../packages/web/src/screens/DailyScreen.tsx#L8712) | `gap: 9,` |
| `DuelInventoryMiniHud` | [8760](../packages/web/src/screens/DailyScreen.tsx#L8760) | `padding: 0,` |
| `DuelInventoryMiniHud` | [8762](../packages/web/src/screens/DailyScreen.tsx#L8762) | `width: 31,` |
| `DuelInventoryMiniHud` | [8763](../packages/web/src/screens/DailyScreen.tsx#L8763) | `height: 31,` |
| `DuelInventoryMiniHud` | [8764](../packages/web/src/screens/DailyScreen.tsx#L8764) | `borderRadius: 999,` |
| `DuelInventoryMiniHud` | [8781](../packages/web/src/screens/DailyScreen.tsx#L8781) | `width: '100%',` |
| `DuelInventoryMiniHud` | [8782](../packages/web/src/screens/DailyScreen.tsx#L8782) | `height: '100%',` |
| `DuelInventoryMiniHud` | [8783](../packages/web/src/screens/DailyScreen.tsx#L8783) | `borderRadius: 999,` |
| `DuelInventoryMiniHud` | [8796](../packages/web/src/screens/DailyScreen.tsx#L8796) | `minWidth: 'max-content',` |
| `DuelInventoryMiniHud` | [8801](../packages/web/src/screens/DailyScreen.tsx#L8801) | `fontSize: 9.5,` |
| `DuelInventoryMiniHud` | [8802](../packages/web/src/screens/DailyScreen.tsx#L8802) | `fontWeight: 950,` |
| `DuelInventoryMiniHud` | [8803](../packages/web/src/screens/DailyScreen.tsx#L8803) | `lineHeight: 1,` |
| `PeriodSpeedSummary` | [8855](../packages/web/src/screens/DailyScreen.tsx#L8855) | `padding: 12,` |
| `PeriodSpeedSummary` | [8856](../packages/web/src/screens/DailyScreen.tsx#L8856) | `borderRadius: 18,` |
| `PeriodSpeedSummary` | [8862](../packages/web/src/screens/DailyScreen.tsx#L8862) | `gap: 10,` |
| `PeriodSpeedSummary` | [8870](../packages/web/src/screens/DailyScreen.tsx#L8870) | `style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4 }}` |
| `PeriodSpeedSummary` | [8873](../packages/web/src/screens/DailyScreen.tsx#L8873) | `<div key={item.label} style={{ minWidth: 0 }}>` |
| `PeriodSpeedSummary` | [8877](../packages/web/src/screens/DailyScreen.tsx#L8877) | `fontSize: 'clamp(8px, 2.5vw, 10px)',` |
| `PeriodSpeedSummary` | [8878](../packages/web/src/screens/DailyScreen.tsx#L8878) | `fontWeight: 800,` |
| `PeriodSpeedSummary` | [8879](../packages/web/src/screens/DailyScreen.tsx#L8879) | `lineHeight: 1.1,` |
| `PeriodSpeedSummary` | [8888](../packages/web/src/screens/DailyScreen.tsx#L8888) | `fontSize: 'clamp(9px, 2.8vw, 12px)',` |
| `PeriodSpeedSummary` | [8889](../packages/web/src/screens/DailyScreen.tsx#L8889) | `fontWeight: 900,` |
| `PeriodSpeedSummary` | [8891](../packages/web/src/screens/DailyScreen.tsx#L8891) | `lineHeight: 1.1,` |
| `TotalCell` | [8910](../packages/web/src/screens/DailyScreen.tsx#L8910) | `padding: '10px 4px',` |
| `TotalCell` | [8911](../packages/web/src/screens/DailyScreen.tsx#L8911) | `borderRadius: 14,` |
| `TotalCell` | [8920](../packages/web/src/screens/DailyScreen.tsx#L8920) | `fontSize: isLongLabel ? 7 : 9,` |
| `TotalCell` | [8922](../packages/web/src/screens/DailyScreen.tsx#L8922) | `lineHeight: 1.1,` |
| `TotalCell` | [8923](../packages/web/src/screens/DailyScreen.tsx#L8923) | `fontWeight: 800,` |
| `TotalCell` | [8933](../packages/web/src/screens/DailyScreen.tsx#L8933) | `fontSize: isLongValue ? 16 : 18,` |
| `TotalCell` | [8934](../packages/web/src/screens/DailyScreen.tsx#L8934) | `fontWeight: 800,` |
| `ClassicRinkLoadoutHud` | [9437](../packages/web/src/screens/DailyScreen.tsx#L9437) | `style={{ display: 'flex', gap: 9, pointerEvents: locked ? 'none' : 'auto' }}` |
| `ClassicRinkLoadoutHud` | [9467](../packages/web/src/screens/DailyScreen.tsx#L9467) | `width: 31,` |
| `ClassicRinkLoadoutHud` | [9468](../packages/web/src/screens/DailyScreen.tsx#L9468) | `height: 31,` |
| `ClassicRinkLoadoutHud` | [9469](../packages/web/src/screens/DailyScreen.tsx#L9469) | `padding: 0,` |
| `ClassicRinkLoadoutHud` | [9470](../packages/web/src/screens/DailyScreen.tsx#L9470) | `borderRadius: 999,` |
| `ClassicRinkLoadoutHud` | [9485](../packages/web/src/screens/DailyScreen.tsx#L9485) | `width: '100%',` |
| `ClassicRinkLoadoutHud` | [9486](../packages/web/src/screens/DailyScreen.tsx#L9486) | `height: '100%',` |
| `ClassicRinkLoadoutHud` | [9488](../packages/web/src/screens/DailyScreen.tsx#L9488) | `borderRadius: 999,` |
| `ClassicRinkLoadoutHud` | [9499](../packages/web/src/screens/DailyScreen.tsx#L9499) | `minWidth: 'max-content',` |
| `ClassicRinkLoadoutHud` | [9504](../packages/web/src/screens/DailyScreen.tsx#L9504) | `fontSize: 9.5,` |
| `ClassicRinkLoadoutHud` | [9505](../packages/web/src/screens/DailyScreen.tsx#L9505) | `fontWeight: 950,` |
| `ClassicRinkLoadoutHud` | [9506](../packages/web/src/screens/DailyScreen.tsx#L9506) | `lineHeight: 1,` |
| `ClassicRinkLoadoutModal` | [9542](../packages/web/src/screens/DailyScreen.tsx#L9542) | `style={{ width: 'min(430px, calc(100vw - 28px))', display: 'grid', gap: 10 }}` |
| `ClassicRinkLoadoutModal` | [9544](../packages/web/src/screens/DailyScreen.tsx#L9544) | `<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>` |
| `ClassicRinkLoadoutModal` | [9554](../packages/web/src/screens/DailyScreen.tsx#L9554) | `style={{ maxHeight: '54dvh', overflowY: 'auto', display: 'grid', gap: 8 }}` |
| `ClassicRinkLoadoutModal` | [9562](../packages/web/src/screens/DailyScreen.tsx#L9562) | `minHeight: 78,` |
| `ClassicRinkLoadoutModal` | [9563](../packages/web/src/screens/DailyScreen.tsx#L9563) | `borderRadius: 16,` |
| `ClassicRinkLoadoutModal` | [9564](../packages/web/src/screens/DailyScreen.tsx#L9564) | `padding: 10,` |
| `ClassicRinkLoadoutModal` | [9566](../packages/web/src/screens/DailyScreen.tsx#L9566) | `gridTemplateColumns: '56px minmax(0, 1fr) 22px',` |
| `ClassicRinkLoadoutModal` | [9568](../packages/web/src/screens/DailyScreen.tsx#L9568) | `gap: 10,` |
| `ClassicRinkLoadoutModal` | [9576](../packages/web/src/screens/DailyScreen.tsx#L9576) | `width: 56,` |
| `ClassicRinkLoadoutModal` | [9577](../packages/web/src/screens/DailyScreen.tsx#L9577) | `height: 56,` |
| `ClassicRinkLoadoutModal` | [9578](../packages/web/src/screens/DailyScreen.tsx#L9578) | `borderRadius: 14,` |
| `ClassicRinkLoadoutModal` | [9588](../packages/web/src/screens/DailyScreen.tsx#L9588) | `width: '100%',` |
| `ClassicRinkLoadoutModal` | [9589](../packages/web/src/screens/DailyScreen.tsx#L9589) | `height: '100%',` |
| `ClassicRinkLoadoutModal` | [9597](../packages/web/src/screens/DailyScreen.tsx#L9597) | `<span style={{ minWidth: 0, display: 'grid', gap: 5 }}>` |
| `ClassicRinkLoadoutModal` | [9598](../packages/web/src/screens/DailyScreen.tsx#L9598) | `<strong style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>` |
| `ClassicRinkLoadoutModal` | [9604](../packages/web/src/screens/DailyScreen.tsx#L9604) | `fontSize: 12,` |
| `ClassicRinkLoadoutModal` | [9605](../packages/web/src/screens/DailyScreen.tsx#L9605) | `fontWeight: 760,` |
| `ClassicRinkLoadoutModal` | [9606](../packages/web/src/screens/DailyScreen.tsx#L9606) | `lineHeight: 1.25,` |
| `ClassicRinkLoadoutModal` | [9622](../packages/web/src/screens/DailyScreen.tsx#L9622) | `minHeight: 78,` |
| `ClassicRinkLoadoutModal` | [9623](../packages/web/src/screens/DailyScreen.tsx#L9623) | `borderRadius: 16,` |
| `ClassicRinkLoadoutModal` | [9624](../packages/web/src/screens/DailyScreen.tsx#L9624) | `padding: 10,` |
| `ClassicRinkLoadoutModal` | [9626](../packages/web/src/screens/DailyScreen.tsx#L9626) | `gridTemplateColumns: '56px minmax(0, 1fr) 22px',` |
| `ClassicRinkLoadoutModal` | [9628](../packages/web/src/screens/DailyScreen.tsx#L9628) | `gap: 10,` |
| `ClassicRinkLoadoutModal` | [9636](../packages/web/src/screens/DailyScreen.tsx#L9636) | `width: 56,` |
| `ClassicRinkLoadoutModal` | [9637](../packages/web/src/screens/DailyScreen.tsx#L9637) | `height: 56,` |
| `ClassicRinkLoadoutModal` | [9638](../packages/web/src/screens/DailyScreen.tsx#L9638) | `borderRadius: 14,` |
| `ClassicRinkLoadoutModal` | [9648](../packages/web/src/screens/DailyScreen.tsx#L9648) | `width: '100%',` |
| `ClassicRinkLoadoutModal` | [9649](../packages/web/src/screens/DailyScreen.tsx#L9649) | `height: '100%',` |
| `ClassicRinkLoadoutModal` | [9657](../packages/web/src/screens/DailyScreen.tsx#L9657) | `<span style={{ minWidth: 0, display: 'grid', gap: 5 }}>` |
| `ClassicRinkLoadoutModal` | [9658](../packages/web/src/screens/DailyScreen.tsx#L9658) | `<strong style={{ minWidth: 0, fontSize: 15, fontWeight: 950, lineHeight: 1.12 }}>` |
| `ClassicRinkLoadoutModal` | [9664](../packages/web/src/screens/DailyScreen.tsx#L9664) | `fontSize: 12,` |
| `ClassicRinkLoadoutModal` | [9665](../packages/web/src/screens/DailyScreen.tsx#L9665) | `fontWeight: 760,` |
| `ClassicRinkLoadoutModal` | [9666](../packages/web/src/screens/DailyScreen.tsx#L9666) | `lineHeight: 1.25,` |
| `showAmateurRestriction` | [9988](../packages/web/src/screens/DailyScreen.tsx#L9988) | `style={{ marginTop: 14, display: 'grid', gap: 6 }}` |
| `showAmateurRestriction` | [9990](../packages/web/src/screens/DailyScreen.tsx#L9990) | `<div className="section-label" style={{ margin: 0, padding: 0 }}>` |
| `showAmateurRestriction` | [9999](../packages/web/src/screens/DailyScreen.tsx#L9999) | `gap: 8,` |
| `showAmateurRestriction` | [10000](../packages/web/src/screens/DailyScreen.tsx#L10000) | `fontSize: 12,` |
| `showAmateurRestriction` | [10003](../packages/web/src/screens/DailyScreen.tsx#L10003) | `<span style={{ color: 'var(--muted)', fontWeight: 750 }}>{item.title}</span>` |
| `TrainingHitboxesToggle` | [10040](../packages/web/src/screens/DailyScreen.tsx#L10040) | `width: 34,` |
| `TrainingHitboxesToggle` | [10041](../packages/web/src/screens/DailyScreen.tsx#L10041) | `height: 34,` |
| `TrainingHitboxesToggle` | [10042](../packages/web/src/screens/DailyScreen.tsx#L10042) | `padding: 0,` |
| `TrainingHitboxesToggle` | [10043](../packages/web/src/screens/DailyScreen.tsx#L10043) | `borderRadius: 999,` |
| `TrainingHitboxesToggle` | [10065](../packages/web/src/screens/DailyScreen.tsx#L10065) | `width: '100%',` |
| `TrainingHitboxesToggle` | [10066](../packages/web/src/screens/DailyScreen.tsx#L10066) | `height: '100%',` |
| `TrainingSpeedControls` | [10135](../packages/web/src/screens/DailyScreen.tsx#L10135) | `width: 34,` |
| `TrainingSpeedControls` | [10136](../packages/web/src/screens/DailyScreen.tsx#L10136) | `height: 34,` |
| `TrainingSpeedControls` | [10137](../packages/web/src/screens/DailyScreen.tsx#L10137) | `padding: 0,` |
| `TrainingSpeedControls` | [10138](../packages/web/src/screens/DailyScreen.tsx#L10138) | `borderRadius: 999,` |
| `TrainingSpeedControls` | [10163](../packages/web/src/screens/DailyScreen.tsx#L10163) | `style={{ width: 'min(100%, 360px)', padding: '22px 20px 20px' }}` |
| `TrainingSpeedControls` | [10170](../packages/web/src/screens/DailyScreen.tsx#L10170) | `gap: 10,` |
| `TrainingSpeedControls` | [10178](../packages/web/src/screens/DailyScreen.tsx#L10178) | `<div style={{ display: 'grid', gap: 16, marginTop: 18 }}>` |
| `TrainingSpeedControls` | [10180](../packages/web/src/screens/DailyScreen.tsx#L10180) | `<label key={field.key} style={{ display: 'grid', gap: 8 }}>` |
| `TrainingSpeedControls` | [10186](../packages/web/src/screens/DailyScreen.tsx#L10186) | `gap: 10,` |
| `TrainingSpeedControls` | [10188](../packages/web/src/screens/DailyScreen.tsx#L10188) | `fontSize: 13,` |
| `TrainingSpeedControls` | [10189](../packages/web/src/screens/DailyScreen.tsx#L10189) | `fontWeight: 900,` |
| `TrainingSpeedControls` | [10216](../packages/web/src/screens/DailyScreen.tsx#L10216) | `style={{ width: '100%', accentColor: '#162136' }}` |
| `TrainingSpeedControls` | [10221](../packages/web/src/screens/DailyScreen.tsx#L10221) | `<div className="modal-actions" style={{ gridTemplateColumns: '1fr 1fr' }}>` |
| `TrainingPlayView` | [10384](../packages/web/src/screens/DailyScreen.tsx#L10384) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>` |
| `DemoCompletionModal` | [10601](../packages/web/src/screens/DailyScreen.tsx#L10601) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `DemoCompletionModal` | [10602](../packages/web/src/screens/DailyScreen.tsx#L10602) | `gap: 8,` |
| `DemoCompletionModal` | [10616](../packages/web/src/screens/DailyScreen.tsx#L10616) | `gap: 10,` |
| `DemoCompletionModal` | [10625](../packages/web/src/screens/DailyScreen.tsx#L10625) | `padding: '0 14px',` |
| `DemoCompletionModal` | [10629](../packages/web/src/screens/DailyScreen.tsx#L10629) | `fontWeight: 700,` |
| `DemoCompletionModal` | [10650](../packages/web/src/screens/DailyScreen.tsx#L10650) | `minHeight: 18,` |
| `DemoCompletionModal` | [10652](../packages/web/src/screens/DailyScreen.tsx#L10652) | `fontSize: 13,` |
| `DemoCompletionModal` | [10653](../packages/web/src/screens/DailyScreen.tsx#L10653) | `fontWeight: 700,` |
| `DemoCompletionModal` | [10654](../packages/web/src/screens/DailyScreen.tsx#L10654) | `lineHeight: 1.35,` |

</details>

<details>
<summary>screens/DuelScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `rel` | [414](../packages/web/src/screens/DuelScreen.tsx#L414) | `minHeight: 0,` |
| `rel` | [429](../packages/web/src/screens/DuelScreen.tsx#L429) | `minHeight: 0,` |
| `rel` | [433](../packages/web/src/screens/DuelScreen.tsx#L433) | `padding: '0 14px 10px',` |
| `rel` | [440](../packages/web/src/screens/DuelScreen.tsx#L440) | `width: '100%',` |
| `rel` | [441](../packages/web/src/screens/DuelScreen.tsx#L441) | `maxHeight: '100%',` |
| `rel` | [442](../packages/web/src/screens/DuelScreen.tsx#L442) | `borderRadius: 36,` |
| `rel` | [461](../packages/web/src/screens/DuelScreen.tsx#L461) | `width: 30,` |
| `rel` | [462](../packages/web/src/screens/DuelScreen.tsx#L462) | `height: 30,` |
| `rel` | [463](../packages/web/src/screens/DuelScreen.tsx#L463) | `borderRadius: 999,` |
| `rel` | [474](../packages/web/src/screens/DuelScreen.tsx#L474) | `padding: 0,` |
| `rel` | [484](../packages/web/src/screens/DuelScreen.tsx#L484) | `<div style={{ padding: '0 14px 10px', display: 'flex', justifyContent: 'center' }}>` |
| `rel` | [490](../packages/web/src/screens/DuelScreen.tsx#L490) | `style={{ width: '100%' }}` |
| `rel` | [497](../packages/web/src/screens/DuelScreen.tsx#L497) | `<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 14 }}>` |
| `rel` | [543](../packages/web/src/screens/DuelScreen.tsx#L543) | `gap: 8,` |
| `rel` | [544](../packages/web/src/screens/DuelScreen.tsx#L544) | `fontSize: 13,` |
| `rel` | [547](../packages/web/src/screens/DuelScreen.tsx#L547) | `padding: '4px 2px',` |
| `PerspectiveRink` | [580](../packages/web/src/screens/DuelScreen.tsx#L580) | `width: '100%',` |
| `PerspectiveRink` | [581](../packages/web/src/screens/DuelScreen.tsx#L581) | `height: '100%',` |
| `PerspectiveRink` | [594](../packages/web/src/screens/DuelScreen.tsx#L594) | `width: '100%',` |
| `PerspectiveRink` | [595](../packages/web/src/screens/DuelScreen.tsx#L595) | `height: &#96;calc(100% + ${TRAINING_NEW_COURT_BG_CROP_BOTTOM})&#96;,` |

</details>

<details>
<summary>screens/GoalieListScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `GoalieListScreen` | [42](../packages/web/src/screens/GoalieListScreen.tsx#L42) | `gap: 6,` |
| `GoalieListScreen` | [43](../packages/web/src/screens/GoalieListScreen.tsx#L43) | `padding: '0 14px 10px',` |
| `GoalieListScreen` | [58](../packages/web/src/screens/GoalieListScreen.tsx#L58) | `padding: '0 14px',` |
| `GoalieListScreen` | [61](../packages/web/src/screens/GoalieListScreen.tsx#L61) | `gap: 10,` |
| `GoalieListScreen` | [75](../packages/web/src/screens/GoalieListScreen.tsx#L75) | `padding: '14px 16px',` |
| `GoalieListScreen` | [76](../packages/web/src/screens/GoalieListScreen.tsx#L76) | `borderRadius: 20,` |
| `GoalieListScreen` | [78](../packages/web/src/screens/GoalieListScreen.tsx#L78) | `gridTemplateColumns: '48px 1fr auto',` |
| `GoalieListScreen` | [80](../packages/web/src/screens/GoalieListScreen.tsx#L80) | `gap: 14,` |
| `GoalieListScreen` | [85](../packages/web/src/screens/GoalieListScreen.tsx#L85) | `width: 48,` |
| `GoalieListScreen` | [86](../packages/web/src/screens/GoalieListScreen.tsx#L86) | `height: 48,` |
| `GoalieListScreen` | [87](../packages/web/src/screens/GoalieListScreen.tsx#L87) | `borderRadius: 999,` |
| `GoalieListScreen` | [91](../packages/web/src/screens/GoalieListScreen.tsx#L91) | `fontSize: 20,` |
| `GoalieListScreen` | [92](../packages/web/src/screens/GoalieListScreen.tsx#L92) | `fontWeight: 800,` |
| `GoalieListScreen` | [101](../packages/web/src/screens/GoalieListScreen.tsx#L101) | `<div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{g.name}</div>` |
| `GoalieListScreen` | [102](../packages/web/src/screens/GoalieListScreen.tsx#L102) | `<div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>` |
| `GoalieListScreen` | [110](../packages/web/src/screens/GoalieListScreen.tsx#L110) | `padding: '8px 14px',` |
| `GoalieListScreen` | [111](../packages/web/src/screens/GoalieListScreen.tsx#L111) | `borderRadius: 999,` |
| `GoalieListScreen` | [114](../packages/web/src/screens/GoalieListScreen.tsx#L114) | `fontSize: 12,` |
| `GoalieListScreen` | [115](../packages/web/src/screens/GoalieListScreen.tsx#L115) | `fontWeight: 700,` |
| `MetaChip` | [150](../packages/web/src/screens/GoalieListScreen.tsx#L150) | `fontSize: 9,` |
| `MetaChip` | [151](../packages/web/src/screens/GoalieListScreen.tsx#L151) | `fontWeight: 600,` |
| `MetaChip` | [152](../packages/web/src/screens/GoalieListScreen.tsx#L152) | `padding: '3px 8px',` |
| `MetaChip` | [153](../packages/web/src/screens/GoalieListScreen.tsx#L153) | `borderRadius: 999,` |

</details>

<details>
<summary>screens/InventoryScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `startPayment` | [376](../packages/web/src/screens/InventoryScreen.tsx#L376) | `padding: 'calc(22px + var(--app-safe-top)) 14px 24px',` |
| `startPayment` | [383](../packages/web/src/screens/InventoryScreen.tsx#L383) | `width: '100%',` |
| `startPayment` | [384](../packages/web/src/screens/InventoryScreen.tsx#L384) | `maxWidth: 760,` |
| `startPayment` | [388](../packages/web/src/screens/InventoryScreen.tsx#L388) | `gap: 14,` |
| `startPayment` | [407](../packages/web/src/screens/InventoryScreen.tsx#L407) | `width: 40,` |
| `startPayment` | [408](../packages/web/src/screens/InventoryScreen.tsx#L408) | `height: 40,` |
| `startPayment` | [409](../packages/web/src/screens/InventoryScreen.tsx#L409) | `minWidth: 40,` |
| `startPayment` | [410](../packages/web/src/screens/InventoryScreen.tsx#L410) | `minHeight: 40,` |
| `startPayment` | [411](../packages/web/src/screens/InventoryScreen.tsx#L411) | `borderRadius: 999,` |
| `startPayment` | [412](../packages/web/src/screens/InventoryScreen.tsx#L412) | `padding: 0,` |
| `startPayment` | [423](../packages/web/src/screens/InventoryScreen.tsx#L423) | `style={{ margin: 0, minWidth: 0, fontSize: 24, fontWeight: 800 }}` |
| `startPayment` | [454](../packages/web/src/screens/InventoryScreen.tsx#L454) | `<div className="glass" style={{ borderRadius: 22, padding: 16, color: 'var(--muted)' }}>` |
| `startPayment` | [472](../packages/web/src/screens/InventoryScreen.tsx#L472) | `<section aria-label="Товары" style={{ display: 'grid', gap: 8 }}>` |
| `GoodsCategoryCatalog` | [613](../packages/web/src/screens/InventoryScreen.tsx#L613) | `gridTemplateColumns: 'minmax(0, 1fr)',` |
| `GoodsCategoryCatalog` | [614](../packages/web/src/screens/InventoryScreen.tsx#L614) | `gap: 8,` |
| `BankTab` | [668](../packages/web/src/screens/InventoryScreen.tsx#L668) | `<section aria-label="Банк" style={{ display: 'grid', gap: 8 }}>` |
| `BankPackageCard` | [715](../packages/web/src/screens/InventoryScreen.tsx#L715) | `minWidth: 0,` |
| `BankPackageCard` | [716](../packages/web/src/screens/InventoryScreen.tsx#L716) | `minHeight: 104,` |
| `BankPackageCard` | [717](../packages/web/src/screens/InventoryScreen.tsx#L717) | `padding: 10,` |
| `BankPackageCard` | [718](../packages/web/src/screens/InventoryScreen.tsx#L718) | `borderRadius: 22,` |
| `BankPackageCard` | [720](../packages/web/src/screens/InventoryScreen.tsx#L720) | `gridTemplateColumns: '52px minmax(0, 1fr) auto',` |
| `BankPackageCard` | [722](../packages/web/src/screens/InventoryScreen.tsx#L722) | `gap: 10,` |
| `BankPackageCard` | [741](../packages/web/src/screens/InventoryScreen.tsx#L741) | `fontSize: 13,` |
| `BankPackageCard` | [742](../packages/web/src/screens/InventoryScreen.tsx#L742) | `fontWeight: 950,` |
| `BankPackageCard` | [743](../packages/web/src/screens/InventoryScreen.tsx#L743) | `lineHeight: 1.1,` |
| `BankPackageCard` | [748](../packages/web/src/screens/InventoryScreen.tsx#L748) | `<div style={{ color: rewardColor('coin'), fontSize: 19, fontWeight: 950, lineHeight: 1 }}>` |
| `PaymentReturnNotice` | [807](../packages/web/src/screens/InventoryScreen.tsx#L807) | `<div className="glass" role={role} style={{ borderRadius: 18, padding: '12px 14px' }}>` |
| `ShopBalanceBar` | [818](../packages/web/src/screens/InventoryScreen.tsx#L818) | `width: 'fit-content',` |
| `ShopBalanceBar` | [819](../packages/web/src/screens/InventoryScreen.tsx#L819) | `maxWidth: '100%',` |
| `ShopBalanceBar` | [820](../packages/web/src/screens/InventoryScreen.tsx#L820) | `borderRadius: 999,` |
| `ShopBalanceBar` | [821](../packages/web/src/screens/InventoryScreen.tsx#L821) | `padding: '9px 12px',` |
| `ShopBalanceBar` | [824](../packages/web/src/screens/InventoryScreen.tsx#L824) | `gap: 14,` |
| `BalanceChip` | [861](../packages/web/src/screens/InventoryScreen.tsx#L861) | `gap: 5,` |
| `BalanceChip` | [863](../packages/web/src/screens/InventoryScreen.tsx#L863) | `fontSize: 13,` |
| `BalanceChip` | [864](../packages/web/src/screens/InventoryScreen.tsx#L864) | `fontWeight: 950,` |
| `BalanceChip` | [865](../packages/web/src/screens/InventoryScreen.tsx#L865) | `lineHeight: 1,` |
| `InventoryProductCard` | [904](../packages/web/src/screens/InventoryScreen.tsx#L904) | `minWidth: 0,` |
| `InventoryProductCard` | [905](../packages/web/src/screens/InventoryScreen.tsx#L905) | `minHeight: 116,` |
| `InventoryProductCard` | [906](../packages/web/src/screens/InventoryScreen.tsx#L906) | `padding: 10,` |
| `InventoryProductCard` | [907](../packages/web/src/screens/InventoryScreen.tsx#L907) | `borderRadius: 22,` |
| `InventoryProductCard` | [909](../packages/web/src/screens/InventoryScreen.tsx#L909) | `gridTemplateColumns: '94px minmax(0, 1fr) auto',` |
| `InventoryProductCard` | [911](../packages/web/src/screens/InventoryScreen.tsx#L911) | `gap: 12,` |
| `InventoryProductCard` | [920](../packages/web/src/screens/InventoryScreen.tsx#L920) | `minWidth: 0,` |
| `InventoryProductCard` | [921](../packages/web/src/screens/InventoryScreen.tsx#L921) | `height: 94,` |
| `InventoryProductCard` | [923](../packages/web/src/screens/InventoryScreen.tsx#L923) | `padding: 0,` |
| `InventoryProductCard` | [933](../packages/web/src/screens/InventoryScreen.tsx#L933) | `style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}` |
| `InventoryProductCard` | [941](../packages/web/src/screens/InventoryScreen.tsx#L941) | `minWidth: 0,` |
| `InventoryProductCard` | [943](../packages/web/src/screens/InventoryScreen.tsx#L943) | `padding: 0,` |
| `InventoryProductCard` | [947](../packages/web/src/screens/InventoryScreen.tsx#L947) | `gap: 5,` |
| `InventoryProductCard` | [956](../packages/web/src/screens/InventoryScreen.tsx#L956) | `minWidth: 0,` |
| `InventoryProductCard` | [958](../packages/web/src/screens/InventoryScreen.tsx#L958) | `fontWeight: 950,` |
| `InventoryProductCard` | [959](../packages/web/src/screens/InventoryScreen.tsx#L959) | `lineHeight: 1.1,` |
| `InventoryProductCard` | [971](../packages/web/src/screens/InventoryScreen.tsx#L971) | `minHeight: '2.4em',` |
| `InventoryProductCard` | [973](../packages/web/src/screens/InventoryScreen.tsx#L973) | `fontWeight: 800,` |
| `InventoryProductCard` | [974](../packages/web/src/screens/InventoryScreen.tsx#L974) | `lineHeight: 1.2,` |
| `InventoryProductCard` | [982](../packages/web/src/screens/InventoryScreen.tsx#L982) | `fontSize: 13,` |
| `InventoryProductCard` | [983](../packages/web/src/screens/InventoryScreen.tsx#L983) | `fontWeight: 950,` |
| `InventoryProductCard` | [984](../packages/web/src/screens/InventoryScreen.tsx#L984) | `lineHeight: 1.1,` |
| `InventoryProductCard` | [987](../packages/web/src/screens/InventoryScreen.tsx#L987) | `gap: 5,` |
| `InventoryProductCard` | [992](../packages/web/src/screens/InventoryScreen.tsx#L992) | `<span style={{ color: rewardColor('coin'), display: 'inline-flex', alignItems: 'center', gap: 3 }}>` |
| `InventoryProductCard` | [996](../packages/web/src/screens/InventoryScreen.tsx#L996) | `<span style={{ color: 'var(--muted)', fontSize: 11 }}>или</span>` |
| `InventoryProductCard` | [997](../packages/web/src/screens/InventoryScreen.tsx#L997) | `<span style={{ color: rewardColor('star'), display: 'inline-flex', alignItems: 'center', gap: 3 }}>` |
| `InventoryProductCard` | [1016](../packages/web/src/screens/InventoryScreen.tsx#L1016) | `minWidth: 86,` |
| `InventoryProductCard` | [1017](../packages/web/src/screens/InventoryScreen.tsx#L1017) | `minHeight: 38,` |
| `InventoryProductCard` | [1018](../packages/web/src/screens/InventoryScreen.tsx#L1018) | `padding: '0 12px',` |
| `InventoryProductCard` | [1019](../packages/web/src/screens/InventoryScreen.tsx#L1019) | `fontSize: 12,` |
| `InventoryEmptyState` | [1036](../packages/web/src/screens/InventoryScreen.tsx#L1036) | `borderRadius: 26,` |
| `InventoryEmptyState` | [1037](../packages/web/src/screens/InventoryScreen.tsx#L1037) | `padding: '22px 18px',` |
| `InventoryEmptyState` | [1038](../packages/web/src/screens/InventoryScreen.tsx#L1038) | `minHeight: 180,` |
| `InventoryEmptyState` | [1042](../packages/web/src/screens/InventoryScreen.tsx#L1042) | `gap: 8,` |
| `InventoryEmptyState` | [1046](../packages/web/src/screens/InventoryScreen.tsx#L1046) | `<h2 style={{ margin: 0, color: 'var(--ink)', fontSize: 18, fontWeight: 950 }}>` |
| `InventoryEmptyState` | [1050](../packages/web/src/screens/InventoryScreen.tsx#L1050) | `style={{ margin: 0, color: 'var(--muted)', fontSize: 13, fontWeight: 750, lineHeight: 1.4 }}` |
| `InventoryItemModal` | [1083](../packages/web/src/screens/InventoryScreen.tsx#L1083) | `width: 'min(430px, calc(100vw - 28px))',` |
| `InventoryItemModal` | [1084](../packages/web/src/screens/InventoryScreen.tsx#L1084) | `maxHeight: 'calc(100dvh - 48px - var(--app-safe-top) - var(--app-safe-bottom))',` |
| `InventoryItemModal` | [1100](../packages/web/src/screens/InventoryScreen.tsx#L1100) | `<div style={{ display: 'grid', gap: 14 }}>` |
| `InventoryItemModal` | [1103](../packages/web/src/screens/InventoryScreen.tsx#L1103) | `width: '100%',` |
| `InventoryItemModal` | [1104](../packages/web/src/screens/InventoryScreen.tsx#L1104) | `height: 'var(--inventory-item-art-height, auto)',` |
| `InventoryItemModal` | [1106](../packages/web/src/screens/InventoryScreen.tsx#L1106) | `borderRadius: 22,` |
| `InventoryItemModal` | [1115](../packages/web/src/screens/InventoryScreen.tsx#L1115) | `style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}` |
| `InventoryItemModal` | [1119](../packages/web/src/screens/InventoryScreen.tsx#L1119) | `<div className="glass" style={{ borderRadius: 18, padding: 14, display: 'grid', gap: 9 }}>` |
| `InventoryItemModal` | [1128](../packages/web/src/screens/InventoryScreen.tsx#L1128) | `fontSize: 13,` |
| `InventoryItemModal` | [1129](../packages/web/src/screens/InventoryScreen.tsx#L1129) | `fontWeight: 750,` |
| `InventoryItemModal` | [1130](../packages/web/src/screens/InventoryScreen.tsx#L1130) | `lineHeight: 1.4,` |
| `InventoryItemModal` | [1137](../packages/web/src/screens/InventoryScreen.tsx#L1137) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>` |
| `PurchaseConfirmModal` | [1179](../packages/web/src/screens/InventoryScreen.tsx#L1179) | `cardStyle={{ width: 'min(390px, calc(100vw - 28px))' }}` |
| `PurchaseConfirmModal` | [1186](../packages/web/src/screens/InventoryScreen.tsx#L1186) | `<div style={{ display: 'grid', gap: 14 }}>` |
| `PurchaseConfirmModal` | [1188](../packages/web/src/screens/InventoryScreen.tsx#L1188) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}>` |
| `PurchaseConfirmModal` | [1192](../packages/web/src/screens/InventoryScreen.tsx#L1192) | `<div style={{ display: 'grid', gap: 8 }}>` |
| `submit` | [1255](../packages/web/src/screens/InventoryScreen.tsx#L1255) | `cardStyle={{ width: 'min(390px, calc(100vw - 28px))' }}` |
| `submit` | [1264](../packages/web/src/screens/InventoryScreen.tsx#L1264) | `style={{ display: 'grid', gap: 14 }}` |
| `submit` | [1270](../packages/web/src/screens/InventoryScreen.tsx#L1270) | `<label style={{ display: 'grid', gap: 7, color: 'var(--text)' }}>` |
| `submit` | [1271](../packages/web/src/screens/InventoryScreen.tsx#L1271) | `<span className="section-label" style={{ padding: 0 }}>` |
| `submit` | [1288](../packages/web/src/screens/InventoryScreen.tsx#L1288) | `width: '100%',` |
| `submit` | [1289](../packages/web/src/screens/InventoryScreen.tsx#L1289) | `minHeight: 46,` |
| `submit` | [1290](../packages/web/src/screens/InventoryScreen.tsx#L1290) | `borderRadius: 14,` |
| `submit` | [1293](../packages/web/src/screens/InventoryScreen.tsx#L1293) | `padding: '0 14px',` |
| `submit` | [1304](../packages/web/src/screens/InventoryScreen.tsx#L1304) | `style={{ color: 'var(--red-deep)', fontSize: 13, fontWeight: 800 }}` |
| `TransactionHistorySection` | [1353](../packages/web/src/screens/InventoryScreen.tsx#L1353) | `<section aria-label="История транзакций" style={{ display: 'grid', gap: 8 }}>` |
| `TransactionAmountBadge` | [1478](../packages/web/src/screens/InventoryScreen.tsx#L1478) | `minHeight: 18,` |
| `TransactionAmountBadge` | [1482](../packages/web/src/screens/InventoryScreen.tsx#L1482) | `gap: 4,` |
| `TransactionAmountBadge` | [1484](../packages/web/src/screens/InventoryScreen.tsx#L1484) | `fontSize: 12,` |
| `TransactionAmountBadge` | [1485](../packages/web/src/screens/InventoryScreen.tsx#L1485) | `fontWeight: 950,` |
| `TransactionAmountBadge` | [1486](../packages/web/src/screens/InventoryScreen.tsx#L1486) | `lineHeight: 1,` |
| `PurchasePrice` | [1502](../packages/web/src/screens/InventoryScreen.tsx#L1502) | `style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>` |
| `PurchasePrice` | [1503](../packages/web/src/screens/InventoryScreen.tsx#L1503) | `<span style={{ color: rewardColor('coin'), display: 'inline-flex', alignItems: 'center', gap: 3 }}>` |
| `PurchasePrice` | [1508](../packages/web/src/screens/InventoryScreen.tsx#L1508) | `<span style={{ color: rewardColor('star'), display: 'inline-flex', alignItems: 'center', gap: 3 }}>` |
| `DetailRow` | [1526](../packages/web/src/screens/InventoryScreen.tsx#L1526) | `<div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>` |
| `DetailRow` | [1527](../packages/web/src/screens/InventoryScreen.tsx#L1527) | `<span style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 800 }}>{label}</span>` |
| `DetailRow` | [1531](../packages/web/src/screens/InventoryScreen.tsx#L1531) | `fontSize: 12,` |
| `DetailRow` | [1532](../packages/web/src/screens/InventoryScreen.tsx#L1532) | `fontWeight: 900,` |

</details>

<details>
<summary>screens/LoginScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `update` | [167](../packages/web/src/screens/LoginScreen.tsx#L167) | `height: 'var(--app-viewport-height, 100dvh)',` |
| `update` | [168](../packages/web/src/screens/LoginScreen.tsx#L168) | `minHeight: 0,` |
| `update` | [188](../packages/web/src/screens/LoginScreen.tsx#L188) | `<div className="login-screen__spacer" style={{ flex: 1, minHeight: 8 }} />` |
| `update` | [246](../packages/web/src/screens/LoginScreen.tsx#L246) | `padding: '0 14px',` |
| `update` | [250](../packages/web/src/screens/LoginScreen.tsx#L250) | `fontWeight: 700,` |
| `update` | [298](../packages/web/src/screens/LoginScreen.tsx#L298) | `gap: 10,` |
| `update` | [300](../packages/web/src/screens/LoginScreen.tsx#L300) | `maxWidth: 360,` |
| `update` | [301](../packages/web/src/screens/LoginScreen.tsx#L301) | `width: '100%',` |
| `update` | [314](../packages/web/src/screens/LoginScreen.tsx#L314) | `width: '100%',` |
| `update` | [315](../packages/web/src/screens/LoginScreen.tsx#L315) | `height: 58,` |
| `update` | [316](../packages/web/src/screens/LoginScreen.tsx#L316) | `borderRadius: 24,` |
| `update` | [320](../packages/web/src/screens/LoginScreen.tsx#L320) | `padding: '0 20px',` |
| `update` | [321](../packages/web/src/screens/LoginScreen.tsx#L321) | `fontSize: 22,` |
| `update` | [322](../packages/web/src/screens/LoginScreen.tsx#L322) | `fontWeight: 800,` |
| `update` | [346](../packages/web/src/screens/LoginScreen.tsx#L346) | `padding: '0 14px',` |
| `update` | [348](../packages/web/src/screens/LoginScreen.tsx#L348) | `fontSize: 15,` |
| `update` | [349](../packages/web/src/screens/LoginScreen.tsx#L349) | `fontWeight: 800,` |
| `update` | [358](../packages/web/src/screens/LoginScreen.tsx#L358) | `<div style={{ fontSize: 13, color: 'var(--muted)' }}>Проверяем профиль…</div>` |
| `update` | [361](../packages/web/src/screens/LoginScreen.tsx#L361) | `<div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>` |
| `update` | [366](../packages/web/src/screens/LoginScreen.tsx#L366) | `<div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>` |
| `update` | [371](../packages/web/src/screens/LoginScreen.tsx#L371) | `<div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>` |
| `update` | [376](../packages/web/src/screens/LoginScreen.tsx#L376) | `<div role="alert" style={{ fontSize: 13, color: 'var(--red-deep)' }}>` |
| `update` | [418](../packages/web/src/screens/LoginScreen.tsx#L418) | `style={{ fontSize: 13, color: 'var(--red-deep, #b91c1c)', textAlign: 'center' }}` |

</details>

<details>
<summary>screens/ProfileSettingsScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `applyProfile` | [361](../packages/web/src/screens/ProfileSettingsScreen.tsx#L361) | `cardStyle={{ maxWidth: 320 }}` |
| `applyProfile` | [373](../packages/web/src/screens/ProfileSettingsScreen.tsx#L373) | `<div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>` |
| `GripOption` | [412](../packages/web/src/screens/ProfileSettingsScreen.tsx#L412) | `padding: '14px 10px',` |
| `GripOption` | [413](../packages/web/src/screens/ProfileSettingsScreen.tsx#L413) | `borderRadius: 16,` |
| `GripOption` | [417](../packages/web/src/screens/ProfileSettingsScreen.tsx#L417) | `gap: 6,` |
| `GripOption` | [429](../packages/web/src/screens/ProfileSettingsScreen.tsx#L429) | `width: size,` |
| `GripOption` | [430](../packages/web/src/screens/ProfileSettingsScreen.tsx#L430) | `height: 86,` |
| `GripOption` | [442](../packages/web/src/screens/ProfileSettingsScreen.tsx#L442) | `width: size,` |
| `GripOption` | [443](../packages/web/src/screens/ProfileSettingsScreen.tsx#L443) | `height: 86,` |
| `GripOption` | [453](../packages/web/src/screens/ProfileSettingsScreen.tsx#L453) | `<span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>` |
| `GripOption` | [454](../packages/web/src/screens/ProfileSettingsScreen.tsx#L454) | `<span style={{ fontSize: 10, opacity: 0.7 }}>{hint}</span>` |

</details>

<details>
<summary>screens/ProfileSupportSections.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `SettingsSectionIcon` | [82](../packages/web/src/screens/ProfileSupportSections.tsx#L82) | `width: 44,` |
| `SettingsSectionIcon` | [83](../packages/web/src/screens/ProfileSupportSections.tsx#L83) | `height: 44,` |
| `SettingsSectionIcon` | [84](../packages/web/src/screens/ProfileSupportSections.tsx#L84) | `borderRadius: 14,` |
| `PushPreferenceToggle` | [175](../packages/web/src/screens/ProfileSupportSections.tsx#L175) | `width: '100%',` |
| `PushPreferenceToggle` | [176](../packages/web/src/screens/ProfileSupportSections.tsx#L176) | `minHeight: 58,` |
| `PushPreferenceToggle` | [177](../packages/web/src/screens/ProfileSupportSections.tsx#L177) | `padding: '10px 12px',` |
| `PushPreferenceToggle` | [179](../packages/web/src/screens/ProfileSupportSections.tsx#L179) | `borderRadius: 16,` |
| `PushPreferenceToggle` | [185](../packages/web/src/screens/ProfileSupportSections.tsx#L185) | `gap: 12,` |
| `PushPreferenceToggle` | [193](../packages/web/src/screens/ProfileSupportSections.tsx#L193) | `<span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>` |
| `PushPreferenceToggle` | [194](../packages/web/src/screens/ProfileSupportSections.tsx#L194) | `<span style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.15 }}>{label}</span>` |
| `PushPreferenceToggle` | [195](../packages/web/src/screens/ProfileSupportSections.tsx#L195) | `<span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', lineHeight: 1.2 }}>` |
| `PushPreferenceToggle` | [202](../packages/web/src/screens/ProfileSupportSections.tsx#L202) | `width: 44,` |
| `PushPreferenceToggle` | [203](../packages/web/src/screens/ProfileSupportSections.tsx#L203) | `height: 26,` |
| `PushPreferenceToggle` | [204](../packages/web/src/screens/ProfileSupportSections.tsx#L204) | `borderRadius: 999,` |
| `PushPreferenceToggle` | [205](../packages/web/src/screens/ProfileSupportSections.tsx#L205) | `padding: 3,` |
| `PushPreferenceToggle` | [216](../packages/web/src/screens/ProfileSupportSections.tsx#L216) | `width: 20,` |
| `PushPreferenceToggle` | [217](../packages/web/src/screens/ProfileSupportSections.tsx#L217) | `height: 20,` |
| `PushPreferenceToggle` | [218](../packages/web/src/screens/ProfileSupportSections.tsx#L218) | `borderRadius: 999,` |
| `handleClose` | [260](../packages/web/src/screens/ProfileSupportSections.tsx#L260) | `cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}` |
| `handleClose` | [274](../packages/web/src/screens/ProfileSupportSections.tsx#L274) | `<div style={{ display: 'grid', gap: 14 }}>` |
| `handleClose` | [281](../packages/web/src/screens/ProfileSupportSections.tsx#L281) | `style={{ width: '100%', minHeight: 52, letterSpacing: 0 }}` |
| `handleClose` | [290](../packages/web/src/screens/ProfileSupportSections.tsx#L290) | `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',` |
| `handleClose` | [291](../packages/web/src/screens/ProfileSupportSections.tsx#L291) | `gap: 8,` |
| `handleClose` | [302](../packages/web/src/screens/ProfileSupportSections.tsx#L302) | `minHeight: 42,` |
| `handleClose` | [303](../packages/web/src/screens/ProfileSupportSections.tsx#L303) | `borderRadius: 14,` |
| `handleClose` | [305](../packages/web/src/screens/ProfileSupportSections.tsx#L305) | `padding: '8px 10px',` |
| `handleClose` | [318](../packages/web/src/screens/ProfileSupportSections.tsx#L318) | `fontSize: 11,` |
| `handleClose` | [319](../packages/web/src/screens/ProfileSupportSections.tsx#L319) | `fontWeight: 900,` |
| `handleClose` | [332](../packages/web/src/screens/ProfileSupportSections.tsx#L332) | `gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',` |
| `handleClose` | [333](../packages/web/src/screens/ProfileSupportSections.tsx#L333) | `gap: 6,` |
| `handleClose` | [347](../packages/web/src/screens/ProfileSupportSections.tsx#L347) | `minWidth: 0,` |
| `handleClose` | [348](../packages/web/src/screens/ProfileSupportSections.tsx#L348) | `height: 40,` |
| `handleClose` | [349](../packages/web/src/screens/ProfileSupportSections.tsx#L349) | `borderRadius: 13,` |
| `handleClose` | [350](../packages/web/src/screens/ProfileSupportSections.tsx#L350) | `padding: 0,` |
| `handleClose` | [367](../packages/web/src/screens/ProfileSupportSections.tsx#L367) | `fontSize: 11,` |
| `handleClose` | [368](../packages/web/src/screens/ProfileSupportSections.tsx#L368) | `fontWeight: 900,` |
| `handleClose` | [388](../packages/web/src/screens/ProfileSupportSections.tsx#L388) | `width: '100%',` |
| `handleClose` | [390](../packages/web/src/screens/ProfileSupportSections.tsx#L390) | `minHeight: 132,` |
| `handleClose` | [392](../packages/web/src/screens/ProfileSupportSections.tsx#L392) | `borderRadius: 18,` |
| `handleClose` | [395](../packages/web/src/screens/ProfileSupportSections.tsx#L395) | `padding: 12,` |
| `handleClose` | [397](../packages/web/src/screens/ProfileSupportSections.tsx#L397) | `fontSize: 14,` |
| `handleClose` | [398](../packages/web/src/screens/ProfileSupportSections.tsx#L398) | `fontWeight: 700,` |
| `handleClose` | [399](../packages/web/src/screens/ProfileSupportSections.tsx#L399) | `lineHeight: 1.4,` |
| `handleClose` | [407](../packages/web/src/screens/ProfileSupportSections.tsx#L407) | `minHeight: 18,` |
| `handleClose` | [409](../packages/web/src/screens/ProfileSupportSections.tsx#L409) | `fontSize: 11,` |
| `handleClose` | [410](../packages/web/src/screens/ProfileSupportSections.tsx#L410) | `fontWeight: 800,` |
| `handleClose` | [426](../packages/web/src/screens/ProfileSupportSections.tsx#L426) | `width: '100%',` |
| `handleClose` | [427](../packages/web/src/screens/ProfileSupportSections.tsx#L427) | `minHeight: 54,` |
| `OfficialMessageModal` | [457](../packages/web/src/screens/ProfileSupportSections.tsx#L457) | `cardStyle={{ width: 'min(420px, calc(100vw - 28px))' }}` |
| `OfficialMessageModal` | [477](../packages/web/src/screens/ProfileSupportSections.tsx#L477) | `style={{ width: '100%', minHeight: 52, letterSpacing: 0 }}` |
| `OfficialMessageModal` | [482](../packages/web/src/screens/ProfileSupportSections.tsx#L482) | `<div style={{ display: 'grid', gap: 12 }}>` |
| `OfficialMessageModal` | [488](../packages/web/src/screens/ProfileSupportSections.tsx#L488) | `padding: 0,` |
| `OfficialMessageModal` | [500](../packages/web/src/screens/ProfileSupportSections.tsx#L500) | `width: '100%',` |
| `OfficialMessageModal` | [502](../packages/web/src/screens/ProfileSupportSections.tsx#L502) | `minHeight: 132,` |
| `OfficialMessageModal` | [504](../packages/web/src/screens/ProfileSupportSections.tsx#L504) | `borderRadius: 18,` |
| `OfficialMessageModal` | [507](../packages/web/src/screens/ProfileSupportSections.tsx#L507) | `padding: 12,` |
| `OfficialMessageModal` | [509](../packages/web/src/screens/ProfileSupportSections.tsx#L509) | `fontSize: 14,` |
| `OfficialMessageModal` | [510](../packages/web/src/screens/ProfileSupportSections.tsx#L510) | `fontWeight: 700,` |
| `OfficialMessageModal` | [511](../packages/web/src/screens/ProfileSupportSections.tsx#L511) | `lineHeight: 1.4,` |
| `OfficialMessageModal` | [519](../packages/web/src/screens/ProfileSupportSections.tsx#L519) | `minHeight: 18,` |
| `OfficialMessageModal` | [521](../packages/web/src/screens/ProfileSupportSections.tsx#L521) | `fontSize: 11,` |
| `OfficialMessageModal` | [522](../packages/web/src/screens/ProfileSupportSections.tsx#L522) | `fontWeight: 800,` |
| `OfficialMessageModal` | [536](../packages/web/src/screens/ProfileSupportSections.tsx#L536) | `width: '100%',` |
| `OfficialMessageModal` | [537](../packages/web/src/screens/ProfileSupportSections.tsx#L537) | `minHeight: 54,` |
| `handleTogglePushPreference` | [799](../packages/web/src/screens/ProfileSupportSections.tsx#L799) | `padding: 16,` |
| `handleTogglePushPreference` | [800](../packages/web/src/screens/ProfileSupportSections.tsx#L800) | `borderRadius: 22,` |
| `handleTogglePushPreference` | [803](../packages/web/src/screens/ProfileSupportSections.tsx#L803) | `gap: 12,` |
| `handleTogglePushPreference` | [806](../packages/web/src/screens/ProfileSupportSections.tsx#L806) | `<div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>` |
| `handleTogglePushPreference` | [810](../packages/web/src/screens/ProfileSupportSections.tsx#L810) | `<div style={{ minWidth: 0, flex: 1 }}>` |
| `handleTogglePushPreference` | [811](../packages/web/src/screens/ProfileSupportSections.tsx#L811) | `<div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>` |
| `handleTogglePushPreference` | [819](../packages/web/src/screens/ProfileSupportSections.tsx#L819) | `minHeight: 18,` |
| `handleTogglePushPreference` | [820](../packages/web/src/screens/ProfileSupportSections.tsx#L820) | `fontSize: 12,` |
| `handleTogglePushPreference` | [821](../packages/web/src/screens/ProfileSupportSections.tsx#L821) | `fontWeight: 700,` |
| `handleTogglePushPreference` | [841](../packages/web/src/screens/ProfileSupportSections.tsx#L841) | `minHeight: 42,` |
| `handleTogglePushPreference` | [842](../packages/web/src/screens/ProfileSupportSections.tsx#L842) | `padding: '0 14px',` |
| `handleTogglePushPreference` | [843](../packages/web/src/screens/ProfileSupportSections.tsx#L843) | `borderRadius: 14,` |
| `handleTogglePushPreference` | [844](../packages/web/src/screens/ProfileSupportSections.tsx#L844) | `fontSize: 12,` |
| `handleTogglePushPreference` | [861](../packages/web/src/screens/ProfileSupportSections.tsx#L861) | `width: '100%',` |
| `handleTogglePushPreference` | [862](../packages/web/src/screens/ProfileSupportSections.tsx#L862) | `minHeight: 46,` |
| `handleTogglePushPreference` | [863](../packages/web/src/screens/ProfileSupportSections.tsx#L863) | `padding: '0 12px',` |
| `handleTogglePushPreference` | [865](../packages/web/src/screens/ProfileSupportSections.tsx#L865) | `borderRadius: 16,` |
| `handleTogglePushPreference` | [872](../packages/web/src/screens/ProfileSupportSections.tsx#L872) | `gap: 10,` |
| `handleTogglePushPreference` | [874](../packages/web/src/screens/ProfileSupportSections.tsx#L874) | `fontSize: 14,` |
| `handleTogglePushPreference` | [875](../packages/web/src/screens/ProfileSupportSections.tsx#L875) | `fontWeight: 800,` |
| `handleTogglePushPreference` | [896](../packages/web/src/screens/ProfileSupportSections.tsx#L896) | `gap: 8,` |
| `handleTogglePushPreference` | [936](../packages/web/src/screens/ProfileSupportSections.tsx#L936) | `padding: 0,` |
| `handleTogglePushPreference` | [937](../packages/web/src/screens/ProfileSupportSections.tsx#L937) | `borderRadius: 22,` |
| `handleTogglePushPreference` | [960](../packages/web/src/screens/ProfileSupportSections.tsx#L960) | `style={{ height: 1, margin: '0 16px', background: 'var(--liquid-inset-bg)' }}` |
| `handleTogglePushPreference` | [965](../packages/web/src/screens/ProfileSupportSections.tsx#L965) | `padding: 16,` |
| `handleTogglePushPreference` | [968](../packages/web/src/screens/ProfileSupportSections.tsx#L968) | `gap: 12,` |
| `handleTogglePushPreference` | [980](../packages/web/src/screens/ProfileSupportSections.tsx#L980) | `width: 44,` |
| `handleTogglePushPreference` | [981](../packages/web/src/screens/ProfileSupportSections.tsx#L981) | `height: 44,` |
| `handleTogglePushPreference` | [982](../packages/web/src/screens/ProfileSupportSections.tsx#L982) | `borderRadius: 14,` |
| `handleTogglePushPreference` | [989](../packages/web/src/screens/ProfileSupportSections.tsx#L989) | `<div style={{ minWidth: 0, flex: 1 }}>` |
| `handleTogglePushPreference` | [990](../packages/web/src/screens/ProfileSupportSections.tsx#L990) | `<div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>` |
| `handleTogglePushPreference` | [993](../packages/web/src/screens/ProfileSupportSections.tsx#L993) | `<div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>` |
| `handleTogglePushPreference` | [1004](../packages/web/src/screens/ProfileSupportSections.tsx#L1004) | `minHeight: 42,` |
| `handleTogglePushPreference` | [1005](../packages/web/src/screens/ProfileSupportSections.tsx#L1005) | `padding: '0 14px',` |
| `handleTogglePushPreference` | [1006](../packages/web/src/screens/ProfileSupportSections.tsx#L1006) | `borderRadius: 14,` |
| `handleTogglePushPreference` | [1007](../packages/web/src/screens/ProfileSupportSections.tsx#L1007) | `fontSize: 12,` |

</details>

<details>
<summary>screens/ReferralsScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `copy` | [148](../packages/web/src/screens/ReferralsScreen.tsx#L148) | `<span style={{ width: &#96;${Math.min(100, (summary.data.qualifiedInvited / nextMilestone.qualifiedReferrals) * 100)}%&#96; }} />` |

</details>

<details>
<summary>screens/SectionsScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `openAmateurs` | [282](../packages/web/src/screens/SectionsScreen.tsx#L282) | `padding: 'calc(18px + var(--app-safe-top)) 14px 24px',` |
| `openAmateurs` | [288](../packages/web/src/screens/SectionsScreen.tsx#L288) | `width: '100%',` |
| `openAmateurs` | [289](../packages/web/src/screens/SectionsScreen.tsx#L289) | `maxWidth: 760,` |
| `openAmateurs` | [293](../packages/web/src/screens/SectionsScreen.tsx#L293) | `gap: 16,` |
| `SectionCard` | [525](../packages/web/src/screens/SectionsScreen.tsx#L525) | `borderRadius: 22,` |
| `SectionCard` | [526](../packages/web/src/screens/SectionsScreen.tsx#L526) | `padding: 14,` |
| `SectionCard` | [528](../packages/web/src/screens/SectionsScreen.tsx#L528) | `gridTemplateColumns: &#96;${SECTION_ARTWORK_SIZE}px minmax(0, 1fr) 20px&#96;,` |
| `SectionCard` | [529](../packages/web/src/screens/SectionsScreen.tsx#L529) | `gap: 12,` |
| `SectionCard` | [531](../packages/web/src/screens/SectionsScreen.tsx#L531) | `width: '100%',` |
| `SectionCard` | [532](../packages/web/src/screens/SectionsScreen.tsx#L532) | `minHeight: 116,` |
| `SectionCard` | [550](../packages/web/src/screens/SectionsScreen.tsx#L550) | `height: 3,` |
| `SectionCard` | [556](../packages/web/src/screens/SectionsScreen.tsx#L556) | `width: &#96;${Math.max(0, Math.min(100, progress))}%&#96;,` |
| `SectionCard` | [557](../packages/web/src/screens/SectionsScreen.tsx#L557) | `height: '100%',` |
| `SectionCard` | [566](../packages/web/src/screens/SectionsScreen.tsx#L566) | `width: SECTION_ARTWORK_SIZE,` |
| `SectionCard` | [567](../packages/web/src/screens/SectionsScreen.tsx#L567) | `height: SECTION_ARTWORK_SIZE,` |
| `SectionCard` | [569](../packages/web/src/screens/SectionsScreen.tsx#L569) | `borderRadius: 22,` |
| `SectionCard` | [582](../packages/web/src/screens/SectionsScreen.tsx#L582) | `width: '100%',` |
| `SectionCard` | [583](../packages/web/src/screens/SectionsScreen.tsx#L583) | `height: '100%',` |
| `SectionCard` | [591](../packages/web/src/screens/SectionsScreen.tsx#L591) | `<span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>` |
| `SectionCard` | [595](../packages/web/src/screens/SectionsScreen.tsx#L595) | `fontSize: 19,` |
| `SectionCard` | [596](../packages/web/src/screens/SectionsScreen.tsx#L596) | `lineHeight: 1.05,` |
| `SectionCard` | [597](../packages/web/src/screens/SectionsScreen.tsx#L597) | `fontWeight: 950,` |
| `SectionCard` | [605](../packages/web/src/screens/SectionsScreen.tsx#L605) | `fontSize: 12,` |
| `SectionCard` | [606](../packages/web/src/screens/SectionsScreen.tsx#L606) | `fontWeight: 850,` |

</details>

<details>
<summary>screens/TestCourtScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `TestCourtScreen` | [104](../packages/web/src/screens/TestCourtScreen.tsx#L104) | `fontSize: 12,` |
| `TestCourtScreen` | [105](../packages/web/src/screens/TestCourtScreen.tsx#L105) | `fontWeight: 800,` |
| `TestCourtScreen` | [121](../packages/web/src/screens/TestCourtScreen.tsx#L121) | `gap: 7,` |
| `TestCourtScreen` | [122](../packages/web/src/screens/TestCourtScreen.tsx#L122) | `minHeight: 32,` |
| `TestCourtScreen` | [123](../packages/web/src/screens/TestCourtScreen.tsx#L123) | `padding: '7px 10px',` |
| `TestCourtScreen` | [124](../packages/web/src/screens/TestCourtScreen.tsx#L124) | `borderRadius: 999,` |
| `TestCourtScreen` | [128](../packages/web/src/screens/TestCourtScreen.tsx#L128) | `fontSize: 11,` |
| `TestCourtScreen` | [129](../packages/web/src/screens/TestCourtScreen.tsx#L129) | `fontWeight: 900,` |
| `TestCourtScreen` | [130](../packages/web/src/screens/TestCourtScreen.tsx#L130) | `lineHeight: 1,` |
| `TestCourtScreen` | [141](../packages/web/src/screens/TestCourtScreen.tsx#L141) | `width: 14,` |
| `TestCourtScreen` | [142](../packages/web/src/screens/TestCourtScreen.tsx#L142) | `height: 14,` |
| `TestPerspectiveRink` | [241](../packages/web/src/screens/TestCourtScreen.tsx#L241) | `width: '100%',` |
| `TestPerspectiveRink` | [242](../packages/web/src/screens/TestCourtScreen.tsx#L242) | `height: '100%',` |
| `TestPerspectiveRink` | [255](../packages/web/src/screens/TestCourtScreen.tsx#L255) | `width: '100%',` |
| `TestPerspectiveRink` | [256](../packages/web/src/screens/TestCourtScreen.tsx#L256) | `height: &#96;calc(100% + ${TRAINING_NEW_COURT_BG_CROP_BOTTOM})&#96;,` |

</details>

<details>
<summary>screens/VkAuthCallbackScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `VkAuthCallbackScreen` | [83](../packages/web/src/screens/VkAuthCallbackScreen.tsx#L83) | `style={{ alignItems: 'center', justifyContent: 'center', padding: 20, textAlign: 'center' }}` |
| `VkAuthCallbackScreen` | [86](../packages/web/src/screens/VkAuthCallbackScreen.tsx#L86) | `<div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>` |
| `VkAuthCallbackScreen` | [87](../packages/web/src/screens/VkAuthCallbackScreen.tsx#L87) | `<h1 style={{ fontSize: 22, margin: 0 }}>Ошибка входа</h1>` |
| `VkAuthCallbackScreen` | [88](../packages/web/src/screens/VkAuthCallbackScreen.tsx#L88) | `<div role="alert" style={{ color: 'var(--red-deep)', fontSize: 14 }}>` |
| `VkAuthCallbackScreen` | [100](../packages/web/src/screens/VkAuthCallbackScreen.tsx#L100) | `<div style={{ fontSize: 14, color: 'var(--muted)' }}>Авторизация через ВКонтакте…</div>` |

</details>

<details>
<summary>screens/WeeklyChallengeScreen.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ChallengeDetails` | [491](../packages/web/src/screens/WeeklyChallengeScreen.tsx#L491) | `<span style={{ width: &#96;${percent}%&#96; }} />` |

</details>

<details>
<summary>screens/profileSections.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `ProfileStatCard` | [100](../packages/web/src/screens/profileSections.tsx#L100) | `minWidth: 0,` |
| `ProfileStatCard` | [101](../packages/web/src/screens/profileSections.tsx#L101) | `minHeight: 74,` |
| `ProfileStatCard` | [102](../packages/web/src/screens/profileSections.tsx#L102) | `padding: '12px 10px',` |
| `ProfileStatCard` | [103](../packages/web/src/screens/profileSections.tsx#L103) | `borderRadius: 16,` |
| `ProfileStatCard` | [107](../packages/web/src/screens/profileSections.tsx#L107) | `gap: 8,` |
| `ProfileStatCard` | [112](../packages/web/src/screens/profileSections.tsx#L112) | `minWidth: 0,` |
| `ProfileStatCard` | [113](../packages/web/src/screens/profileSections.tsx#L113) | `fontSize: 10,` |
| `ProfileStatCard` | [114](../packages/web/src/screens/profileSections.tsx#L114) | `fontWeight: 700,` |
| `ProfileStatCard` | [124](../packages/web/src/screens/profileSections.tsx#L124) | `minWidth: 0,` |
| `ProfileStatCard` | [125](../packages/web/src/screens/profileSections.tsx#L125) | `fontSize: 21,` |
| `ProfileStatCard` | [126](../packages/web/src/screens/profileSections.tsx#L126) | `lineHeight: 1,` |
| `ProfileStatCard` | [127](../packages/web/src/screens/profileSections.tsx#L127) | `fontWeight: 800,` |
| `ProfileStatsGrid` | [154](../packages/web/src/screens/profileSections.tsx#L154) | `gridTemplateColumns: &#96;repeat(${columns}, minmax(0, 1fr))&#96;,` |
| `ProfileStatsGrid` | [155](../packages/web/src/screens/profileSections.tsx#L155) | `gap: 8,` |
| `ProfileStatsGrid` | [165](../packages/web/src/screens/profileSections.tsx#L165) | `<span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>` |
| `ProfileStatsGrid` | [169](../packages/web/src/screens/profileSections.tsx#L169) | `fontSize: 14,` |
| `ProfileStatsGrid` | [170](../packages/web/src/screens/profileSections.tsx#L170) | `fontWeight: 700,` |
| `AchievementTile` | [198](../packages/web/src/screens/profileSections.tsx#L198) | `width: 84,` |
| `AchievementTile` | [200](../packages/web/src/screens/profileSections.tsx#L200) | `padding: 0,` |
| `AchievementTile` | [208](../packages/web/src/screens/profileSections.tsx#L208) | `gap: 6,` |
| `AchievementTile` | [216](../packages/web/src/screens/profileSections.tsx#L216) | `width: 64,` |
| `AchievementTile` | [217](../packages/web/src/screens/profileSections.tsx#L217) | `height: 64,` |
| `AchievementTile` | [218](../packages/web/src/screens/profileSections.tsx#L218) | `borderRadius: 18,` |
| `AchievementTile` | [231](../packages/web/src/screens/profileSections.tsx#L231) | `width: '100%',` |
| `AchievementTile` | [232](../packages/web/src/screens/profileSections.tsx#L232) | `height: '100%',` |
| `AchievementTile` | [250](../packages/web/src/screens/profileSections.tsx#L250) | `height: 25,` |
| `AchievementTile` | [251](../packages/web/src/screens/profileSections.tsx#L251) | `width: '100%',` |
| `AchievementTile` | [256](../packages/web/src/screens/profileSections.tsx#L256) | `lineHeight: 1.25,` |
| `AchievementTile` | [257](../packages/web/src/screens/profileSections.tsx#L257) | `fontWeight: 700,` |
| `ProfileAchievementsSection` | [318](../packages/web/src/screens/profileSections.tsx#L318) | `gap: 10,` |
| `ProfileAchievementsSection` | [322](../packages/web/src/screens/profileSections.tsx#L322) | `<span style={{ minWidth: 0, whiteSpace: 'nowrap' }}>` |
| `ProfileAchievementsSection` | [331](../packages/web/src/screens/profileSections.tsx#L331) | `padding: '14px 12px',` |
| `ProfileAchievementsSection` | [332](../packages/web/src/screens/profileSections.tsx#L332) | `borderRadius: 22,` |
| `ProfileAchievementsSection` | [333](../packages/web/src/screens/profileSections.tsx#L333) | `minHeight: 121,` |
| `ProfileAchievementsSection` | [342](../packages/web/src/screens/profileSections.tsx#L342) | `gap: 12,` |
| `ProfileAchievementsSection` | [343](../packages/web/src/screens/profileSections.tsx#L343) | `minHeight: 95,` |
| `AchievementDetailsSheet` | [388](../packages/web/src/screens/profileSections.tsx#L388) | `width: 'min(320px, calc(100vw - 40px))',` |
| `AchievementDetailsSheet` | [389](../packages/web/src/screens/profileSections.tsx#L389) | `maxHeight: 'calc(100dvh - 20px - var(--app-safe-top) - var(--app-safe-bottom))',` |

</details>

<details>
<summary>tournament/TournamentAdmin.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `stillCurrent` | [2241](../packages/web/src/tournament/TournamentAdmin.tsx#L2241) | `<section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>` |
| `stillCurrent` | [2243](../packages/web/src/tournament/TournamentAdmin.tsx#L2243) | `style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}` |
| `stillCurrent` | [2317](../packages/web/src/tournament/TournamentAdmin.tsx#L2317) | `style={{ height: 'min(var(--app-viewport-height, 100dvh), 860px)' }}` |
| `stillCurrent` | [2355](../packages/web/src/tournament/TournamentAdmin.tsx#L2355) | `style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}` |

</details>

<details>
<summary>tournament/TournamentPlayoffOverview.tsx — локальная геометрия</summary>

| Компонент | Строка источника | Декларация |
| --- | --- | --- |
| `height` | [459](../packages/web/src/tournament/TournamentPlayoffOverview.tsx#L459) | `style={{ top: &#96;${top}%&#96;, height: &#96;${height}%&#96; }}` |

</details>

## Охват каталога

CSS: 2585 правил оформления и вариантов. React: 2793 строк локальной геометрии. Каталог содержит декларации CSS и локальной геометрии React, в том числе служебных элементов. Это индекс исходного оформления, а не вычисленных размеров в браузере. Серверная логика и содержимое рисунков в каталог не включены.

## Проверка реализации 11 октября 2026

- Локальная ветка `feature/universal-liquid-glass`, база `465b718e`; публикации на dev и production нет.
- Web typecheck, общий ESLint и web build прошли. Сборка сообщает обычное предупреждение о размере bundle.
- 81 тест общих компонентов, 71 тест каталога и операций турниров, 129 тестов конструктора, чата, настроек профиля и турнирной админки прошли. Четыре последние набора запускались отдельными процессами согласно изоляции проекта.
- Два изменённых сценария DailyScreen проверены отдельно: настройка скорости периода и фильтры форматов дуэли. Остальные сценарии DailyScreen этим результатом не покрыты.
- Полный web runner не зелёный: на исходной базе отдельно воспроизведены 13 ошибок в App, OpenWindowObservationPlay, recordedObservation и SectionsScreen, а также два необработанных `image.decode` исключения. Старые проверки конкретных цветов адаптированы к новой теме. Полный runner после адаптации повторно не завершался.
- Chromium: реальные BottomNav, GlassSelect и StartPeriodModal плюс синтетическое содержимое карточек/модалки на баре, льду и пляже; 360 и 430 px, нет горизонтального переполнения, выбор списка и запуск периода работают, pageerror отсутствуют. Проверка материала до изменения была RED, после изменения GREEN.
- Отключённая прозрачность: непрозрачный нейтральный материал и отсутствие blur подтверждены через browser media emulation. Обычные `/login` и `/demo` открываются без горизонтального переполнения. Вход в аккаунт и серверные записи не выполнялись.
- Снимки и локальный отчёт: `output/playwright/liquid-glass/` в рабочей копии. Это локальная проверка компонентов, не приёмка всех авторизованных экранов, Safari/WebKit или физического iPhone.
