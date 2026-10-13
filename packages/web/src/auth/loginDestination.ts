export function loginDestination(from:unknown):string {
 if(typeof from==='string'&&from.startsWith('/profile?')) {
  const params=new URLSearchParams(from.slice(from.indexOf('?')+1));
  if(params.get('social')==='fans'&&params.get('fanId'))return from;
 }
 return '/';
}
