'use client';

import { createContext, useContext } from 'react';

// On a phone the page is one screen: the image, with a bar along the bottom
// holding Prompt, Generate and History, as novelai.net's own phone layout
// does. The prompt form lives in a sheet that can be closed, but Generate
// stays on the bar, so the form puts its Generate row there.

interface PhoneLayout {
  /** The bottom bar's slot for the form's Generate row (the bar only shows
   *  on a phone); null until the bar has mounted. */
  generateSlot: HTMLElement | null;
}

export const PhoneLayoutContext = createContext<PhoneLayout>({ generateSlot: null });

export const usePhoneLayout = () => useContext(PhoneLayoutContext);
