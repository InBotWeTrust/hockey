import { useInfiniteQuery } from '@tanstack/react-query';
import { useSocial } from './SocialContext.js';
import type { SocialPage } from './api.js';
export function useSocialPage<T>(key:readonly unknown[],load:(cursor?:string)=>Promise<SocialPage<T>>) {
 const {viewerId}=useSocial();
 const query=useInfiniteQuery({queryKey:['social',viewerId,...key],initialPageParam:undefined as string|undefined,queryFn:({pageParam})=>load(pageParam),getNextPageParam:last=>last.nextCursor??undefined,enabled:Boolean(viewerId),staleTime:30000});
 return {...query,items:query.data?.pages.flatMap(p=>p.items)??[]};
}
