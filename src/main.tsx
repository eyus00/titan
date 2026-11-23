import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import SetView from './pages/SetView';
import { watchAppearance } from './lib/appearance';
import './index.css';

// Split by route: the editor (with the importer) and the game load when they are opened.
const Editor = lazy(() => import('./pages/Editor'));
const Match = lazy(() => import('./pages/Match'));

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'new', element: <Editor /> },
      { path: 'set/:id', element: <SetView /> },
      { path: 'set/:id/edit', element: <Editor /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  // The game takes the whole screen: no header around it.
  { path: 'set/:id/match', element: <Match /> },
]);

watchAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <RouterProvider router={router} />
    </Suspense>
  </StrictMode>,
);
