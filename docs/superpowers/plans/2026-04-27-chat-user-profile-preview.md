# Chat User Profile Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В групповых и системных чатах тап по аватарке/имени автора сообщения открывает bottom-sheet с превью профиля и кнопкой «Написать в личку», запускающей `findOrCreateDM` и переход в DM.

**Architecture:** Новый `UserProfileSheet` рендерится в `ChatRoomScreen` через portal-паттерн (как `MessageActionsMenu`) и сам владеет мутацией `findOrCreateDM`. `ChatBubble` оборачивает аватар и имя в кликабельные `<button>`-ы и через проп `onOpenProfile` передаёт `{userId, displayName, avatarUrl}` родителю. `StatCard` выносится из `ProfileScreen` в общий модуль для переиспользования (плейсхолдеры с прочерками — реальные данные подключим, когда появится `GET /users/:id/profile` в подпроекте рейтинга).

**Tech Stack:** React 18, TanStack Query v5, react-router-dom v6, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-04-27-chat-user-profile-preview-design.md`

**Branch:** `chat/user-profile-preview` (уже создан, спек закоммичен).

---

## Task 1: Вынос `StatCard` в общий компонент

**Files:**
- Create: `packages/web/src/components/StatCard.tsx`
- Modify: `packages/web/src/screens/ProfileScreen.tsx`

Зачем отдельной задачей: `UserProfileSheet` (Task 2) рендерит ту же сетку статов, что `ProfileScreen`. Чтобы не плодить копию — выносим. Изменение чисто механическое и не задевает поведение.

- [ ] **Step 1: Создать общий `StatCard`**

Создать файл `packages/web/src/components/StatCard.tsx`:

```tsx
interface StatCardProps {
  label: string;
  value: string;
  suffix?: string;
}

