import {test} from 'vitest';import assert from 'node:assert/strict';import fs from 'node:fs';
test('map viewport prevents horizontal rubber banding and scroll chaining',()=>{const css=fs.readFileSync('src/city/city-map.css','utf8');assert.match(css,/\.district-viewport\{[^}]*overscroll-behavior-x:none/)});
