import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('renders the game title', () => {
    render(<App />);
    expect(screen.getByText('Ultimate Hockey')).toBeInTheDocument();
  });

  it('renders a placeholder call to action', () => {
    render(<App />);
    expect(screen.getByText(/скоро в бою/i)).toBeInTheDocument();
  });
});
