import * as THREE from 'three'

/**
 * Procedural texture generator.
 * Creates crisp, high-performance textures using HTML5 2D canvas, cached as Three.js CanvasTextures.
 */

const textureCache = new Map<string, THREE.CanvasTexture>()

function createTileableCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  // Canvas art is authored in sRGB; without this PBR lighting washes the colours out.
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function getBrickTexture(): THREE.CanvasTexture {
  if (textureCache.has('brick')) return textureCache.get('brick')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#222733'
    ctx.fillRect(0, 0, w, h)
    const rows = 16
    const cols = 8
    const rh = h / rows
    const cw = w / cols
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw / 2)
      for (let c = -1; c <= cols; c++) {
        const x = c * cw + offset
        const y = r * rh
        const shade = Math.floor(45 + Math.random() * 20)
        ctx.fillStyle = `rgb(${shade}, ${shade + 6}, ${shade + 18})`
        ctx.fillRect(x + 2, y + 2, cw - 4, rh - 4)
        // Highlight edge
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fillRect(x + 2, y + 2, cw - 4, 1.5)
        // Shadow edge
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.fillRect(x + 2, y + rh - 3, cw - 4, 1.5)
      }
    }
  })
  tex.repeat.set(2, 2)
  textureCache.set('brick', tex)
  return tex
}

export function getConcreteTexture(): THREE.CanvasTexture {
  if (textureCache.has('concrete')) return textureCache.get('concrete')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#2c3340'
    ctx.fillRect(0, 0, w, h)
    // Speckles and aggregate
    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const bright = Math.random() > 0.5
      ctx.fillStyle = bright ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.14)'
      ctx.fillRect(x, y, 1.5, 1.5)
    }
    // Formwork seams
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, w, h)
    ctx.beginPath()
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
  })
  tex.repeat.set(3, 3)
  textureCache.set('concrete', tex)
  return tex
}

export function getMetalPanelTexture(): THREE.CanvasTexture {
  if (textureCache.has('metalPanel')) return textureCache.get('metalPanel')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3a4250'
    ctx.fillRect(0, 0, w, h)
    // Brushed lines
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)'
      ctx.fillRect(0, Math.random() * h, w, 1)
    }
    // Panel grid
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.lineWidth = 3
    ctx.strokeRect(4, 4, w - 8, h - 8)
    // Rivets
    const corners = [
      [14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14],
      [w / 2, 14], [w / 2, h - 14], [14, h / 2], [w - 14, h / 2],
    ]
    for (const [rx, ry] of corners) {
      ctx.fillStyle = '#1c212a'
      ctx.beginPath()
      ctx.arc(rx, ry, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.beginPath()
      ctx.arc(rx - 1, ry - 1, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  tex.repeat.set(2, 2)
  textureCache.set('metalPanel', tex)
  return tex
}

export function getHazardStripeTexture(): THREE.CanvasTexture {
  if (textureCache.has('hazard')) return textureCache.get('hazard')!
  const tex = createTileableCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#f5b016'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#1a1d24'
    const stripeW = 20
    for (let x = -w; x < w * 2; x += stripeW * 2) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + stripeW, 0)
      ctx.lineTo(x + stripeW + h, h)
      ctx.lineTo(x + h, h)
      ctx.closePath()
      ctx.fill()
    }
  })
  tex.repeat.set(4, 1)
  textureCache.set('hazard', tex)
  return tex
}

export function getWoodCrateTexture(): THREE.CanvasTexture {
  if (textureCache.has('woodCrate')) return textureCache.get('woodCrate')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#594433'
    ctx.fillRect(0, 0, w, h)
    // Planks
    const planks = 5
    const ph = h / planks
    for (let i = 0; i < planks; i++) {
      const y = i * ph
      const grain = 70 + (i % 2) * 12
      ctx.fillStyle = `rgb(${grain + 15}, ${grain - 5}, ${grain - 25})`
      ctx.fillRect(0, y + 2, w, ph - 4)
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(0, y, w, 2)
    }
    // Diagonal brace
    ctx.fillStyle = '#4d3928'
    ctx.lineWidth = 14
    ctx.strokeStyle = '#423122'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(w, h)
    ctx.stroke()
    ctx.strokeStyle = '#322316'
    ctx.lineWidth = 16
    ctx.strokeRect(0, 0, w, h)
    // Stenciled text
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = 'bold 22px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('SURGE // 01', w / 2, h / 2 + 8)
  })
  textureCache.set('woodCrate', tex)
  return tex
}

