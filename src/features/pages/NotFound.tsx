import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui/Layout';
import { t } from '@/i18n/en';

/** Shown for an unknown address or an item that no longer exists. */
export function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title={t.notFound.title}
      body={t.notFound.body}
      action={
        <Link to="/" className="inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent">
          {t.notFound.home}
        </Link>
      }
    />
  );
}
