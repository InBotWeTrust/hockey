import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GOAL_OPENING, PUCK_START } from '@hockey/game-core';
import { RECORDED_RUNS } from './marksmanshipReplayData.js';
import { MarksmanshipRecordedReplay } from './MarksmanshipRecordedReplay.js';

vi.mock('../game/MarksmanshipConstructorCourt.js', () => ({
  MarksmanshipConstructorCourt: () => <div aria-label="Площадка повтора" />,
}));

describe('recorded marksmanship replay', () => {
  it('moves the slider by the editable millisecond step and clamps at zero', () => {
    render(<MarksmanshipRecordedReplay run={RECORDED_RUNS[0]!} />);
    const time = screen.getByRole('slider', { name: 'Время повтора' });
    expect(time).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(time).toHaveValue('50');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Шаг, мс' }),
      { target: { value: '125' } });
    fireEvent.click(screen.getByRole('button', { name: 'Вперёд' }));
    expect(time).toHaveValue('175');
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(time).toHaveValue('50');
  });

  it('offers play, pause, reset and only recorded goals in a jump list', () => {
    Element.prototype.scrollIntoView = vi.fn();
    render(<MarksmanshipRecordedReplay run={RECORDED_RUNS[0]!} />);
    expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Воспроизвести' }));
    expect(screen.getByRole('button', { name: 'Пауза' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: 'Время повтора' }),
      { target: { value: '1234' } });
    expect(screen.getByRole('button', { name: 'Воспроизвести' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Записанные голы' }).querySelectorAll('li')).toHaveLength(78);
    fireEvent.click(screen.getByRole('button', { name: 'Показать гол №1 на площадке' }));
    expect(screen.getByRole('slider', { name: 'Время повтора' })).toHaveValue(
      String(RECORDED_RUNS[0]!.shots[0]!.wallMs));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить повтор' }));
    expect(screen.getByRole('slider', { name: 'Время повтора' })).toHaveValue('0');
  });

  it('shows the saved result briefly after the puck reaches the goal', () => {
    const run = RECORDED_RUNS[0]!;
    const shot = run.shots[0]!;
    render(<MarksmanshipRecordedReplay run={run} />);
    const flightMs = (PUCK_START.y - GOAL_OPENING.y) / shot.input.puckSpeedPerMs!;
    fireEvent.change(screen.getByRole('slider', { name: 'Время повтора' }),
      { target: { value: String(Math.ceil(shot.wallMs + flightMs + 10)) } });
    expect(screen.getByLabelText('Результат записанного броска')).toHaveTextContent('ГОЛ');
    fireEvent.change(screen.getByRole('slider', { name: 'Время повтора' }),
      { target: { value: String(Math.ceil(shot.wallMs + flightMs + 700)) } });
    expect(screen.queryByLabelText('Результат записанного броска')).not.toBeInTheDocument();
  });
});
