import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

function HomePlaceholder(): JSX.Element {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Ultimate Hockey — Training</h1>
      <p>Выбор вратарей появится в следующей задаче.</p>
      <Link to="/duel/rookie">→ Тестовый переход на бой с Новичком</Link>
    </main>
  );
}

function DuelPlaceholder(): JSX.Element {
  return <main style={{ padding: 24 }}>Duel placeholder</main>;
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePlaceholder />} />
        <Route path="/duel/:goalieId" element={<DuelPlaceholder />} />
      </Routes>
    </BrowserRouter>
  );
}
