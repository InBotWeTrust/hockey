import type { ApartmentDesign, ApartmentImageLayer, ApartmentLayer } from './apartmentTypes.js';
import type { ApartmentSettingsSection } from './ApartmentSettingsContext.js';

export type ApartmentPage = 'profile' | 'rewards' | 'friends' | 'settings' | 'story';
export type ApartmentShortcut = ApartmentSettingsSection | 'appearance';
export interface ApartmentTarget {
  id: string;
  page: ApartmentPage;
  label: string;
  box: ApartmentImageLayer;
  shortcut?: ApartmentShortcut;
}
const asset = (id: string, x: number, y: number, width: number, height: number): ApartmentImageLayer => ({
  kind: 'image', id, src: `/apartment/interactive/${id}-v1.webp`, x, y, width, height,
});

export function apartmentInteractiveObjects(design: ApartmentDesign) {
  const item = (id: string) => design.layers.find((l): l is ApartmentImageLayer => l.kind === 'image' && l.id === id)!;
  const originalPlayer = item('player');
  const seat = design.layers.find(l => l.kind === 'shadow' && l.id === 'seat-contact-player');
  const seatY = seat?.kind === 'shadow' ? seat.cy : originalPlayer.y + originalPlayer.height * 0.64;
  const centerX = originalPlayer.x + originalPlayer.width / 2;
  const playerScale = 0.88;
  const player = {
    ...originalPlayer,
    x: centerX + (originalPlayer.x - centerX) * playerScale,
    y: seatY + (originalPlayer.y - seatY) * playerScale,
    width: originalPlayer.width * playerScale,
    height: originalPlayer.height * playerScale,
  };
  const baseFloorlamp = { ...item('decor-floorlamp-0'), src: '/apartment/interactive/floorlamp-base-v1.webp', x: 328, y: 257, width: 77, height: 261 };
  const desk = item('desk');
  const top = desk.supportY ?? desk.y;
  const coffee = item('coffee-table');
  const phone = asset('phone', desk.x + desk.width * 0.27, top - 36, 27, 43);
  const laptop = asset('laptop', desk.x + desk.width * 0.53, top - 39, 76, 53);
  const mirror = { ...asset('mirror', 44.5, 195, 24, 72), src: '/apartment/interactive/mirror-v2.webp' };
  const catalogue = asset('catalogue', coffee.x + coffee.width * 0.27, coffee.y + 12, 69, 26);
  const originalLamp = design.id === 'base' ? asset('lamp', 318, 24, 64, 181) : item('pendant');
  const lamp = { ...originalLamp, x: 247 - originalLamp.width / 2 };
  const deskLamp = { ...lamp, id: 'desk-lamp', x: desk.x + desk.width / 2 - lamp.width / 2 };
  const targets: ApartmentTarget[] = [
    { id: 'profile', page: 'profile', label: 'Персонаж: профиль', box: player },
    { id: 'rewards', page: 'rewards', label: 'Полки: награды', box: item('vitrine') },
    { id: 'story', page: 'story', label: 'Телевизор: сюжет', box: item('tv') },
    { id: 'friends', page: 'friends', label: 'Телефон: друзья и болельщики', box: phone },
    { id: 'settings', page: 'settings', label: 'Ноутбук: настройки', box: laptop },
    { id: 'mirror', page: 'settings', label: 'Зеркало: имя, аватар и описание', box: mirror, shortcut: 'profile' },
    { id: 'window', page: 'settings', label: 'Окно: город и погода', box: { ...item('window'), height: item('window').height * 0.65 }, shortcut: 'city' },
    { id: 'lamp', page: 'settings', label: 'Лампа: тема приложения', box: { ...lamp, y: lamp.y + lamp.height * 0.72, height: lamp.height * 0.28 }, shortcut: 'theme' },
    { id: 'desk-lamp', page: 'settings', label: 'Светильник над столом: тема приложения', box: { ...deskLamp, y: deskLamp.y + deskLamp.height * 0.72, height: deskLamp.height * 0.28 }, shortcut: 'theme' },
    { id: 'catalogue', page: 'settings', label: 'Каталог: оформление квартиры', box: catalogue, shortcut: 'appearance' },
  ];
  const layers: ApartmentLayer[] = [];
  for (const layer of design.layers) {
    if (layer.kind === 'surface' && ['ceiling', 'wall-back', 'wall-left'].includes(layer.id)) {
      const points = layer.points.split(' ').map(point => {
        const [x, y] = point.split(',').map(Number);
        return `${x},${y !== undefined && y > 130 && y < 140 ? y - 36 : y}`;
      }).join(' ');
      layers.push({ ...layer, points });
      continue;
    }
    if (design.id === 'base' && layer.kind === 'shadow' && ['contact-decor-pillows', 'contact-decor-throw'].includes(layer.id)) continue;
    if (design.id === 'base' && layer.kind === 'image' && ['decor-pillows-0', 'decor-throw-0'].includes(layer.id)) {
      const pillow = layer.id === 'decor-pillows-0';
      const adjusted = { ...layer, y: layer.y - (pillow ? 14 : 27) };
      layers.push({ kind: 'shadow', id: pillow ? 'pillow-seat-contact' : 'throw-seat-contact',
        cx: adjusted.x + adjusted.width / 2, cy: pillow ? 410 : 407,
        rx: pillow ? 21 : 20, ry: 1.8, blur: 1.2, opacity: 0.22, decor: pillow ? 'pillows' : 'throw' }, adjusted);
      continue;
    }
    if (layer.id === 'player') { layers.push(player); continue; }
    if (layer.kind === 'shadow' && layer.id.includes('player')) {
      layers.push({ ...layer, cx: centerX + (layer.cx - centerX) * playerScale,
        cy: seatY + (layer.cy - seatY) * playerScale,
        rx: layer.rx * playerScale, ry: layer.ry * playerScale });
      continue;
    }
    if (design.id === 'base' && layer.id === 'decor-floorlamp-0') continue;
    if (layer.id === 'mounted-shadow-pendant' && layer.kind === 'image-shadow') {
      layers.push({ ...layer, x: lamp.x }, { ...layer, id: 'mounted-shadow-desk-lamp', x: deskLamp.x });
      continue;
    }
    if (layer.id === 'pendant') { layers.push(lamp, deskLamp); continue; }
    if (layer.id === 'sofa') layers.push(mirror);
    layers.push(layer);
    if (layer.id === 'desk') layers.push(phone,
      { kind: 'shadow', id: 'laptop-desk-contact', cx: laptop.x + laptop.width / 2,
        cy: top + 13, rx: 35, ry: 1.6, blur: 1.1, opacity: 0.24 }, laptop);
    if (layer.id === 'coffee-table') {
      layers.push(catalogue);
      if (design.id === 'base') layers.push({ kind: 'shadow', id: 'floorlamp-floor-contact',
        cx: 366, cy: 518, rx: 35, ry: 3, opacity: 0.17, blur: 2, decor: 'floorlamp' }, baseFloorlamp);
    }
  }
  const sofaOffset = 12;
  const shiftedLayers = layers.map(layer => {
    if (!/sofa|player|pillows|throw|pillow-seat-contact/.test(layer.id)) return layer;
    if (layer.kind === 'image' || layer.kind === 'image-shadow') return { ...layer, x: layer.x + sofaOffset };
    if (layer.kind === 'shadow') return { ...layer, cx: layer.cx + sofaOffset };
    return layer;
  });
  return {
    targets: targets.map(target => target.id === 'profile' ? { ...target, box: { ...target.box, x: target.box.x + sofaOffset } } : target),
    layers: shiftedLayers,
  };
}
