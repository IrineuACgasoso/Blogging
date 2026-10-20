import { supabase } from './supabase';

const OK = ['image/jpeg', 'image/png', 'image/webp'];

export const publicUrl = (path: string) => supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;

/** Valida, corrige a rotação, reduz (máx. 1800px) e reencoda. Reencodar também remove EXIF/GPS da foto. */
export async function prepareImage(file: File, maxSide = 1800): Promise<{ blob: Blob; width: number; height: number }> {
  if (!OK.includes(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Arquivo muito grande (máximo 15 MB).');
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale), height = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85));
  if (!blob) throw new Error('Não foi possível processar a imagem.');
  return { blob, width, height };
}

export async function uploadImage(blob: Blob, folder: 'photos' | 'posts'): Promise<{ path: string; url: string }> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw new Error(error.message);
  return { path, url: publicUrl(path) };
}
