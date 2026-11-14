import { apartmentBounds, apartmentViewBox, type ApartmentDesign, type ApartmentImageLayer } from './apartmentTypes.js';
import { apartmentInteractiveObjects, type ApartmentShortcut } from './apartmentInteractiveObjects.js';

type Page = 'profile' | 'rewards' | 'friends' | 'settings' | 'story';
export function ApartmentObjects({
  design,
  active,
  onOpen,
  activeShortcut,
  onExit,
}: {
  design: ApartmentDesign;
  active: Page | null;
  activeShortcut?: ApartmentShortcut | undefined;
  onExit: () => void;
  onOpen: (page: Page, trigger?: HTMLElement | SVGElement, shortcut?: ApartmentShortcut) => void;
}): JSX.Element {
  const { targets } = apartmentInteractiveObjects(design);
  const door = design.layers.find((layer): layer is ApartmentImageLayer => layer.kind === 'image' && layer.id === 'door')!;
  const pulses = [
    { id: 'door', x: door.x + door.width * 0.7, y: door.y + door.height * 0.52, radius: 12, active: false },
    ...targets.map(({ id, page, box, shortcut }) => ({
      id, x: box.x + box.width / 2, y: box.y + box.height * (id === 'profile' ? 0.25 : 0.5),
      radius: id === 'profile' ? 14 : 12,
      active: active === page && (shortcut ? activeShortcut === shortcut : !activeShortcut),
    })),
  ];
  return (
    <>
      <svg
        className="home-apartment__objects"
        viewBox={apartmentViewBox}
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
      <div className="home-apartment__pulses" aria-hidden="true">
        {pulses.map(({ id, x, y, radius, active: highlighted }) => (
          <span
            key={id}
            data-pulse-for={id}
            className={`home-apartment__pulse${highlighted ? ' is-active' : ''}`}
            style={{
              left: `${(x - apartmentBounds.left) / apartmentBounds.width * 100}%`,
              top: `${(y - apartmentBounds.top) / apartmentBounds.height * 100}%`,
              width: `${radius * 2 / apartmentBounds.width * 100}%`,
            }}
          >
            <span className="home-apartment__pulse-ring" />
          </span>
        ))}
      </div>
    </>
  );
}
