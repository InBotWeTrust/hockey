export function achievementThumbnailUrl(photoUrl: string): string {
  if (!photoUrl.startsWith('/achievements/') || photoUrl.startsWith('/achievements/thumbnails/')) {
    return photoUrl;
  }
  const queryStart = photoUrl.indexOf('?');
  const path = queryStart === -1 ? photoUrl : photoUrl.slice(0, queryStart);
  const query = queryStart === -1 ? '' : photoUrl.slice(queryStart);
  return path.replace('/achievements/', '/achievements/thumbnails/') + query;
}