export function getTreeBarkTexture(): THREE.CanvasTexture {
  if (textureCache.has('treeBark')) return textureCache.get('treeBark')!
  const tex = createTileableCanvas(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#30261f'
    ctx.fillRect(0, 0, w, h)
    // Vertical fibrous furrows
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const len = 30 + Math.random() * 80
      const wide = 1 + Math.random() * 4
      ctx.fillStyle = Math.random() > 0.4 ? 'rgba(20,15,10,0.65)' : 'rgba(75,60,45,0.45)'
      ctx.fillRect(x, y, wide, len)
    }
    // Moss patches
    for (let m = 0; m < 12; m++) {
      ctx.fillStyle = 'rgba(45,75,35,0.3)'
      ctx.beginPath()
      ctx.arc(Math.random() * w, Math.random() * h, 12 + Math.random() * 20, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  tex.repeat.set(1, 4)
  textureCache.set('treeBark', tex)
  return tex
}

export function getJungleFoliageTexture(): THREE.CanvasTexture {
  if (textureCache.has('foliage')) return textureCache.get('foliage')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1c3619'
    ctx.fillRect(0, 0, w, h)
    // Leaf clusters
    const greens = ['#274c23', '#2d5c28', '#386f32', '#488a40', '#183015']
    for (let i = 0; i < 240; i++) {
      const lx = Math.random() * w
      const ly = Math.random() * h
      const rad = 8 + Math.random() * 16
      ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)]
      ctx.beginPath()
      ctx.ellipse(lx, ly, rad, rad * 0.5, Math.random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  tex.repeat.set(2, 2)
  textureCache.set('foliage', tex)
  return tex
}

export function getAsphaltTexture(): THREE.CanvasTexture {
  if (textureCache.has('asphalt')) return textureCache.get('asphalt')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1e2229'
    ctx.fillRect(0, 0, w, h)
    // Aggregate grain
    for (let i = 0; i < 3500; i++) {
      const x = Math.random() * w
      const y = Math.random() * h
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.18)'
      ctx.fillRect(x, y, 1.2, 1.2)
    }
    // Road marker stripe
    ctx.fillStyle = 'rgba(240, 200, 70, 0.45)'
    ctx.fillRect(w / 2 - 4, 30, 8, 80)
    ctx.fillRect(w / 2 - 4, 150, 8, 80)
  })
  tex.repeat.set(4, 4)
  textureCache.set('asphalt', tex)
  return tex
}

export function getRoofGravelTexture(): THREE.CanvasTexture {
  if (textureCache.has('roofGravel')) return textureCache.get('roofGravel')!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1c2028'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 2000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.2)'
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
    }
    // Bitumen seam lines
    ctx.fillStyle = '#111419'
    ctx.fillRect(0, 60, w, 4)
    ctx.fillRect(0, 190, w, 4)
  })
  tex.repeat.set(3, 3)
  textureCache.set('roofGravel', tex)
  return tex
}

export function getCorrugatedMetalTexture(): THREE.CanvasTexture {
  if (textureCache.has('corrugated')) return textureCache.get('corrugated')!
  const tex = createTileableCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#424b59'
    ctx.fillRect(0, 0, w, h)
    const ribs = 16
    const rh = h / ribs
    for (let i = 0; i < ribs; i++) {
      const y = i * rh
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(0, y, w, rh * 0.45)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(0, y + rh * 0.45, w, rh * 0.55)
    }
  })
  tex.repeat.set(2, 4)
  textureCache.set('corrugated', tex)
  return tex
}

