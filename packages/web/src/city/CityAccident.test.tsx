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
