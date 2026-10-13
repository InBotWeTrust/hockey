import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocial } from './SocialContext.js';
import type { FeedReadStatus } from './api.js';

export function useFeedReadState(enabled=true) {
  const {api,viewerId}=useSocial();
  const client=useQueryClient();
  const key=['social',viewerId,'feed-unread'];
  const status=useQuery({queryKey:key,queryFn:()=>api.feedUnread(),enabled:Boolean(enabled&&viewerId&&api.feedUnread),refetchInterval:15000});
  const read=useMutation({mutationFn:(input:{ids:string[]}|{through:string})=>api.readFeed(input),onSuccess:(data:FeedReadStatus)=>{
    client.setQueryData(key,data);
    void client.invalidateQueries({queryKey:['social',viewerId,'activity','feed']});
  }});
  return {status,read};
}
