export function skiNoticeTone(state: {
  resting: boolean;
  slipping: boolean;
  recovering: boolean;
  slowdownPercent: number;
}): 'warning' | 'error' | 'slip' | 'success' {
  if (state.resting) return 'error';
  if (state.slipping) return 'slip';
  if (state.recovering) return 'success';
  return state.slowdownPercent >= 55 ? 'error' : 'warning';
}
