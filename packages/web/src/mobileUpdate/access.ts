export function canAccessAndroidRelease(role: 'player' | 'admin' | undefined): boolean {
  return role === 'admin';
}
