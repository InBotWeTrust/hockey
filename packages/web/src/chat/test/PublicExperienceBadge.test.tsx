import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicExperienceBadge } from '../components/UserProfileSheet.js';

afterEach(() => { vi.restoreAllMocks(); });

it('fits the untruncated number including badge padding and icon into a small avatar', () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(48);
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('public-profile-experience__value') ? 81 : 55;
  });
  render(<div><PublicExperienceBadge experience={123456789} /></div>);
  const value = screen.getByLabelText('Опыт: 123456789').querySelector<HTMLElement>('.public-profile-experience__value')!;
  expect(parseFloat(value.style.fontSize)).toBeLessThan(8);
  expect(value).toHaveTextContent('123 456 789');
});
