alter table push_delivery_log
  add column web_subscription_count int not null default 0
    check (web_subscription_count >= 0),
  add column web_sent_count int not null default 0
    check (web_sent_count >= 0),
  add column fcm_installation_count int not null default 0
    check (fcm_installation_count >= 0),
  add column fcm_sent_count int not null default 0
    check (fcm_sent_count >= 0);

-- Scheduled producers need one or more transport-neutral rows per user. Web
-- subscriptions keep their existing fan-out shape; an Android-only user gets
-- one synthetic target row without exposing the FCM token.
create view push_delivery_targets as
select ps.id,
       ps.user_id,
       ps.endpoint,
       ps.p256dh,
       ps.auth,
       ps.updated_at
  from push_subscriptions ps
union all
select api.id,
       api.user_id,
       ''::text as endpoint,
       ''::text as p256dh,
       ''::text as auth,
       api.updated_at
  from android_push_installations api
 where api.disabled_at is null
   and not exists (
     select 1 from push_subscriptions ps where ps.user_id = api.user_id
   );
