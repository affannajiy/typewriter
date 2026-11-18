import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n/en';

/**
 * Registers the service worker (production builds only) and tells the person
 * when the app works offline and when a new version is waiting. A new version
 * is applied only when they press Reload, never in the middle of writing.
 */
// Register once, even when React runs effects twice in development.
let registered = false;

export function UpdatePrompt() {
  const toast = useToast();

  useEffect(() => {
    if (registered || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    registered = true;
    const updateSW = registerSW({
      onOfflineReady: () => toast({ message: t.app.offlineReady }),
      onNeedRefresh: () =>
        toast({
          message: t.app.updateReady,
          sticky: true,
          action: { label: t.app.updateReload, run: () => void updateSW(true) },
        }),
    });
  }, [toast]);

  return null;
}
