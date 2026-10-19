-- New bonus attempts count real board contacts; saved attempts and records retain prior rules.
update bonus_game
set qualification_rules=jsonb_set(qualification_rules,'{boardContactLimit}','3'::jsonb),
    preview_story=replace(preview_story,'за два проката','до третьего касания борта'),
    preview_revision=preview_revision+1,revision=revision+1,updated_at=now()
where skill_code='rhythm';
update amateur_duel_template
set description='В счёт идут серии от четырёх голов подряд. Промах или третье касание борта обрывает серию. После каждого гола касания считаются заново. При равенстве очков побеждают длинные серии.',updated_at=now()
where duel_kind='rhythm' and deleted_at is null;
