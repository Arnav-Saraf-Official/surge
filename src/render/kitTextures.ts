import * as THREE from 'three'
import { createTileableCanvas } from './textures'

/**
 * Stylised surface library for the prefab kit.
 *
 * Fortnite's look is not photoreal resolution, it's large hand-painted shapes,
 * strong value separation and readable silhouettes. These textures are painted
 * at 512px with big brush strokes, then a tangent-space normal map is derived
 * from their luminance so every surface catches the sun instead of looking flat.
 */

const cache = new Map<string, THREE.CanvasTexture>()
const normalCache = new WeakMap<HTMLCanvasElement, Map<number, THREE.CanvasTexture>>()

function normaliseCanvas(source: HTMLCanvasElement, size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0, size, size)
  return canvas
}

/**
 * Derives a tileable normal map from an albedo texture's luminance. Wrapping
 * sampling keeps the Sobel result seamless when the texture repeats.
 */
export function getSurfaceNormal(texture: THREE.Texture, strength = 1): THREE.CanvasTexture {
  const image = texture.image as HTMLCanvasElement | undefined
  if (!image || typeof image.getContext !== 'function') {
    const flat = document.createElement('canvas')
    flat.width = flat.height = 1
    const ctx = flat.getContext('2d')!
    ctx.fillStyle = 'rgb(128,128,255)'
    ctx.fillRect(0, 0, 1, 1)
    return new THREE.CanvasTexture(flat)
  }

  let byStrength = normalCache.get(image)
  if (!byStrength) {
    byStrength = new Map()
    normalCache.set(image, byStrength)
  }
  const cached = byStrength.get(strength)
  if (cached) return cached

  const size = 256
  const sample = normaliseCanvas(image, size)
  const data = sample.getContext('2d')!.getImageData(0, 0, size, size).data
  const height = new Float32Array(size * size)
  for (let i = 0; i < height.length; i++) {
    height[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255
  }

  const out = document.createElement('canvas')
  out.width = out.height = size
  const ctx = out.getContext('2d')!
  const imageData = ctx.createImageData(size, size)
  const scale = 2.2 * strength

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = height[y * size + ((x - 1 + size) % size)]
      const right = height[y * size + ((x + 1) % size)]
      const up = height[((y - 1 + size) % size) * size + x]
      const down = height[((y + 1) % size) * size + x]
      const dx = (right - left) * scale
      const dy = (down - up) * scale
      const len = Math.hypot(dx, dy, 1)
      const index = (y * size + x) * 4
      imageData.data[index] = Math.round(((-dx / len) * 0.5 + 0.5) * 255)
      imageData.data[index + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255)
      imageData.data[index + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255)
      imageData.data[index + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)

  const normal = new THREE.CanvasTexture(out)
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping
  normal.colorSpace = THREE.NoColorSpace
  normal.anisotropy = 4
  byStrength.set(strength, normal)
  return normal
}

/** Big soft leaf clusters with rim highlights, used for faceted canopy blobs. */
export function getCanopyTexture(): THREE.CanvasTexture {
  const hit = cache.get('canopy')
  if (hit) return hit
  const tex = createTileableCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3a6330'
    ctx.fillRect(0, 0, w, h)
    const shades = ['#3f6f33', '#4c7f3b', '#5a9245', '#6aa753', '#7cb85f', '#345a2b']
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const radius = 9 + Math.random() * 26
      const angle = Math.random() * Math.PI
      ctx.fillStyle = shades[Math.floor(Math.random() * shades.length)]
      ctx.globalAlpha = 0.55 + Math.random() * 0.45
      ctx.beginPath()
      // Leaf blade: pointed ellipse with a slight asymmetric bend.
      ctx.ellipse(x, y, radius, radius * 0.42, angle, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.5
      ctx.strokeStyle = 'rgba(196, 232, 150, 0.5)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(x - Math.cos(angle) * radius, y - Math.sin(angle) * radius * 0.42)
      ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.42)
      ctx.stroke()
    }
    // Warm sunlight break-up across the canopy.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(220, 240, 150, 0.10)'
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 40, 8 + Math.random() * 18, Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  })
  tex.repeat.set(2, 2)
  cache.set('canopy', tex)
  return tex
}

