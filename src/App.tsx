import { useEffect, useRef, useState } from 'react'
import './App.css'

type CameraStatus = 'idle' | 'starting' | 'live' | 'error'
type AspectMode = '16:9' | '4:3'
type FilterMode =
  | 'original'
  | 'vyntage'
  | 'digicam'
  | 'nightflash'
  | 'fisheye'
  | 'vhs'
  | 'goldenfilm'

type CaptureMessage = {
  tone: 'success' | 'error' | 'neutral'
  text: string
}

type RenderSettings = {
  filterMode: FilterMode
  pixelSize: number
  grain: number
  zoom: number
  aspectMode: AspectMode
  dateImprint: boolean
}

const FILTERS: Array<{
  id: FilterMode
  label: string
  shortLabel: string
}> = [
  { id: 'original', label: 'ORIGINAL', shortLabel: 'RAW' },
  { id: 'vyntage', label: 'VYNTAGE', shortLabel: 'VYNT' },
  { id: 'digicam', label: '2007 DIGICAM', shortLabel: '2007' },
  { id: 'nightflash', label: 'NIGHT FLASH', shortLabel: 'FLASH' },
  { id: 'fisheye', label: 'FISHEYE', shortLabel: 'FISH' },
  { id: 'vhs', label: 'VHS TAPE', shortLabel: 'VHS' },
  { id: 'goldenfilm', label: 'GOLDEN FILM', shortLabel: 'FILM' }
]

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value))
}

function getFilterLabel(filterMode: FilterMode): string {
  return FILTERS.find((filter) => filter.id === filterMode)?.label ?? 'ORIGINAL'
}

function getFilterShortLabel(filterMode: FilterMode): string {
  return FILTERS.find((filter) => filter.id === filterMode)?.shortLabel ?? 'RAW'
}

function getDimensions(aspectMode: AspectMode, quality: 'preview' | 'capture'): {
  width: number
  height: number
} {
  if (quality === 'preview') {
    return aspectMode === '16:9'
      ? { width: 640, height: 360 }
      : { width: 640, height: 480 }
  }

  return aspectMode === '16:9'
    ? { width: 1280, height: 720 }
    : { width: 1200, height: 900 }
}

/*
  Low slider values remain subtle.
  1–5 = believable old-camera texture.
  6–10 = visibly chunky.
  11–14 = deliberately wrecked.
*/
function getEffectivePixelSize(pixelSize: number): number {
  return 1 + Math.pow(pixelSize - 1, 1.45) * 0.22
}

function drawMirroredCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number,
  zoom: number
): void {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const sourceAspectRatio = sourceWidth / sourceHeight
  const targetAspectRatio = targetWidth / targetHeight

  let cropWidth = sourceWidth
  let cropHeight = sourceHeight

  if (sourceAspectRatio > targetAspectRatio) {
    cropWidth = sourceHeight * targetAspectRatio
  } else {
    cropHeight = sourceWidth / targetAspectRatio
  }

  cropWidth /= zoom
  cropHeight /= zoom

  const sourceX = (sourceWidth - cropWidth) / 2
  const sourceY = (sourceHeight - cropHeight) / 2

  context.clearRect(0, 0, targetWidth, targetHeight)

  context.save()
  context.translate(targetWidth, 0)
  context.scale(-1, 1)

  context.drawImage(
    video,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight
  )

  context.restore()
}

function applyFisheye(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imageData = context.getImageData(0, 0, width, height)
  const source = new Uint8ClampedArray(imageData.data)
  const output = imageData.data

  const centerX = width / 2
  const centerY = height / 2

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const outputIndex = (y * width + x) * 4
      const normalizedX = (x - centerX) / centerX
      const normalizedY = (y - centerY) / centerY
      const radius = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)

      if (radius > 1) {
        output[outputIndex] = 8
        output[outputIndex + 1] = 8
        output[outputIndex + 2] = 7
        output[outputIndex + 3] = 255
        continue
      }

      // Curves and expands the middle of the image like a cheap fisheye lens.
      const sourceRadius = Math.pow(radius, 1.55)
      const angle = Math.atan2(normalizedY, normalizedX)

      const sourceX = Math.round(centerX + Math.cos(angle) * sourceRadius * centerX)
      const sourceY = Math.round(centerY + Math.sin(angle) * sourceRadius * centerY)

      const safeX = Math.max(0, Math.min(width - 1, sourceX))
      const safeY = Math.max(0, Math.min(height - 1, sourceY))
      const sourceIndex = (safeY * width + safeX) * 4

      output[outputIndex] = source[sourceIndex]
      output[outputIndex + 1] = source[sourceIndex + 1]
      output[outputIndex + 2] = source[sourceIndex + 2]
      output[outputIndex + 3] = 255
    }
  }

  context.putImageData(imageData, 0, 0)
}

