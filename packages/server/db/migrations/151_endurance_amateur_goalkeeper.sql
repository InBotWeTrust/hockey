-- Keep endurance on the same standard amateur goalkeeper used by the
-- perspective-court gameplay. Existing attempt snapshots stay immutable; the
-- web client applies the same visual correction to already-created attempts.

update bonus_game
   set goalkeeper_ready_url = '/sprites/test-goalie-black.webp',
       goalkeeper_save_url = '/sprites/test-goalie-black-save.webp',
       revision = revision + 1
 where skill_code = 'endurance'
   and (
     goalkeeper_ready_url is distinct from '/sprites/test-goalie-black.webp'
     or goalkeeper_save_url is distinct from '/sprites/test-goalie-black-save.webp'
   );
