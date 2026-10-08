/**
 * Pack the rasterised PNG favicon sizes into a single multi-resolution `favicon.ico`.
 *
 * Written by hand because there is no image library on this machine - no sharp, no
 * ImageMagick, and the Python here has no pip. The format is small enough to do
 * directly, and the PNG-in-ICO variant has been supported since Vista, so the payloads
 * are the exact PNGs Chromium already resampled rather than a second lossy pass.
 *
 * Usage: node scripts/build-favicon.mjs
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'

const SRC = 'public/favicon-src'
const SIZES = [16, 32, 48]

const images = SIZES.map((size) => ({
  size,
  data: readFileSync(`${SRC}/favicon-${size}.png`),
}))

/** ICONDIR: reserved, type (1 = icon), image count. */
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(images.length, 4)

/** One 16-byte directory entry per image. Width and height are single bytes, so 256 is
 *  written as 0 - the format's way of saying "256" rather than "0". */
const directory = Buffer.alloc(16 * images.length)
let offset = header.length + directory.length

images.forEach((img, i) => {
  const at = i * 16
  directory.writeUInt8(img.size >= 256 ? 0 : img.size, at + 0)
  directory.writeUInt8(img.size >= 256 ? 0 : img.size, at + 1)
  directory.writeUInt8(0, at + 2) // palette size; 0 = truecolour
  directory.writeUInt8(0, at + 3) // reserved
  directory.writeUInt16LE(1, at + 4) // colour planes
  directory.writeUInt16LE(32, at + 6) // bits per pixel
  directory.writeUInt32LE(img.data.length, at + 8)
  directory.writeUInt32LE(offset, at + 12)
  offset += img.data.length
})

writeFileSync(
  'public/favicon.ico',
  Buffer.concat([header, directory, ...images.map((i) => i.data)]),
)

copyFileSync(`${SRC}/favicon-32.png`, 'public/favicon-32.png')
copyFileSync(`${SRC}/apple-touch-icon.png`, 'public/apple-touch-icon.png')
copyFileSync(`${SRC}/icon-512.png`, 'public/icon-512.png')

console.log(
  `  favicon.ico        ${SIZES.join(', ')} px  ${readFileSync('public/favicon.ico').length} bytes`,
)
console.log('  favicon-32.png     copied')
console.log('  apple-touch-icon.png  copied')
console.log('  icon-512.png       copied')
