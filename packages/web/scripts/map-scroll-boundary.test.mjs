import {test} from 'vitest';import assert from 'node:assert/strict';import fs from 'node:fs';
test('map viewport prevents horizontal rubber banding and scroll chaining',()=>{const css=fs.readFileSync(new URL('../src/city/city-map.css',import.meta.url),'utf8');assert.match(css,/\.district-viewport\{[^}]*overscroll-behavior-x:none/)});
