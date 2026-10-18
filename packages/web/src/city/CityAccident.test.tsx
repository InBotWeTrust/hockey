import {render,screen} from '@testing-library/react';
import {expect,it} from 'vitest';
import {CityAccident} from './CityAccident.js';
import {accidentWidth,createAccident} from './accident.js';
it('shows damage after contact and keeps police in the remaining upper lane',()=>{
 const event=createAccident(1000,()=>.5);
 const view=render(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt}}/>);
 expect(screen.getByTestId('accident-sedan').querySelector('img')?.src).toContain(`city-accident-${event.vehicleA}`);
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
 expect(burst.style.left).toBe(`${event.impact+accidentWidth(event.vehicleA!)}%`);expect(burst.children).toHaveLength(3);
 view.rerender(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt+1000}}/>);
 expect(screen.queryByTestId('accident-contact-burst')).toBeNull();
});

it('keeps bus size and contact position through damage and supports legacy saved incidents',()=>{
 const event={...createAccident(1000,()=>.5),vehicleA:'bus' as const,vehicleB:'suv' as const};
 const view=render(<CityAccident incident={{event,phase:'approach',sampledAt:event.start}}/>);
 expect(screen.getByTestId('accident-sedan').style.width).toBe('7%');
 expect(screen.getByTestId('accident-sedan').querySelector('img')?.src).toContain('city-traffic-bus-');
 view.rerender(<CityAccident incident={{event,phase:'waiting',sampledAt:event.collisionAt}}/>);
 expect(screen.getByTestId('accident-sedan').querySelector('img')?.src).toContain('city-accident-bus-');
 expect(screen.getByTestId('accident-taxi').style.left).toBe(`${event.impact+7}%`);
 const {vehicleA,vehicleB,...legacy}=event;
 void vehicleA;void vehicleB;
 view.rerender(<CityAccident incident={{event:legacy,phase:'waiting',sampledAt:event.collisionAt}}/>);
 expect(screen.getByTestId('accident-sedan').querySelector('img')?.src).toContain('city-accident-sedan-');
 expect(screen.getByTestId('accident-taxi').querySelector('img')?.src).toContain('city-accident-taxi-');
});

it('flashes both crash participants only while stopped, with a clock preserved across phases',()=>{
 const event=createAccident(1000,()=>.5);
 const view=render(<CityAccident incident={{event,phase:'approach',sampledAt:event.start}}/>);
 expect(screen.getByTestId('accident-sedan')).not.toHaveClass('has-hazards');
 for(const [phase,time] of [['waiting',event.collisionAt+100],['police-approach',event.policeStart+100],['police-wait',event.policeArrived+100]] as const){
  view.rerender(<CityAccident incident={{event,phase,sampledAt:time}}/>);
  for(const id of ['sedan','taxi']){
   const car=screen.getByTestId(`accident-${id}`);
   expect(car).toHaveClass('has-hazards');
   expect(car.style.getPropertyValue('--hazard-delay')).toBe(`${-((time-event.collisionAt)%1000)/1000}s`);
  }
  const police=screen.queryByTestId('accident-police');if(police)expect(police).not.toHaveClass('has-hazards');
 }
 view.rerender(<CityAccident incident={{event,phase:'departing',sampledAt:event.departAt}}/>);
 for(const id of ['sedan','taxi'])expect(screen.getByTestId(`accident-${id}`)).not.toHaveClass('has-hazards');
});
