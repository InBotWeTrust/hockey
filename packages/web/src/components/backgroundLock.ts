const locks = new WeakMap<HTMLElement, {count:number; inert:string|null; hidden:string|null}>();

/** Startup and modal layers share ownership so neither restores another layer's lock. */
export function lockBackground(element: HTMLElement): () => void {
  const state = locks.get(element) ?? {count:0,inert:element.getAttribute('inert'),hidden:element.getAttribute('aria-hidden')};
  state.count++;
  locks.set(element,state);
  element.setAttribute('inert','');
  element.setAttribute('aria-hidden','true');
  let released=false;
  return () => {
    if(released)return;
    released=true;
    if(--state.count>0)return;
    for(const [name,value] of [['inert',state.inert],['aria-hidden',state.hidden]] as const){
      if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);
    }
    locks.delete(element);
  };
}
