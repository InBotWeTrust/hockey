import { expect, it } from 'vitest';
import { criticalPwaAssets } from './pwaCachePolicy.js';
it('precaches the shell, map and static dependencies, leaving secondary screens for runtime caching',()=>{
 const bundle={
  'assets/index-a.js':{type:'chunk',isEntry:true,imports:['assets/shared-a.js'],facadeModuleId:'/src/main.tsx',viteMetadata:{importedCss:new Set(['assets/index.css'])}},
  'assets/shared-a.js':{type:'chunk',imports:[]},
  'assets/map-a.js':{type:'chunk',imports:['assets/shared-a.js'],facadeModuleId:'/src/screens/SectionsScreen.tsx'},
  'assets/admin-a.js':{type:'chunk',imports:['assets/shared-a.js']},
  'assets/game-a.js':{type:'chunk',imports:['assets/shared-a.js']},
 };
 expect([...criticalPwaAssets(bundle)].sort()).toEqual(['assets/index-a.js','assets/index.css','assets/map-a.js','assets/shared-a.js']);
});
