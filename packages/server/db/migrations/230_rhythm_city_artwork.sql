-- Attach final city artwork to stable Rhythm level ids. Existing attempt snapshots stay intact.
create temporary table rhythm_city_artwork_seed(sort_order integer,slug text,title text,story text) on commit drop;
insert into rhythm_city_artwork_seed values
  (1,'raleigh','Роли','В центре Роли стоит Капитолий Северной Каролины с колоннами и небольшим куполом. Здесь начинается твой тур на ритм. Собери первые серии и набери нужный счёт за три минуты.'),
  (2,'columbus','Коламбус','Капитолий Огайо в Коламбусе можно узнать по широкой колоннаде и круглой башне над крышей. На льду успевай забивать следующий гол за два проката и набери нужный счёт.'),
  (3,'buffalo','Баффало','Над площадью Ниагара в Баффало возвышается ратуша со ступенчатой башней в стиле ар-деко. На этой арене в счёт идут серии от трёх голов. Успей набрать нужное число шайб до сирены.'),
  (4,'miami','Майами','На Оушен-Драйв в Майами-Бич стоят дома в пастельных тонах, а вдоль улицы растут пальмы. Здесь тебя ждёт лёд на фоне заката. Собирай серии от трёх голов и выполни цель за три минуты.'),
  (5,'ottawa','Оттава','Башня Мира поднимается над зданиями Парламентского холма в Оттаве. Перед тобой заснеженная площадка с видом на её часы. В счёт идут серии от четырёх голов. Успей выполнить цель за три минуты.'),
  (6,'tampa','Тампа','Серебристые минареты Плант-Холла в Тампе видны над пальмами. В сумерках вокруг площадки загораются огни. Набери нужный счёт сериями от четырёх голов, пока не закончились три минуты.'),
  (7,'st-louis','Сент-Луис','Над Сент-Луисом поднимается стальная арка. На местном льду держи серии от пяти голов. Более короткие серии очков не принесут.'),
  (8,'saint-paul','Сент-Пол','Белый купол Капитолия Миннесоты возвышается над зимним Сент-Полом. Снег лежит на деревьях и вдоль бортов. Собери серии от пяти голов и успей выполнить норматив за три минуты.'),
  (9,'anaheim','Анахайм','Анахайм находится в Южной Калифорнии. За площадкой стоят пальмы и светлое здание с арочным входом и черепичными башенками. Чтобы пополнить счёт, собери серию хотя бы из шести голов.'),
  (10,'san-jose','Сан-Хосе','У городской ратуши Сан-Хосе есть круглый стеклянный зал, а рядом поднимается современная башня. Здесь последний этап тура. Набери нужный счёт сериями от семи голов до конца трёхминутного отсчёта.');
insert into arena_theme(id,slug,title,artwork_url,thumbnail_url,status,is_selectable)
select ('00000000-0000-4000-8000-'||lpad((1200+sort_order)::text,12,'0'))::uuid,
 'rhythm-city-'||slug,title,'/bonus-games/nhl-cities/arenas/'||slug||'.webp',
 '/bonus-games/nhl-cities/previews/'||slug||'.webp','active',false
from rhythm_city_artwork_seed;
update bonus_game game
set slug='rhythm-'||seed.slug,title=seed.title,description='Города Северной Америки · Ритм',
    arena_theme_id=('00000000-0000-4000-8000-'||lpad((1200+seed.sort_order)::text,12,'0'))::uuid,
    preview_title=seed.title,preview_story=seed.story,
    preview_artwork_url='/bonus-games/nhl-cities/previews/'||seed.slug||'.webp',
    goalkeeper_ready_url='/bonus-games/nhl-cities/goalkeepers/'||seed.slug||'-ready.webp',
    goalkeeper_save_url='/bonus-games/nhl-cities/goalkeepers/'||seed.slug||'-save.webp',
    preview_revision=game.preview_revision+1,revision=game.revision+1,updated_at=now()
from rhythm_city_artwork_seed seed
where game.skill_code='rhythm' and game.sort_order=seed.sort_order and game.status='active';
