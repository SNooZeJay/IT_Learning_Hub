<template>
  <div ref="ctnDom" class="aurora-container" />
</template>

<script setup lang="ts">
/**
 * Aurora, from Vue Bits - https://vue-bits.dev/r/Aurora.json
 *
 * Upstream is installed verbatim in shape: the same shader, the same ribbon maths,
 * the same `blend` / `amplitude` / `speed` props. What follows is the list of changes,
 * because a component that has been quietly rewritten is worse than one that was
 * replaced wholesale.
 *
 * 1. COLOUR STOPS COME FROM THE PAGE, NOT FROM THE PROP.
 *
 *    Upstream defaults to `['#171D22', '#7cff67', '#171D22']` - a charcoal and a neon
 *    green, chosen for the dark Vue Bits demo. Those are NOT this landing page's
 *    colours, and using them would have put a green aurora on a cream page. The three
 *    stops are read from the `--ith-lp-glow-*` custom properties the landing page's
 *    three blurred circles already use, so the Aurora is literally the same palette,
 *    and so it follows the light/dark theme automatically: `main.css` declares a
 *    different value for each token under `.dark`, and a watcher re-resolves them when
 *    the theme flips.
 *
 *    `ogl`'s `Color` only parses hex, so the tokens are resolved through the browser
 *    first and converted back to hex. That is the price of reusing upstream's colour
 *    path, and it is worth it - it is what keeps the palette in one place.
 *
 * 2. THE STOPS ARE ORDERED TO MATCH WHERE THE CIRCLES ARE.
 *
 *    The shader maps the three stops across `uv.x`, so stop order is left to right.
 *    The circles are green top-left (36rem), beige top-right (42rem, the largest) and
 *    peach further down (30rem). So: green, beige, peach - and the biggest circle is
 *    the middle stop, which is both where the eye lands and where the ribbon is at its
 *    brightest. That is also why this is not a symmetric arrangement; an Aurora whose
 *    stops are evenly spaced would read as a different design.
 *
 * 3. `dpr` IS CAPPED AT 2.
 *
 *    Upstream lets ogl use the raw `devicePixelRatio`, so a 3x phone renders nine
 *    times the fragments of a 2x one. For a background this soft that is invisible and
 *    costs real milliseconds every frame.
 *
 * 4. `prefers-reduced-motion` DRAWS ONE FRAME AND STOPS.
 *
 *    Upstream animates unconditionally. The loop still runs one frame, so the
 *    background is present and correct, it simply does not move.
 *
 * 5. CONTEXT LOSS IS HANDLED.
 *
 *    WebGL contexts are dropped on some mobile browsers when a tab is backgrounded,
 *    and ogl does not recover. Without `preventDefault` the browser will not even try
 *    to restore it, and the canvas stays blank for the rest of the session.
 *
 * 6. A FAILED CONTEXT OR SHADER IS NOT FATAL.
 *
 *    No WebGL (older browser, blocklisted driver, no GPU memory) or a compile failure
 *    leaves an empty div. The landing page's own CSS circles are still there, so the
 *    page looks exactly as it did before this component existed.
 *
 * 7. THE RESIZE LISTENER IS ON THE ELEMENT, NOT THE WINDOW.
 *
 *    Upstream listens on `window`, which fires for scroll-driven layout changes that
 *    have nothing to do with this canvas, and misses the case that actually matters:
 *    the element changing size without the window doing so. A `ResizeObserver` on the
 *    container is both cheaper and correct.
 *
 * 8. `uColorStops` IS NOT REBUILT EVERY FRAME.
 *
 *    Upstream re-parses all three hex strings inside the animation loop, allocating
 *    three `Color` instances sixty times a second for a value that changes only when
 *    the theme does. Same for `uAmplitude` and `uBlend`.
 *
 * NOT CHANGED: `VERT`, `FRAG`, the `snoise` implementation, `COLOR_RAMP`, the
 * premultiplied-alpha fragment output, and the props.
 */
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \\
  int index = 0;                                            \\
  for (int i = 0; i < 2; i++) {                               \\
     ColorStop currentColor = colors[i];                    \\
     bool isInBetween = currentColor.position <= factor;    \\
     index = int(mix(float(index), float(i), float(isInBetween))); \\
  }                                                         \\
  ColorStop currentColor = colors[index];                   \\
  ColorStop nextColor = colors[index + 1];                  \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`

interface AuroraProps {
  colorStops?: string[]
  amplitude?: number
  blend?: number
  time?: number
  speed?: number
}

const props = withDefaults(defineProps<AuroraProps>(), {
  colorStops: () => ['#cfe3d2', '#f0e2cd', '#f6dcd0'],
  amplitude: 1.0,
  blend: 0.5,
  speed: 1.0,
})

const ctnDom = ref<HTMLDivElement | null>(null)

let animateId = 0
let renderer: InstanceType<typeof Renderer> | null = null
let program: InstanceType<typeof Program> | null = null
let resizeObserver: ResizeObserver | null = null
let mesh: InstanceType<typeof Mesh> | null = null
let canvas: HTMLCanvasElement | null = null
let onContextLost: ((e: Event) => void) | null = null
let reducedMotion = false

/**
 * The stops this page passes, and why in that order.
 *
 * Green is the top-left circle, beige the top-right one and the largest, peach the
 * circle further down. The shader ramps `colorStops` across `uv.x`, so the order is
 * left to right and the middle stop is the brightest part of the ribbon - which is
 * where the biggest circle already is.
 *
 * They are token NAMES rather than hex, because `main.css` declares a separate value
 * for each under `.dark`. Writing the light values here would leave a cream aurora
 * glowing over the dark theme, and hardcoding a second copy of the palette would be a
 * third place to update when it changes.
 */

/** What to use if the document or the tokens are unavailable. */
const FALLBACK_STOPS = ['#cfe3d2', '#f0e2cd', '#f6dcd0']

/**
 * Resolves one CSS colour to hex, because ogl's `Color` only parses hex.
 *
 * The browser resolves the token - including its dark-mode value - to an `rgb()`
 * string, and that is converted back to hex for `Color`.
 */
function toHex(input: string): string {
  const value = input.trim()
  if (value.startsWith('#')) return value
  if (typeof document === 'undefined') return FALLBACK_STOPS[0]

  const probe = document.createElement('span')
  probe.style.color = value
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const rgb = getComputedStyle(probe).color.match(/[\d.]+/g)
  probe.remove()
  if (!rgb || rgb.length < 3) return FALLBACK_STOPS[0]

  return (
    '#' +
    rgb
      .slice(0, 3)
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')
  )
}

/** The three stops for the theme in force right now. */
function resolveStops(): string[] {
  const explicit = props.colorStops ?? []
  const explicitLooksLikeTokens = explicit.length === 3 && explicit.every((c) => c.startsWith('--'))

  if (typeof document !== 'undefined' && explicitLooksLikeTokens) {
    const styles = getComputedStyle(document.documentElement)
    const fromTheme = explicit.map((t) => styles.getPropertyValue(t).trim())
    if (fromTheme.every(Boolean)) return fromTheme.map(toHex)
  }
  return explicit.length === 3 ? explicit.map(toHex) : FALLBACK_STOPS
}

/** Pushes the current stops into the shader. Called on mount and whenever the theme flips. */
function syncStops(): void {
  if (!program) return
  program.uniforms.uColorStops.value = resolveStops().map((hex) => {
    const c = new Color(hex)
    return [c.r, c.g, c.b]
  })
}

onMounted(() => {
  const ctn = ctnDom.value
  if (!ctn) return

  reducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  try {
    renderer = new Renderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      // Cap the pixel ratio: a 3x phone would otherwise render 9x the fragments for a
      // gradient this soft.
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    })
  } catch {
    // No WebGL. The div stays empty and the landing page's CSS circles carry the
    // background on their own.
    return
  }

  const gl = renderer.gl
  if (!gl) return
  canvas = gl.canvas
  gl.clearColor(0, 0, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.canvas.style.backgroundColor = 'transparent'
  gl.canvas.style.display = 'block'

  onContextLost = (e: Event) => {
    // Without preventDefault the browser will not attempt a restore at all.
    e.preventDefault()
    cancelAnimationFrame(animateId)
  }
  gl.canvas.addEventListener('webglcontextlost', onContextLost as EventListener)

  const resizeHandler = () => {
    if (!renderer || !program) return
    const width = ctn.offsetWidth
    const height = ctn.offsetHeight
    if (!width || !height) return
    renderer.setSize(width, height)
    program.uniforms.uResolution.value = [width, height]
  }

  // On the element, not on `window`: the canvas can change size without the window
  // doing so, and `window` also fires for changes that have nothing to do with it.
  resizeObserver = new ResizeObserver(resizeHandler)
  resizeObserver.observe(ctn)

  const geometry = new Triangle(gl)
  if (geometry.attributes.uv) {
    delete geometry.attributes.uv
  }

  const colorStopsArray = resolveStops().map((hex) => {
    const c = new Color(hex)
    return [c.r, c.g, c.b]
  })

  try {
    program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: props.amplitude },
        uColorStops: { value: colorStopsArray },
        uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
        uBlend: { value: props.blend },
      },
    })
  } catch {
    // Shader compile or link failed. Remove the canvas rather than leave a blank
    // rectangle over the background.
    gl.canvas.remove()
    canvas = null
    return
  }

  mesh = new Mesh(gl, { geometry, program })
  ctn.appendChild(gl.canvas)

  const update = (t: number) => {
    if (!program || !renderer || !mesh) return
    const time = props.time ?? t * 0.01
    program.uniforms.uTime.value = time * props.speed * 0.1
    renderer.render({ scene: mesh })

    // Reduced motion: the frame above still renders, the loop just stops here.
    if (reducedMotion) return
    animateId = requestAnimationFrame(update)
  }

  animateId = requestAnimationFrame(update)
  resizeHandler()
})

// Re-resolve the stops when the theme flips, so the Aurora follows light and dark.
watch(
  () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  () => syncStops(),
)

onUnmounted(() => {
  cancelAnimationFrame(animateId)
  resizeObserver?.disconnect()
  if (canvas && onContextLost) {
    canvas.removeEventListener('webglcontextlost', onContextLost as EventListener)
  }
  if (renderer) {
    const ctn = ctnDom.value
    const c = renderer.gl.canvas
    if (ctn && c.parentNode === ctn) {
      ctn.removeChild(c)
    }
    // Release the GPU context rather than waiting for the GC to notice it is unused.
    renderer.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
  canvas = null
  mesh = null
  program = null
  renderer = null
})
</script>

<style scoped>
.aurora-container {
  width: 100%;
  height: 100%;
  /* Never interactive, in both themes, regardless of what the caller remembers. */
  pointer-events: none;
}
</style>
