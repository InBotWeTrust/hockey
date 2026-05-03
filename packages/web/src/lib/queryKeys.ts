export const chatKeys = {
  all: ['chat'] as const,
  list: () => [...chatKeys.all, 'list'] as const,
  messages: (chatId: string) => [...chatKeys.all, 'messages', chatId] as const,
  channelPost: (postId: string) => [...chatKeys.all, 'channel-post', postId] as const,
  channelComments: (postId: string) => [...chatKeys.all, 'channel-comments', postId] as const,
  search: (q: string) => [...chatKeys.all, 'search', q] as const,
  users: (q: string) => [...chatKeys.all, 'users', q] as const,
  unread: () => [...chatKeys.all, 'unread'] as const,
  info: (chatId: string) => [...chatKeys.all, 'info', chatId] as const,
};

export const userKeys = {
  all: ['user'] as const,
  profile: (userId: string) => [...userKeys.all, 'profile', userId] as const,
};
