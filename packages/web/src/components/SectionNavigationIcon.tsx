import {
  Activity, Beer, BookOpen, CalendarDays, ClipboardList, Crosshair, Dumbbell,
  createLucideIcon, Medal, Goal, GraduationCap, HeartPulse, History, Landmark, LayoutGrid,
  Music2, Settings, Shield, Shirt, Swords, Target, TrendingUp, Trophy,
  User, Users, Zap, type LucideIcon,
} from 'lucide-react';

const HockeyStick = createLucideIcon('HockeyStick', [
  ['path', {d: 'M18 3 10 17H4l-1 4h9L21 4Z', key: 'stick'}],
  ['path', {d: 'm16.5 6 2.6 1.3M6 17l-1 4', key: 'tape'}],
]);

const IceSkate = createLucideIcon('IceSkate', [
  ['path', {d: 'M7 3h7l1 7 4 2c1.5.8 2 2 2 4v1H4v-4l3-3Z', key: 'boot'}],
  ['path', {d: 'M10 7h4m-4 3h5M6 17v4m11-4v4M3 21h15c2 0 3-1 3-3', key: 'blade'}],
]);

const NutritionJar = createLucideIcon('NutritionJar', [
  ['rect', {x: '6', y: '3', width: '12', height: '4', rx: '1', key: 'lid'}],
  ['path', {d: 'M7 7v3c-2 1-2 2-2 4v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5c0-2 0-3-2-4V7M5 13h14M5 18h14', key: 'jar'}],
]);

const icons: Record<string, LucideIcon> = {
  profile: User,
  rewards: Medal,
  friends: Users,
  settings: Settings,
  story: BookOpen,
  open: Goal,
  daily: CalendarDays,
  course: GraduationCap,
  advanced: TrendingUp,
  duels: Swords,
  tournaments: Trophy,
  tasks: ClipboardList,
  challenges: Target,
  bank: Landmark,
  history: History,
  stick: HockeyStick,
  skates: IceSkate,
  nutrition: NutritionJar,
  recovery: HeartPulse,
  bar: Beer,
  inventory: Shirt,
  speed: Zap,
  accuracy: Target,
  marksmanship: Crosshair,
  endurance: Dumbbell,
  rhythm: Music2,
  challenge: Shield,
  training: Activity,
};

const labelIds: Record<string, string> = {
  'клюшки': 'stick',
  'коньки': 'skates',
  'питание': 'nutrition',
  'восстановление': 'recovery',
  'история': 'history',
  'тренировка': 'training',
};

export function SectionNavigationIcon({id, label}: {id: string; label: string}) {
  const Icon = icons[id] ?? icons[labelIds[label.toLowerCase()] ?? ''] ?? LayoutGrid;
  return <span className="section-scene__icon" aria-hidden="true"><Icon size={24} strokeWidth={1.5}/></span>;
}
