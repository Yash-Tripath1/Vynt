/// <reference types="vite/client" />

interface Window {
  vynt: {
    savePhoto: (
      dataUrl: string
    ) => Promise<{
      saved: boolean
      filePath: string | null
    }>

    saveVideo: (
      videoData: ArrayBuffer
    ) => Promise<{
      saved: boolean
      filePath: string | null
    }>
  }
}