// Renders the PNG/ICO icon set in public/ from public/favicon.svg and icon-src/maskable.svg.
// Run `node icon-src/render-icons.mjs` from /web after changing either SVG, and commit the output.
// A local headless Chrome is the rasteriser (set CHROME if it isn't at one of the default paths),
// so the project takes on no image-processing dependency for a job that runs once per logo change.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..')

const chrome =
  process.env.CHROME ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].find((p) => existsSync(p))
if (!chrome) throw new Error('No Chrome found; set CHROME to its executable path')

const svg = (file) => `data:image/svg+xml;base64,${readFileSync(join(web, file)).toString('base64')}`
const mark = svg('public/favicon.svg')
const maskable = svg('icon-src/maskable.svg')

// [output, source, px]. The any-purpose icons keep the tile's transparent rounded corners; the
// maskable and apple-touch icons are opaque squares the OS crops itself.
const jobs = [
  ['pwa-64x64.png', mark, 64],
  ['pwa-192x192.png', mark, 192],
  ['pwa-512x512.png', mark, 512],
  ['maskable-icon-512x512.png', maskable, 512],
  ['apple-touch-icon-180x180.png', maskable, 180],
  ['favicon.ico', mark, 48],
]

// Each job draws its SVG into a canvas of exactly its size, so every PNG is rasterised from the
// vector at its final size rather than scaled down from a bigger bitmap. --dump-dom then prints
// the finished data URLs.
const page = `<pre id="out"></pre><script>
Promise.all(${JSON.stringify(jobs)}.map(([name, src, px]) => new Promise((done) => {
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = px
    canvas.getContext('2d').drawImage(img, 0, 0, px, px)
    done([name, canvas.toDataURL('image/png')])
  }
  img.src = src
}))).then((out) => { document.getElementById('out').textContent = JSON.stringify(out) })
</script>`

const dir = mkdtempSync(join(tmpdir(), 'heliograph-icons-'))
try {
  const html = join(dir, 'render.html')
  writeFileSync(html, page)
  const dom = execFileSync(
    chrome,
    ['--headless=new', '--disable-gpu', '--virtual-time-budget=5000', '--dump-dom', pathToFileURL(html).href],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const rendered = JSON.parse(dom.match(/<pre id="out">(.*)<\/pre>/s)[1])
  for (const [name, dataUrl] of rendered) {
    const png = Buffer.from(dataUrl.split(',')[1], 'base64')
    writeFileSync(join(web, 'public', name), name.endsWith('.ico') ? ico(png, 48) : png)
    console.log(`public/${name}`)
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// A single-image .ico whose one entry is a PNG, which every browser that reads favicon.ico accepts.
function ico(png, px) {
  const head = Buffer.alloc(22)
  head.writeUInt16LE(1, 2) // type: icon
  head.writeUInt16LE(1, 4) // image count
  head[6] = px
  head[7] = px
  head.writeUInt16LE(1, 10) // colour planes
  head.writeUInt16LE(32, 12) // bits per pixel
  head.writeUInt32LE(png.length, 14)
  head.writeUInt32LE(22, 18) // offset of the PNG data
  return Buffer.concat([head, png])
}
