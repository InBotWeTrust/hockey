do $$
declare
  target_user_id uuid;
begin
  select user_id
    into target_user_id
    from auth_providers
   where provider = 'telegram'
     and provider_uid = '151457626'
   limit 1;

  if target_user_id is null then
    raise notice 'accidental telegram user 151457626 not found';
    return;
  end if;

  delete from chats c
   using chat_members cm
   where c.id = cm.chat_id
     and c.type = 'direct'
     and cm.user_id = target_user_id;

  delete from channel_post_comments
   where author_id = target_user_id;

  delete from messages
   where sender_id = target_user_id;

  delete from chats
   where created_by = target_user_id;

  delete from payments
   where user_id = target_user_id;

  delete from feedback_messages
   where user_id = target_user_id;

  delete from users
   where id = target_user_id;

  raise notice 'deleted accidental telegram user 151457626 (%).', target_user_id;
end $$;
