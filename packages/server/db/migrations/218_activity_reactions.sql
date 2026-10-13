create table social_activity_reaction (
 activity_id uuid not null references social_activity(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade,
 emoji text not null,
 primary key(activity_id,user_id)
);
