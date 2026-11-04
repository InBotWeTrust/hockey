import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CaretakerResultModal} from './CaretakerResultModal.js';
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('switches to the next-period message when the remaining break expires in the result modal',()=>{
 vi.useFakeTimers();
 let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const close=vi.fn();
 render(<CaretakerResultModal result={{savedMs:45000,remainingMs:1000}} onClose={close}/>);
 expect(screen.getByText('45 сек')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Отлично'})).toBeInTheDocument();
 act(()=>{now=1250;vi.advanceTimersByTime(1250);});
 fireEvent.click(screen.getByRole('button',{name:'На лёд'}));
 expect(close).toHaveBeenCalledOnce();
});
