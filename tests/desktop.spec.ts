import { _electron as electron, test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

// Playwright requires fixture destructuring even when only testInfo is used.
// eslint-disable-next-line no-empty-pattern
test('Electron preload, native photo save and microphone video save work', async ({}, testInfo) => {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    expect(await page.evaluate(() => typeof window.vynt?.saveVideo)).toBe('function')
    expect(await page.evaluate(async () => {
      try { await window.vynt!.savePhoto('not-a-png'); return false } catch { return true }
    })).toBe(true)
    const photoPath = testInfo.outputPath('desktop-photo.png')
    const videoPath = testInfo.outputPath('desktop-video.webm')
    // Stub the OS file picker only; IPC validation and filesystem writes are real.
    await app.evaluate(({ dialog }, paths) => {
      dialog.showSaveDialog = (async (...args: unknown[]) => {
        const options = args[args.length - 1] as { title?: string }
        return { canceled: false, filePath: options.title?.includes('photo') ? paths.photoPath : paths.videoPath }
      }) as typeof dialog.showSaveDialog
    }, { photoPath, videoPath })
    await page.getByRole('button', { name: 'Start camera', exact: true }).click()
    await page.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('status')).toContainText('Saved')
    expect((await readFile(photoPath)).length).toBeGreaterThan(1000)
    await page.getByRole('button', { name: 'RECORD VIDEO', exact: true }).click()
    await expect(page.getByRole('button', { name: /^STOP/ })).toBeVisible()
    await page.waitForTimeout(2400)
    await page.getByRole('button', { name: /^STOP/ }).click()
    await expect(page.getByRole('status')).toHaveText('Video saved.')
    const bytes = await readFile(videoPath)
    expect(bytes.length).toBeGreaterThan(1000)
    const peak = await page.evaluate(async (base64) => {
      const context = new AudioContext()
      try {
        const audio = await context.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer)
        return audio.getChannelData(0).reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0)
      } finally { await context.close() }
    }, bytes.toString('base64'))
    expect(peak).toBeGreaterThan(0.001)
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (async () => ({ canceled: true, filePath: '' })) as typeof dialog.showSaveDialog
    })
    await page.getByRole('button', { name: 'Take photo' }).click()
    await expect(page.getByRole('status')).toHaveText('Save cancelled.')
    await page.getByRole('button', { name: 'TURN OFF' }).click()
  } finally { await app.close() }
})
