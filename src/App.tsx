import { useEffect, useRef, useState } from 'react'
import './App.css'

type CameraStatus = 'idle' | 'starting' | 'live' | 'error'
type CaptureMessage = {
  tone: 'success' | 'error' | 'neutral'
  text: string
}

function App(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [captureMessage, setCaptureMessage] = useState<CaptureMessage | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [photoCount, setPhotoCount] = useState(0)

  const stopCamera = (): void => {
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
        text: 'Developing photo…'
      })

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('VYNT could not create an image canvas.')
      }

      // The live preview is mirrored, so mirror the saved image to match it.
      context.translate(canvas.width, 0)
      context.scale(-1, 1)
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageDataUrl = canvas.toDataURL('image/png')
      const result = await window.vynt.savePhoto(imageDataUrl)

      if (result.saved && result.filePath) {
        setPhotoCount((count) => count + 1)
        setCaptureMessage({
          tone: 'success',
          text: `Saved: ${result.filePath}`
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
    return () => {
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
          <video
            ref={videoRef}
            className={`camera-feed ${cameraStatus === 'live' ? 'camera-feed-visible' : ''}`}
            muted
            playsInline
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

          {captureMessage && (
            <div className={`capture-message capture-message-${captureMessage.tone}`}>
              {captureMessage.text}
            </div>
          )}
        </div>

        <footer className="control-bar">
          <div className="mode-readout">
            <span className="control-label">MODE</span>
            <strong>DIGICAM</strong>
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
            <strong>RAW</strong>
          </div>
        </footer>
      </section>
    </main>
  )
}

export default App