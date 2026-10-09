/**
 * Shrink the app icons in `public/` without changing what they look like.
 *
 * WHY
 * ---
 * The icons are rasterised from the brand logo by Playwright, which writes RGBA PNG
 * (colour type 6) with every scanline set to filter type 0. Both are correct; together
 * they are why a 512x512 icon of a small mark costs 110 KB. The filter exists to store
 * each pixel as a difference from its neighbours so deflate can find runs, and without
 * it a smooth gradient stays 512 raw large values per row.
 *
 * Chrome fetches `icon-512.png` on every page load, because `site.webmanifest` declares
 * it and the manifest is read for any page. Lighthouse measured it on the landing page as
 * the third-largest transfer in the whole page - behind the entry chunk and one font -
 * for an image that is an app icon.
 *
 * TWO ROUTES, CHOSEN PER FILE
 * ---------------------------
 *   Indexed    A flat mark collapses to a handful of colours, so a palette plus one
 *              byte per pixel is a large, lossless-in-practice win. `favicon-32.png`
 *              goes this way.
 *   Lossless   The app icon carries a real gradient - sampled across its middle row it
 *              runs #09be6e to #3a8266 - so 256 palette entries would band it. Banding
 *              an app icon to save bytes trades a visible regression for an invisible
 *              one. This route keeps colour type 6 and every pixel exactly, and takes
 *              the saving from adaptive filtering and maximum deflate instead.
 *
 * Nothing here is lossy in the lossless route: PNG's filter types are exact reversible
 * encodings, so the output decodes to precisely the input image.
 *
 * WHY HAND-WRITTEN
 * ----------------
 * No image library on this machine - no sharp, no ImageMagick, no pip. PNG is small
 * enough to read and write directly, and the alternative was accepting a 110 KB icon on
 * every page load or dropping the installed-app icon entirely.
 *
 * Usage: node scripts/optimize-icon.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import zlib from 'node:zlib'

const DIR = 'public'

/* ------------------------------------------------------------------ reading */

function readHeader(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  if (buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('no IHDR')
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    depth: buf.toString('ascii', 24, 25).charCodeAt(0),
    colorType: buf.toString('ascii', 25, 26).charCodeAt(0),
  }
}

function readData(buf) {
  const parts = []
  let offset = 8
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') parts.push(buf.subarray(offset + 8, offset + 8 + length))
    if (type === 'IEND') break
    offset += 12 + length
  }
  return Buffer.concat(parts)
}

/** Reverse the per-scanline filters so each pixel can be read back. */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  let pos = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const row = raw.subarray(pos, pos + stride)
    pos += stride
    const target = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? target[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= bpp ? prev[x - bpp] : 0
      let value = row[x]
      switch (filter) {
        case 0: break
        case 1: value += a; break
        case 2: value += b; break
        case 3: value += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default: throw new Error(`unknown filter ${filter}`)
      }
      target[x] = value & 0xff
    }
  }
  return out
}

/* ------------------------------------------------------------------ writing */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * Filter each row with whichever of the five types gives the smallest sum of absolute
 * signed differences - the heuristic PNG's own reference encoder uses.
 */
function filterAdaptive(pixels, width, height, bpp) {
  const stride = width * bpp
  const out = Buffer.alloc((stride + 1) * height)
  const candidate = Buffer.alloc(stride)

  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null
    let bestType = 0
    let bestScore = Infinity
    let bestRow = null

    for (let type = 0; type <= 4; type++) {
      let score = 0
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? row[x - bpp] : 0
        const b = prev ? prev[x] : 0
        const c = prev && x >= bpp ? prev[x - bpp] : 0
        let v = row[x]
        switch (type) {
          case 1: v -= a; break
          case 2: v -= b; break
          case 3: v -= (a + b) >> 1; break
          case 4: {
            const p = a + b - c
            const pa = Math.abs(p - a)
            const pb = Math.abs(p - b)
            const pc = Math.abs(p - c)
            v -= pa <= pb && pa <= pc ? a : pb <= pc ? b : c
            break
          }
        }
        v &= 0xff
        candidate[x] = v
        // A byte near 255 is -1, not +255. Reading it as +255 makes the encoder prefer
        // the wrong filter wherever an edge is sharp, which is exactly where it matters.
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) {
        bestScore = score
        bestType = type
        bestRow = Buffer.from(candidate)
      }
    }

    out[y * (stride + 1)] = bestType
    bestRow.copy(out, y * (stride + 1) + 1)
  }
  return out
}

