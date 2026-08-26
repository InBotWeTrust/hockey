update bonus_game
   set preview_artwork_url = '/bonus-games/location-cards/'
         || regexp_replace(slug, '^(speed|accuracy)-', '')
         || '.webp',
       preview_revision = preview_revision + 1,
       revision = revision + 1,
       updated_at = now()
 where id between '00000000-0000-4000-8000-000000000601'
              and '00000000-0000-4000-8000-000000000620'
   and skill_code in ('speed', 'accuracy')
   and sort_order between 1 and 10
   and preview_artwork_url in (
     '/bonus-games/previews/'
       || regexp_replace(slug, '^(speed|accuracy)-', '')
       || '.webp',
     '/bonus-games/location-cards/'
       || regexp_replace(slug, '^(speed|accuracy)-', '')
       || '.webp'
   );
