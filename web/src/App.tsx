import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { AuthLockProvider, type LockSignal } from './context/AuthLock';
import { DependenciesProvider, type Dependencies } from './context/Dependencies';
import { PrefsProvider } from './context/Prefs';
import { ToastProvider } from './context/Toasts';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { AuthGate } from './components/lock/AuthGate';
import { AppShell } from './components/layout/AppShell';
import { AllImagesPage } from './pages/AllImagesPage';
import { DuplicatesPage } from './pages/DuplicatesPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { GroupPage } from './pages/GroupPage';
import { GroupsIndexPage } from './pages/GroupsIndexPage';
import { LibraryPage } from './pages/LibraryPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReviewPage } from './pages/ReviewPage';
import { SavedPage } from './pages/SavedPage';
import { TagsPage } from './pages/TagsPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';

interface AppProvidersProps {
  dependencies: Dependencies;
  queryClient: QueryClient;
  lockSignal: LockSignal;
  children: ReactNode;
}

/** All app-wide context. The router is supplied by the caller (BrowserRouter in prod, MemoryRouter in tests). */
export function AppProviders({ dependencies, queryClient, lockSignal, children }: AppProvidersProps) {
  return (
    <ErrorBoundary>
      <DependenciesProvider value={dependencies}>
        <QueryClientProvider client={queryClient}>
          <AuthLockProvider lockSignal={lockSignal}>
            <PrefsProvider>
              <ToastProvider>
                <MotionConfig reducedMotion="user">{children}</MotionConfig>
              </ToastProvider>
            </PrefsProvider>
          </AuthLockProvider>
        </QueryClientProvider>
      </DependenciesProvider>
    </ErrorBoundary>
  );
}

export function AppRoutes() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LibraryPage />} />
          <Route path="illustrators" element={<GroupsIndexPage key="illustrators" kind="illustrator" />} />
          <Route path="illustrators/:id" element={<GroupPage key="illustrator" kind="illustrator" />} />
          <Route path="collections" element={<GroupsIndexPage key="collections" kind="collection" />} />
          <Route path="collections/:id" element={<GroupPage key="collection" kind="collection" />} />
          <Route path="favorites" element={<FavoritesPage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="all" element={<AllImagesPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="duplicates" element={<DuplicatesPage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
