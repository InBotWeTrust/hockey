import type {CaretakerVariant,DriftState} from '@hockey/game-core';
export function animateMachineImpact(surface:HTMLElement|null,previous:DriftState,next:DriftState,
 options:{venue:'yard'|'stadium';variant:CaretakerVariant;reducedMotion:boolean}):Animation|null{
 if(options.venue!=='stadium'||options.variant!=='drift'||options.reducedMotion||
    previous.fallTicks>0||next.fallTicks<=0||!surface||typeof surface.animate!=='function')return null;
 // Same diminishing kick as Battleship's naval-airstrike-contact. Additive translation
 // preserves the rink's existing camera/zoom transform and leaves no offset afterwards.
 return surface.animate([
  {translate:'0 4px',offset:0},
  {translate:'-5px -3px',offset:.15},
  {translate:'5px 3px',offset:.3},
  {translate:'-3px -2px',offset:.5},
  {translate:'2px 1px',offset:.7},
  {translate:'-1px 0',offset:.85},
  {translate:'0 0',offset:1},
 ],{duration:400,easing:'ease-out'});
}
