import {useQuery} from '@tanstack/react-query';
import {BookOpen} from 'lucide-react';
import {fetchInitialTrainingCourse} from '../api/initialTraining.js';
import {MapActionButton} from './MapActionButton.js';
import {useAuthStore} from '../auth/authStore.js';
export function MapExercises({owner,beginner,onNavigate}:{owner:string|undefined;beginner:boolean;onNavigate:(path:string)=>void}){
 const authenticated=useAuthStore(s=>s.user?.id);
 const enabled=import.meta.env.DEV||import.meta.env.VITE_TRAINING_EXERCISES_ENABLED===true;
 const query=useQuery({queryKey:['training','initial-course',owner],queryFn:fetchInitialTrainingCourse,enabled:enabled&&beginner&&!!owner&&owner===authenticated,refetchOnMount:'always'});
 const data=query.data;
 if(!beginner||!enabled||!data?.enabled||data.completed_count>=data.total_count)return null;
 return <MapActionButton label="Упражнения" note={`${data.completed_count}/${data.total_count}`} icon={<BookOpen/>} onClick={()=>onNavigate('/?view=training&section=course')}/>;
}
