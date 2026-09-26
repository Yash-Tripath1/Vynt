import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaError, saveVideo } from './platform'

type Message = { tone: 'success' | 'error' | 'neutral'; text: string }
type Phase = 'idle' | 'starting' | 'recording' | 'saving'
const MAX_SECONDS = 300
const MAX_BYTES = 200 * 1024 * 1024

export function useRecording(onMessage: (message: Message) => void) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [hasAudio, setHasAudio] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamsRef = useRef<MediaStream[]>([])
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const generationRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const releaseTracks = useCallback(() => {
    streamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
    streamsRef.current = []
    clearTimeout(timeoutRef.current)
  }, [])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const start = async (canvas: HTMLCanvasElement, microphone: boolean): Promise<void> => {
    if (pendingRef.current) return
    pendingRef.current = true
    setPhase('starting')
    setHasAudio(false)
    const generation = ++generationRef.current
    let requestingMicrophone = false
    try {
      if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
        throw new Error('Video recording is unavailable here. Try a recent Chrome or Edge browser, or the desktop app.')
      }
      const candidates = microphone
        ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) throw new Error('This browser cannot record a supported video format. Try Chrome or Edge.')

      let audio: MediaStream | undefined
      if (microphone) {
        requestingMicrophone = true
        onMessage({ tone: 'neutral', text: 'Allow microphone access to record your voice…' })
        audio = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
        requestingMicrophone = false
        if (!mountedRef.current || generation !== generationRef.current) {
          audio.getTracks().forEach((track) => track.stop())
          return
        }
        streamsRef.current.push(audio)
        if (!audio.getAudioTracks().length) throw new Error('No microphone audio track was available. Turn MIC OFF to record silently.')
      }
      const video = canvas.captureStream(30)
      streamsRef.current.push(video)
      const combined = new MediaStream([...video.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])])
      const recorder = new MediaRecorder(combined, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
        audioBitsPerSecond: 128_000
      })
      const chunks: Blob[] = []
      let bytes = 0
      let recordingFailed = false
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data)
          bytes += event.data.size
          if (bytes >= MAX_BYTES && recorder.state === 'recording') {
            recorder.stop()
            onMessage({ tone: 'neutral', text: 'Clip size limit reached. Finishing your recording…' })
          }
        }
      }
      recorder.onerror = () => {
        recordingFailed = true
        if (recorder.state === 'recording') recorder.stop()
        releaseTracks()
        if (mountedRef.current) onMessage({ tone: 'error', text: 'Recording was interrupted. Try a shorter clip or another browser.' })
      }
      audio?.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (recorder.state === 'recording') {
            recorder.stop()
            onMessage({ tone: 'error', text: 'Microphone disconnected. Finishing the clip recorded so far.' })
          }
        }
      })
      recorder.onstop = async () => {
        releaseTracks()
        recorderRef.current = null
        if (!mountedRef.current) return
        setPhase('saving')
        setHasAudio(false)
        try {
          if (!recordingFailed) {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType })
            if (!blob.size) throw new Error('The recording was empty. Record for a little longer and try again.')
            const result = await saveVideo(blob)
            if (mountedRef.current) onMessage({
              tone: result.saved ? 'success' : 'neutral',
              text: result.downloaded ? 'Video download started. Check your downloads.' : result.saved ? 'Video saved.' : 'Video save cancelled.'
            })
          }
        } catch (error) {
          if (mountedRef.current) onMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save the video.' })
        } finally {
          chunks.length = 0
          pendingRef.current = false
          if (mountedRef.current) { setPhase('idle'); setSeconds(0) }
        }
      }
      recorder.start(1000)
      setSeconds(0)
      setHasAudio(Boolean(audio))
      setPhase('recording')
      onMessage({ tone: 'neutral', text: audio ? 'Recording video + microphone. Maximum 5 minutes.' : 'Recording silent video. Maximum 5 minutes.' })
      timeoutRef.current = setTimeout(() => {
        stop()
        if (mountedRef.current) onMessage({ tone: 'neutral', text: '5-minute limit reached. Finishing your clip…' })
      }, MAX_SECONDS * 1000)
    } catch (error) {
      releaseTracks()
      recorderRef.current = null
      pendingRef.current = false
      if (mountedRef.current) {
        setPhase('idle')
        onMessage({ tone: 'error', text: requestingMicrophone ? `${mediaError(error, 'microphone')} Or turn MIC OFF to record silently.` : error instanceof Error ? error.message : 'Could not start recording.' })
      }
    }
  }

  useEffect(() => {
    if (phase !== 'recording') return
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(timer)
  }, [phase])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      if (recorderRef.current) {
        recorderRef.current.onstop = null
        recorderRef.current.ondataavailable = null
        recorderRef.current.onerror = null
        if (recorderRef.current.state === 'recording') recorderRef.current.stop()
      }
      releaseTracks()
    }
  }, [releaseTracks])

  // Prevent accidental navigation from silently discarding an in-memory recording.
  useEffect(() => {
    if (phase === 'idle') return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  return { phase, seconds, hasAudio, start, stop, busy: phase !== 'idle' }
}