export function StatCard({ label, value, suffix }: StatCardProps): JSX.Element {
  return (
    <div
      className="glass"
      style={{
        padding: '12px 14px',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
        {value}
        {suffix && <small style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{suffix}</small>}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Переключить `ProfileScreen` на общий `StatCard`**

В `packages/web/src/screens/ProfileScreen.tsx`:

1. Добавить импорт в шапке файла:
   ```tsx
   import { StatCard } from '../components/StatCard.js';
   ```
2. Удалить локальное определение `function StatCard(...)` в конце файла (строки ~337–366 в текущем состоянии).

- [ ] **Step 3: Прогнать typecheck + тесты**

```bash
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web test
```
Expected: PASS, никакой регрессии — рендер `ProfileScreen` визуально идентичен.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/StatCard.tsx packages/web/src/screens/ProfileScreen.tsx
git commit -m "refactor(web): extract StatCard into shared component"
```

---

## Task 2: `UserProfileSheet` компонент + тесты

**Files:**
- Create: `packages/web/src/chat/components/UserProfileSheet.tsx`
- Create: `packages/web/src/chat/test/UserProfileSheet.test.tsx`

Компонент сам владеет мутацией `findOrCreateDM` и навигацией — родитель только хранит state открытия (`sender | null`) и рендерит. Это упрощает интеграцию в `ChatRoomScreen` (Task 4).

- [ ] **Step 1: Написать падающий тест на рендер sheet'а**

Создать `packages/web/src/chat/test/UserProfileSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UserProfileSheet } from '../components/UserProfileSheet.js';
import * as api from '../api.js';

function renderSheet(props: Parameters<typeof UserProfileSheet>[0]): { qc: QueryClient } {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/chat/c1']}>
        <Routes>
          <Route
            path="/chat/:chatId"
            element={<UserProfileSheet {...props} />}
          />
          <Route path="/chat/:chatId/*" element={<div data-testid="navigated">{location.pathname}</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { qc };
}

describe('UserProfileSheet', () => {
  beforeEach(() => {
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm1', created: false });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when sender is null', () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UserProfileSheet sender={null} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders displayName and stat placeholders when sender provided', () => {
    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван Петров', avatarUrl: null },
      onClose: () => {},
    });
    expect(screen.getByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /написать в личку/i })).toBeInTheDocument();
    // 4 placeholders ("—") in stat grid.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 2: Запустить и убедиться что падает на отсутствии модуля**

```bash
pnpm --filter @hockey/web test -- UserProfileSheet
```
Expected: FAIL — "Failed to resolve import '../components/UserProfileSheet.js'".

- [ ] **Step 3: Минимальная имплементация `UserProfileSheet`**

Создать `packages/web/src/chat/components/UserProfileSheet.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { findOrCreateDM, type UserPickerItem } from '../api.js';
import { chatKeys } from '../../lib/queryKeys.js';
import { StatCard } from '../../components/StatCard.js';

interface UserProfileSheetProps {
  sender: UserPickerItem | null;
  onClose: () => void;
}

export function UserProfileSheet({ sender, onClose }: UserProfileSheetProps): JSX.Element | null {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Slide-up animation: render off-screen on first frame, then animate in.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (sender) {
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    return undefined;
  }, [sender]);

  const { mutate, isPending } = useMutation({
    mutationFn: (otherUserId: string) => findOrCreateDM(otherUserId),
    onSuccess: ({ chatId, created }) => {
      if (created) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      }
      navigate(`/chat/${chatId}`);
      onClose();
    },
  });

  if (!sender) return null;

  const initial = (sender.displayName.trim() || '?').charAt(0).toUpperCase();

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.35)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        className="glass"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '80dvh',
          padding: `16px 16px calc(16px + env(safe-area-inset-bottom, 0px))`,
          borderRadius: '24px 24px 0 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          transform: entered ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'rgba(15,23,42,0.2)',
              margin: '0 auto',
            }}
          />
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Закрыть"
            style={{ position: 'absolute', top: 12, right: 12 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {sender.avatarUrl ? (
            <img
              src={sender.avatarUrl}
              alt=""
              style={{
                width: 88,
                height: 88,
                borderRadius: 999,
                objectFit: 'cover',
                boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
              }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                width: 88,
                height: 88,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
                color: '#ffffff',
                fontSize: 32,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 26px rgba(15, 23, 42, 0.25)',
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', minWidth: 0 }}>
            {sender.displayName}
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 4 }}>Статистика</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <StatCard label="Всего бросков" value="—" />
          <StatCard label="Голов" value="—" />
          <StatCard label="Точность" value="—" />
          <StatCard label="Ранг" value="—" />
        </div>

        <button
          type="button"
          className="btn btn--cta"
          onClick={() => mutate(sender.userId)}
          disabled={isPending}
          style={{ marginTop: 6, padding: '14px 0', fontSize: 15, fontWeight: 600 }}
        >
          {isPending ? 'Открываем чат…' : 'Написать в личку'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Запустить тесты — оба должны пройти**

```bash
pnpm --filter @hockey/web test -- UserProfileSheet
```
Expected: PASS (2 теста: null-sender и render).

- [ ] **Step 5: Дописать тесты на тап «Написать»**

Добавить в `UserProfileSheet.test.tsx` внутрь `describe('UserProfileSheet')` ещё кейс:

```tsx
  it('clicking "Написать в личку" calls findOrCreateDM and closes the sheet', async () => {
    const onClose = vi.fn();
    renderSheet({
      sender: { userId: 'u1', displayName: 'Иван', avatarUrl: null },
      onClose,
    });
    fireEvent.click(screen.getByRole('button', { name: /написать в личку/i }));
    await waitFor(() => expect(api.findOrCreateDM).toHaveBeenCalledWith('u1'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <UserProfileSheet
            sender={{ userId: 'u1', displayName: 'Иван', avatarUrl: null }}
            onClose={onClose}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Backdrop is the portal root inside document.body; query the topmost
    // overlay div with the rgba background.
    const backdrop = document.body.querySelector<HTMLElement>('div[style*="rgba(15,23,42,0.35)"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalled();
  });
```

- [ ] **Step 6: Прогнать тесты**

```bash
pnpm --filter @hockey/web test -- UserProfileSheet
```
Expected: PASS (4 теста).

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/chat/components/UserProfileSheet.tsx packages/web/src/chat/test/UserProfileSheet.test.tsx
git commit -m "feat(chat): UserProfileSheet — bottom-sheet preview + DM mutation"
```

---

## Task 3: Кликабельные аватар и имя в `ChatBubble` + тесты

**Files:**
- Modify: `packages/web/src/chat/components/ChatBubble.tsx`
- Create: `packages/web/src/chat/test/ChatBubble.test.tsx`

`ChatBubble` сейчас обёрнут в `React.memo` с явным `areEqual`. Добавляем проп `onOpenProfile` (опциональный): если задан, аватар и имя становятся `<button>`-ами с одним и тем же `onClick`. Иначе всё работает как раньше.

- [ ] **Step 1: Написать падающие тесты на кликабельность**

Создать `packages/web/src/chat/test/ChatBubble.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatBubble } from '../components/ChatBubble.js';
import type { ChatMessageDTO } from '../api.js';

const baseMessage: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: 'u1',
  senderDisplayName: 'Иван',
  senderAvatarUrl: null,
  content: 'привет',
  replyToId: null,
  isDeleted: false,
  createdAt: '2026-04-27T10:00:00.000Z',
  reactions: [],
};

function defaults() {
  return {
    message: baseMessage,
    isOwn: false,
    showAuthor: true,
    replyTo: null,
    onRequestActions: vi.fn(),
    onReact: vi.fn(),
  };
}

describe('ChatBubble — author tap', () => {
  it('clicking the avatar calls onOpenProfile with sender info', () => {
    const onOpenProfile = vi.fn();
    render(<ChatBubble {...defaults()} onOpenProfile={onOpenProfile} />);
    // Author name button — accessible by name.
    const nameBtn = screen.getByRole('button', { name: /иван/i });
    fireEvent.click(nameBtn);
    expect(onOpenProfile).toHaveBeenCalledWith({
      userId: 'u1',
      displayName: 'Иван',
      avatarUrl: null,
    });
  });

  it('does not render author buttons when senderDisplayName is null', () => {
    render(
      <ChatBubble
        {...defaults()}
        message={{ ...baseMessage, senderDisplayName: null }}
        onOpenProfile={vi.fn()}
      />,
    );
    // Fallback label "Участник" still renders, but inside a disabled button.
    const btn = screen.getByRole('button', { name: /участник/i });
    expect(btn).toBeDisabled();
  });

  it('does not render author when isOwn=true (no avatar/name on own bubbles)', () => {
    render(<ChatBubble {...defaults()} isOwn onOpenProfile={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /иван/i })).toBeNull();
  });

  it('does not render author when showAuthor=false', () => {
    render(<ChatBubble {...defaults()} showAuthor={false} onOpenProfile={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /иван/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm --filter @hockey/web test -- ChatBubble
```
Expected: FAIL — нет accessible button с именем "Иван" (имя сейчас в `<span>`, не кликабельное).

- [ ] **Step 3: Сделать аватар и имя кликабельными в `ChatBubble.tsx`**

Изменения в `packages/web/src/chat/components/ChatBubble.tsx`:

1. Расширить интерфейс `ChatBubbleProps` (после `onReact`):

   ```ts
     // Foreign group/system bubbles call this when the user taps avatar or name —
     // parent opens a profile preview sheet. Optional: if undefined, the avatar
     // and name render as plain non-interactive elements.
     onOpenProfile?: (sender: { userId: string; displayName: string; avatarUrl: string | null }) => void;
   ```

2. Принять проп в сигнатуре `ChatBubbleImpl`:

   ```ts
   function ChatBubbleImpl({
     message,
     isOwn,
     showAuthor = false,
     replyTo,
     onRequestActions,
     onReact,
     onOpenProfile,
   }: ChatBubbleProps): JSX.Element {
   ```

3. В блоке, где `showAvatarAndName=true`, обернуть `avatar` и `<span>` имени в `<button>`-ы. Заменить текущее определение `avatar` (строки ~115–146) на:

   ```tsx
     const senderForOpen = {
       userId: message.senderId,
       displayName: message.senderDisplayName ?? 'Участник',
       avatarUrl: message.senderAvatarUrl,
     };
     const canOpenProfile = onOpenProfile !== undefined && message.senderDisplayName !== null;
     const onAvatarClick = (): void => {
       if (canOpenProfile) onOpenProfile!(senderForOpen);
     };
     const buttonReset = {
       background: 'none',
       border: 'none',
       padding: 0,
       cursor: canOpenProfile ? 'pointer' : 'default',
       font: 'inherit',
       color: 'inherit',
       textAlign: 'left' as const,
     };

     const avatarInner = message.senderAvatarUrl ? (
       <img
         src={message.senderAvatarUrl}
         alt=""
         style={{
           width: 32,
           height: 32,
           borderRadius: '50%',
           objectFit: 'cover',
           flexShrink: 0,
         }}
       />
     ) : (
       <div
         aria-hidden
         style={{
           width: 32,
           height: 32,
           borderRadius: '50%',
           background: 'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
           color: '#ffffff',
           display: 'flex',
           alignItems: 'center',
           justifyContent: 'center',
           fontSize: 13,
           fontWeight: 800,
           flexShrink: 0,
         }}
       >
         {authorInitial(message.senderDisplayName)}
       </div>
     );
     const avatar = (
       <button
         type="button"
         disabled={!canOpenProfile}
         onClick={onAvatarClick}
         aria-label={`Профиль: ${senderForOpen.displayName}`}
         style={{ ...buttonReset, flexShrink: 0 }}
       >
         {avatarInner}
       </button>
     );
   ```

4. Обернуть `<span>` имени в `<button>`-обёртку. Заменить блок имени (строки ~165–179) на:

   ```tsx
         <button
           type="button"
           disabled={!canOpenProfile}
           onClick={onAvatarClick}
           style={{
             ...buttonReset,
             fontSize: 11,
             fontWeight: 600,
             color: 'var(--muted)',
             padding: '0 4px',
             marginBottom: 2,
             maxWidth: '100%',
             whiteSpace: 'nowrap',
             overflow: 'hidden',
             textOverflow: 'ellipsis',
             display: 'block',
           }}
         >
           {message.senderDisplayName ?? 'Участник'}
         </button>
   ```

5. Обновить `areEqual` — добавить сравнение `onOpenProfile`:

   ```ts
     prev.onReact === next.onReact &&
     prev.onOpenProfile === next.onOpenProfile
   ```

- [ ] **Step 4: Запустить тесты — должны пройти**

```bash
pnpm --filter @hockey/web test -- ChatBubble
```
Expected: PASS (4 теста).

- [ ] **Step 5: Прогнать соседние тесты, убедиться что existing ChatRoomScreen.test не сломан**

```bash
pnpm --filter @hockey/web test
```
Expected: PASS — long-press selectors в `ChatRoomScreen.test.tsx` цепляются за inner `div` bubble (не за button-обёртки), так что не должны зацепить.

Если упало: проверить, что существующий тест в `ChatRoomScreen.test.tsx` (вызов `bubble.querySelector<HTMLElement>('div')`) находит правильный `div` — внутри нового кода имя стало `<button>`, но первый `div` остаётся flex-обёрткой, а далее идёт колонка с body. Селектор `div` (первый дочерний) у `<div data-testid="chat-bubble">` — это `<button>` в случае showAuthor (но `<button>` это не div, селектор `'div'` его пропустит). На showAuthor=true структура: `<div testid> > <button avatar> + <div column> > [<button name>, <body div>]`. `querySelector('div')` сначала найдёт `<div column>`, затем `body`. Но long-press handlers сидят на body-div. Структура осталась совместимой — pointerDown на колонке всплывёт до body. Проверить тестом.

- [ ] **Step 6: Typecheck**

```bash
pnpm --filter @hockey/web typecheck
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/chat/components/ChatBubble.tsx packages/web/src/chat/test/ChatBubble.test.tsx
git commit -m "feat(chat): clickable avatar + name in foreign group bubbles"
```

---

## Task 4: Подключить `UserProfileSheet` в `ChatRoomScreen` + тест

**Files:**
- Modify: `packages/web/src/chat/screens/ChatRoomScreen.tsx`
- Modify: `packages/web/src/chat/test/ChatRoomScreen.test.tsx`

`ChatRoomScreen` хранит `previewSender` в state, передаёт стабильный `onOpenProfile` коллбэк в `ChatBubble`, рендерит `<UserProfileSheet>` рядом с `MessageActionsMenu`.

- [ ] **Step 1: Написать падающий тест**

Добавить в существующий `packages/web/src/chat/test/ChatRoomScreen.test.tsx` новый test-кейс. Сначала в `beforeEach` добавить мок группового чата (текущий тест отдаёт пустой list, что даёт `chatMeta=undefined` и `showAuthorOnBubbles=false`):

```tsx
    vi.spyOn(api, 'fetchChatList').mockResolvedValue([
      {
        id: 'c1',
        type: 'group',
        name: 'Командный чат',
        entityType: null,
        entityId: null,
        lastMessageAt: null,
        unreadCount: 0,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: null,
        memberCount: 5,
        pinnedAt: null,
      },
    ]);
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm-new', created: true });
```

Также подменить `msgFromOther.senderDisplayName` на реальное имя:

```tsx
const msgFromOther: ChatMessageDTO = {
  id: 'm1',
  chatId: 'c1',
  senderId: OTHER_ID,
  senderDisplayName: 'Иван',
  senderAvatarUrl: null,
  ...
};
```

Добавить новый `describe`-блок в конец файла:

```tsx
describe('ChatRoomScreen — profile preview', () => {
  beforeEach(() => {
    const user: AuthUser = { id: SELF_ID, displayName: 'Me', grip: 'right' };
    useAuthStore.setState({ accessToken: 'tok', refreshToken: 'rtok', user });
    vi.spyOn(api, 'fetchMessages').mockResolvedValue([msgFromOther]);
    vi.spyOn(api, 'markChatAsRead').mockResolvedValue(undefined);
    vi.spyOn(api, 'fetchChatList').mockResolvedValue([
      {
        id: 'c1',
        type: 'group',
        name: 'Командный чат',
        entityType: null,
        entityId: null,
        lastMessageAt: null,
        unreadCount: 0,
        lastMessage: null,
        lastMessageSenderName: null,
        dmCounterpart: null,
        memberCount: 5,
        pinnedAt: null,
      },
    ]);
    vi.spyOn(api, 'findOrCreateDM').mockResolvedValue({ chatId: 'dm-new', created: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens UserProfileSheet on author tap and navigates to DM after "Написать"', async () => {
    renderRoom('c1');
    // Bubble for OTHER_ID renders avatar+name as buttons — tap the name.
    const nameBtn = await screen.findByRole('button', { name: /иван/i });
    fireEvent.click(nameBtn);
    // Sheet opens with the "Написать" CTA.
    const writeBtn = await screen.findByRole('button', { name: /написать в личку/i });
    fireEvent.click(writeBtn);
    await waitFor(() => expect(api.findOrCreateDM).toHaveBeenCalledWith(OTHER_ID));
  });
});
```

- [ ] **Step 2: Запустить — упадёт на "не нашли кнопку «Написать в личку»"**

```bash
pnpm --filter @hockey/web test -- ChatRoomScreen
```
Expected: FAIL — UserProfileSheet ещё не подключён в screen.

- [ ] **Step 3: Подключить sheet в `ChatRoomScreen.tsx`**

В `packages/web/src/chat/screens/ChatRoomScreen.tsx`:

1. Добавить импорт:

   ```tsx
   import { UserProfileSheet } from '../components/UserProfileSheet.js';
   import type { UserPickerItem } from '../api.js';
   ```

2. Рядом с другими `useState` (например, после `pickerTarget`) добавить:

   ```tsx
   const [previewSender, setPreviewSender] = useState<UserPickerItem | null>(null);
   ```

3. Рядом с другими `useCallback`-ами добавить стабильный коллбэк:

   ```tsx
   const onOpenProfile = useCallback((sender: UserPickerItem) => {
     // Defensive guard: never open a sheet for self (own bubbles already
     // hide their author UI, but a future change might regress this).
     if (sender.userId === meId) return;
     setPreviewSender(sender);
   }, [meId]);
   const onCloseProfile = useCallback(() => setPreviewSender(null), []);
   ```

4. Прокинуть проп в `<ChatBubble>` (внутри `visibleMessages.map`):

   ```tsx
   <ChatBubble
     key={m.id}
     message={m}
     isOwn={isOwn}
     showAuthor={showAuthorOnBubbles}
     replyTo={replyTo}
     onRequestActions={onRequestActions}
     onReact={onToggleReaction}
     onOpenProfile={onOpenProfile}
   />
   ```

5. В JSX рядом с `<ReactionPicker ... />` добавить:

   ```tsx
   <UserProfileSheet sender={previewSender} onClose={onCloseProfile} />
   ```

- [ ] **Step 4: Прогнать тест**

```bash
pnpm --filter @hockey/web test -- ChatRoomScreen
```
Expected: PASS — новый тест зелёный, существующие не сломаны.

- [ ] **Step 5: Прогнать всю web-сюту + typecheck + lint**

```bash
pnpm --filter @hockey/web typecheck
pnpm --filter @hockey/web lint
pnpm --filter @hockey/web test
```
Expected: PASS на всех трёх.

- [ ] **Step 6: Ручная проверка в dev-режиме**

```bash
pnpm dev:server &  # или в отдельном терминале
pnpm dev:web
```

Открыть `http://localhost:5173`, залогиниться dev-кнопкой как два разных юзера в двух окнах, написать в системном «Общий чат». В одном окне тапнуть на аватар/имя другого участника:
1. Должен открыться bottom-sheet с аватаром+именем + 4 плейсхолдера статов.
2. Кнопка «Написать в личку» → переход в `/chat/<dmChatId>`, в списке чатов появился новый DM.
3. На своих сообщениях — аватара/имени нет (как было).
4. Проверить, что long-press на bubble всё ещё открывает MessageActionsMenu (не сломался обработчик).
5. Проверить тап по backdrop sheet'а — закрывает.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/chat/screens/ChatRoomScreen.tsx packages/web/src/chat/test/ChatRoomScreen.test.tsx
git commit -m "feat(chat): wire UserProfileSheet into ChatRoomScreen"
```

---

## Task 5: PR

- [ ] **Step 1: Push ветки**

```bash
git push -u origin chat/user-profile-preview
```

- [ ] **Step 2: Открыть PR**

```bash
gh pr create --title "feat(chat): user profile preview on avatar tap + DM shortcut" --body "$(cat <<'EOF'
## Summary
- Тап по аватару или имени автора в группе/системном чате открывает bottom-sheet с превью профиля
- В превью — аватар, имя и плейсхолдеры под статы; кнопка «Написать в личку» через findOrCreateDM открывает DM
- Вынес StatCard из ProfileScreen в общий компонент для переиспользования

Спек: `docs/superpowers/specs/2026-04-27-chat-user-profile-preview-design.md`

## Test plan
- [x] vitest на UserProfileSheet (рендер, тап «Написать», тап backdrop)
- [x] vitest на ChatBubble (clickable avatar/name, disabled на null senderDisplayName, нет на own/showAuthor=false)
- [x] vitest на ChatRoomScreen (тап автора → sheet → DM navigate)
- [ ] manual: dev-сервер, два юзера в системном чате, превью + переход в DM
- [ ] manual: long-press на bubble всё ещё открывает MessageActionsMenu
- [ ] manual: на своих сообщениях аватар/имя не рендерятся
EOF
)"
```

---

## Self-review checklist

- ✅ Spec coverage: §3 архитектура (Tasks 2-4), §4 кликабельность DOM (Task 3), §5 edge cases (`isOwn` self, null displayName, system chat — Tasks 3-4), §6 тесты (Tasks 2-4), §7 файлы (все перечислены).
- ✅ No placeholders — все шаги с конкретным кодом и командами.
- ✅ Type consistency: `UserPickerItem` используется одинаково (`{userId, displayName, avatarUrl: string | null}`) во всех тасках; `onOpenProfile` сигнатура совпадает в Task 3 (ChatBubble) и Task 4 (ChatRoomScreen).
- ⚠️ Edge case по `meId`-guard: тест на самозакрытие не написан (Task 4 step 1), но guard добавлен. Если хочется проверить — можно дополнить тест-кейсом с `senderId === SELF_ID`, но в реальности `showAvatarAndName=false` уже отрезает путь, тест будет дублировать логику Task 3.