function applyPreset(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  filterMode: FilterMode,
  grain: number
): void {
  if (filterMode === 'fisheye') {
    applyFisheye(context, width, height)
  }

  if (filterMode === 'original' && grain === 0) {
    return
  }

  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data
  const original = new Uint8ClampedArray(data)
  const manualGrain = grain * 0.28

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const leftX = Math.max(0, x - 1)
      const rightX = Math.min(width - 1, x + 1)
      const leftIndex = (y * width + leftX) * 4
      const rightIndex = (y * width + rightX) * 4

      let red = original[index]
      let green = original[index + 1]
      let blue = original[index + 2]

      const luminance = red * 0.299 + green * 0.587 + blue * 0.114
      const normalizedX = (x - width / 2) / (width / 2)
      const normalizedY = (y - height / 2) / (height / 2)
      const distanceFromCenter = Math.sqrt(
        normalizedX * normalizedX + normalizedY * normalizedY
      )

      if (filterMode === 'vyntage') {
        red = red * 1.1 + 15
        green = green * 1.01 + 7
        blue = blue * 0.8 + 1

        red = luminance + (red - luminance) * 0.84
        green = luminance + (green - luminance) * 0.79
        blue = luminance + (blue - luminance) * 0.7

        red = (red - 128) * 0.87 + 138
        green = (green - 128) * 0.85 + 134
        blue = (blue - 128) * 0.82 + 127

        const noise = (Math.random() - 0.5) * (15 + manualGrain)
        red += noise * 1.1
        green += noise * 0.93
        blue += noise * 0.72

        const vignette = 1 - Math.max(0, distanceFromCenter - 0.2) * 0.2
        red *= vignette
        green *= vignette
        blue *= vignette
      }

      if (filterMode === 'digicam') {
        red = original[leftIndex]
        green = original[index + 1]
        blue = original[rightIndex + 2]

        red = red * 1.08 + 7
        green = green * 0.99 + 1
        blue = blue * 0.89 - 2

        red = (red - 128) * 1.07 + 128
        green = (green - 128) * 1.04 + 128
        blue = (blue - 128) * 1.01 + 128

        const noise = (Math.random() - 0.5) * (13 + manualGrain)
        red += noise * 1.05
        green += noise * 0.82
        blue += noise * 0.72

        const vignette = 1 - Math.max(0, distanceFromCenter - 0.34) * 0.26
        red *= vignette
        green *= vignette
        blue *= vignette

        const colourStep = 12
        red = Math.round(red / colourStep) * colourStep
        green = Math.round(green / colourStep) * colourStep
        blue = Math.round(blue / colourStep) * colourStep
      }

      if (filterMode === 'nightflash') {
        red = luminance * 1.18 + 24
        green = luminance * 1.1 + 14
        blue = luminance * 1.2 + 26

        const flashFalloff = 1 - Math.min(0.6, distanceFromCenter * 0.52)
        red *= flashFalloff
        green *= flashFalloff
        blue *= flashFalloff

        const noise = (Math.random() - 0.5) * (24 + manualGrain)
        red += noise
        green += noise * 0.85
        blue += noise * 1.22

        red = (red - 128) * 1.24 + 128
        green = (green - 128) * 1.19 + 128
        blue = (blue - 128) * 1.17 + 128
      }

      if (filterMode === 'vhs') {
        const tapeLeftX = Math.max(0, x - 2)
        const tapeRightX = Math.min(width - 1, x + 2)
        const tapeLeftIndex = (y * width + tapeLeftX) * 4
        const tapeRightIndex = (y * width + tapeRightX) * 4

        red = original[tapeLeftIndex]
        green = original[index + 1]
        blue = original[tapeRightIndex + 2]

        const mutedLuminance = red * 0.299 + green * 0.587 + blue * 0.114
        red = mutedLuminance + (red - mutedLuminance) * 0.72 + 4
        green = mutedLuminance + (green - mutedLuminance) * 0.68
        blue = mutedLuminance + (blue - mutedLuminance) * 0.82 + 7

        const scanline = y % 4 < 2 ? 0.86 : 1
        red *= scanline
        green *= scanline
        blue *= scanline

        const noise = (Math.random() - 0.5) * (20 + manualGrain)
        red += noise
        green += noise
        blue += noise * 1.2
      }

      if (filterMode === 'goldenfilm') {
        red = red * 1.15 + 18
        green = green * 1.03 + 10
        blue = blue * 0.78 + 2

        red = (red - 128) * 0.88 + 135
        green = (green - 128) * 0.86 + 133
        blue = (blue - 128) * 0.84 + 128

        const noise = (Math.random() - 0.5) * (9 + manualGrain)
        red += noise
        green += noise * 0.9
        blue += noise * 0.7
      }

      if (filterMode === 'fisheye') {
        red = red * 1.04 + 4
        green = green * 1.01 + 2
        blue = blue * 1.06 + 5

        const noise = (Math.random() - 0.5) * (8 + manualGrain)
        red += noise
        green += noise
        blue += noise
      }

      if (filterMode === 'original' && grain > 0) {
        const noise = (Math.random() - 0.5) * manualGrain
        red += noise
        green += noise
        blue += noise
      }

      data[index] = clamp(red)
      data[index + 1] = clamp(green)
      data[index + 2] = clamp(blue)
      data[index + 3] = 255
    }
  }

  context.putImageData(imageData, 0, 0)
}

