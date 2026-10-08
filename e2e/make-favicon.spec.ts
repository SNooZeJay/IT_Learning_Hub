import { test, expect } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

/**
 * Rasterise the brand logo into favicon sizes, using the Chromium that is already
 * installed for the end-to-end tests.
 *
 * There is no image library available here - no sharp, no ImageMagick, and the Python
 * on this machine has no pip - so the browser does the work: draw the source onto a
 * canvas at each target size and read the PNG back out. That is a real resampler rather
 * than a nearest-neighbour squash, which matters at 16px.
 *
 * Written as a spec rather than a build script so it uses the same toolchain as
 * everything else here, and it asserts the output is non-empty rather than assuming.
 */

const SOURCE = 'D:/LMS_PROJECT/IT_Learning_Hub_Logo.png'
const OUT = 'public/favicon-src'
const SIZES = [16, 32, 48, 180, 512]

test('rasterise the logo into favicon sizes', async ({ page }) => {
  test.setTimeout(120_000)
  mkdirSync(OUT, { recursive: true })

  const b64 = readFileSync(SOURCE).toString('base64')
  await page.goto('about:blank')

  const sourceInfo = await page.evaluate(async (data) => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + data
    await img.decode()
    return { w: img.naturalWidth, h: img.naturalHeight }
  }, b64)
  console.log(`  source logo: ${sourceInfo.w}x${sourceInfo.h}`)

  for (const size of SIZES) {
    const png = await page.evaluate(
      async ({ data, size }) => {
        const img = new Image()
        img.src = 'data:image/png;base64,' + data
        await img.decode()

        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        // Contain, centred: the logo is not guaranteed square, and a stretched
        // favicon is worse than a letterboxed one.
        const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight)
        const w = img.naturalWidth * scale
        const h = img.naturalHeight * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        return canvas.toDataURL('image/png').split(',')[1]
      },
      { data: b64, size },
    )

    const buf = Buffer.from(png, 'base64')
    const name =
      size === 180 ? 'apple-touch-icon.png' : size === 512 ? 'icon-512.png' : `favicon-${size}.png`
    writeFileSync(`${OUT}/${name}`, buf)
    console.log(`  wrote ${name.padEnd(22)} ${size}x${size}  ${buf.length} bytes`)
    expect(buf.length, `${name} is empty`).toBeGreaterThan(50)
  }
})