export function getPlayerArmorTexture(isEnemy: boolean): THREE.CanvasTexture {
  const key = isEnemy ? 'playerEnemy' : 'playerSelf'
  if (textureCache.has(key)) return textureCache.get(key)!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    // Base tactical weave
    ctx.fillStyle = isEnemy ? '#261b1b' : '#1b222a'
    ctx.fillRect(0, 0, w, h)
    // Hexagonal Kevlar weave
    ctx.strokeStyle = isEnemy ? 'rgba(220,70,50,0.15)' : 'rgba(60,140,210,0.15)'
    ctx.lineWidth = 1
    const size = 16
    for (let y = 0; y < h + size; y += size * 1.5) {
      for (let x = 0; x < w + size; x += size * Math.sqrt(3)) {
        ctx.beginPath()
        for (let a = 0; a < 6; a++) {
          const angle = (Math.PI / 3) * a
          const hx = x + size * Math.cos(angle)
          const hy = y + size * Math.sin(angle)
          if (a === 0) ctx.moveTo(hx, hy)
          else ctx.lineTo(hx, hy)
        }
        ctx.closePath()
        ctx.stroke()
      }
    }
    // Armor plates
    ctx.fillStyle = isEnemy ? '#422825' : '#2b3644'
    ctx.fillRect(20, 20, w - 40, 80)
    ctx.fillRect(30, 130, w - 60, 90)
    // Tactical straps and trim
    ctx.fillStyle = isEnemy ? '#d14334' : '#3fa9f5'
    ctx.fillRect(16, 18, w - 32, 4)
    ctx.fillRect(16, 98, w - 32, 4)
  })
  textureCache.set(key, tex)
  return tex
}

