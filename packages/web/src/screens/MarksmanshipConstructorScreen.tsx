import { useNavigate } from 'react-router-dom';

export function MarksmanshipConstructorScreen(): JSX.Element {
  const navigate = useNavigate();
  return (
    <main>
      <button type="button" onClick={() => navigate('/profile')}>Назад</button>
      <h1>Конструктор меткости</h1>
    </main>
  );
}
