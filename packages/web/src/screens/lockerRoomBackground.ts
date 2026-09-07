import type { CompetitionLevel } from './profileTypes.js';

export function lockerRoomBackgroundClass(level: CompetitionLevel | undefined): string {
  return `locker-room-bg--${level ?? 'professional'}`;
}

export function arenaBackgroundClass(level: CompetitionLevel | undefined): string {
  return `arena-bg--${level ?? 'professional'}`;
}

export function arenaVideoCubeImage(level: CompetitionLevel | undefined): string {
  if (level === 'beginner') return '/sprites/app-arena-cube-beginner.webp';
  if (level === 'amateur') return '/sprites/app-arena-cube-amateur.webp';
  return '/sprites/app-arena-cube.webp';
}

export function arenaVideoCubeClass(level: CompetitionLevel | undefined): string {
  return `arena-video-cube__plate--${level ?? 'professional'}`;
}

export function arenaCourtImage(level: CompetitionLevel | undefined): string {
  if (level === 'beginner') return '/backgrounds/arena-beginner.webp';
  if (level === 'amateur') return '/backgrounds/arena-amateur.webp';
  return '/sprites/app-arena-ice.webp';
}
