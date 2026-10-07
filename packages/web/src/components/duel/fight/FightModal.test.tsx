import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FightModal } from './FightModal.js';

describe('post-fight medical assistance', () => {
  it('adapts the fight modal to assistance with the art and a server-based countdown', () => {
    const view = render(<FightModal medicalAidUntilMs={10000} nowMs={0}><p>Fight scene</p></FightModal>);
    expect(screen.getByRole('dialog', { name: 'Оказание помощи' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Доктор оказывает помощь хоккеисту' })).toHaveAttribute('src', '/sprites/fight/medical-aid-v1.webp');
    expect(screen.getByRole('timer', { name: 'До возвращения в игру' })).toHaveTextContent('10');
    expect(screen.queryByText('Fight scene')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    view.rerender(<FightModal medicalAidUntilMs={10000} nowMs={-500}><p>Fight scene</p></FightModal>);
    expect(screen.getByRole('timer')).toHaveTextContent('10');
    view.rerender(<FightModal medicalAidUntilMs={10000} nowMs={1100}><p>Fight scene</p></FightModal>);
    expect(screen.getByRole('timer')).toHaveTextContent('9');
    view.rerender(<FightModal medicalAidUntilMs={10000} nowMs={12000}><p>Fight scene</p></FightModal>);
    expect(screen.getByRole('timer')).toHaveTextContent('0');
  });
});
