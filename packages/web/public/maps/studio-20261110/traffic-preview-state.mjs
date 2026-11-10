export function signalPhase(time) {
  const t = time % 25;
  return t < 12 ? 'green' : t < 15 ? 'yellow' : 'red';
}

export function createVehicles() {
 const models=['sedan-blue','bus-red','suv','taxi','compact','coupe','crossover','executive','hatchback','sedan','wagon','bus','motorcycle','snowplow'];
 return Array.from({length:20},(_,id)=>{const lane=Math.floor(id/5),index=id%5,model=models[id%models.length];return {id,model,lane,x:lane<2?112-index*25:-12+index*25,width:model.startsWith('bus')?7.5:model==='motorcycle'?2.4:model==='snowplow'?6:4.5,direction:lane<2?-1:1,speed:6.8+lane*.15};});
}

export function stepVehicles(vehicles, delta, phase, stops = { right: 65, left: 75 }) {
  const result = vehicles.map(car => ({ ...car }));
  for (let lane = 0; lane < 4; lane++) {
    const cars = result.filter(car => car.lane === lane).sort((a, b) => (b.x - a.x) * a.direction);
    let leader;
    for (const car of cars) {
      const proposed = car.x + car.speed * delta * car.direction;
      let next = proposed;
      if (phase !== 'green') {
        if (car.direction > 0 && car.x + car.width <= stops.right + .001) next = Math.min(next, stops.right - car.width);
        if (car.direction < 0 && car.x >= stops.left - .001) next = Math.max(next, stops.left);
      }
      if (leader) next = car.direction > 0
        ? Math.min(next, leader.x - car.width - 1.2)
        : Math.max(next, leader.x + leader.width + 1.2);
      car.x = next;
      leader = car;
    }
    // Re-enter behind the last car rather than wrapping into a standing queue.
    for (const car of cars) {
      if ((car.direction > 0 && car.x > 112) || (car.direction < 0 && car.x + car.width < -12)) {
        const others = cars.filter(other => other !== car);
        car.x = car.direction > 0
          ? Math.min(-12, ...others.map(other => other.x - car.width - 6))
          : Math.max(112, ...others.map(other => other.x + other.width + 6));
      }
    }
  }
  return result;
}

export const laneBaselines = [82.5, 86, 91.5, 94.8];

export function vehiclePaintOrder(actors) {
  return [...actors].sort((a, b) => a.baseline - b.baseline);
}

// Tire contact within the cropped sprite; buses include deeper shadows below it.
export function vehicleWheelAnchor(id) {
  return ({"traffic-bus": .93, "traffic-bus-red": .84})[id] ?? 1;
}
