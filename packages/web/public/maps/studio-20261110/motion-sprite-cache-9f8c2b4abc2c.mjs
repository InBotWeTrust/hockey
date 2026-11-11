// Prepare cropped, scaled and tinted frames once, rather than filtering full images each paint.
export function createMotionSpriteCache(createCanvas=()=>document.createElement('canvas'),limit=128){
 let sources=new WeakMap(),nextId=0;const entries=new Map();
 return {
  get(source,bbox,width,height,filter='none'){
   if(!sources.has(source))sources.set(source,++nextId);
   const w=Math.max(1,Math.ceil(width*2)),h=Math.max(1,Math.ceil(height*2));
   const key=[sources.get(source),...bbox,w,h,filter].join(':');
   if(entries.has(key)){const hit=entries.get(key);entries.delete(key);entries.set(key,hit);return hit;}
   const canvas=createCanvas();canvas.width=w;canvas.height=h;const context=canvas.getContext('2d');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.filter=filter;
   const [x,y,right,bottom]=bbox;context.drawImage(source,x,y,right-x,bottom-y,0,0,w,h);
   entries.set(key,canvas);if(entries.size>limit)entries.delete(entries.keys().next().value);return canvas;
  },
  clear(){entries.clear();sources=new WeakMap();nextId=0;}
 };
}
