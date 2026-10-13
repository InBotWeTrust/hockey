-- Append-only cleanup history; existing attempt snapshots are unchanged.
create table bonus_beach_cleanup_event (
  id uuid primary key,
  attempt_id uuid not null references bonus_game_attempt(id),
  period_number integer not null check (period_number > 0),
  puddle_id text not null,
  tap_time double precision not null check (tap_time >= 0 and tap_time < 86400000),
  created_at timestamptz not null default now()
);
create index bonus_beach_cleanup_event_attempt_period on bonus_beach_cleanup_event(attempt_id, period_number, tap_time);

-- Only new Beach attempts receive this profile. IDs, economy and previous snapshots are preserved.
update bonus_game set challenge_environment = '{"baseModifiers":{"goalMultiplier":1,"goalieMultiplier":1,"shooterMultiplier":0.9,"puckSpeedMultiplier":0.9,"label":"Лёд тает"},"fatigue":{"slowdownStartMs":8000,"heavyStartMs":18000,"stopStartMs":30000,"stopDurationMs":4000,"recoveryDurationMs":8000,"slowMultiplier":0.85,"heavyMultiplier":0.65},"stumbleWindows":[{"startMs":25000,"durationMs":700},{"startMs":49000,"durationMs":700},{"startMs":70000,"durationMs":700},{"startMs":89000,"durationMs":700},{"startMs":106000,"durationMs":700},{"startMs":122000,"durationMs":700},{"startMs":137000,"durationMs":700}],"beach":{"version":1,"meltDurationMs":150000,"finalSpeedMultiplier":0.8333333333333333,"interactive":{"version":1,"wind":[]},"puddles":[{"id":"left","x":145,"y":325,"radiusX":58,"radiusY":45,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":0,"activeMs":3000,"fullMs":33000,"initialScale":0.25},{"id":"right","x":430,"y":205,"radiusX":50,"radiusY":38,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":5000,"activeMs":8000,"fullMs":38000,"initialScale":0.25},{"id":"upper-left","x":120,"y":165,"radiusX":43,"radiusY":32,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":10000,"activeMs":13000,"fullMs":43000,"initialScale":0.25},{"id":"middle-right","x":455,"y":355,"radiusX":48,"radiusY":36,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":15000,"activeMs":18000,"fullMs":48000,"initialScale":0.25},{"id":"center","x":290,"y":455,"radiusX":60,"radiusY":40,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":20000,"activeMs":23000,"fullMs":53000,"initialScale":0.25},{"id":"upper-center","x":280,"y":260,"radiusX":42,"radiusY":30,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":25000,"activeMs":28000,"fullMs":58000,"initialScale":0.25},{"id":"lower-left","x":105,"y":480,"radiusX":45,"radiusY":34,"deepRatio":0.5,"speedMultiplier":0.65,"warningMs":30000,"activeMs":33000,"fullMs":63000,"initialScale":0.25}]}}'::jsonb,
  preview_story = 'Забей 25 голов за 2 минуты 30 секунд, пока лёд тает. Лужи тормозят шайбу, глубокая вода её останавливает. Тапай по лужам, чтобы убрать воду: чем больше лужа, тем больше тапов нужно. Со временем вода появляется снова. Порывы ветра медленно сносят игрока, вратаря или ворота назад на секунду. Игрок устаёт, отдыхает и спотыкается на мокром льду.',
  preview_revision = preview_revision + 1, revision = revision + 1, updated_at = now()
where slug = 'challenge-beach' and skill_code = 'challenge';
