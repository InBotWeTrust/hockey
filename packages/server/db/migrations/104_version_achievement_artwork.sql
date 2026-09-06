update achievements
   set photo_url = split_part(photo_url, '?', 1) || '?v=20260906-hd1',
       updated_at = now()
 where split_part(photo_url, '?', 1) like '/achievements/%.webp';
