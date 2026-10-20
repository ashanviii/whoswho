import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from './components/Layout';
import { Spinner } from './components/States';
import { About } from './pages/About';
import { Browse } from './pages/Browse';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';

// The book page pulls in Cytoscape; load it on demand.
const BookPage = lazy(() => import('./pages/BookPage'));

// GitHub Pages has no SPA fallback, so allow hash routing via env.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <Router basename={import.meta.env.VITE_ROUTER === 'hash' ? undefined : import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="browse" element={<Browse />} />
            <Route
              path="book/:id"
              element={
                <Suspense fallback={<Spinner className="py-32" label="Opening book…" />}>
                  <BookPage />
                </Suspense>
              }
            />
            <Route path="about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router>
    </TooltipProvider>
  );
}
