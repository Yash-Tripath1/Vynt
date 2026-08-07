import { useEffect, useRef, useState } from 'react'
import './App.css'

type CameraStatus = 'idle' | 'starting' | 'live' | 'error'
type FilterMode = 'original' | 'digicam'

type CaptureMessage = {
  tone: 'success' | 'error' | 'neutral'
  text: string
}

const PREVIEW_WIDTH = 640
const PREVIEW_HEIGHT = 480
const CAPTURE_WIDTH = 1200
const CAPTURE_HEIGHT = 900

const FILTERS: Array<{
  id: FilterMode
  label: string
  shortLabel: string
}> = [
  {
    id: 'original',
    label: 'ORIGINAL',
    shortLabel: 'RAW'
  },
  {
    id: 'digicam',
    label: '2007 DIGICAM',
    shortLabel: '2007'
  }
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

function drawMirroredCover(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number
): void {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const sourceAspectRatio = sourceWidth / sourceHeight
  const targetAspectRatio = targetWidth / targetHeight

  let sourceX = 0
  let sourceY = 0
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight

  if (sourceAspectRatio > targetAspectRatio) {
    cropWidth = sourceHeight * targetAspectRatio
    sourceX = (sourceWidth - cropWidth) / 2
  } else {
    cropHeight = sourceWidth / targetAspectRatio
    sourceY = (sourceHeight - cropHeight) / 2
  }

  context.clearRect(0, 0, targetWidth, targetHeight)

  // VYNT mirrors the image so its saved photo matches the live viewfinder.
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

function applyDigicamEffect(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data
  const original = new Uint8ClampedArray(data)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4

      const leftX = Math.max(0, x - 1)
      const rightX = Math.min(width - 1, x + 1)
      const leftIndex = (y * width + leftX) * 4
      const rightIndex = (y * width + rightX) * 4

      // Small red/blue separation: old cheap-lens colour fringing.
      let red = original[leftIndex]
      let green = original[pixelIndex + 1]
      let blue = original[rightIndex + 2]

      // Warm, slightly inaccurate consumer-camera white balance.
      red = red * 1.08 + 7
      green = green * 0.99 + 1
      blue = blue * 0.89 - 2

      // Slight contrast and faded highlight response.
      red = (red - 128) * 1.07 + 128
      green = (green - 128) * 1.04 + 128
      blue = (blue - 128) * 1.01 + 128

      // Sensor grain.
      const noise = (Math.random() - 0.5) * 13
      red += noise * 1.05
      green += noise * 0.82
      blue += noise * 0.72

      // Gentle darkened corners.
      const normalizedX = (x - width / 2) / (width / 2)
      const normalizedY = (y - height / 2) / (height / 2)
      const distanceFromCenter = Math.sqrt(
        normalizedX * normalizedX + normalizedY * normalizedY
      )
      const vignette = 1 - Math.max(0, distanceFromCenter - 0.34) * 0.26

      red *= vignette
      green *= vignette
      blue *= vignette

      // Fewer colour levels = less modern/clean image output.
      const colourStep = 12
      data[pixelIndex] = clamp(Math.round(red / colourStep) * colourStep)
      data[pixelIndex + 1] = clamp(Math.round(green / colourStep) * colourStep)
      data[pixelIndex + 2] = clamp(Math.round(blue / colourStep) * colourStep)
      data[pixelIndex + 3] = 255
    }
  }

  context.putImageData(imageData, 0, 0)
}

function renderFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  filterMode: FilterMode
): void {
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', {
    willReadFrequently: filterMode === 'digicam'
  })

  if (!context) {
    throw new Error('VYNT could not create an image-rendering canvas.')
  }

  context.imageSmoothingEnabled = false
  drawMirroredCover(context, video, width, height)

  if (filterMode === 'digicam') {
    applyDigicamEffect(context, width, height)
  }
}

function App(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef(0)

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [filterMode, setFilterMode] = useState<FilterMode>('digicam')
  const [errorMessage, setErrorMessage] = useState('')
  const [captureMessage, setCaptureMessage] = useState<CaptureMessage | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)

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

      const captureCanvas = document.createElement('canvas')

      renderFrame(
        video,
        captureCanvas,
        CAPTURE_WIDTH,
        CAPTURE_HEIGHT,
        filterMode
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
            PREVIEW_WIDTH,
            PREVIEW_HEIGHT,
            filterMode
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
  }, [cameraStatus, filterMode])

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
      <section className="camera-frame">
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

        <div className="viewfinder">
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
            <span>4:3</span>
          </div>

          <div className="focus-box" />

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

          {captureMessage && (
            <div className={`capture-message capture-message-${captureMessage.tone}`}>
              {captureMessage.text}
            </div>
          )}
        </div>

        <footer className="control-bar">
          <div className="mode-readout">
            <span className="control-label">MODE</span>
            <strong>{filterMode === 'digicam' ? 'DIGICAM' : 'ORIGINAL'}</strong>
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