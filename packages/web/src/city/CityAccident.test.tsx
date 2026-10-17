import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {CityAccident} from './CityAccident.js';
import {createAccident} from './accident.js';
it('shows damage after contact and keeps police in the remaining upper lane',()=>{
 const event=createAccident(1000,()=>.5);
 const view=render(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt}}/>);
 expect(screen.getByTestId('accident-sedan').querySelector('img')?.src).toContain('city-accident-sedan');
 expect(screen.queryByTestId('accident-police')).toBeNull();
 view.rerender(<CityAccident incident={{event,phase:'police-wait',sampledAt:event.policeArrived}}/>);
 expect(screen.getByTestId('accident-police').style.getPropertyValue('--lane-bottom')).not.toBe(screen.getByTestId('accident-sedan').style.getPropertyValue('--lane-bottom'));
 expect(screen.getByTestId('accident-police').querySelector('.city-police-beacons')).not.toBeNull();
 view.rerender(<CityAccident incident={{event,phase:'departing',sampledAt:event.departAt}}/>);
 expect(screen.getByTestId('accident-sedan')).toHaveClass('is-leftward');expect(screen.getByTestId('accident-taxi')).not.toHaveClass('is-leftward');
});
it('bounces both rear ends only at fresh contact, never when restoring an old collision',()=>{
 const event=createAccident(1000,()=>.5);
 const view=render(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt}}/>);
 expect(screen.getByTestId('accident-sedan')).toHaveClass('has-impact');
 expect(screen.getByTestId('accident-taxi')).toHaveClass('has-impact');
 expect(screen.getByTestId('accident-sedan').style.getPropertyValue('--impact-tilt')).toBe('1.5deg');
 expect(screen.getByTestId('accident-taxi').style.getPropertyValue('--impact-tilt')).toBe('-1.5deg');
 view.rerender(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt+5000}}/>);
 expect(screen.getByTestId('accident-sedan')).not.toHaveClass('has-impact');
 expect(screen.getByTestId('accident-taxi')).not.toHaveClass('has-impact');
});
it('flashes a small contact burst between the two fronts only at the impact instant',()=>{
 const event=createAccident(1000,()=>.5);
 const view=render(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt}}/>);
 const burst=screen.getByTestId('accident-contact-burst');
 expect(burst.style.left).toBe(`${event.impact+3.6}%`);expect(burst.children).toHaveLength(3);
 view.rerender(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt+1000}}/>);
 expect(screen.queryByTestId('accident-contact-burst')).toBeNull();
});
