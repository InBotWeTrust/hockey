import {venueSceneFor, type Level} from '../components/venueScenes.js';
import {SHOP_CATEGORY_ORDER} from '../screens/inventoryShopCategories.js';

export function readSectionTab(storageKey: string): string | null {
  try { return localStorage.getItem(`${storageKey}:selected`); } catch { return null; }
}
export function saveSectionTab(storageKey: string, selected: string): void {
  try { localStorage.setItem(`${storageKey}:selected`, selected); } catch { /* Storage is optional. */ }
}
/** Only the map entry restores tabs; explicit links inside sections always win. */
export function sectionEntryRoute(place: string, fallback: string, owner: string | undefined, level: Level, exercisesEnabled: boolean): string {
  const sceneId = place === 'profile' ? 'apartment' : place;
  const selected = readSectionTab(`section-scroll:${owner ?? 'guest'}:${sceneId}`);
  if (!selected) return fallback;
  const catalogRoutes: Record<string, [string,string]> = {
    profile: ['/profile',''], yard: ['/','?view=training&section=open'],
    stadium: ['/','?view=amateur&section=duels'], tasks: ['/achievements',''],
  };
  const route = catalogRoutes[place];
  if (route) {
    const scene = venueSceneFor(route[0],route[1],level);
    if (place === 'yard' && !exercisesEnabled && ['course','advanced'].includes(selected)) {
      return scene?.pages.find(page => page.id === 'open')?.href ?? fallback;
    }
    return scene?.pages.find(page => page.id === selected)?.href ?? fallback;
  }
  if (place === 'shop' && SHOP_CATEGORY_ORDER.some(category => category === selected)) return `/inventory?category=${selected}`;
  if (place === 'bank' && ['bank','history'].includes(selected)) return `/inventory?tab=${selected}`;
  if (place === 'bonus') {
    const allowed = level === 'beginner' ? ['speed','accuracy'] : ['speed','accuracy','marksmanship','endurance','rhythm','challenge'];
    return allowed.includes(selected) ? `/bonus-games?skill=${selected}` : '/bonus-games?skill=speed';
  }
  return fallback;
}
