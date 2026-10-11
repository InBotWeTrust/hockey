import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createDefaultBarLayout, moveBarOccupant } from '@hockey/game-core';
import { BarScene } from './BarScene.js';
it('scrubs touch previews in both directions without navigating on release', () => {
  const select = vi.fn();
  render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3"
    onSelectSlot={select} onAction={vi.fn()} />);
  const nav = screen.getByRole('navigation', { name: 'Места в баре' });
  vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 200 } as DOMRect);
  const pointer = (type: string, y: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientY: y });
    Object.defineProperties(event, {
      pointerId: { value: 1 }, pointerType: { value: 'touch' },
    });
    fireEvent(nav, event);
  };
  pointer('pointerdown', 110);
  expect(screen.getByRole('button', { name: 'Перейти: Дарья' })).toBeInTheDocument();
  pointer('pointermove', 190);
  expect(screen.getByRole('button', { name: 'Перейти: Играть онлайн' })).toBeInTheDocument();
  pointer('pointermove', 130);
  expect(screen.getByRole('button', { name: 'Перейти: Григорий' })).toBeInTheDocument();
  pointer('pointerup', 130);
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Перейти: Григорий' }));
  expect(select).toHaveBeenCalledWith('bar-2');
});
it('previews a place first and navigates only when its preview is clicked', () => {
  const select = vi.fn();
  render(
    <BarScene
      layout={createDefaultBarLayout()}
      activeSlotId="bar-3"
      onSelectSlot={select}
      onAction={vi.fn()}
    />,
  );
  fireEvent.focus(screen.getByRole('button', { name: 'Арсенич' }));
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Перейти: Арсенич' }));
  expect(select).toHaveBeenCalledWith('bar-4');
  expect(screen.queryByRole('button', { name: 'Перейти: Арсенич' })).not.toBeInTheDocument();
});
it('renders identity, safe actions and stable navigation', () => {
  const layout = createDefaultBarLayout();
  const select = vi.fn(),
    action = vi.fn();
  const view = render(
    <BarScene layout={layout} activeSlotId="bar-3" onSelectSlot={select} onAction={action} />,
  );
  expect(screen.getByRole('heading', { name: 'Мария' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Показать действия' }));
  fireEvent.click(screen.getByRole('button', { name: 'Сыграть в карты' }));
  expect(action).toHaveBeenCalledWith('cards', 'maria');
  fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
  expect(select).toHaveBeenCalledWith('bar-4');
  expect(screen.queryByRole('button', { name: 'Поговорить' })).not.toBeInTheDocument();
  const moved = moveBarOccupant(layout, 'bar-6', 'maria');
  view.rerender(
    <BarScene layout={moved} activeSlotId="bar-6" onSelectSlot={select} onAction={action} />,
  );
  expect(screen.getByRole('heading', { name: 'Мария' })).toBeInTheDocument();
});
it('shows Veronika and enables conversation without unsupported card games', () => {
  render(
    <BarScene
      layout={createDefaultBarLayout()}
      activeSlotId="bar-8"
      onSelectSlot={vi.fn()}
      onAction={vi.fn()}
      onTalk={vi.fn()}
    />,
  );
  expect(screen.getByRole('heading', { name: 'Вероника' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Показать действия' }));
  expect(screen.getByRole('button', { name: 'Поговорить' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Сыграть в карты' })).not.toBeInTheDocument();
});

it('shows a silhouette and no interactions for an empty place', () => {
  const layout = createDefaultBarLayout();
  layout.slots[7]!.occupantId = null;
  const { container } = render(<BarScene layout={layout} activeSlotId="bar-8"
    onSelectSlot={vi.fn()} onAction={vi.fn()} onTalk={vi.fn()} />);
  expect(screen.getByText('Персонаж в разработке')).toBeInTheDocument();
  expect(container.querySelectorAll('.bar-space__silhouette')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Поговорить' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Сыграть в карты' })).not.toBeInTheDocument();
});

it('never loads remote or invalid paths from an unsaved admin draft', () => {
  const layout = createDefaultBarLayout();
  layout.profiles.maria.avatar = 'https://example.com/avatar.png';
  layout.profiles.maria.composition = '/bar/../secret.png';
  const { container } = render(
    <BarScene
      layout={layout}
      activeSlotId="bar-3"
      onSelectSlot={vi.fn()}
      onAction={vi.fn()}
      preview
    />,
  );
  expect(container.querySelector('img[src="https://example.com/avatar.png"]')).toBeNull();
  expect(container.querySelector('img[src="/bar/../secret.png"]')).toBeNull();
});

it('navigates when clicking a marker with its preview already open', () => {
  const select = vi.fn();
  render(<BarScene layout={createDefaultBarLayout()} activeSlotId="bar-3" onSelectSlot={select} onAction={vi.fn()} />);
  const marker = screen.getByRole('button', { name: /^Григорий$/ });
  fireEvent.focus(marker);
  fireEvent.click(marker);
  expect(select).toHaveBeenCalledWith('bar-2');
});
