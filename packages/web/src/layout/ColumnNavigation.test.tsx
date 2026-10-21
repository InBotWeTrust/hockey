import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ColumnNavigationProvider, useColumnNavigation } from './ColumnNavigation.js';
import { clearColumnHistory } from './columnNavigationStore.js';
const loc = (search: string) => ({ pathname: '/profile', search, hash: '' });
function Page({ name }: { name: string }) {
  const location = useLocation(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const { back } = useColumnNavigation();
  return (
    <section aria-label={name}>
      <output>{name + location.search}</output>
      <button onClick={() => navigate('/profile?detail=1')}>{name} detail</button>
      <button onClick={() => setParams({ filter: 'new' })}>{name} filter</button>
      <button onClick={back}>{name} back</button>
      <span>{params.get('filter')}</span>
    </section>
  );
}
beforeEach(clearColumnHistory);
it('scopes existing router hooks to independent columns and restores local history', () => {
  const activate = vi.fn();
  render(
    <MemoryRouter>
      <ColumnNavigationProvider
        pageKey={{ owner: 'a', venueId: 'home', pageId: 'left' }}
        initialLocation={loc('?page=left')}
        active={false}
        onActivate={activate}
        onGame={vi.fn()}
      >
        <Page name="left" />
      </ColumnNavigationProvider>
      <ColumnNavigationProvider
        pageKey={{ owner: 'a', venueId: 'home', pageId: 'right' }}
        initialLocation={loc('?page=right')}
        active={false}
        onActivate={activate}
        onGame={vi.fn()}
      >
        <Page name="right" />
      </ColumnNavigationProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('right detail'));
  expect(screen.getByText('right?detail=1')).toBeInTheDocument();
  expect(screen.getByText('left?page=left')).toBeInTheDocument();
  expect(activate).toHaveBeenCalledWith(loc('?detail=1'), { replace: false });
  fireEvent.click(screen.getByText('right back'));
  expect(screen.getByText('right?page=right')).toBeInTheDocument();
  fireEvent.click(screen.getByText('left filter'));
  expect(screen.getByText('left?filter=new')).toBeInTheDocument();
  expect(screen.getByText('right?page=right')).toBeInTheDocument();
});
it('restores an active location from browser navigation', () => {
  const props = {
    pageKey: { owner: 'a', venueId: 'home', pageId: 'left' },
    active: true,
    onActivate: vi.fn(),
    onGame: vi.fn(),
  };
  const view = render(
    <MemoryRouter>
      <ColumnNavigationProvider {...props} initialLocation={loc('?detail=1')}>
        <Page name="left" />
      </ColumnNavigationProvider>
    </MemoryRouter>,
  );
  view.rerender(
    <MemoryRouter>
      <ColumnNavigationProvider {...props} initialLocation={loc('')}>
        <Page name="left" />
      </ColumnNavigationProvider>
    </MemoryRouter>,
  );
  expect(screen.getByText('left')).toBeInTheDocument();
});
