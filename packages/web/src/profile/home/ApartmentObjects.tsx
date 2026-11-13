import type { ApartmentDesign, ApartmentImageLayer } from './apartmentTypes.js';
import { apartmentInteractiveObjects, type ApartmentShortcut } from './apartmentInteractiveObjects.js';

type Page = 'profile' | 'rewards' | 'friends' | 'settings' | 'story';
export function ApartmentObjects({
  design,
  camera,
  active,
  onOpen,
  activeShortcut,
  onExit,
}: {
  design: ApartmentDesign;
  camera: number;
  active: Page | null;
  activeShortcut?: ApartmentShortcut | undefined;
  onExit: () => void;
  onOpen: (page: Page, trigger?: HTMLElement | SVGElement, shortcut?: ApartmentShortcut) => void;
}): JSX.Element {
  const { targets } = apartmentInteractiveObjects(design);
  const door = design.layers.find((layer): layer is ApartmentImageLayer => layer.kind === 'image' && layer.id === 'door')!;
  return (
    <svg
      className="home-apartment__objects"
      viewBox={`${camera} -60 450 840`}
      preserveAspectRatio="xMinYMid slice"
      role="group"
      aria-label="Предметы квартиры"
    >
      <g
        role="button"
        aria-label="Дверь: выйти на карту"
        tabIndex={0}
        className="home-apartment__object"
        onClick={onExit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onExit();
          }
        }}
      >
        <g className="home-apartment__pulse" transform={`translate(${door.x + door.width * 0.7} ${door.y + door.height * 0.52})`} aria-hidden="true">
          <circle className="home-apartment__pulse-ring" r={12} fill="none" />
        </g>
        <rect className="home-apartment__object-hit" x={door.x} y={door.y} width={door.width * 0.82} height={door.height} fill="transparent" />
        <title>Выйти на карту</title>
      </g>
      {targets.map(({ id, page, label, box, shortcut }) => {
        return (
          <g
            key={id}
            data-apartment-page={id}
            data-center-x={box.x + box.width / 2}
            role="button"
            aria-label={label}
            aria-expanded={active === page && (shortcut ? activeShortcut === shortcut : !activeShortcut)}
            tabIndex={0}
            className={`home-apartment__object${active === page && (shortcut ? activeShortcut === shortcut : !activeShortcut) ? ' is-active' : ''}`}
            onClick={(e) => onOpen(page, e.currentTarget, shortcut)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(page, e.currentTarget, shortcut);
              }
            }}
          >
            <g
              className="home-apartment__pulse"
              transform={`translate(${box.x + box.width / 2} ${box.y + box.height * (id === 'profile' ? 0.25 : 0.5)})`}
              aria-hidden="true"
            >
              <circle
                className="home-apartment__pulse-ring"
                r={id === 'profile' ? 14 : 12}
                fill="none"
              />
            </g>
            <rect
              className="home-apartment__object-hit"
              x={box.x - Math.max(0, (36 - box.width) / 2)}
              y={box.y - Math.max(0, (36 - box.height) / 2)}
              width={Math.max(36, box.width)}
              height={Math.max(36, box.height)}
              fill="transparent"
            />
            <title>{label}</title>
          </g>
        );
      })}
    </svg>
  );
}
