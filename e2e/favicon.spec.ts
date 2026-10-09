import { test, expect } from '@playwright/test'

/**
 * The tab icon.
 *
 * Two separate failures hide behind "the favicon is wrong".
 *
 * The first is the file: the served icon must be the green brand mark, not the
 * earlier blue one, and the ICO must carry more than one resolution or a high-DPI
 * screen upscales a blurry 16px.
 *
 * The second is the cache, and it is the one that bit. Browsers keep the tab icon in
 * their own store keyed by URL and revalidate it at best occasionally, so a
 * corrected favicon on the server does not change the tab on a browser that already
 * has the site. `Cache-Control: max-age=0, must-revalidate` was being served and did
 * not help. The only reliable lever is a changed URL, which is what the `?v=` query
 * strings are for - so the test asserts the URLs are versioned, because an unversioned
 * icon is a bug that reappears the next time the logo changes.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

/** The green mark, not the old blue one. Sampled from the middle of the glyph. */
const BRAND_GREEN = { r: 31, g: 107, b: 70 }

test('every declared icon URL is cache-busted', async ({ page }) => {
  test.setTimeout(60_000)

  const declared = await (async () => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    return page.evaluate(() =>
      [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')].map((l) => ({
        rel: l.getAttribute('rel'),
        href: l.getAttribute('href'),
      })),
    )
  })()

  expect(declared.length, 'no icon links are declared at all').toBeGreaterThan(0)

  for (const { rel, href } of declared) {
    expect(
      href,
      `${rel} icon "${href}" has no ?v= query string, so a browser that already has ` +
        `the old icon will keep showing it after the logo changes`,
    ).toMatch(/\?v=[0-9a-f]{6,}/)
  }
})

test('the served favicon is the green brand mark, not the old blue one', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000)

  // The PNG, not the ICO.
  //
  // An ICO is a container of one or more encoded images - BMP or PNG - behind a
  // directory, and a browser decodes it with the same machinery that reads an .ico
  // file from disk. Pointing an `<img>` at a data URL of the packed ICO does not
  // reliably decode in Chromium and comes back as a black rectangle, which sampled
  // as rgb(0,0,0) and failed a check that was reporting on its own decoder rather
  // than on the logo.
  //
  // The PNG is rasterised from the identical source in the same generator run, so it
  // is the same artwork and the same question. The ICO's structure is asserted
  // separately below, by parsing its header - which is plain binary and needs no
  // decoder at all.
  const res = await request.get(`${BASE}/favicon-32.png?v=probe`)
  expect(res.status(), 'favicon-32.png is not served').toBe(200)
  const body = await res.body()
  expect(body.length, 'favicon-32.png is empty').toBeGreaterThan(100)

  const dataUrl = `data:image/png;base64,${body.toString('base64')}`
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })

  const sampled = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    // The glyph's body: the centre of a graduation cap. A blue logo and a green one
    // differ sharply here, and the corners are transparent in both so sampling them
    // would prove nothing.
    const d = ctx.getImageData(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
    ).data
    return { r: d[0], g: d[1], b: d[2], a: d[3], w: canvas.width, h: canvas.height }
  }, dataUrl)

  expect(sampled.a, 'the favicon centre is transparent - the glyph is not there').toBeGreaterThan(0)

  // Green dominant, and closer to the brand value than to the old blue.
  expect(
    sampled.g,
    `sampled rgb(${sampled.r},${sampled.g},${sampled.b}) is not green`,
  ).toBeGreaterThan(sampled.r)
  const distToBrand =
    Math.abs(sampled.r - BRAND_GREEN.r) +
    Math.abs(sampled.g - BRAND_GREEN.g) +
    Math.abs(sampled.b - BRAND_GREEN.b)
  const distToBlue = Math.abs(sampled.r - 37) + Math.abs(sampled.g - 99) + Math.abs(sampled.b - 235)
  expect(
    distToBrand,
    `favicon centre rgb(${sampled.r},${sampled.g},${sampled.b}) is closer to the old blue ` +
      `than to the brand green (${distToBlue} vs ${distToBrand})`,
  ).toBeLessThan(distToBlue)
})

test('the ICO carries three resolutions, so a high-DPI tab is not upscaled', async ({
  request,
}) => {
  test.setTimeout(60_000)

  const res = await request.get(`${BASE}/favicon.ico?v=probe`)
  expect(res.status(), 'favicon.ico is not served').toBe(200)
  const ico = await res.body()

  // ICO directory: reserved(2) type(2)=1 count(2), then 16 bytes per entry where
  // byte 0 is width and byte 1 is height, and 0 means 256. Read directly, because
  // this is the one part of the format that needs no image decoder.
  expect(ico.readUInt16LE(0), 'ICO reserved field is not 0').toBe(0)
  expect(ico.readUInt16LE(2), 'ICO type is not 1 (icon)').toBe(1)
  const count = ico.readUInt16LE(4)
  expect(count, 'the ICO holds fewer than three resolutions').toBeGreaterThanOrEqual(3)

  const sizes: number[] = []
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16
    const w = ico[at] === 0 ? 256 : ico[at]
    sizes.push(w)
  }

  // A browser picks the largest that fits the tab, so a missing 32 means every
  // desktop tab upscales from 16 and looks soft.
  for (const required of [16, 32, 48]) {
    expect(sizes, `the ICO has no ${required}px image (found ${sizes.join(', ')})`).toContain(
      required,
    )
  }
})

test('the web manifest is valid and points at the brand icon', async ({ request }) => {
  test.setTimeout(60_000)

  const res = await request.get(`${BASE}/site.webmanifest`)
  expect(res.status(), 'site.webmanifest is not served').toBe(200)

  const manifest = await res.json()
  expect(manifest.name).toBeTruthy()
  expect(manifest.icons?.length, 'the manifest declares no icons').toBeGreaterThan(0)

  for (const icon of manifest.icons) {
    expect(icon.src, `manifest icon "${icon.src}" is not cache-busted`).toMatch(/\?v=/)
  }

  // The theme colour is what tints an installed app's toolbar on Android. It has to
  // be the brand green, not a plausible-looking teal that is somebody's guess.
  expect(
    manifest.theme_color?.toLowerCase(),
    'the manifest theme colour is not the brand green',
  ).toBe('#1f6b46')
})
