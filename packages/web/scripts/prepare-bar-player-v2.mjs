import sharp from 'sharp';
import {resolve} from 'node:path';
// Only crop and uniformly scale authored artwork; preserve its anatomy and alpha.
const source=process.argv[2];
if(!source)throw new Error('Pass the generated player pose sheet path');
const poses=[
 ['idle',0,0,360,442],['attack_head',360,0,370,442],['attack_body',730,0,356,442],
 ['block_head',0,442,360,420],['block_body',360,442,370,420],['hit',730,442,356,420],
 ['lose',0,862,360,298],['crouch',360,862,370,298],['crouch_block',730,862,356,298],
 ['crouch_attack',0,1160,410,288],
];
const prepared=[];
for(const [pose,left,top,width,height] of poses){
 const raw=await sharp(source).extract({left,top,width,height}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
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
  .webp({quality:92}).toFile(resolve(`public/bar/fight/player-${pose.pose}-v2.webp`));
 console.log(pose.pose,{width,height:meta.height,scale:Number(scale.toFixed(4))});
}
