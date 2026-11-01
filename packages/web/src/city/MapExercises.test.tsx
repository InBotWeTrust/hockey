import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,expect,it,vi} from 'vitest';
import {MapExercises} from './MapExercises.js';
const fixture=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('../api/initialTraining.js',()=>({fetchInitialTrainingCourse:fixture.fetch}));
vi.mock('../auth/authStore.js',()=>({useAuthStore:(select:(s:unknown)=>unknown)=>select({user:{id:'owner'}})}));
beforeEach(()=>{vi.resetAllMocks();fixture.fetch.mockResolvedValue({enabled:true,completed_count:0,total_count:7});});
function show(beginner=true,owner='owner'){const navigate=vi.fn();render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MapExercises owner={owner} beginner={beginner} onNavigate={navigate}/></QueryClientProvider>);return navigate;}
it('shows course progress and opens the course',async()=>{const navigate=show();expect(await screen.findByText('0/7')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'Упражнения'}));expect(navigate).toHaveBeenCalledWith('/?view=training&section=course');});
it.each([{enabled:true,completed_count:7,total_count:7},{enabled:false,completed_count:0,total_count:7}])('hides completed or disabled courses',async(data)=>{fixture.fetch.mockResolvedValue(data);show();await waitFor(()=>expect(fixture.fetch).toHaveBeenCalled());expect(screen.queryByRole('button')).toBeNull();});
it('does not request the course for amateurs or another account',()=>{show(false);show(true,'other');expect(fixture.fetch).not.toHaveBeenCalled();});
