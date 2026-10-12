import sharp from 'sharp';
import {resolve} from 'node:path';
// Only crop and uniformly scale authored artwork; preserve its anatomy and alpha.
const source=process.argv[2];
if(!source)throw new Error('Pass the generated player pose sheet path');
const poses=[
 ['idle',0,0,360,452],['attack_head',360,0,390,452],['attack_body',730,0,356,452],
 ['block_head',0,452,360,438],['block_body',360,452,370,420],['hit',730,452,356,438],
 ['lose',0,890,360,305],['crouch',360,890,370,305],['crouch_block',730,890,356,305],
 ['crouch_attack',0,1195,410,253],
];
const prepared=[];
for(const [pose,left,top,width,height] of poses){
 const raw=await sharp(source).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 // Keep the main connected figure; neighbouring cell fingertips must not leak in.
 const seen=new Uint8Array(width*height);let largest=[];
 for(let start=0;start<seen.length;start++){
  if(seen[start]||raw.data[start*4+3]<24)continue;
  const component=[start];seen[start]=1;
  for(let q=0;q<component.length;q++){
   const n=component[q],x=n%width,y=Math.floor(n/width);
   for(const next of [x>0?n-1:-1,x<width-1?n+1:-1,y>0?n-width:-1,y<height-1?n+width:-1]){
    if(next>=0&&!seen[next]&&raw.data[next*4+3]>=24){seen[next]=1;component.push(next);}
   }
  }
  if(component.length>largest.length)largest=component;
 }
 const keep=new Uint8Array(width*height);for(const n of largest)keep[n]=1;
 for(let n=0;n<keep.length;n++)if(!keep[n])raw.data[n*4+3]=0;
 let x0=width,y0=height,x1=0,y1=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const alpha=(y*width+x)*4+3;
  if(raw.data[alpha]<24){raw.data[alpha]=0;continue;}
  x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
 }
 const body=await sharp(raw.data,{raw:raw.info}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).png().toBuffer();
 prepared.push({pose,body,width:x1-x0+1,height:y1-y0+1});
}
const scale=430/prepared[0].height;
for(const pose of prepared){
 const width=Math.round(pose.width*scale),height=Math.round(pose.height*scale);
 if(width>380||height>456)throw new Error(`Pose exceeds normalized canvas: ${pose.pose}`);
 const resized=await sharp(pose.body).resize({width}).png().toBuffer();
 const meta=await sharp(resized).metadata();
 await sharp({create:{width:384,height:512,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite([{input:resized,left:Math.round((384-width)/2),top:460-meta.height}])
  .webp({quality:92}).toFile(resolve(`public/bar/fight/player-${pose.pose}-v3.webp`));
 console.log(pose.pose,{width,height:meta.height,scale:Number(scale.toFixed(4))});
}
