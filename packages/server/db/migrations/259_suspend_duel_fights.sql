-- Suspend only duel fights. Bar fights and previously earned rewards are unchanged.
update game_settings set value='false'::jsonb where key='duels.fights.enabled';

-- Restore the time already spent in a fight before removing its pause.
update amateur_duel_participant
set period_paused_ms=period_paused_ms + case when period_paused_at is null then 0
      else greatest(0,floor(extract(epoch from (now()-period_paused_at))*1000)::integer) end,
    period_paused_at=null, recovery_until=null, fight_aid_until=null
where period_paused_at is not null or recovery_until is not null or fight_aid_until is not null;
update amateur_duel_match
set ends_at=ends_at+greatest(interval '0',now()-fight_paused_at), fight_paused_at=null
where fight_paused_at is not null;
update amateur_duel_fight
set status='cancelled', reason='feature_suspended', resolved_at=coalesce(resolved_at,now())
where status in ('offered','starting','fighting','sudden_death');
-- Do not replay stale fight notifications if the feature is later re-enabled.
update amateur_duel_fight_outbox set published_at=now() where published_at is null;
delete from amateur_duel_fight_presence;
