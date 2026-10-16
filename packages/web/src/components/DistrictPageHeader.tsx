import {ArrowLeft} from 'lucide-react';
import {useNavigate} from 'react-router-dom';

export function DistrictPageHeader({title}:{title:string}):JSX.Element{
 const navigate=useNavigate();
 return <header className="profile-settings-header">
  <button type="button" className="icon-btn icon-btn--page-back" aria-label="Назад" onClick={()=>navigate('/sections')}><ArrowLeft size={16}/></button>
  <h1 className="screen-title-on-arena">{title}</h1>
 </header>;
}
