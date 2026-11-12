import type { ApartmentDesign, ApartmentImageLayer } from './apartmentTypes.js';

type Page = 'profile' | 'rewards' | 'friends' | 'settings' | 'story';
export function ApartmentObjects({
  design,
  camera,
  active,
  onOpen,
}: {
  design: ApartmentDesign;
  camera: number;
  active: Page | null;
  onOpen: (page: Page, trigger?: HTMLElement | SVGElement) => void;
}): JSX.Element {
  const item = (id: string) =>
    design.layers.find((l): l is ApartmentImageLayer => l.kind === 'image' && l.id === id)!;
  const desk = item('desk');
  const top = desk.supportY ?? desk.y;
  const phone = { x: desk.x + desk.width * 0.13, y: top - 7, width: 18, height: 10 };
  const laptop = { x: desk.x + desk.width * 0.48, y: top - 28, width: 42, height: 30 };
  const targets = [
    { page: 'profile' as const, label: 'Персонаж: профиль', box: item('player') },
    { page: 'rewards' as const, label: 'Полки: награды', box: item('vitrine') },
    { page: 'story' as const, label: 'Телевизор: сюжет', box: item('tv') },
    { page: 'friends' as const, label: 'Телефон: друзья и болельщики', box: phone },
    { page: 'settings' as const, label: 'Ноутбук: настройки', box: laptop },
  ];
  return (
    <svg
      className="home-apartment__objects"
      viewBox={`${camera} -60 450 840`}
      preserveAspectRatio="xMinYMid slice"
      role="group"
      aria-label="Предметы квартиры"
    >
      <g aria-hidden="true" className="home-apartment__devices">
        <ellipse cx={phone.x + 9} cy={top + 2} rx="11" ry="1.5" fill="#43443b" opacity=".18" />
        <ellipse cx={laptop.x + 21} cy={top + 3} rx="23" ry="1.5" fill="#43443b" opacity=".16" />
        <g transform={`translate(${phone.x} ${phone.y}) rotate(-12 9 5)`}>
          <rect width="18" height="10" rx="2" fill="#4d5554" stroke="#a8aaa1" strokeWidth=".8" />
          <rect x="1.5" y="2" width="14" height="6" rx="1" fill="#b3c4be" />
          <path d="M16 4v3" stroke="#b9bcb4" strokeWidth=".7" />
        </g>
        <g transform={`translate(${laptop.x} ${laptop.y})`}>
          <rect
            x="3"
            width="35"
            height="25"
            rx="2"
            fill="#757d79"
            stroke="#c5c7bc"
            strokeWidth="1"
          />
          <rect x="5" y="2" width="31" height="20" rx="1" fill="#aabbb8" />
          <path d="M3 25h35l4 5H0z" fill="#bcc0b7" stroke="#858e87" strokeWidth=".6" />
          <path d="M14 27h13" stroke="#8f9a91" strokeWidth="1" />
        </g>
      </g>
      {targets.map(({ page, label, box }) => {
        return (
          <g
            key={page}
            data-apartment-page={page}
            data-center-x={box.x + box.width / 2}
            role="button"
            aria-label={label}
            aria-expanded={active === page}
            tabIndex={0}
            className={`home-apartment__object${active === page ? ' is-active' : ''}`}
            onClick={(e) => onOpen(page, e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen(page, e.currentTarget);
              }
            }}
          >
            <g
              className="home-apartment__pulse"
              transform={`translate(${box.x + box.width / 2} ${box.y + box.height / 2})`}
              aria-hidden="true"
            >
              <circle
                className={`home-apartment__pulse-ring${page === 'story' ? ' home-apartment__pulse-ring--screen' : ''}`}
                r="17"
                fill="none"
              />
            </g>
            <rect
              className="home-apartment__object-hit"
              x={box.x - (page === 'friends' ? 12 : 0)}
              y={box.y - (page === 'friends' ? 8 : 0)}
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
