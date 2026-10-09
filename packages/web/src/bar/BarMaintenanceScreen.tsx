import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './bar.css';

export function BarMaintenanceScreen(): JSX.Element {
  const navigate = useNavigate();
  return (
    <main className="screen bar-screen bar-maintenance-screen">
      <header className="bar-header">
        <button
          type="button"
          className="icon-btn"
          aria-label="Назад"
          onClick={() => navigate('/sections')}
        >
          <ChevronLeft size={22} />
        </button>
        <h1>Бар</h1>
      </header>
      <section className="bar-content bar-maintenance-copy">
        <p>
          Бар на ремонте. Готовим место для трансляций, обсуждений и быстрых мини-игр. Скоро
          откроемся.
        </p>
      </section>
    </main>
  );
}
