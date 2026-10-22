import {fireEvent, render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {SectionLoading} from './SectionLoading.js';
it('leaves the app interactive while a section is loading', () => {
 const back=vi.fn();
 render(<div id="root"><button onClick={back}>Назад</button><section data-testid="section"><SectionLoading/></section></div>);
 expect(screen.getByTestId('section')).toContainElement(screen.getByRole('status'));
 expect(document.getElementById('root')).not.toHaveAttribute('inert');
 expect(document.getElementById('root')).not.toHaveAttribute('aria-hidden');
 expect(screen.queryByLabelText('Загрузка приложения')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Назад'}));
 expect(back).toHaveBeenCalledOnce();
});
it('keeps retry local and accessible', () => {
 const retry=vi.fn(); render(<SectionLoading message="Не удалось загрузить карту." retry={retry}/>);
 expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить карту.');
 fireEvent.click(screen.getByRole('button',{name:'Повторить'})); expect(retry).toHaveBeenCalledOnce();
});
