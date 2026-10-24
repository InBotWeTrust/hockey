import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ChunkLoadBoundary } from './ChunkLoadBoundary.js';
it('keeps a failed stale chunk recoverable without automatically reloading the application',()=>{
 const reload=vi.fn();const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 function Broken():JSX.Element { throw new TypeError('Failed to fetch dynamically imported module: /assets/old.js'); }
 try {
  render(<ChunkLoadBoundary reload={reload}><Broken/></ChunkLoadBoundary>);
  expect(reload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Обновить приложение'}));
  expect(reload).toHaveBeenCalledOnce();
 }finally{log.mockRestore();}
});
