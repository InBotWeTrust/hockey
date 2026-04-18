import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DuelScreen } from '../screens/DuelScreen.js';
import { GoalieListScreen } from '../screens/GoalieListScreen.js';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GoalieListScreen />} />
        <Route path="/duel/:goalieId" element={<DuelScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