function assemble(colorType, width, height, idat, palette) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(colorType, 9)
  ihdr.writeUInt8(0, 10) // compression
  ihdr.writeUInt8(0, 11) // filter
  ihdr.writeUInt8(0, 12) // interlace

  const signature = Buffer.alloc(8)
  signature.writeUInt32BE(0x89504e47, 0)
  signature.write('IHDR', 4, 'ascii')

  const parts = [signature, chunk('IHDR', ihdr)]
  if (palette) {
    const plte = Buffer.alloc(palette.length * 3)
    palette.forEach(([r, g, b], i) => {
      plte[i * 3] = r
      plte[i * 3 + 1] = g
      plte[i * 3 + 2] = b
    })
    parts.push(chunk('PLTE', plte))
  }
  parts.push(chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

/* ------------------------------------------------------------- the two routes */

/**
 * Bucket opaque pixels in 5-bit-per-channel RGB and average each bucket.
 *
 * The source has far more distinct colours than 256 even when the image looks flat: a
 * vector mark rasterised at 512px produces one edge colour per partial-coverage pixel,
 * and each is a slightly different mix of the same inks. 5-bit buckets are fine enough
 * to separate the inks and every meaningful blend, and coarse enough to collapse that
 * noise. Each entry is the average of the pixels that landed in it, so it is a colour
 * that was actually present rather than a snapped one.
 */
function buildPalette(pixels, width, height, bpp) {
  const SHIFT = 3 // 8 - 5
  const buckets = new Map()
  let transparent = 0

  for (let i = 0; i < width * height; i++) {
    const o = i * bpp
    if (pixels[o + 3] === 0) {
      transparent++
      continue
    }
    const r = pixels[o]
    const g = pixels[o + 1]
    const b = pixels[o + 2]
    const key = ((r >> SHIFT) << 10) | ((g >> SHIFT) << 5) | (b >> SHIFT)
    let bucket = buckets.get(key)
    if (!bucket) buckets.set(key, (bucket = { n: 0, r: 0, g: 0, b: 0 }))
    bucket.n++
    bucket.r += r
    bucket.g += g
    bucket.b += b
  }

  return {
    transparent,
    ranked: [...buckets].sort((a, b) => b[1].n - a[1].n),
  }
}

function quantise(pixels, width, height, bpp, { transparent, ranked }) {
  // One index is reserved for transparency when any pixel is transparent.
  const MAX = transparent > 0 ? 255 : 256
  if (ranked.length > MAX) return null

  const palette = ranked.map(([, v]) => [
    Math.round(v.r / v.n),
    Math.round(v.g / v.n),
    Math.round(v.b / v.n),
  ])
  const transparentIndex = transparent > 0 ? palette.length : -1
  if (transparentIndex >= 0) palette.push([0, 0, 0])

  const nearest = (r, g, b) => {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < palette.length; i++) {
      if (i === transparentIndex) continue
      const p = palette[i]
      const dr = r - p[0]
      const dg = g - p[1]
      const db = b - p[2]
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    return best
  }

  // Cached per colour: a bucket seen 40,000 times is matched once.
  const cache = new Map()
  const indices = Buffer.alloc(width * height)

  for (let i = 0; i < width * height; i++) {
    const o = i * bpp
    if (pixels[o + 3] === 0) {
      indices[i] = transparentIndex
      continue
    }
    const key = (pixels[o] << 16) | (pixels[o + 1] << 8) | pixels[o + 2]
    let idx = cache.get(key)
    if (idx === undefined) {
      idx = nearest(pixels[o], pixels[o + 1], pixels[o + 2])
      cache.set(key, idx)
    }
    indices[i] = idx
  }

  return {
    png: assemble(
      3,
      width,
      height,
      zlib.deflateSync(filterAdaptive(indices, width, height, 1), { level: 9 }),
      palette,
    ),
    colours: palette.length,
  }
}

function lossless(pixels, width, height) {
  return assemble(
    6,
    width,
    height,
    zlib.deflateSync(filterAdaptive(pixels, width, height, 4), { level: 9 }),
    null,
  )
}

/* ----------------------------------------------------------------- the pass */

let changed = 0

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.png'))) {
  const file = `${DIR}/${name}`
  const original = readFileSync(file)
  const { width, height, depth, colorType } = readHeader(original)

  if (colorType !== 6 || depth !== 8) {
    console.log(`${name}: colour type ${colorType}, not a truecolour RGBA file - left alone`)
    continue
  }

  const bpp = 4
  const pixels = unfilter(zlib.inflateSync(readData(original)), width, height, bpp)
  const before = original.length

  const { transparent, ranked } = buildPalette(pixels, width, height, bpp)
  const indexed = quantise(pixels, width, height, bpp, { transparent, ranked })

  // Indexed when the palette fits, lossless re-encode when it does not - which is the
  // gradient case, where 256 entries would band a visible edge.
  const result = indexed ?? { png: lossless(pixels, width, height), colours: null }
  const after = result.png.length

  if (after >= before) {
    console.log(`${name}: ${Math.round(before / 1024)} KB, no gain - left alone`)
    continue
  }

  writeFileSync(file, result.png)
  changed++
  const pct = Math.round((1 - after / before) * 100)
  console.log(
    `${name}: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB (-${pct}%)  ` +
      (indexed
        ? `indexed, ${result.colours} colours${transparent > 0 ? ' + transparency' : ''}`
        : 'lossless re-encode, gradient kept in full colour'),
  )
}

console.log(`\n${changed} file(s) rewritten`)