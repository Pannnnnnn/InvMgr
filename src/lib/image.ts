'use client';

// Client-side image compression (PRD 7: "Implement client-side image
// compression prior to upload (capping payloads at < 1–2 MB) to ensure
// fast uploads over factory Wi-Fi or cellular networks"). The server
// (src/lib/storage.ts) enforces a 2MB hard ceiling as a backstop, but the
// point is to never hit that ceiling from a real camera photo (which can
// easily be 4-8MB straight off a phone).

const MAX_BYTES = 1.5 * 1024 * 1024; // target under the server's 2MB cap
const MAX_DIMENSION = 1600; // px, long edge — plenty for a worker/badge photo

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  const bitmap = await loadBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file; // canvas unsupported — fall back to the original file

  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) bitmap.close();

  // Step down JPEG quality until under the target size, or we hit a floor.
  let quality = 0.85;
  let blob = await canvasToBlob(canvas, quality);
  while (blob && blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.15;
    blob = await canvasToBlob(canvas, quality);
  }

  if (!blob) return file;

  const compressed = new File([blob], renameToJpg(file.name), { type: 'image/jpeg' });
  // Only use the compressed version if it actually helped.
  return compressed.size < file.size ? compressed : file;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file);
  }
  // Safari/older browser fallback
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  if (w <= maxEdge && h <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

function renameToJpg(name: string): string {
  return name.replace(/\.[^.]+$/, '') + '.jpg';
}
