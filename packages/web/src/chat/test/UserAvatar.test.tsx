import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar } from '../components/UserAvatar.js';

describe('UserAvatar', () => {
  it('keeps the player initial behind a loaded avatar image', () => {
    render(
      <UserAvatar avatarUrl="transparent-avatar.webp" name="Sirius" size={40} alt="Sirius" />,
    );

    expect(document.querySelector('[data-initial="S"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: 'Sirius' })).toHaveAttribute(
      'src',
      'transparent-avatar.webp',
    );
  });

  it('shows the player initial when the avatar image fails', () => {
    render(<UserAvatar avatarUrl="broken-avatar.webp" name="Sirius" size={40} alt="Sirius" />);

    fireEvent.error(screen.getByRole('img', { name: 'Sirius' }));

    expect(document.querySelector('[data-initial="S"]')).not.toBeNull();
    expect(screen.queryByRole('img', { name: 'Sirius' })).toBeNull();
  });
});

it('keeps a shared circular border within the requested avatar size', () => {
  render(<UserAvatar avatarUrl={null} name="Player" size={44} />);
  expect(document.querySelector('.user-avatar')).toHaveStyle({
    border: '1px solid var(--liquid-border)',
    boxSizing: 'border-box',
    width: '44px',
    height: '44px',
  });
});
