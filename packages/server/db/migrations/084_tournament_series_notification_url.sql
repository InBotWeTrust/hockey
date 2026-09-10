update push_notification_templates
   set click_url = '/?view=amateur&section=tournaments',
       updated_at = now()
 where key = 'tournament.series_next_game'
   and click_url = '/?view=tournaments';
