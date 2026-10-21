import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SectionPanorama, adjacentSection } from './SectionPanorama.js';
const pages = ['Клюшки', 'Коньки', 'Питание'].map((label, i) => ({
  id: String(i),
  label,
  image: '/thumb.webp',
}));
beforeEach(() => sessionStorage.clear());
it('keeps circle navigation visible and delegates selection without submitting content', () => {
  const change = vi.fn();
  render(
    <SectionPanorama
      label="Магазин"
      pages={pages}
      selected="0"
      onSelect={change}
      panorama="/shop.webp"
      storageKey="test"
    >
      <button>Купить</button>
    </SectionPanorama>,
  );
  expect(screen.getByRole('tab', { name: 'Клюшки' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Коньки' }));
  expect(change).toHaveBeenCalledWith('1');
  expect(screen.queryByLabelText('Свернуть навигацию')).toBeNull();
  const exit = screen.getByRole('link', { name: 'На карту' });
  expect(exit).toHaveAttribute('href', '/sections');
  expect(
    exit.compareDocumentPosition(screen.getByRole('tab', { name: 'Клюшки' })) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
it('clamps swipes at the first and last section', () => {
  expect(adjacentSection(pages, '0', -1)).toBe('0');
  expect(adjacentSection(pages, '2', 1)).toBe('2');
  expect(adjacentSection(pages, '0', 1)).toBe('1');
});
it('restores independent vertical positions on switching and remounting', () => {
  const props = {
    label: 'Магазин',
    pages,
    onSelect: vi.fn(),
    panorama: '/shop.webp',
    storageKey: 'scroll-test',
  };
  const view = render(
    <SectionPanorama {...props} selected="0">
      <p>Товары</p>
    </SectionPanorama>,
  );
  const scroll = screen.getByTestId('section-page-scroll');
  scroll.scrollTop = 320;
  fireEvent.scroll(scroll);
  view.rerender(
    <SectionPanorama {...props} selected="1">
      <p>Товары</p>
    </SectionPanorama>,
  );
  expect(scroll.scrollTop).toBe(0);
  scroll.scrollTop = 100;
  fireEvent.scroll(scroll);
  view.rerender(
    <SectionPanorama {...props} selected="0">
      <p>Товары</p>
    </SectionPanorama>,
  );
  expect(scroll.scrollTop).toBe(320);
  view.unmount();
  render(
    <SectionPanorama {...props} selected="1">
      <p>Товары</p>
    </SectionPanorama>,
  );
  expect(screen.getByTestId('section-page-scroll').scrollTop).toBe(100);
});
it('ignores corrupt optional scroll storage', () => {
  sessionStorage.setItem('corrupt', 'null');
  expect(() =>
    render(
      <SectionPanorama
        label="Магазин"
        pages={pages}
        selected="0"
        onSelect={vi.fn()}
        panorama="/shop.webp"
        storageKey="corrupt"
      >
        <p>Товары</p>
      </SectionPanorama>,
    ),
  ).not.toThrow();
});
it('restores a saved position after the catalog finishes loading', () => {
  sessionStorage.setItem('delayed', JSON.stringify({ '0': 320 }));
  const props = {
    label: 'Магазин',
    pages,
    selected: '0',
    onSelect: vi.fn(),
    panorama: '/shop.webp',
    storageKey: 'delayed',
  };
  const view = render(
    <SectionPanorama {...props}>
      <p>Загрузка</p>
    </SectionPanorama>,
  );
  const scroll = screen.getByTestId('section-page-scroll');
  // A browser clamps scrollTop while an asynchronous catalog is shorter than the viewport.
  scroll.scrollTop = 0;
  fireEvent.scroll(scroll);
  view.rerender(
    <SectionPanorama {...props}>
      <p>Загруженные товары</p>
    </SectionPanorama>,
  );
  expect(scroll.scrollTop).toBe(320);
});

it('reserves the measured floating panel height at the end of the scrollable content', () => {
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ height: 132 } as DOMRect);
  render(
    <SectionPanorama
      label="Магазин"
      pages={pages}
      selected="0"
      onSelect={vi.fn()}
      panorama="/shop.webp"
      storageKey="overlay"
    >
      <p>Last card</p>
    </SectionPanorama>,
  );
  expect(
    screen.getByTestId('section-page-scroll').style.getPropertyValue('--section-panel-height'),
  ).toBe('132px');
  bounds.mockRestore();
});

it('shows numeric reward counts and caps large badges', () => {
  render(
    <SectionPanorama
      label="Задания"
      pages={[
        { id: 'tasks', label: 'Задания', image: '/thumb.webp', attention: 12 },
        { id: 'challenges', label: 'Челленджи', image: '/thumb.webp', attention: 123 },
      ]}
      selected="tasks"
      onSelect={vi.fn()}
      panorama="/tasks.webp"
      storageKey="counts"
    >
      <p>Tasks</p>
    </SectionPanorama>,
  );
  expect(screen.getAllByLabelText('Есть награда').map((el) => el.textContent)).toEqual([
    '12',
    '99+',
  ]);
});

it('persists the current section tab beyond the session without restoring over explicit selection',()=>{
 localStorage.clear();
 const view=render(<SectionPanorama label="Test" pages={pages} selected="1" onSelect={()=>{}} panorama="/test.webp" storageKey="section-scroll:one:shop"><p>Test</p></SectionPanorama>);
 expect(localStorage.getItem('section-scroll:one:shop:selected')).toBe('1');
 view.rerender(<SectionPanorama label="Test" pages={pages} selected="2" onSelect={()=>{}} panorama="/test.webp" storageKey="section-scroll:one:shop"><p>Test</p></SectionPanorama>);
 expect(localStorage.getItem('section-scroll:one:shop:selected')).toBe('2');
 expect(screen.getByRole('tab',{name:'Питание'})).toHaveAttribute('aria-selected','true');
 localStorage.clear();
});

it('drags overflowed section circles with a mouse and suppresses the release click',()=>{
 const change=vi.fn();render(<SectionPanorama label="Бонусные игры" pages={pages} selected="0" onSelect={change} panorama="/bonus.webp" storageKey="drag-test"><p>Test</p></SectionPanorama>);
 const dock=screen.getByRole('tablist',{name:'Навык'});dock.scrollLeft=180;
 const target=screen.getByRole('tab',{name:'Коньки'});
 const mouse=(type:string,x:number)=>{const event=new Event(type,{bubbles:true});Object.defineProperties(event,{isPrimary:{value:true},button:{value:0},pointerId:{value:1},clientX:{value:x},clientY:{value:20},pointerType:{value:'mouse'}});fireEvent(target,event);};
 mouse('pointerdown',220);mouse('pointermove',120);mouse('pointerup',120);
 expect(dock.scrollLeft).toBe(280);
 fireEvent.click(target,{detail:1});expect(change).not.toHaveBeenCalled();
 fireEvent.click(target,{detail:0});expect(change).toHaveBeenCalledWith('1');
});
