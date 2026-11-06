import {render} from '@testing-library/react';
import {expect,it} from 'vitest';
import {SectionNavigationIcon} from './SectionNavigationIcon.js';

it.each([['stick','hockey-stick'],['skates','ice-skate'],['nutrition','nutrition-jar'],['rewards','medal']])('uses the requested pictogram for %s',(id,icon)=>{
 const view=render(<SectionNavigationIcon id={id} label={id}/>);
 expect(view.container.querySelector('svg')).toHaveClass('lucide-'+icon);
});
