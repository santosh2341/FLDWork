// Shrinks a phone photo before upload: longest side 1600px, JPEG. Keeps uploads small and fast on mobile data.
export async function shrinkPhoto(file: File, maxSide = 1600, quality = 0.75): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * scale)
  c.height = Math.round(bmp.height * scale)
  c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close?.()
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo.'))), 'image/jpeg', quality))
}

export const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result))
  r.onerror = () => rej(new Error('Could not read that photo.'))
  r.readAsDataURL(b)
})
