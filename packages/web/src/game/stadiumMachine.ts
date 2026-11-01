export const STADIUM_MACHINE_SPRITES={
 right:'/caretaker/machine-right-v1.png',left:'/caretaker/machine-left-v1.png',
 up:'/caretaker/machine-up-v1.png',down:'/caretaker/machine-down-v2.png',impact:'/caretaker/machine-impact-v1.png',
 impactUp:'/caretaker/machine-impact-up-v1.png',impactDown:'/caretaker/machine-impact-down-v1.png',
};
export type MachineDirection='right'|'left'|'up'|'down';
// Bounds refer to the visible machine, not transparent image padding.
const frames={
 right:{start:26,end:1515,centre:518},left:{start:26,end:1523,centre:520},
 up:{start:170,end:1400,centre:512},down:{start:88,end:1460,centre:512},
};
export function stadiumMachineFrame(angle:number,stalled=false){
 const horizontal=Math.abs(Math.cos(angle))>.707;
 const direction:MachineDirection=horizontal?(Math.cos(angle)>0?'right':'left'):(Math.sin(angle)>0?'down':'up');
 const key:keyof typeof STADIUM_MACHINE_SPRITES=stalled?(horizontal?'impact':direction==='up'?'impactUp':'impactDown'):direction;
 // Impact changes only the driver layer, never the chassis frame or its anchor.
 const bounds=frames[direction];
 const basePixelScale=159/(bounds.end-bounds.start);
 const appearanceScale=horizontal?1.1:direction==='down'?.9*.88:.9*.92;
 const pixelScale=basePixelScale*appearanceScale;
 const forward=direction==='right'||direction==='down';
 const origin=forward?bounds.end-54/basePixelScale:bounds.start+54/basePixelScale;
 return {direction,key,appearanceScale,
   pixelScale,x:horizontal?-origin*pixelScale:-bounds.centre*pixelScale,
   y:horizontal?-bounds.centre*pixelScale:-origin*pixelScale,
   flip:horizontal&&stalled&&direction==='left'};
}
// Driver-only masks in the original directional sprite coordinates. Wheels, tank
// silhouette and conditioner always come from the unchanged base machine image.
const driverMasks:Record<MachineDirection,readonly (readonly [number,number])[]>={
 right:[[220,75],[650,75],[650,620],[220,620]],
 left:[[886,75],[1320,75],[1320,620],[886,620]],
 up:[[130,330],[570,330],[570,900],[130,900]],
 down:[[425,70],[900,70],[900,460],[800,460],[800,445],[470,445],[470,420],[425,420]],
};
function driverPath(ctx:CanvasRenderingContext2D,pose:ReturnType<typeof stadiumMachineFrame>){
 const points=driverMasks[pose.direction];
 const first=points[0]!;
 ctx.moveTo(pose.x+first[0]*pose.pixelScale,pose.y+first[1]*pose.pixelScale);
 for(const [x,y] of points.slice(1))ctx.lineTo(pose.x+x*pose.pixelScale,pose.y+y*pose.pixelScale);
 ctx.closePath();
}
export function drawStadiumMachine(ctx:CanvasRenderingContext2D,images:Record<keyof typeof STADIUM_MACHINE_SPRITES,HTMLImageElement>,angle:number,stalled:boolean){
 const pose=stadiumMachineFrame(angle,stalled),base=images[pose.direction],impact=images[pose.key];
 if(!base.complete||!base.naturalWidth)return;
 const scale=pose.pixelScale,width=base.naturalWidth*scale,height=base.naturalHeight*scale;
 const showImpact=stalled&&impact.complete&&impact.naturalWidth>0;
 ctx.save();
 if(showImpact){
  ctx.beginPath();ctx.rect(pose.x,pose.y,width,height);driverPath(ctx,pose);ctx.clip('evenodd');
 }
 ctx.drawImage(base,pose.x,pose.y,width,height);
 ctx.restore();
 if(!showImpact)return;
 ctx.save();ctx.beginPath();driverPath(ctx,pose);ctx.clip();
 // Align the driver's source using stable chassis landmarks, not the bent head.
 const alignment=pose.direction==='up'?{scale:.916,x:29,y:78}
  :pose.direction==='down'?{scale:.989,x:6,y:15}:{scale:.98,x:22,y:9};
 if(pose.direction==='left'){
  ctx.translate(pose.x+base.naturalWidth*scale,pose.y);ctx.scale(-1,1);
  ctx.drawImage(impact,alignment.x*scale,alignment.y*scale,
   impact.naturalWidth*alignment.scale*scale,impact.naturalHeight*alignment.scale*scale);
 }else ctx.drawImage(impact,pose.x+alignment.x*scale,pose.y+alignment.y*scale,
  impact.naturalWidth*alignment.scale*scale,impact.naturalHeight*alignment.scale*scale);
 ctx.restore();
}
