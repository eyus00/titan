import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { LazyMotion, MotionConfig } from 'motion/react';
import Layout from './components/Layout';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import SetView from './pages/SetView';
import { watchAppearance } from './lib/appearance';
import './index.css';

// Split by route: the editor (with the importer) and the study modes load when they are opened.
const Editor = lazy(() => import('./pages/Editor'));
const Match = lazy(() => import('./pages/Match'));
const Flashcards = lazy(() => import('./pages/Flashcards'));

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
  // Study modes take the whole screen: no header around them.
  { path: 'set/:id/match', element: <Match /> },
  { path: 'set/:id/cards', element: <Flashcards /> },
]);

watchAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Anyone who asked their device for less motion gets fades instead of movement. */}
    <MotionConfig reducedMotion="user">
      <LazyMotion features={() => import('./lib/motion-features').then((f) => f.default)} strict>
        <Suspense fallback={null}>
          <RouterProvider router={router} />
        </Suspense>
      </LazyMotion>
    </MotionConfig>
  </StrictMode>,
);
