import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {expect,it} from 'vitest';
import {DistrictPageHeader} from './DistrictPageHeader.js';
it('uses the standard task header without settings page margins',()=>{
 render(<MemoryRouter><DistrictPageHeader title="Профиль"/></MemoryRouter>);
 const title=screen.getByRole('heading',{name:'Профиль'});
 expect(title.parentElement).toHaveClass('page-header-standard');
 expect(title.parentElement).not.toHaveClass('profile-settings-header');
 expect(title).toHaveClass('page-header-standard__title');
 expect(screen.getByRole('button',{name:'Назад'})).toHaveClass('page-header-standard__back');
});
