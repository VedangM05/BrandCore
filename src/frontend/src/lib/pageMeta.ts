import { useEffect } from 'react';

/**
 * Sets document.title and the <meta name="description"> tag for the
 * current page. Previously every route shared index.html's one static
 * title/description regardless of which page was actually open - a
 * bookmark, browser tab, or search result for /terms looked identical to
 * one for /login. No new dependency (react-helmet et al.) needed for this;
 * plain DOM writes on mount/unmount are enough for an SPA with a fixed set
 * of routes. Restores the previous value on unmount so navigating away
 * (e.g. via client-side routing) doesn't leave a stale title/description
 * behind for whatever renders next without calling this itself.
 */
export function usePageMeta(title: string, description?: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let previousDescription: string | null = null;
    let metaEl: HTMLMetaElement | null = null;
    if (description) {
      metaEl = document.querySelector('meta[name="description"]');
      if (metaEl) {
        previousDescription = metaEl.getAttribute('content');
        metaEl.setAttribute('content', description);
      }
    }

    return () => {
      document.title = previousTitle;
      if (metaEl && previousDescription !== null) {
        metaEl.setAttribute('content', previousDescription);
      }
    };
  }, [title, description]);
}
