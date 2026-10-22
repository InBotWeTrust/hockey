import {SectionLoading} from '../components/SectionLoading.js';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBarAccess, type BarAccess } from './olegFightApi.js';
import { AccessibleModal } from '../components/AccessibleModal.js';
import { X } from 'lucide-react';
import { BarReopeningCountdown } from './BarReopeningCountdown.js';
import { OlegFightPanel } from './OlegFightPanel.js';
import {useBarLighting} from './barLighting.js';
import {barStreet} from './barArtwork.js';
export function BarAccessGate({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<BarAccess | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [fightId, setFightId] = useState<string|null>(null);
  const lighting = useBarLighting('blocked', !!access?.blockedUntil && !fightId);
  const acknowledged = useRef(new Set<string>());
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false,
      pending = false,
      requested = false;
    const read = async () => {
      if (pending) {
        requested = true;
        return;
      }
      pending = true;
      try {
        const next = await fetchBarAccess();
        if (!cancelled) {
          const latest = next.fightId && acknowledged.current.has(next.fightId) ? {...next, fightId:null} : next;
          setAccess(latest);
          if (latest.fightId) setFightId(latest.fightId);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        pending = false;
        if (requested && !cancelled) {
          requested = false;
          void read();
        }
      }
    };
    void read();
    const timer = setInterval(() => void read(), 5000);
    const changed = () => void read();
    window.addEventListener('bar-access-changed', changed);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('bar-access-changed', changed);
    };
  }, [retry]);
  if (fightId)
    return <OlegFightPanel id={fightId} onDone={next=>{
      acknowledged.current.add(fightId);
      setFightId(null);setAccess(next);
      if (next.blockedUntil) navigate('/sections', {replace:true});
      else navigate('/bar', {replace:true});
    }}/>;
  if (access?.blockedUntil) {
    const leave=()=>navigate('/sections', {replace:true});
    return <AccessibleModal title="«4-й период» закрыт для тебя" ariaLabel="Бар закрыт" onClose={leave}
      cardClassName="bar-oleg-result" headerAction={<button className="icon-btn" aria-label="Закрыть" onClick={leave}><X size={18}/></button>}>
      <img src={barStreet('oleg-blocked', lighting.phase)} alt="Олег стоит у входа и не пускает в бар"/>
      <p>Олег сегодня тебя больше не пустит.</p>
      <BarReopeningCountdown until={access.blockedUntil} onExpire={()=>window.dispatchEvent(new Event('bar-access-changed'))}/>
      <div className="modal-actions"><button className="btn btn--cta" onClick={leave}>Понятно</button></div>
    </AccessibleModal>;
  }
  if (error)
    return <SectionLoading message="Не удалось проверить доступ в бар." retry={() => setRetry(n => n + 1)} />;
  if (!access)
    return <SectionLoading />;
  return <>{children}</>;
}
