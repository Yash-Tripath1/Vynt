// One source of truth for the preview, exported media and frame selector.
// Do not change the frame with CSS alone: that would stretch the canvas.
export type AspectMode = '16:9' | '4:3' | '3:4'
export const ASPECT_MODES: AspectMode[] = ['16:9', '4:3', '3:4']

const FRAME_SIZES = {
  '16:9': { preview: { width: 640, height: 360 }, capture: { width: 1280, height: 720 } },
  '4:3': { preview: { width: 640, height: 480 }, capture: { width: 1200, height: 900 } },
  '3:4': { preview: { width: 480, height: 640 }, capture: { width: 900, height: 1200 } },
} as const

export function getDimensions(aspectMode: AspectMode, quality: 'preview' | 'capture') {
  return FRAME_SIZES[aspectMode][quality]
}

export function getInitialAspectMode(): AspectMode {
  // Choose only at mount. Rotation/resizing must not reset the user's choice or
  // change the canvas dimensions while MediaRecorder is using its video track.
  return typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 760px) and (orientation: portrait)').matches
    ? '4:3'
    : '16:9'
}

export function getCameraConstraints(aspectMode: AspectMode): MediaTrackConstraints {
  const { width, height } = getDimensions(aspectMode, 'capture')
  return {
    width: { ideal: width },
    height: { ideal: height },
    aspectRatio: { ideal: width / height },
    facingMode: 'user',
  }
}
