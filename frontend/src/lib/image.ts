export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return 'Use a JPEG, PNG or WebP image.'
  if (file.size > MAX_IMAGE_BYTES) return `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB.`
  if (file.size < 1024) return 'This file looks too small to be a photo.'
  return null
}

/**
 * Downscales an image to fit within maxDim and re-encodes it as JPEG. In demo mode this keeps
 * browser storage small; in Phase 2 the original file is uploaded to Supabase Storage instead.
 */
export async function compressImage(file: File, maxDim = 1280, quality = 0.78): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('This image could not be read. Try a different photo.')
  })
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image processing is not supported in this browser.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { dataUrl: canvas.toDataURL('image/jpeg', quality), width, height }
}
