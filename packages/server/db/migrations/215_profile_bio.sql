alter table users add column if not exists bio text not null default '';
alter table users add constraint users_bio_length check (char_length(bio)<=160);
