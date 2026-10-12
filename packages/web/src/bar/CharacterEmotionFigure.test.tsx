import {act,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {CharacterEmotionFigure} from './CharacterEmotionFigure.js';
afterEach(()=>{vi.unstubAllGlobals();});
it('waits for the replacement image and ignores stale loads',()=>{
 const loaders:Array<{src:string;onload:(()=>void)|null;onerror:(()=>void)|null}>=[];
 vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){loaders.push(this);}});
 const view=render(<CharacterEmotionFigure character="daria" emotion="neutral" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 view.rerender(<CharacterEmotionFigure character="daria" emotion="joy" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 expect(view.container.querySelector('img')?.getAttribute('src')).toContain('/neutral-');
 const stale=loaders.at(-1)!.onload!;
 view.rerender(<CharacterEmotionFigure character="daria" emotion="empathy" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 act(()=>stale());expect(view.container.querySelector('img')?.getAttribute('src')).toContain('/neutral-');
 act(()=>loaders.at(-1)!.onload?.());expect(view.container.querySelector('img[data-current]')?.getAttribute('src')).toContain('/empathy-');
});
it('falls back to the original composition if authored neutral fails',()=>{
 const view=render(<CharacterEmotionFigure character="maria" emotion="neutral" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 fireEvent.error(view.container.querySelector('img')!);
 expect(view.container.querySelector('img')?.getAttribute('src')).toBe('/bar/original.webp');
});
it('keeps both transparent frames available for the isolated crossfade',()=>{
 const loaders:Array<{onload:(()=>void)|null}>=[];
 vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){loaders.push(this);}});
 const view=render(<CharacterEmotionFigure character="daria" emotion="neutral" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 view.rerender(<CharacterEmotionFigure character="daria" emotion="joy" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 act(()=>loaders.at(-1)!.onload?.());
 expect(view.container.querySelector('img:not([data-current])')?.className).toBe('bar-emotion-base');
});
it('finishes the current fade before applying a newer emotion',()=>{
 vi.useFakeTimers();
 try {
  const loaders:Array<{onload:(()=>void)|null}>=[];
  vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){loaders.push(this);}});
  const props={character:'daria',fallback:'/bar/original.webp',style:{},onFallbackError:()=>{}};
  const view=render(<CharacterEmotionFigure {...props} emotion="neutral"/>);
  view.rerender(<CharacterEmotionFigure {...props} emotion="joy"/>);
  act(()=>loaders.at(-1)!.onload?.());
  view.rerender(<CharacterEmotionFigure {...props} emotion="surprise"/>);
  expect(loaders).toHaveLength(1);
  expect(view.container.querySelector('img[data-current]')?.getAttribute('src')).toContain('/joy-');
  act(()=>vi.advanceTimersByTime(720));
  expect(loaders).toHaveLength(2);
  act(()=>loaders.at(-1)!.onload?.());
  expect(view.container.querySelector('img[data-current]')?.getAttribute('src')).toContain('/surprise-');
  view.unmount();
 } finally {vi.useRealTimers();}
});
it('greets with the neutral body and only a masked smiling face',()=>{
 const loaders:Array<{src:string;onload:(()=>void)|null}>=[];
 vi.stubGlobal('Image',class{src='';onload=null;onerror=null;constructor(){loaders.push(this);}});
 const view=render(<CharacterEmotionFigure character="maria" emotion="greeting" fallback="/bar/original.webp" style={{}} onFallbackError={()=>{}}/>);
 expect(loaders[0]?.src).toBe('/bar/emotions/maria/joy-v1.webp');
 act(()=>loaders[0]?.onload?.());
 const frame=view.container.querySelector('svg[data-current]')!;
 const images=frame.querySelectorAll('image');
 expect(images[0]?.getAttribute('href')).toBe('/bar/emotions/maria/neutral-v1.webp');
 expect(images[0]?.hasAttribute('mask')).toBe(false);
 expect(images[1]?.getAttribute('href')).toBe('/bar/emotions/maria/joy-v1.webp');
 expect(images[1]?.getAttribute('mask')).toContain('url(#');
 expect(frame.querySelector('ellipse')?.getAttribute('cy')).toBe('280');
});
