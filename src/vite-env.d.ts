/// <reference types="vite/client" />

interface Window {
  vynt?: {
    savePhoto: (dataUrl: string) => Promise<import('./platform').SaveResult>
    saveVideo: (videoData: ArrayBuffer, extension: 'webm' | 'mp4') => Promise<import('./platform').SaveResult>
  }
}
