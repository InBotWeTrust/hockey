import {ArrowLeft} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import './district-page-header.css';

export function DistrictPageHeader({title}:{title:string}):JSX.Element{
 const navigate=useNavigate();
 return <header className="district-page-header page-header-standard">
  <button type="button" className="icon-btn page-header-standard__back" aria-label="Назад" onClick={()=>navigate('/sections')}><ArrowLeft size={16}/></button>
  <h1 className="screen-title-on-arena page-header-standard__title">{title}</h1>
 </header>;
}
