interface WetPoint{x:number;y:number;width:number;time:number;angle:number;breakBefore:boolean}
/** Screen-space wet film, fading independently of snow and gameplay progress. */
export class MachineWaterTrail{
 private points:WetPoint[]=[];
 add(x:number,y:number,width:number,time:number,angle:number){
  const previous=this.points.at(-1);
  if(previous&&Math.hypot(x-previous.x,y-previous.y)<2.5)return;
  const turn=previous?Math.abs(Math.atan2(Math.sin(angle-previous.angle),Math.cos(angle-previous.angle))):0;
  this.points.push({x,y,width,time,angle,breakBefore:!!previous&&(Math.hypot(x-previous.x,y-previous.y)>width*2||turn>1.5)});
  this.points=this.points.filter(p=>time-p.time<10000).slice(-512);
 }
 draw(ctx:CanvasRenderingContext2D,time:number){
  ctx.save();ctx.lineCap='butt';ctx.lineJoin='round';
  for(let i=1;i<this.points.length;i++){
   const a=this.points[i-1]!,b=this.points[i]!;
   const fade=Math.max(0,1-(time-a.time)/10000);
   if(b.breakBefore||fade===0)continue;
   const width=(a.width+b.width)/2;
   ctx.strokeStyle=`rgba(98,167,196,${fade*.085})`;ctx.lineWidth=width;
   ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
   ctx.strokeStyle=`rgba(225,247,255,${fade*.1})`;ctx.lineWidth=width*.72;ctx.stroke();
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;
   const ox=-dy/len*width*.27,oy=dx/len*width*.27;
   ctx.strokeStyle=`rgba(245,253,255,${fade*.2})`;ctx.lineWidth=.8;
   ctx.beginPath();ctx.moveTo(a.x+ox,a.y+oy);ctx.lineTo(b.x+ox,b.y+oy);ctx.stroke();
  }
  ctx.restore();
 }
}
