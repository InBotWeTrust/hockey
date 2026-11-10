import {useEffect,useRef} from 'react';
import {studioMapManifest} from './studioMapManifest.js';
import {useCityAccident} from './useCityAccident.js';
type Options={traffic:boolean;accident:boolean;plane:boolean;grigory:boolean;preview:boolean};
type Motion={update:(options:Options)=>void;dispose:()=>void};
type Scene={environment:{time:string};assets:Array<{src:string}>};
type Runtime={mountCityMotion:(input:{world:HTMLElement;getState:()=>Scene;image:(src:string)=>Promise<HTMLImageElement>})=>Motion};
let resources:Promise<{runtime:Runtime;scene:Scene}>|undefined;
const images=new Map<string,Promise<HTMLImageElement>>();
export function loadMotionImage(src:string):Promise<HTMLImageElement>{
 const cached=images.get(src);if(cached)return cached;
 const image=new Image();image.decoding='async';image.src=src;
 const pending=image.decode().then(()=>image).catch(error=>{images.delete(src);throw error;});
 images.set(src,pending);return pending;
}
function loadResources(){
 if(!resources)resources=Promise.all([
  import(/* @vite-ignore */ new URL(studioMapManifest.motionUrl, window.location.origin).href) as Promise<Runtime>,
  fetch(studioMapManifest.sceneUrl).then(response=>{if(!response.ok)throw Error('Map motion unavailable');return response.json() as Promise<Scene>;})
 ]).then(([runtime,scene])=>({runtime,scene})).catch(error=>{resources=undefined;throw error;});
 return resources;
}
export function StudioCityMotion({phase,owner,preview=false,accidentPreview=false,flood=false}:{phase:string;owner?:string|undefined;preview?:boolean;accidentPreview?:boolean;flood?:boolean}){
 const host=useRef<HTMLSpanElement>(null),motion=useRef<Motion>();
 const incident=useCityAccident(owner,false,accidentPreview);
 const live=useRef({phase,options:{traffic:true,accident:Boolean(incident),plane:true,grigory:flood,preview}});
 live.current={phase,options:{traffic:true,accident:Boolean(incident),plane:true,grigory:flood,preview}};
 useEffect(()=>{
  let disposed=false;
  void loadResources().then(({runtime,scene})=>{
   const world=host.current?.parentElement;if(disposed||!world)return;
   motion.current=runtime.mountCityMotion({world,getState:()=>({...scene,environment:{time:live.current.phase}}),image:loadMotionImage});
   motion.current.update(live.current.options);
  }).catch(()=>{/* Static map and navigation remain usable; retry on the next visit. */});
  return()=>{disposed=true;motion.current?.dispose();motion.current=undefined;};
 },[]);
 useEffect(()=>{motion.current?.update(live.current.options);},[phase,incident,flood,preview]);
 return <span ref={host} data-testid="studio-city-motion" data-phase={phase} hidden/>;
}
