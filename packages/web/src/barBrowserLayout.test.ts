import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const css=readFileSync('src/bar/bar-panorama.css','utf8');
it('sizes bar pages against the app container rather than the desktop window',()=>{
 expect(css).toMatch(/container-type:\s*size/);
 expect(css).toContain('--bar-scene-page-width: min(100cqw, 47cqh)');
 expect(css).toContain('left: calc((100cqw - var(--bar-scene-page-width)) / 2)');
});
it('keeps the dock and terminal inside a narrow app on a wide browser',()=>{
 expect(css).not.toMatch(/width:\s*760px/);
 expect(css.match(/width:min\(760px,calc\(100% - 24px\)\)/g)).toHaveLength(2);
});
