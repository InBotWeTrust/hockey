import sharp from 'sharp';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const [ready,maria]=process.argv.slice(2);
if(!ready||!maria)throw new Error('Pass the approved common folder and Maria folder');
const emotions=['neutral','joy','interest','surprise','empathy','displeasure'];
const manifest=[];
for(const character of ['igor','veronika','oleg','grigory','arsenich','daria','maria']){
 const destination=join('public/bar/emotions',character);await mkdir(destination,{recursive:true});
 for(const [index,emotion] of emotions.entries()){
  const source=join(character==='maria'?maria:join(ready,character),`${String(index+1).padStart(2,'0')}-${emotion}.png`);
  const original=await readFile(source);
  const file=`${character}/${emotion}-v1.webp`;
  await sharp(original).resize({width:1024,height:1536,fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).webp({quality:88}).toFile(join('public/bar/emotions',file));
  manifest.push({character,emotion,file,sourceSha256:createHash('sha256').update(original).digest('hex')});
 }
}
await writeFile('public/bar/emotions/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`${manifest.length} approved emotions prepared; originals preserved without retouching`);
