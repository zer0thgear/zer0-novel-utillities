'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { useChainBusy } from '@/store/chainStore';

// Mirrors novelai.net's tab title: while images are generating it cycles
// ◰◳◲◱ in front of the page name every 225 ms, and a run that finishes while
// the tab is in the background leaves "✓ <name>" until you come back to it.
const FRAMES = [...'◰◳◲◱'];
const FRAME_MS = 225;

export function TitleStatus() {
  const isLoading = useSessionStore((s) => s.isLoading);
  // A chain is still running between its steps' requests.
  const busy = useChainBusy() || isLoading;

  const name = useRef<string | null>(null);
  const visible = useRef(true);
  const wasBusy = useRef(false);
  const busyNow = useRef(busy);
  busyNow.current = busy;

  useEffect(() => {
    name.current ??= document.title;
    const base = name.current;
    if (!busy) {
      document.title = wasBusy.current && !visible.current ? `✓ ${base}` : base;
      wasBusy.current = false;
      return;
    }
    wasBusy.current = true;
    let frame = 0;
    const tick = () => {
      document.title = `${FRAMES[frame]} ${base}`;
      frame = (frame + 1) % FRAMES.length;
    };
    tick();
    const id = setInterval(tick, FRAME_MS);
    return () => clearInterval(id);
  }, [busy]);

  useEffect(() => {
    visible.current = document.visibilityState === 'visible';
    const onVisibility = () => {
      visible.current = document.visibilityState === 'visible';
      // Coming back (or leaving) clears the ✓, unless a run is in progress.
      if (!busyNow.current && name.current) document.title = name.current;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return null;
}
