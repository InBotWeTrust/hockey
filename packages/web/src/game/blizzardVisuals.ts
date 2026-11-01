import {blizzardWind,type BlizzardState} from '@hockey/game-core';
/** Same moving streak + particle visual language as renderer/BeachWind, adapted to snow. */
export function drawBlizzard(ctx:CanvasRenderingContext2D,s:BlizzardState,time:number,reduced:boolean,ventilation=false){
 const wind=blizzardWind(s);
 if(ventilation){
  // Wall grilles make the source of each indoor airflow visible.
  for(const x of [16,584]){
   const active=wind.strength>0&&(wind.x>0?x===16:x===584);
   ctx.save();ctx.translate(x,75);
   ctx.fillStyle='#384958';ctx.strokeStyle=active?'#b9e7f7':'#8b9aa7';ctx.lineWidth=1.5;
   ctx.beginPath();ctx.roundRect(-12,-24,24,48,4);ctx.fill();ctx.stroke();
   for(let y=-17;y<=17;y+=7){ctx.beginPath();ctx.moveTo(-8,y);ctx.lineTo(8,y);ctx.stroke();}
   if(active){
    ctx.fillStyle='#a9ddf5';ctx.beginPath();ctx.arc(0,-19,2,0,Math.PI*2);ctx.fill();
    for(let n=0;n<4;n++){
     const direction=x<300?1:-1;
     const reach=24+(reduced?20:((time/13+n*15)%55));
     ctx.strokeStyle=`rgba(194,231,247,${.5-n*.07})`;ctx.lineWidth=2;
     ctx.beginPath();ctx.moveTo(direction*15,-14+n*9);
     ctx.quadraticCurveTo(direction*reach, -14+n*9, direction*(reach+20),15+n*12);ctx.stroke();
    }
   }
   ctx.restore();
  }
 }
 if(wind.strength>0){
  const magnitude=Math.hypot(wind.x,wind.y)||1,dx=wind.x/magnitude,dy=wind.y/magnitude;
  for(let i=0;i<72;i++){
   const travel=reduced?.5:((time/420+i*.173)%1);
   const x=40+((i*137+travel*500*dx)%520+520)%520;
   const y=80+((i*79+travel*500*dy)%650+650)%650;
   const length=45+(i%4)*22;
   ctx.strokeStyle=ventilation?`rgba(184,215,230,${Math.min(.5,(.18+(i%3)*.07)*wind.strength)})`:`rgba(237,249,255,${Math.min(.65,(.22+(i%3)*.09)*wind.strength)})`;
   ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x-dx*length,y-dy*length);ctx.lineTo(x,y);ctx.stroke();
   if(!ventilation){ctx.fillStyle='#ecf6ff80';ctx.beginPath();ctx.arc(x-7*dx,y-7*dy,1.5+i%3,0,Math.PI*2);ctx.fill();}
  }
 }
 for(let i=0;i<s.flakes.length;i++){
  const f=s.flakes[i]!;if(f.status===0||f.status===3)continue;
  const radius=f.status===2?5:8;
  ctx.fillStyle='rgba(248,253,255,.92)';ctx.beginPath();
  if(ventilation){
   ctx.moveTo(f.x-radius,f.y+2);ctx.lineTo(f.x-2,f.y-radius*.6);
   ctx.lineTo(f.x+radius,f.y-1);ctx.lineTo(f.x+3,f.y+radius*.6);ctx.closePath();
  }else ctx.ellipse(f.x,f.y,radius+2,radius*.7,(i%4)*.4,0,Math.PI*2);
  ctx.fill();
  ctx.fillStyle='#c8dce94d';ctx.fillRect(f.x-2,f.y+3,4,2);
 }
 // The edge at which cargo is delivered is visible without covering the rink.
 if(s.flakes.some(f=>f.status===2)){
  ctx.strokeStyle='rgba(192,237,255,.55)';ctx.lineWidth=3;ctx.setLineDash([10,14]);
  ctx.strokeRect(36,85,528,650);ctx.setLineDash([]);
 }
}