export function getVisorEmissiveTexture(colorHex: string): THREE.CanvasTexture {
  const key = 'visor_' + colorHex
  if (textureCache.has(key)) return textureCache.get(key)!
  const tex = createTileableCanvas(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#0a0d14'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = colorHex
    // Glowing visor scanline & hex pattern
    ctx.fillRect(8, h / 2 - 4, w - 16, 8)
    for (let x = 12; x < w - 12; x += 14) {
      ctx.beginPath()
      ctx.arc(x, h / 2, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  })
  textureCache.set(key, tex)
  return tex
}

export function getWeaponTexture(colorHex: string, pattern: 'camo' | 'carbon' | 'tech'): THREE.CanvasTexture {
  const key = `wpn_${colorHex}_${pattern}`
  if (textureCache.has(key)) return textureCache.get(key)!
  const tex = createTileableCanvas(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1f242c'
    ctx.fillRect(0, 0, w, h)
    if (pattern === 'carbon') {
      // Carbon fiber pattern
      for (let y = 0; y < h; y += 8) {
        for (let x = 0; x < w; x += 8) {
          ctx.fillStyle = (x + y) % 16 === 0 ? '#2d3440' : '#171b22'
          ctx.fillRect(x, y, 7, 7)
        }
      }
    } else if (pattern === 'tech') {
      // High-tech circuit traces
      ctx.strokeStyle = colorHex
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(20, 40)
      ctx.lineTo(80, 40)
      ctx.lineTo(120, 80)
      ctx.lineTo(220, 80)
      ctx.moveTo(40, 160)
      ctx.lineTo(140, 160)
      ctx.lineTo(180, 200)
      ctx.lineTo(240, 200)
      ctx.stroke()
      // Dots
      ctx.fillStyle = colorHex
      for (const [cx, cy] of [[80, 40], [120, 80], [140, 160], [180, 200]]) {
        ctx.beginPath()
        ctx.arc(cx, cy, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (pattern === 'camo') {
      // Layered camouflage blotches with a couple of darker foliage shades.
      ctx.fillStyle = '#343a2d'
      ctx.fillRect(0, 0, w, h)
      const blotches = ['#252b20', '#48503c', '#5b624a', colorHex]
      for (let i = 0; i < 46; i++) {
        ctx.fillStyle = blotches[i % blotches.length]
        ctx.globalAlpha = i % 4 === 3 ? 0.35 : 1
        ctx.beginPath()
        ctx.ellipse(
          Math.random() * w,
          Math.random() * h,
          14 + Math.random() * 30,
          8 + Math.random() * 18,
          Math.random() * Math.PI,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      ctx.globalAlpha = 1
      // Dark stencilled unit marks over the camo.
      ctx.fillStyle = 'rgba(12,14,10,0.55)'
      ctx.font = 'bold 20px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('SURGE', w / 2, h / 2 + 7)
    } else {
      // Tactical panel lines
      ctx.fillStyle = '#2b3340'
      ctx.fillRect(10, 10, w - 20, h - 20)
      ctx.strokeStyle = '#12161c'
      ctx.lineWidth = 3
      ctx.strokeRect(10, 10, w - 20, h - 20)
      ctx.fillStyle = colorHex
      ctx.fillRect(12, 12, w - 24, 6)
      ctx.fillRect(12, h - 20, w - 24, 6)
    }
    // Edge wear and scratches so every weapon skin reads as used metal.
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(220,226,235,0.10)' : 'rgba(0,0,0,0.22)'
      ctx.lineWidth = Math.random() > 0.7 ? 1.6 : 0.8
      const x = Math.random() * w
      const y = Math.random() * h
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 4 + Math.random() * 22, y + (Math.random() - 0.5) * 6)
      ctx.stroke()
    }
    // Metal corner highlight pass.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, w - 4, h - 4)
  })
  textureCache.set(key, tex)
  return tex
}

/** Tinted vehicle / aircraft canopy glass with reflective streaks. */
export function getGlassTexture(): THREE.CanvasTexture {
  if (textureCache.has('glass')) return textureCache.get('glass')!
  const tex = createTileableCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#141c26'
    ctx.fillRect(0, 0, w, h)
    // Angled reflections.
    const glare = ctx.createLinearGradient(0, h, w, 0)
    glare.addColorStop(0, 'rgba(120,170,210,0)')
    glare.addColorStop(0.45, 'rgba(150,200,235,0.28)')
    glare.addColorStop(0.55, 'rgba(90,130,170,0.10)')
    glare.addColorStop(1, 'rgba(180,220,255,0.02)')
    ctx.fillStyle = glare
    ctx.fillRect(0, 0, w, h)
    // Window frame grid.
    ctx.strokeStyle = 'rgba(8,12,18,0.85)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, w - 4, h - 4)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.moveTo(0, h / 2)
    ctx.lineTo(w, h / 2)
    ctx.stroke()
  })
  tex.repeat.set(1, 1)
  textureCache.set('glass', tex)
  return tex
}

/** Armoured helmet shell for the third-person player models. */
export function getHelmetTexture(isEnemy: boolean): THREE.CanvasTexture {
  const key = isEnemy ? 'helmetEnemy' : 'helmetSelf'
  if (textureCache.has(key)) return textureCache.get(key)!
  const accent = isEnemy ? '#ff3b2f' : '#2f9bff'
  const tex = createTileableCanvas(128, 128, (ctx, w, h) => {
    ctx.fillStyle = isEnemy ? '#241a18' : '#171e28'
    ctx.fillRect(0, 0, w, h)
    // Carbon shell weave.
    for (let y = 0; y < h; y += 8) {
      for (let x = 0; x < w; x += 8) {
        ctx.fillStyle = (x + y) % 16 === 0 ? '#2b323d' : '#1d242e'
        ctx.fillRect(x, y, 7, 7)
      }
    }
    // Armour plates and rivets.
    ctx.fillStyle = 'rgba(70,82,98,0.55)'
    ctx.fillRect(14, 18, w - 28, 34)
    ctx.fillRect(20, 60, w - 40, 40)
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.lineWidth = 3
    ctx.strokeRect(14, 18, w - 28, 34)
    ctx.strokeRect(20, 60, w - 40, 40)
    // Faction stripe.
    ctx.fillStyle = accent
    ctx.fillRect(14, 54, w - 28, 4)
    for (let x = 22; x < w - 14; x += 18) {
      ctx.fillStyle = 'rgba(200,210,225,0.5)'
      ctx.beginPath()
      ctx.arc(x, 24, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    // Side vents.
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    for (let i = 0; i < 4; i++) ctx.fillRect(22 + i * 6, 66, 3, 28)
  })
  textureCache.set(key, tex)
  return tex
}
