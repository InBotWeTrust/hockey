create table referral_code (
  user_id uuid primary key references users(id) on delete cascade,
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9]{8,16}$'),
  created_at timestamptz not null default now()
);

do $$
declare
  existing_user record;
  attempt int;
begin
  for existing_user in select id, created_at from users loop
    attempt := 0;
    loop
      begin
        insert into referral_code (user_id, code, created_at)
        values (
          existing_user.id,
          upper(substr(md5(existing_user.id::text || ':' || attempt::text), 1, 16)),
          existing_user.created_at
        );
        exit;
      exception when unique_violation then
        attempt := attempt + 1;
      end;
    end loop;
  end loop;
end $$;

create table referral_relationship (
  invitee_user_id uuid primary key references users(id) on delete cascade,
  inviter_user_id uuid not null references users(id) on delete restrict,
  referral_code text not null,
  source text not null default 'manual' check (source in ('manual', 'link')),
  joined_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (inviter_user_id <> invitee_user_id)
);

create index referral_relationship_inviter_idx
  on referral_relationship (inviter_user_id, joined_at desc);
create index referral_relationship_qualified_idx
  on referral_relationship (inviter_user_id, qualified_at)
  where qualified_at is not null;

create table referral_milestone (
  id uuid primary key default gen_random_uuid(),
  qualified_referrals int not null unique check (qualified_referrals > 0),
  reward_stars int not null check (reward_stars > 0),
  sort_order int not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into referral_milestone (qualified_referrals, reward_stars, sort_order)
values
  (1, 25, 10),
  (5, 100, 20),
  (10, 150, 30),
  (15, 200, 40),
  (30, 500, 50),
  (50, 800, 60),
  (100, 2000, 70);

create table referral_reward_unlock (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null references users(id) on delete cascade,
  milestone_id uuid not null references referral_milestone(id) on delete restrict,
  qualified_referrals_snapshot int not null check (qualified_referrals_snapshot > 0),
  reward_stars_snapshot int not null check (reward_stars_snapshot > 0),
  unlocked_at timestamptz not null default now(),
  claimed_at timestamptz,
  stars_after int check (stars_after is null or stars_after >= 0),
  unique (inviter_user_id, milestone_id)
);

create index referral_reward_unlock_claimable_idx
  on referral_reward_unlock (inviter_user_id, unlocked_at)
  where claimed_at is null;

create table referral_risk_signal (
  id bigserial primary key,
  relationship_invitee_user_id uuid not null
    references referral_relationship(invitee_user_id) on delete cascade,
  signal_type text not null check (signal_type in ('ip', 'installation', 'velocity')),
  signal_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index referral_risk_signal_active_idx
  on referral_risk_signal (relationship_invitee_user_id, expires_at);

create table referral_milestone_audit (
  id bigserial primary key,
  milestone_id uuid references referral_milestone(id) on delete set null,
  admin_user_id uuid not null references users(id) on delete restrict,
  action text not null check (action in ('created', 'updated', 'archived')),
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);

alter table currency_ledger
  drop constraint if exists currency_ledger_reason_check,
  add constraint currency_ledger_reason_check
    check (reason in (
      'admin_adjustment', 'purchase', 'duel_stake_hold', 'duel_entry_fee',
      'duel_stake_refund', 'duel_stake_payout', 'duel_stake_burn', 'duel_reward',
      'inventory_purchase', 'weekly_challenge_reward', 'bonus_game_reward',
      'tournament_entry_fee', 'tournament_entry_refund', 'tournament_reward',
      'achievement_reward', 'recovery_kit_use', 'monthly_duel_rating_reward',
      'referral_reward'
    ));