function formatTimestamp(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()

  const rawHour = date.getHours()
  const hour = rawHour % 12 || 12
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  const meridiem = rawHour >= 12 ? 'PM' : 'AM'

  return `${month}-${day}-${year}   ${hour}:${minute}:${second} ${meridiem}`
}

function drawTimestamp(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timestamp: Date
): void {
  const text = formatTimestamp(timestamp)
  const fontSize = Math.max(13, Math.round(width * 0.022))
  const padding = Math.max(14, Math.round(width * 0.03))

  context.save()
  context.font = `bold ${fontSize}px "Courier New", monospace`
  context.textAlign = 'left'
  context.textBaseline = 'bottom'

  context.lineWidth = Math.max(2, Math.round(fontSize * 0.13))
  context.strokeStyle = 'rgba(10, 10, 9, 0.88)'
  context.fillStyle = 'rgba(239, 239, 228, 0.96)'

  context.strokeText(text, padding, height - padding)
  context.fillText(text, padding, height - padding)
  context.restore()
}

function renderFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  settings: RenderSettings,
  timestamp: Date
): void {
  canvas.width = width
  canvas.height = height

  const finalContext = canvas.getContext('2d')

  if (!finalContext) {
    throw new Error('VYNT could not create an image-rendering canvas.')
  }

  const effectivePixelSize = getEffectivePixelSize(settings.pixelSize)
  const workingWidth = Math.max(1, Math.floor(width / effectivePixelSize))
  const workingHeight = Math.max(1, Math.floor(height / effectivePixelSize))

  const workingCanvas = document.createElement('canvas')
  workingCanvas.width = workingWidth
  workingCanvas.height = workingHeight

  const workingContext = workingCanvas.getContext('2d', {
    willReadFrequently: settings.filterMode !== 'original' || settings.grain > 0
  })

  if (!workingContext) {
    throw new Error('VYNT could not create a texture canvas.')
  }

  workingContext.imageSmoothingEnabled = false

  drawMirroredCover(
    workingContext,
    video,
    workingWidth,
    workingHeight,
    settings.zoom
  )

  applyPreset(
    workingContext,
    workingWidth,
    workingHeight,
    settings.filterMode,
    settings.grain
  )

  finalContext.imageSmoothingEnabled = false
  finalContext.clearRect(0, 0, width, height)
  finalContext.drawImage(workingCanvas, 0, 0, width, height)

  if (settings.dateImprint) {
    drawTimestamp(finalContext, width, height, timestamp)
  }
}

