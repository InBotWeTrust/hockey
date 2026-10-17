import {act,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CityTraffic,trafficChoice,trafficDelay} from './CityTraffic.js';
import {createAccident,nextAccidentAt} from './accident.js';
afterEach(()=>{localStorage.clear();vi.useRealTimers();vi.restoreAllMocks();});
it('assigns all four lanes to the agreed directions and wheel baselines',()=>{
 const choices=[0,.25,.5,.75].map(value=>trafficChoice(()=>value));
 expect(choices.map(c=>c.lane)).toEqual([0,1,2,3]);
 expect(choices.map(c=>c.leftward)).toEqual([false,false,true,true]);
 expect(choices.map(c=>c.bottom)).toEqual([19.5,17,13,8.5]);
 expect(new Set(choices.map(c=>c.duration)).size).toBeGreaterThan(1);
 expect(trafficDelay(()=>0)).toBeGreaterThanOrEqual(40_000);
 expect(trafficDelay(()=>.99)).toBeGreaterThan(90_000);
});
it('starts off-map after a quiet interval and removes completed traffic',()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(.2);
 const view=render(<CityTraffic night={false}/>);
 expect(screen.queryByTestId('city-vehicle')).toBeNull();
 act(()=>vi.advanceTimersByTime(39999));expect(screen.queryByTestId('city-vehicle')).toBeNull();
 act(()=>vi.advanceTimersByTime(50000));
 const cars=screen.getAllByTestId('city-vehicle');expect(cars.length).toBeGreaterThan(0);
 for(const car of cars)fireEvent.animationEnd(car);
 expect(screen.queryByTestId('city-vehicle')).toBeNull();
 view.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('does not spawn while the page is hidden',()=>{
 vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(.6);const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true);
 const view=render(<CityTraffic night={true}/>);
 act(()=>vi.advanceTimersByTime(20*60_000));expect(screen.queryByTestId('city-vehicle')).toBeNull();
 hidden.mockReturnValue(false);fireEvent(document,new Event('visibilitychange'));
 act(()=>vi.advanceTimersByTime(180_000));expect(screen.getAllByTestId('city-vehicle').length).toBeGreaterThan(0);
 view.unmount();
});

it('reserves both upper lanes for the accident while lower traffic continues',()=>{
 vi.useFakeTimers();const event=createAccident(1000000,()=>.5);vi.setSystemTime(event.collisionAt+1);
 const random=vi.spyOn(Math,'random').mockReturnValue(.1);
 localStorage.setItem('city-accident-v1:user',JSON.stringify({nextAt:nextAccidentAt(event),event}));
 const view=render(<CityTraffic owner="user" night={false}/>);
 act(()=>vi.advanceTimersByTime(100000));expect(screen.queryByTestId('city-vehicle')).toBeNull();expect(screen.getByTestId('city-accident')).toBeInTheDocument();
 random.mockReturnValue(.6);act(()=>vi.advanceTimersByTime(90000));
 expect(screen.getAllByTestId('city-vehicle').every(car=>parseFloat(car.style.getPropertyValue('--lane-bottom'))<=13)).toBe(true);view.unmount();
});
