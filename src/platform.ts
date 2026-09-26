export type SaveResult = {
  saved: boolean
  filePath: string | null
  downloaded?: boolean
}

function downloadBlob(blob: Blob, extension: string): SaveResult {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `vynt-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Leave time for the browser to consume the URL, especially on mobile.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  // Browsers cannot tell us whether the user ultimately saved the download.
  return { saved: true, filePath: null, downloaded: true }
}

export async function savePhoto(dataUrl: string): Promise<SaveResult> {
  if (window.vynt) return window.vynt.savePhoto(dataUrl)
  const base64 = dataUrl.split(',')[1]
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
  return downloadBlob(new Blob([bytes], { type: 'image/png' }), 'png')
}

export async function saveVideo(blob: Blob): Promise<SaveResult> {
  const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm'
  if (window.vynt) return window.vynt.saveVideo(await blob.arrayBuffer(), extension)
  return downloadBlob(blob, extension)
}

export function mediaError(error: unknown, device: 'camera' | 'microphone'): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return `${device === 'camera' ? 'Camera' : 'Microphone'} access was denied. Allow it in browser/site or system privacy settings, then try again.`
    }
    if (error.name === 'NotFoundError') return `No ${device} was found. Connect one and try again.`
    if (error.name === 'NotReadableError') return `The ${device} is busy or unavailable. Close other apps using it and try again.`
  }
  return `Could not start the ${device}. Check its permissions and try again.`
}
