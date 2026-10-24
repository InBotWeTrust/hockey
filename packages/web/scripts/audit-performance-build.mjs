import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gzipSync} from 'node:zlib';

export async function auditBuild(directory) {
 const manifest=JSON.parse(await readFile(join(directory,'.vite/manifest.json'),'utf8'));
 const initial=new Set(), visited=new Set();
 function visit(key){
  if(visited.has(key))return;visited.add(key);
  const chunk=manifest[key];if(!chunk)throw new Error(`Missing manifest chunk: ${key}`);
  initial.add(chunk.file);for(const css of chunk.css??[])initial.add(css);
  for(const dependency of chunk.imports??[])visit(dependency);
 }
 const entry=Object.entries(manifest).find(([key,value])=>key==='index.html'&&value.isEntry);
 if(!entry)throw new Error('index.html entry is missing; build with vite build --manifest');
 visit(entry[0]);
 const totals={jsBytes:0,jsGzipBytes:0,cssBytes:0,cssGzipBytes:0,files:[...initial].sort()};
 for(const name of initial){
  const data=await readFile(join(directory,name));const kind=name.endsWith('.css')?'css':'js';
  totals[`${kind}Bytes`]+=data.length;totals[`${kind}GzipBytes`]+=gzipSync(data).length;
 }
 return {initial:totals,chunks:Object.keys(manifest).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const result=await auditBuild(resolve(process.argv[2]??'packages/web/dist'));
 process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
 if(process.argv.includes('--check')&&(result.initial.jsGzipBytes>220*1024||result.initial.cssGzipBytes+result.initial.jsGzipBytes>280*1024)){
  process.stderr.write('Initial bundle exceeds the approved performance budget\n');process.exitCode=1;
 }
}
