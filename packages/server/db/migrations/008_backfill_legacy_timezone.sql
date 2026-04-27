-- One-shot data backfill for the project owner: migration 003 set
-- timezone='UTC' as the column default for all pre-existing users, and
-- findOrCreateTelegramUser never updated tz on returning users (fixed in
-- the same PR). The owner's account therefore stayed on UTC, which made
-- the daily-game day boundary land at 03:00 MSK (= UTC midnight),
-- breaking the "next day starts at" timer and re-opening period 1 on
-- sessions that crossed UTC midnight.
--
-- Idempotent: the WHERE clause makes this a no-op once applied (or if
-- the row was already corrected manually via SQL).
update users
   set timezone = 'Europe/Moscow'
 where timezone = 'UTC'
   and id = (select user_id
               from auth_providers
              where provider = 'telegram'
                and provider_uid = '432014500');
