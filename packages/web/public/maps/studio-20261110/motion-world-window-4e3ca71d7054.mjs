const MAX_PIXELS=6_000_000;
const positive=value=>Number.isFinite(value)&&value>0?value:0;
export function motionViewportFrame({viewportWidth,worldWidth,worldHeight,dpr=1,scrollLeft=0}) {
 const cssWidth=Math.min(positive(viewportWidth)*2,positive(worldWidth)),cssHeight=positive(worldHeight);
 if(!cssWidth||!cssHeight)return {width:1,height:1,cssWidth,cssHeight,left:0,density:1,scaleX:0,scaleY:0,translateX:0};
 const requested=Math.min(2,positive(dpr)||1,Math.sqrt(MAX_PIXELS/(cssWidth*cssHeight)));
 const width=Math.max(1,Math.floor(cssWidth*requested)),height=Math.max(1,Math.floor(cssHeight*requested)),density=width/cssWidth;
 const left=Math.max(0,Math.min(positive(worldWidth)-cssWidth,scrollLeft-positive(viewportWidth)*.5));
 return {width,height,cssWidth,cssHeight,left,density,scaleX:worldWidth/3000*density,scaleY:height/1000,translateX:-left*density};
}
export function resizeMotionViewport(canvas,context,settings) {
 const frame=motionViewportFrame(settings);
 if(canvas.width!==frame.width)canvas.width=frame.width;
 if(canvas.height!==frame.height)canvas.height=frame.height;
 const width=frame.cssWidth+'px',height=frame.cssHeight+'px';
 const left=frame.left+'px';if(canvas.style.left!==left)canvas.style.left=left;
 if(canvas.style.width!==width)canvas.style.width=width;
 if(canvas.style.height!==height)canvas.style.height=height;
 context.setTransform(frame.scaleX,0,0,frame.scaleY,frame.translateX,0);
 context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 return frame;
}
