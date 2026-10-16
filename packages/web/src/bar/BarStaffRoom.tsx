import {ChevronLeft} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import './bar-staff-room.css';

export function BarStaffRoom() {
  const navigate = useNavigate();
  const back = () => {
    const slot = sessionStorage.getItem('bar-staff-return-slot');
    if (slot) sessionStorage.setItem('bar-active-slot', slot);
    navigate('/bar', {replace: true});
  };
  return <main className="bar-staff-room" aria-label="Раздевалка персонала">
    <img src="/bar/city-v3/staff-room-v1.webp" alt="Раздевалка персонала: шкафчики, вешалки и скамья" draggable={false}/>
    <button className="icon-btn bar-staff-room__back" type="button" aria-label="Вернуться в бар" onClick={back}><ChevronLeft size={20} strokeWidth={1.5}/></button>
  </main>;
}
