import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditBuild} from './audit-performance-build.mjs';
test('counts initial static imports once and leaves lazy screens out of startup bytes', async () => {
 const dir=await mkdtemp(join(tmpdir(),'uh-build-budget-'));
 try {
  await mkdir(join(dir,'.vite')); await mkdir(join(dir,'assets'));
  await writeFile(join(dir,'.vite/manifest.json'),JSON.stringify({
   'index.html':{isEntry:true,file:'assets/main.js',imports:['shared'],dynamicImports:['game'],css:['assets/main.css']},
   shared:{file:'assets/shared.js'},game:{file:'assets/game.js',imports:['shared']},
  }));
  for(const [name,content] of [['main.js','123'],['shared.js','12345'],['game.js','x'.repeat(1000)],['main.css','1234']])await writeFile(join(dir,'assets',name),content);
  const result=await auditBuild(dir);
  assert.equal(result.initial.jsBytes,8); assert.equal(result.initial.cssBytes,4);
  assert.deepEqual(result.initial.files,['assets/main.css','assets/main.js','assets/shared.js']);
 } finally {await rm(dir,{recursive:true,force:true});}
});
