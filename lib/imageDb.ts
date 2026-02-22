import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { GeneratedImage } from '@/types/novelai';

// What we actually store — object URLs are ephemeral and recreated on load
type StoredImage = Omit<GeneratedImage, 'url'>;

interface NovelAIDB extends DBSchema {
  images: {
    key: string;
    value: StoredImage;
    indexes: { 'by-timestamp': number };
  };
}

let dbPromise: Promise<IDBPDatabase<NovelAIDB>> | null = null;

function getDb(): Promise<IDBPDatabase<NovelAIDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NovelAIDB>('novelai-frontend', 1, {
      upgrade(db) {
        const store = db.createObjectStore('images', { keyPath: 'id' });
        store.createIndex('by-timestamp', 'timestamp');
      },
    });
  }
  return dbPromise;
}

/** Load all persisted images, recreating object URLs from stored blobs. */
export async function loadAllImages(): Promise<GeneratedImage[]> {
  const db = await getDb();
  const stored = await db.getAllFromIndex('images', 'by-timestamp');
  // Index returns oldest-first; reverse so newest appears first in the gallery
  return stored.reverse().map((s) => ({
    ...s,
    url: URL.createObjectURL(s.blob),
  }));
}

/** Persist a single image blob + metadata to IndexedDB. */
export async function persistImage(image: GeneratedImage): Promise<void> {
  const db = await getDb();
  const stored: StoredImage = {
    id: image.id,
    blob: image.blob,
    prompt: image.prompt,
    negativePrompt: image.negativePrompt,
    model: image.model,
    parameters: image.parameters,
    timestamp: image.timestamp,
    seed: image.seed,
  };
  await db.put('images', stored);
}

/** Remove one image by id. */
export async function deleteImage(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('images', id);
}

/** Wipe the entire image store. */
export async function clearImages(): Promise<void> {
  const db = await getDb();
  await db.clear('images');
}
