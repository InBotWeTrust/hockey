export interface ProfileData {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  grip: 'right' | 'left';
  displaySource?: 'telegram' | 'vk';
  linkedProviders?: Array<'telegram' | 'vk'>;
  tgId?: string;
  username?: string;
  tgFirstName?: string | null;
  tgLastName?: string | null;
  tgAvatarUrl?: string | null;
  tgUsername?: string | null;
  vkFirstName?: string | null;
  vkLastName?: string | null;
  vkAvatarUrl?: string | null;
  vkUsername?: string | null;
}
