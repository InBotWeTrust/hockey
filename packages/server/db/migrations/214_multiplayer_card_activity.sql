create function social_capture_card_room() returns trigger language plpgsql as $$
declare actors uuid[]; participants jsonb;
begin
 if new.ended_at is null or new.data->'game'->>'phase' is distinct from 'ended' then return null; end if;
 if tg_op='UPDATE' and old.ended_at is not null then return null; end if;
 select array_agg(seat::uuid),jsonb_agg(jsonb_build_object('userId',seat,
   'outcome',case new.data->'game'->'status'->>(ordinality::int-1) when 'won' then 'win' else 'loss' end))
 into actors,participants from jsonb_array_elements_text(new.data->'seats') with ordinality as players(seat,ordinality);
 if cardinality(actors)<2 then return null; end if;
 perform social_record_activity('cards:room:'||new.id,'bar_cards',new.ended_at,actors,jsonb_build_object('game','Дурак','participants',participants,'provenance','server'));
 return null;
end $$;
create constraint trigger social_multiplayer_cards after insert or update on bar_card_rooms deferrable initially deferred for each row execute function social_capture_card_room();
