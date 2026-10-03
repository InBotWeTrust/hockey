-- Only future catalog snapshots; preserve historical attempts and rewards.
create table bonus_cyberpunk_panel_event (
 id uuid primary key,
 attempt_id uuid not null references bonus_game_attempt(id),
 period_number integer not null check(period_number > 0),
 strip_event_id text not null,
 expected_shots integer not null check(expected_shots >= 0),
 expected_panels integer not null check(expected_panels >= 0),
 tap_time double precision not null check(tap_time >= 0),
 created_at timestamptz not null
);
create index bonus_cyberpunk_panel_attempt_idx on bonus_cyberpunk_panel_event(attempt_id,period_number,tap_time);
update bonus_game set
 challenge_environment = jsonb_set(challenge_environment,'{baseModifiers,goalieMultiplier}','1.26'::jsonb) || '{"cyberpunk":{"version":1,"seed":"","durationMs":150000},"fatigue":{"slowdownStartMs":12000,"heavyStartMs":24000,"stopStartMs":36000,"stopDurationMs":4000,"recoveryDurationMs":6000,"slowMultiplier":0.85,"heavyMultiplier":0.65}}'::jsonb,
 period_rules=jsonb_set(period_rules,'{0}',(period_rules->0)||'{"goaliePattern":"linear","goalieAmplitude":1}'::jsonb),
 preview_story='Электросеть двора перегрелась. Свет гаснет, а магнитные пластины под площадкой включаются сами по себе. До аварийного отключения осталось две с половиной минуты. Успей набрать 18 очков меткости и выбраться из двора, пока всё не погасло.',
 revision=revision+1,preview_revision=preview_revision+1,updated_at=now()
where slug='challenge-cyberpunk-yard' and skill_code='challenge';
