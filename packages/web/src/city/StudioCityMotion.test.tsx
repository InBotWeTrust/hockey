import {afterEach,expect,it,vi} from 'vitest';
import {loadMotionImage} from './StudioCityMotion.js';
afterEach(()=>{vi.unstubAllGlobals();});
it('shares a single image decode between repeated visits and concurrent requests',async()=>{
 const decode=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal('Image',class {src='';decode=decode;});
 const first=loadMotionImage('/maps/studio-20261110/cache-proof.webp');
 expect(loadMotionImage('/maps/studio-20261110/cache-proof.webp')).toBe(first);
 await first;
 expect(loadMotionImage('/maps/studio-20261110/cache-proof.webp')).toBe(first);
 expect(decode).toHaveBeenCalledTimes(1);
});
it('retries an image after a failed load instead of caching failure',async()=>{
 const decode=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined);
 vi.stubGlobal('Image',class {src='';decode=decode;});
 await expect(loadMotionImage('/maps/studio-20261110/retry-proof.webp')).rejects.toThrow('offline');
 await loadMotionImage('/maps/studio-20261110/retry-proof.webp');
 expect(decode).toHaveBeenCalledTimes(2);
});
