import { DatabaseZap, TriangleAlert } from 'lucide-react';
import { Component, type ReactNode, Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { AppShell } from '@/components/navigation/AppShell';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/Layout';
import { ToastProvider } from '@/components/ui/Toast';
import { db } from '@/database/db';
import { DashboardScreen } from '@/features/dashboard/DashboardScreen';
import { FilesScreen } from '@/features/files/FilesScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { NotebookScreen } from '@/features/library/NotebookScreen';
import { NotFound } from '@/features/pages/NotFound';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { applyAppearance } from '@/features/settings/appearance';
import { TagsScreen } from '@/features/tags/TagsScreen';
import { TrashScreen } from '@/features/trash/TrashScreen';
import { useSettings, useSettingsLoaded } from '@/hooks/useData';
import { t } from '@/i18n/en';

// The editor is the heaviest part of the app. It loads when a page is first opened.
const PageScreen = lazy(() => import('@/features/pages/PageScreen'));
// The PDF reader brings PDF.js, loaded when a file is first opened.
const FileScreen = lazy(() => import('@/features/files/FileScreen'));

const reload = () => window.location.reload();

/** Catches a rendering error so one broken screen does not blank the whole app. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyState icon={TriangleAlert} title={t.app.crashTitle} body={t.app.crashBody} action={<Button variant="primary" onClick={reload}>{t.app.reload}</Button>} />
      </div>
    );
  }
}

/** Keeps the document's theme attributes in step with the stored settings. */
function AppearanceSync() {
  const settings = useSettings();
  const loaded = useSettingsLoaded();
  const { theme, accent, density, motion } = settings;
  useEffect(() => {
    // Until the database has answered, the cached appearance from startup stays.
    if (!loaded) return;
    const apply = () => applyAppearance({ theme, accent, density, motion });
    apply();
    if (theme !== 'system') return;
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [loaded, theme, accent, density, motion]);
  return null;
}

type DbState = 'opening' | 'ready' | 'failed';

export function App() {
  const [dbState, setDbState] = useState<DbState>('opening');

  useEffect(() => {
    db.open().then(
      () => setDbState('ready'),
      (error: unknown) => {
        console.error(error);
        setDbState('failed');
      },
    );
  }, []);

  if (dbState === 'opening') return <LoadingBlock />;
  if (dbState === 'failed') {
    return (
      <div className="mx-auto max-w-xl p-6">
        <EmptyState icon={DatabaseZap} title={t.app.storageUnavailableTitle} body={t.app.storageUnavailableBody} action={<Button variant="primary" onClick={reload}>{t.app.reload}</Button>} />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppearanceSync />
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardScreen />} />
              <Route path="library" element={<LibraryScreen />} />
              <Route path="library/folder/:folderId" element={<LibraryScreen />} />
              <Route path="notebook/:notebookId" element={<NotebookScreen />} />
              <Route
                path="page/:pageId"
                element={
                  <Suspense fallback={<LoadingBlock />}>
                    <PageScreen />
                  </Suspense>
                }
              />
              <Route path="files" element={<FilesScreen />} />
              <Route
                path="file/:fileId"
                element={
                  <Suspense fallback={<LoadingBlock />}>
                    <FileScreen />
                  </Suspense>
                }
              />
              <Route path="tags" element={<TagsScreen />} />
              <Route path="tags/:tagId" element={<TagsScreen />} />
              <Route path="trash" element={<TrashScreen />} />
              <Route path="settings" element={<SettingsScreen />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
