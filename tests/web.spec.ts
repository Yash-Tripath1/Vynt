import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// The actual MediaRecorder runs; the wrapper only records its input track kinds.
async function observeMedia(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const NativeRecorder = window.MediaRecorder
    const state = window as unknown as { recorderKinds: string[]; capturedStreams: MediaStream[] }
    state.recorderKinds = []
    state.capturedStreams = []
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getMedia(constraints)
      state.capturedStreams.push(stream)
      return stream
    }
    window.MediaRecorder = class extends NativeRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options)
        state.recorderKinds = stream.getTracks().map((track) => track.kind)
      }
    }
  })
}

test('loads without Electron, exports a PNG and releases camera', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await observeMedia(page)
  await page.goto('/')
  await expect(page).toHaveTitle(/VYNT/)
  await expect(page.getByRole('link', { name: 'Download for Windows' })).toBeVisible()
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Take photo' })).toBeEnabled()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Take photo' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/\.png$/)
  const bytes = await readFile((await download.path())!)
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  await expect(page.getByRole('button', { name: /LAST PHOTO/ })).toBeVisible()
  await page.getByRole('button', { name: 'TURN OFF' }).click()
  expect(await page.evaluate(() => (window as unknown as { capturedStreams: MediaStream[] }).capturedStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true)
  expect(errors).toEqual([])
})

for (const microphone of [true, false]) {
  test(`records a playable video with microphone ${microphone ? 'on' : 'off'}`, async ({ page }, testInfo) => {
    await observeMedia(page)
    await page.goto('/')
    if (!microphone) await page.getByRole('button', { name: 'MIC ON', exact: true }).click()
    await page.getByRole('button', { name: 'Start camera', exact: true }).click()
    await page.getByRole('button', { name: 'RECORD VIDEO', exact: true }).click()
    await expect(page.getByRole('button', { name: /^STOP/ })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { recorderKinds: string[] }).recorderKinds.sort())).toEqual(microphone ? ['audio', 'video'] : ['video'])
    await expect(page.getByRole('button', { name: '4:3', exact: true })).toBeDisabled()
    await page.waitForTimeout(2400)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /^STOP/ }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/\.(webm|mp4)$/)
    await download.saveAs(testInfo.outputPath(microphone ? 'with-mic.webm' : 'silent.webm'))
    const bytes = await readFile((await download.path())!)
    expect(bytes.length).toBeGreaterThan(1000)
    // Decode the actual exported container, not just a mocked recording.
    const dimensions = await page.evaluate(async (base64) => {
      const blob = new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: 'video/webm' })
      const video = document.createElement('video')
      video.src = URL.createObjectURL(blob)
      await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Video did not decode')) })
      const dimensions = [video.videoWidth, video.videoHeight]
      URL.revokeObjectURL(video.src)
      return dimensions
    }, bytes.toString('base64'))
    expect(dimensions).toEqual([640, 360])
    if (microphone) {
      const peak = await page.evaluate(async (base64) => {
        const context = new AudioContext()
        try {
          const audio = await context.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer)
          return audio.getChannelData(0).reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)
        } finally { await context.close() }
      }, bytes.toString('base64'))
      expect(peak).toBeGreaterThan(0.001)
    }
    await expect(page.getByRole('button', { name: 'RECORD VIDEO', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => (window as unknown as { capturedStreams: MediaStream[] }).capturedStreams.flatMap(s => s.getAudioTracks()).every(t => t.readyState === 'ended'))).toBe(true)
    // Restart verifies recording state and stream cleanup between clips.
    await page.getByRole('button', { name: 'RECORD VIDEO', exact: true }).click()
    await expect(page.getByRole('button', { name: /^STOP/ })).toBeVisible()
    await page.waitForTimeout(1100)
    const secondDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: 'TURN OFF' }).click()
    await secondDownload
    await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeEnabled()
  })
}

test('microphone denial is visible and silent recording remains available', async ({ page }) => {
  await page.addInitScript(() => {
    const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = (constraints) => constraints?.audio
      ? Promise.reject(new DOMException('Test microphone denial', 'NotAllowedError'))
      : getMedia(constraints)
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await page.getByRole('button', { name: 'RECORD VIDEO', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Microphone access was denied')
  await page.getByRole('button', { name: 'MIC ON', exact: true }).click()
  await page.getByRole('button', { name: 'RECORD VIDEO', exact: true }).click()
  await expect(page.getByRole('button', { name: /^STOP/ })).toBeVisible()
  await page.waitForTimeout(1100)
  await page.getByRole('button', { name: /^STOP/ }).click()
})

test('camera denial displays recovery instructions', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Test denial', 'NotAllowedError'))
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByText(/Camera access was denied/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start camera', exact: true })).toBeEnabled()
})

test('mobile controls fit and camera off remains accessible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'TURN OFF' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'TURN OFF' }).click()
})

for (const width of [320, 375, 430]) {
  test(`phone ${width}px defaults to 4:3 with touch controls and no overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: '4:3', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: '3:4', exact: true })).toBeVisible()
    const frame = (await page.locator('.viewfinder').boundingBox())!
    expect(frame.width / frame.height).toBeCloseTo(4 / 3, 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const name of ['16:9', '4:3', '3:4', 'MIC ON']) {
      const button = (await page.getByRole('button', { name, exact: true }).boundingBox())!
      expect(button.height).toBeGreaterThanOrEqual(44)
    }
    await page.getByRole('button', { name: '16:9', exact: true }).click()
    await expect(page.getByRole('button', { name: '16:9', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
}

test('desktop keeps the 16:9 default and offers optional portrait framing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '16:9', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '3:4', exact: true })).toBeVisible()
  const frame = (await page.locator('.viewfinder').boundingBox())!
  expect(frame.width / frame.height).toBeCloseTo(16 / 9, 2)
})

test('portrait photo and video exports match the frame and survive rotation', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByRole('button', { name: '3:4', exact: true }).click()
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.locator('.camera-canvas')).toHaveAttribute('width', '480')
  await expect(page.locator('.camera-canvas')).toHaveAttribute('height', '640')
  const photoDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Take photo', exact: true }).click()
  const photo = await photoDownload
  const png = await readFile((await photo.path())!)
  // PNG IHDR stores the exact export dimensions at byte offsets 16 and 20.
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([900, 1200])
  await page.getByRole('button', { name: 'RECORD VIDEO', exact: true }).click()
  await expect(page.getByRole('button', { name: /^STOP/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '3:4', exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 812, height: 375 })
  await expect(page.getByRole('button', { name: '3:4', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.camera-canvas')).toHaveAttribute('width', '480')
  await expect(page.locator('.camera-canvas')).toHaveAttribute('height', '640')
  await page.waitForTimeout(1800)
  const videoDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: /^STOP/ }).click()
  const video = await videoDownload
  const bytes = await readFile((await video.path())!)
  const decoded = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }))
    const element = document.createElement('video')
    const audio = new AudioContext()
    try {
      element.src = url
      await new Promise<void>((resolve, reject) => {
        element.onloadeddata = () => resolve()
        element.onerror = () => reject(new Error('Portrait video did not decode'))
      })
      const buffer = await audio.decodeAudioData(bytes.buffer)
      const peak = buffer.getChannelData(0).reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)
      return { width: element.videoWidth, height: element.videoHeight, peak }
    } finally { URL.revokeObjectURL(url); await audio.close() }
  }, bytes.toString('base64'))
  expect([decoded.width, decoded.height]).toEqual([480, 640])
  expect(decoded.peak).toBeGreaterThan(0.001)
  await page.getByRole('button', { name: 'TURN OFF' }).click()
})
