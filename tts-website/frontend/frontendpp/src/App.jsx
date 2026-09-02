// src/App.jsx
import { useCallback } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/shell/AppShell';
import HomePage from './pages/HomePage';
import ToolPage from './pages/ToolPage';
import NotFoundPage from './pages/NotFoundPage';
import useLocalStorage from './hooks/useLocalStorage';

export default function App() {
  const [favourites, setFavourites] = useLocalStorage('vf.favourites', []);

  const toggleFavourite = useCallback(
    (toolId) =>
      setFavourites((current) =>
        current.includes(toolId) ? current.filter((id) => id !== toolId) : [...current, toolId],
      ),
    [setFavourites],
  );

  return (
    <AppShell favourites={favourites}>
      <Routes>
        <Route
          path="/"
          element={<HomePage favourites={favourites} onToggleFavourite={toggleFavourite} />}
        />
        <Route
          path="/tools/:toolId"
          element={<ToolPage favourites={favourites} onToggleFavourite={toggleFavourite} />}
        />
        {/* An unknown URL renders a real 404 rather than redirecting to `/`:
            a redirect tells a crawler the bad URL is a live page. */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