/** Fluted jungle bark with moss in the hollows. */
export function getBarkTexture(): THREE.CanvasTexture {
  const hit = cache.get('kitBark')
  if (hit) return hit
  const tex = createTileableCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3a2a1f'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * w
      const ridge = 6 + Math.random() * 22
      const grad = ctx.createLinearGradient(x, 0, x + ridge, 0)
      grad.addColorStop(0, 'rgba(18, 12, 8, 0.85)')
      grad.addColorStop(0.45, 'rgba(96, 74, 54, 0.55)')
      grad.addColorStop(1, 'rgba(28, 19, 13, 0.8)')
      ctx.fillStyle = grad
      ctx.fillRect(x, 0, ridge, h)
      ctx.strokeStyle = 'rgba(140, 112, 82, 0.18)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x + ridge * 0.4, 0)
      for (let y = 0; y < h; y += 18) ctx.lineTo(x + ridge * 0.4 + Math.sin(y * 0.05 + x) * 2.5, y)
      ctx.stroke()
    }
    // Moss collects on one side of the trunk.
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(${50 + Math.random() * 30}, ${90 + Math.random() * 40}, ${40 + Math.random() * 20}, 0.22)`
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, 8 + Math.random() * 26, 10 + Math.random() * 34, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  tex.repeat.set(1, 2)
  cache.set('kitBark', tex)
  return tex
}

/** Weathered decking planks with nails and end grain. */
export function getPlankTexture(): THREE.CanvasTexture {
  const hit = cache.get('plank')
  if (hit) return hit
  const tex = createTileableCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4d4030'
    ctx.fillRect(0, 0, w, h)
    const planks = 5
    const ph = h / planks
    for (let p = 0; p < planks; p++) {
      const y = p * ph
      const warm = 62 + Math.random() * 26
      ctx.fillStyle = `rgb(${warm + 24}, ${warm + 2}, ${warm - 20})`
      ctx.fillRect(0, y + 2, w, ph - 4)
      // Grain lines following the plank direction.
      for (let g = 0; g < 26; g++) {
        ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(38, 26, 16, 0.35)' : 'rgba(190, 162, 120, 0.18)'
        ctx.lineWidth = 0.8 + Math.random() * 1.6
        const gy = y + 6 + Math.random() * (ph - 12)
        ctx.beginPath()
        ctx.moveTo(0, gy)
        for (let x = 0; x <= w; x += 24) ctx.lineTo(x, gy + Math.sin(x * 0.03 + p) * 1.6)
        ctx.stroke()
      }
      // Shadowed gap between planks.
      ctx.fillStyle = 'rgba(10, 8, 6, 0.85)'
      ctx.fillRect(0, y, w, 3)
      // Nail heads.
      for (const nx of [w * 0.12, w * 0.88]) {
        ctx.fillStyle = 'rgba(20, 18, 16, 0.85)'
        ctx.beginPath()
        ctx.arc(nx, y + ph / 2, 3.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(205, 205, 205, 0.3)'
        ctx.beginPath()
        ctx.arc(nx - 1, y + ph / 2 - 1, 1.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  })
  tex.repeat.set(1, 1)
  cache.set('plank', tex)
  return tex
}

/** Chunky ashlar blocks with mossy mortar, for the ruin maze. */
export function getStoneTexture(): THREE.CanvasTexture {
  const hit = cache.get('stone')
  if (hit) return hit
  const tex = createTileableCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3c4139'
    ctx.fillRect(0, 0, w, h)
    const rows = 5
    const rh = h / rows
    for (let r = 0; r < rows; r++) {
      const cols = 3
      const cw = w / cols
      const offset = (r % 2) * (cw * 0.5)
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + offset + 4
        const y = r * rh + 4
        const tone = 88 + Math.random() * 40
        ctx.fillStyle = `rgb(${tone}, ${tone + 5}, ${tone - 12})`
        ctx.fillRect(x, y, cw - 8, rh - 8)
        // Chiselled top light and bottom shadow give the block real volume.
        ctx.fillStyle = 'rgba(255,255,255,0.13)'
        ctx.fillRect(x, y, cw - 8, 4)
        ctx.fillStyle = 'rgba(0,0,0,0.4)'
        ctx.fillRect(x, y + rh - 12, cw - 8, 5)
        // Weathering pits.
        for (let i = 0; i < 16; i++) {
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(235,235,225,0.10)'
          ctx.beginPath()
          ctx.ellipse(x + Math.random() * (cw - 14), y + Math.random() * (rh - 14), 2 + Math.random() * 7, 1 + Math.random() * 4, Math.random() * Math.PI, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    // Moss creeping out of the joints.
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 25}, ${78 + Math.random() * 40}, ${38 + Math.random() * 20}, ${0.18 + Math.random() * 0.28})`
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, 5 + Math.random() * 16, 3 + Math.random() * 9, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  tex.repeat.set(1, 1)
  cache.set('stone', tex)
  return tex
}

/** Layered, lichen-stained boulder surface. */
export function getRockTexture(): THREE.CanvasTexture {
  const hit = cache.get('rock')
  if (hit) return hit
  const tex = createTileableCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a5148'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 170; i++) {
      const y = Math.random() * h
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
      ctx.fillRect(0, y, w, 1 + Math.random() * 5)
    }
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = 'rgba(22, 24, 20, 0.45)'
      ctx.lineWidth = 1 + Math.random() * 2.5
      ctx.beginPath()
      let x = Math.random() * w
      let y = Math.random() * h
      ctx.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 70
        y += (Math.random() - 0.5) * 70
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(${90 + Math.random() * 30}, ${110 + Math.random() * 30}, ${70 + Math.random() * 25}, 0.14)`
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  tex.repeat.set(2, 2)
  cache.set('rock', tex)
  return tex
}

/** Jungle floor: dark soil, leaf litter and sparse grass speckle. */
export function getGroundTexture(): THREE.CanvasTexture {
  const hit = cache.get('ground')
  if (hit) return hit
  const tex = createTileableCanvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4b4b3c'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 2200; i++) {
      const g = 60 + Math.random() * 45
      ctx.fillStyle = `rgba(${g + 14}, ${g + 10}, ${g - 12}, 0.5)`
      ctx.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1 + Math.random() * 3)
    }
    // Fallen leaves.
    for (let i = 0; i < 220; i++) {
      const warm = Math.random()
      ctx.fillStyle = warm > 0.6 ? 'rgba(120, 96, 50, 0.45)' : 'rgba(70, 92, 48, 0.5)'
      ctx.beginPath()
      ctx.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 12, 2 + Math.random() * 5, Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    // Small grass blades.
    for (let i = 0; i < 380; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      ctx.strokeStyle = `rgba(${70 + Math.random() * 40}, ${100 + Math.random() * 45}, ${50 + Math.random() * 25}, 0.5)`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 7, y - 5 - Math.random() * 10)
      ctx.stroke()
    }
  })
  tex.repeat.set(1, 1)
  cache.set('ground', tex)
  return tex
}