function App(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef(0)

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [aspectMode, setAspectMode] = useState<AspectMode>('16:9')
  const [filterMode, setFilterMode] = useState<FilterMode>('vyntage')
  const [pixelSize, setPixelSize] = useState(3)
  const [grain, setGrain] = useState(34)
  const [zoom, setZoom] = useState(1)
  const [dateImprint, setDateImprint] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [captureMessage, setCaptureMessage] = useState<CaptureMessage | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)

  const renderSettings: RenderSettings = {
    filterMode,
    pixelSize,
    grain,
    zoom,
    aspectMode,
    dateImprint
  }

  const stopPreviewRender = (): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }

  const stopCamera = (): void => {
    stopPreviewRender()

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraStatus('idle')
    setCaptureMessage({
      tone: 'neutral',
      text: 'Camera turned off.'
    })
  }

  const startCamera = async (): Promise<void> => {
    try {
      setCameraStatus('starting')
      setErrorMessage('')
      setCaptureMessage(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
          facingMode: 'user'
        }
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setCameraStatus('live')
    } catch (error) {
      console.error('Unable to start camera:', error)

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setErrorMessage(
          'Camera access was blocked. Allow VYNT to use your camera in Windows Settings, then try again.'
        )
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setErrorMessage('No camera was found. Check that your webcam is connected and enabled.')
      } else {
        setErrorMessage('VYNT could not start the camera. Close any other app using it and try again.')
      }

      setCameraStatus('error')
    }
  }

  const capturePhoto = async (): Promise<void> => {
    const video = videoRef.current

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCaptureMessage({
        tone: 'error',
        text: 'The camera frame is not ready yet. Try again in a moment.'
      })
      return
    }

    try {
      setIsCapturing(true)
      setCaptureMessage({
        tone: 'neutral',
        text: `Developing ${getFilterLabel(filterMode)} photo…`
      })

      const dimensions = getDimensions(aspectMode, 'capture')
      const captureCanvas = document.createElement('canvas')
      const capturedAt = new Date()

      renderFrame(
        video,
        captureCanvas,
        dimensions.width,
        dimensions.height,
        renderSettings,
        capturedAt
      )

      const imageDataUrl = captureCanvas.toDataURL('image/png')
      const result = await window.vynt.savePhoto(imageDataUrl)

      if (result.saved && result.filePath) {
        setPhotoCount((count) => count + 1)
        setCaptureMessage({
          tone: 'success',
          text: `Saved ${getFilterLabel(filterMode)} photo: ${result.filePath}`
        })
      } else {
        setCaptureMessage({
          tone: 'neutral',
          text: 'Save cancelled.'
        })
      }
    } catch (error) {
      console.error('Unable to capture photo:', error)

      setCaptureMessage({
        tone: 'error',
        text: 'VYNT could not save that photo. Please try again.'
      })
    } finally {
      setIsCapturing(false)
    }
  }

  const handleShutter = (): void => {
    if (cameraStatus === 'live') {
      void capturePhoto()
      return
    }

    if (cameraStatus !== 'starting') {
      void startCamera()
    }
  }

  useEffect(() => {
    if (cameraStatus !== 'live') {
      return
    }

    const dimensions = getDimensions(aspectMode, 'preview')

    const renderPreview = (time: number): void => {
      const video = videoRef.current
      const canvas = previewCanvasRef.current

      if (
        video &&
        canvas &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        time - lastFrameTimeRef.current >= 33
      ) {
        lastFrameTimeRef.current = time

        try {
          renderFrame(
            video,
            canvas,
            dimensions.width,
            dimensions.height,
            renderSettings,
            new Date()
          )
        } catch (error) {
          console.error('Unable to render VYNT preview:', error)
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderPreview)
    }

    animationFrameRef.current = requestAnimationFrame(renderPreview)

    return () => {
      stopPreviewRender()
    }
  }, [cameraStatus, aspectMode, filterMode, pixelSize, grain, zoom, dateImprint])

  useEffect(() => {
    return () => {
      stopPreviewRender()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const statusText =
    cameraStatus === 'live'
      ? 'LIVE'
      : cameraStatus === 'starting'
        ? 'CONNECTING'
        : cameraStatus === 'error'
          ? 'CAMERA ERROR'
          : 'STANDBY'

  return (
    <main className="app-shell">
      <section className="camera-frame" style={{ maxWidth: '980px' }}>
        <header className="top-bar">
          <div className="brand">
            <span className="brand-mark">V</span>
            <span>VYNT</span>
          </div>

          <div className={`status status-${cameraStatus.toLowerCase()}`}>
            <span className="status-dot" />
            {statusText}
          </div>

          <div className="top-actions">
            {cameraStatus === 'live' && (
              <button className="power-button" type="button" onClick={stopCamera}>
                TURN OFF
              </button>
            )}

            <div className="counter">MEM {String(photoCount).padStart(4, '0')}</div>
          </div>
        </header>

        <div
          className="viewfinder"
          style={{
            minHeight: 0,
            aspectRatio: aspectMode === '16:9' ? '16 / 9' : '4 / 3'
          }}
        >
          <video ref={videoRef} className="source-video" muted playsInline />

          <canvas
            ref={previewCanvasRef}
            className={`camera-canvas ${cameraStatus === 'live' ? 'camera-canvas-visible' : ''}`}
          />

          {cameraStatus !== 'live' && (
            <div className="viewfinder-empty">
              <div className="viewfinder-icon">◉</div>

              <p>
                {cameraStatus === 'starting'
                  ? 'Opening camera…'
                  : cameraStatus === 'error'
                    ? 'Camera unavailable'
                    : 'Camera is standing by'}
              </p>

              {cameraStatus === 'error' && <small>{errorMessage}</small>}
            </div>
          )}

          <div className="viewfinder-overlay">
            <span>REC</span>
            <span>{aspectMode}</span>
          </div>

          <div className="focus-box" />

          <div
            style={{
              position: 'absolute',
              zIndex: 4,
              top: '46px',
              left: '20px',
              display: 'flex',
              overflow: 'hidden',
              border: '1px solid rgba(238, 232, 220, 0.22)',
              borderRadius: '5px',
              background: 'rgba(17, 17, 15, 0.84)'
            }}
          >
            {(['16:9', '4:3'] as AspectMode[]).map((aspect) => (
              <button
                key={aspect}
                className={`filter-button ${
                  aspectMode === aspect ? 'filter-button-active' : ''
                }`}
                type="button"
                onClick={() => setAspectMode(aspect)}
                disabled={isCapturing}
              >
                {aspect}
              </button>
            ))}
          </div>

          <div className="filter-dock" aria-label="VYNT filter modes">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                className={`filter-button ${
                  filterMode === filter.id ? 'filter-button-active' : ''
                }`}
                type="button"
                onClick={() => setFilterMode(filter.id)}
                disabled={isCapturing}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="texture-panel" aria-label="VYNT camera controls">
            <label className="texture-control">
              <span>
                ZOOM <strong>{zoom.toFixed(1)}X</strong>
              </span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.1"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                disabled={isCapturing}
              />
            </label>

            <label className="texture-control">
              <span>
                PIXEL <strong>{pixelSize}</strong>
              </span>
              <input
                type="range"
                min="1"
                max="14"
                step="1"
                value={pixelSize}
                onChange={(event) => setPixelSize(Number(event.target.value))}
                disabled={isCapturing}
              />
            </label>

            <label className="texture-control">
              <span>
                GRAIN <strong>{grain}</strong>
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={grain}
                onChange={(event) => setGrain(Number(event.target.value))}
                disabled={isCapturing}
              />
            </label>

            <label className="texture-control">
              <span>
                DATE IMPRINT <strong>{dateImprint ? 'ON' : 'OFF'}</strong>
              </span>
              <input
                type="checkbox"
                checked={dateImprint}
                onChange={(event) => setDateImprint(event.target.checked)}
                disabled={isCapturing}
              />
            </label>
          </div>

          {captureMessage && (
            <div className={`capture-message capture-message-${captureMessage.tone}`}>
              {captureMessage.text}
            </div>
          )}
        </div>

        <footer className="control-bar">
          <div className="mode-readout">
            <span className="control-label">MODE</span>
            <strong>{filterMode === 'original' ? 'ORIGINAL' : 'FILTER'}</strong>
          </div>

          <button
            className={`shutter-button ${isCapturing ? 'shutter-button-capturing' : ''}`}
            type="button"
            onClick={handleShutter}
            disabled={cameraStatus === 'starting' || isCapturing}
            aria-label={cameraStatus === 'live' ? 'Capture photo' : 'Start camera'}
          >
            <span />
          </button>

          <div className="mode-readout right-readout">
            <span className="control-label">FILTER</span>
            <strong>{getFilterShortLabel(filterMode)}</strong>
          </div>
        </footer>
      </section>
    </main>
  )
}

export default App