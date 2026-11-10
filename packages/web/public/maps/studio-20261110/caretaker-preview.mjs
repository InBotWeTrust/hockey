// Local anchors measured on the separate rink artwork, not the old combined yard.
export function caretakerPlacement(yard){
 const separate=yard.asset==='boxes-20261108-rink';
 const feet={x:(yard.x+yard.w*(separate?.75:.72))*30,y:(yard.y+yard.h*(separate?.45:.77))*10};
 const bodyHeight=yard.w*30*(separate?.09:.075),scale=bodyHeight/240;
 const crop={x:1840,y:260,w:332,h:300};
 const sourceFeet={x:1997,y:527},sourceNozzle={x:2052,y:424},sourceEnd={x:2150,y:535};
 const project=p=>({x:feet.x+(sourceFeet.x-p.x)*scale,y:feet.y+(p.y-sourceFeet.y)*scale});
 return {feet,bodyHeight,crop,scale,width:crop.w*scale,height:crop.h*scale,x:feet.x-(crop.x+crop.w-sourceFeet.x)*scale,y:feet.y-(sourceFeet.y-crop.y)*scale,mirror:true,spray:{start:project(sourceNozzle),end:project(sourceEnd)}};
}
