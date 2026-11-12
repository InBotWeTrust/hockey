export function paintRoadDepth(paintSignals, paintVehicles) {
  paintSignals(false);
  paintVehicles();
  paintSignals(true);
}
