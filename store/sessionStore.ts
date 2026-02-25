import { create } from 'zustand';
import { GeneratedImage } from '@/types/novelai';

// API key lives in localStorage so it survives a full browser close/reopen
const API_KEY_KEY = 'novelai_api_key';

interface SessionState {
  apiKey: string;
  setApiKey: (key: string) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Live preview frame shown during streaming generation (object URL or null)
  streamPreview: string | null;
  setStreamPreview: (url: string | null) => void;

  images: GeneratedImage[];
  addImages: (images: GeneratedImage[]) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;

  // The image currently displayed in the center viewer
  focusedImageId: string | null;
  setFocusedImageId: (id: string | null) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  apiKey:
    typeof window !== 'undefined' ? (localStorage.getItem(API_KEY_KEY) ?? '') : '',

  setApiKey: (key) => {
    if (typeof window !== 'undefined') {
      key ? localStorage.setItem(API_KEY_KEY, key) : localStorage.removeItem(API_KEY_KEY);
    }
    set({ apiKey: key });
  },

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  streamPreview: null,
  setStreamPreview: (url) =>
    set((state) => {
      // Revoke previous preview URL to avoid memory leaks
      if (state.streamPreview) URL.revokeObjectURL(state.streamPreview);
      return { streamPreview: url };
    }),

  images: [],

  addImages: (newImages) =>
    set((state) => ({
      images: [...newImages, ...state.images],
      // Auto-focus the newest image
      focusedImageId: newImages[0]?.id ?? state.focusedImageId,
    })),

  removeImage: (id) =>
    set((state) => {
      const target = state.images.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.url);
      const newImages = state.images.filter((img) => img.id !== id);
      // If we removed the focused image, focus the first remaining one
      const focusedImageId =
        state.focusedImageId === id ? (newImages[0]?.id ?? null) : state.focusedImageId;
      return { images: newImages, focusedImageId };
    }),

  clearImages: () =>
    set((state) => {
      state.images.forEach((img) => URL.revokeObjectURL(img.url));
      return { images: [], focusedImageId: null };
    }),

  focusedImageId: null,
  setFocusedImageId: (id) => set({ focusedImageId: id }),
}));
