export const commonRouteModules = {
  sections: () => import('../screens/SectionsScreen.js'),
  bar: () => import('../bar/BarScreen.js'),
  profile: () => import('../screens/ProfileScreen.js'),
  bonusGames: () => import('../screens/BonusGamesScreen.js'),
  inventory: () => import('../screens/InventoryScreen.js'),
  chatList: () => import('../chat/screens/ChatListScreen.js'),
};
