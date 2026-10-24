import { useQuery } from '@tanstack/react-query';
import { useSocial } from './SocialContext.js';
import './social.css';
export function ProfileBio({userId,initialBio}:{userId:string;initialBio?:string|undefined}):JSX.Element|null {
 const {api,viewerId}=useSocial();const bio=useQuery({queryKey:['social',viewerId,'bio',userId],queryFn:()=>api.bio(userId),initialData:initialBio===undefined?undefined:{bio:initialBio},staleTime:60_000,enabled:Boolean(viewerId&&api.bio)});
 return bio.data?.bio?<p className="profile-bio">{bio.data.bio}</p>:null;
}
