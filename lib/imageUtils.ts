import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { GeneratedImage } from '@/types/novelai';

/** Extract all PNG blobs from a NovelAI response zip buffer. */
export async function extractImagesFromZip(zipBuffer: ArrayBuffer): Promise<Blob[]> {
  const zip = await JSZip.loadAsync(zipBuffer);

  const pngEntries = Object.values(zip.files)
    .filter((file) => !file.dir && file.name.endsWith('.png'))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (pngEntries.length === 0) {
    throw new Error('No images found in the response. The API may have returned an error zip.');
  }

  return Promise.all(pngEntries.map((file) => file.async('blob')));
}

/** Download a single generated image as a PNG. */
export function downloadImage(image: GeneratedImage) {
  const date = new Date(image.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  saveAs(image.blob, `novelai_${date}_${image.seed}.png`);
}

/** Bundle all session images into a zip and download it. */
export async function downloadSessionAsZip(images: GeneratedImage[]) {
  if (images.length === 0) return;

  const zip = new JSZip();

  images.forEach((image) => {
    const date = new Date(image.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    zip.file(`novelai_${date}_${image.seed}.png`, image.blob);
  });

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const sessionDate = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  saveAs(zipBlob, `novelai_session_${sessionDate}.zip`);
}
