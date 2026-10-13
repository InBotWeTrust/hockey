import { useQuery } from '@tanstack/react-query';
import { useSocial } from './SocialContext.js';
import './social.css';
export function ProfileBio({userId}:{userId:string}):JSX.Element|null {
 const {api,viewerId}=useSocial();const bio=useQuery({queryKey:['social',viewerId,'bio',userId],queryFn:()=>api.bio(userId),enabled:Boolean(viewerId&&api.bio)});
 return bio.data?.bio?<p className="profile-bio">{bio.data.bio}</p>:null;
}
