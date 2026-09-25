import { useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, kept up to date. False before the page
 *  is in a browser (the static export's first render). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Where the layout becomes one screen with a bottom bar: the `phone`
 *  variant in app/globals.css (narrow screens, and short touch screens). */
export const PHONE_QUERY = '(max-width: 767.98px) or ((max-height: 500px) and (pointer: coarse))';
