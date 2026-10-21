import {fireEvent, render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {StartupSplash} from './StartupSplash.js';

it('places the loading screen outside the panorama and removes it when data is ready', () => {
 const view=render(<div id="root" data-testid="page-panorama"><StartupSplash/></div>);
 const loading=screen.getByLabelText('Загрузка приложения');
 expect(loading.parentElement).toBe(document.body);
 expect(screen.getByTestId('page-panorama')).not.toContainElement(loading);
 expect(screen.getByTestId('page-panorama')).toHaveAttribute('inert');
 expect(screen.getByTestId('page-panorama')).toHaveAttribute('aria-hidden','true');
 expect(screen.getByRole('status')).toHaveTextContent('Идёт загрузка…');
 view.rerender(<div id="root" data-testid="page-panorama">Page ready</div>);
 expect(screen.queryByLabelText('Загрузка приложения')).toBeNull();
 expect(screen.getByText('Page ready')).toBeVisible();
 expect(screen.getByTestId('page-panorama')).not.toHaveAttribute('inert');
 expect(screen.getByTestId('page-panorama')).not.toHaveAttribute('aria-hidden');
});

it('keeps the retry action usable on the fullscreen loading error', () => {
 const retry=vi.fn();
 render(<StartupSplash message="Не удалось загрузить страницу." retry={retry}/>);
 fireEvent.click(screen.getByRole('button',{name:'Повторить'}));
 expect(retry).toHaveBeenCalledOnce();
});
