class BaseShape {
  constructor(data) {
    for (const key in data) this[key] = data[key]
  }
  merge(obj) {
    this.stroke = obj.stroke
    this.lineWidth = obj.lineWidth
    this.lineJoin = obj.lineJoin
    this.lineCap = obj.lineCap
  }
  canMerge(obj) {
    return this.constructor === obj.constructor && this._matrix === obj.matrix && this.clips === obj.clips &&
          this.alpha === 1 && obj.alpha === 1 &&
          this.isSameProperty(obj) && !this.stroke && !obj.fill && obj.stroke
  }
  isSameProperty(obj) {
    return false
  }
  styleAttrs() {
    const attrs = []
    attrs.push(`fill="${this.fill === undefined ? 'none' : this.fill || 'black'}"`)
    attrs.push(`stroke="${this.stroke === undefined ? 'none' : this.stroke || 'black'}"`)
    if (this.stroke) {
      attrs.push(`stroke-width="${this.lineWidth}"`)
      attrs.push(`stroke-linejoin="${this.lineJoin}"`)
      attrs.push(`stroke-linecap="${this.lineCap}"`)
    }
    if (this.stroke && this.alpha !== 1) attrs.push(`stroke-opacity="${this.alpha}"`)
    if (this.fill && this.alpha !== 1) attrs.push(`fill-opacity="${this.alpha}"`)
    return attrs
  }
}

class PathShape extends BaseShape {
  constructor(data) {
    super(data)
  }
  isSameProperty(obj) {
    return this.path == obj.path
  }
  toSVG() {
    const attrs = [`d="${this.path}"`, ...this.styleAttrs()]
    return `<path ${attrs.join(' ')} />`
  }
}
let measureSpan = null
function escapeText(text) {
  measureSpan = measureSpan || document.createElement('span')
  measureSpan.textContent = text
  const escaped = measureSpan.innerHTML
  measureSpan.textContent = ''
  return escaped
}

const textAlignConverts = { center: 'middle' }
const textBaselineConverts = {
  top: 'text-before-edge',
  middle: 'central',
  bottom: 'text-after-edge'
}

class TextShape extends BaseShape {
  constructor(data) {
    super(data)
  }
  isSameProperty(obj) {
    return this.text === obj.text && this.font == obj.font && this.align === obj.align && this.baseline === obj.baseline
  }
  toSVG() {
    return this.toTag('text')
  }
  toTSpanSVG(matrix) {
    return this.toTag('tspan', matrix)
  }
  toTag(tagName, matrix) {
    const [size, family, style] = this.font.split(' ')
    const scale = matrix ? matrix.averageScale : 1
    const { x, y } = matrix ? matrix.convert(this) : this
    const attrs = [
      ...this.styleAttrs(),
      `x="${x}px"`,
      `y="${y}px"`,
      `font-size="${scale * parseFloat(size)}px"`,
      `font-family="${family}"`,
      `dominant-baseline="${textBaselineConverts[this.baseline] || this.baseline}"`,
      `text-anchor="${textAlignConverts[this.align] || this.align}"`
    ]
    if (style) attrs.push(`font-style=${style}`)
    return `<${tagName} ${attrs.join(' ')}>${escapeText(this.text)}</${tagName}>`
  }
}

class ImageShape extends BaseShape {
  constructor(data) {
    super(data)
    this.originalSrc = this.src
  }
  async load() {
    const { src } = this
    if (!src.match(/^https?:\/\//)) return
    this.src = ''
    const res = await fetch(src, {
      mode: 'cors',
      credentials: 'same-origin',
    })
    const blob = await res.blob()
    const reader = new FileReader()
    reader.readAsDataURL(blob)
    await new Promise(resolve => { reader.onload = resolve })
    this.src = reader.result
  }
  toSVG() {
    const { src, width, height, dx, dy, dw, dh, sx, sy, sw, sh, alpha } = this
    if (sx == null) {
      return `<image xlink:href="${src}" x="${dx}" y="${dy}" width="${dw}" height="${dh}" opacity=${alpha} />`
    } else {
      const id = `i${Math.random().toString(36).substr(2)}`
      return [
        `<clipPath id="${id}"><path d="M${dx},${dy}L${dx + dw},${dy}L${dx + dw},${dy + dh}L${dx},${dy + dh}" /></clipPath>`,
        `<g clip-path="url(#${id})">`,
        `<g transform="translate(${dx},${dy})">`,
        `<image xlink:href="${src}" x="${-sx * dw / sw}" y="${-sy * dh / sh}" width="${width * dw / sw}" height="${height * dh / sh}" opacity=${alpha} />`,
        '</g></g>'
      ].join("\n")
    }
  }
}
class Matrix {
  constructor(xx = 1, xy = 0, tx = 0, yx = 0, yy = 1, ty = 0) {
    this.xx = xx
    this.xy = xy
    this.yx = yx
    this.yy = yy
    this.tx = tx
    this.ty = ty
  }
  scale(sx, sy) {
    return new Matrix(
      this.xx * sx,
      this.xy * sy,
      this.tx,
      this.yx * sx,
      this.yy * sy,
      this.ty
    )
  }
  translate(tx, ty) {
    return new Matrix(
      this.xx,
      this.xy,
      this.tx + tx * this.xx + ty * this.xy,
      this.yx,
      this.yy,
      this.ty + tx * this.yx + ty * this.yy)
  }
  rotate(theta) {
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    return new Matrix(
      this.xx * cos + this.xy * sin,
      -this.xx * sin + this.xy * cos,
      this.tx,
      this.yx * cos + this.yy * sin,
      -this.yx * sin + this.yy * cos,
      this.ty
    )
  }
  toTransform() {
    return `matrix(${this.xx},${this.yx},${this.xy},${this.yy},${this.tx},${this.ty})`
  }
  get averageScale() {
    return Math.hypot(this.xx, this.xy, this.yx, this.yy) / Math.sqrt(2)
  }
  get averageRotate() {
    return Math.atan2(this.yx, this.xx)
  }
  multiply({ xx, xy, yx, yy, tx, ty }) {
    return new Matrix(
      this.xx * xx + this.xy * yx, this.xx * xy + this.xy * yy, this.xx * tx + this.xy * ty + this.tx,
      this.yx * xx + this.yy * yx, this.yx * xy + this.yy * yy, this.yx * tx + this.yy * ty + this.ty
    )
  }
  convert({ x, y }) {
    return {
      x: x * this.xx + y * this.xy + this.tx,
      y: x * this.yx + y * this.yy + this.ty
    }
  }
  reverseConvert({ x, y }) {
    const { xx, xy, yx, yy, tx, ty } = this
    const d = xx * yy - xy * yx
    x -= tx
    y -= ty
    return {
      x: (yy * x - xy * y) / d,
      y: (-yx * x + xx * y) / d
    }
  }
}

class SVGRenderingContext2D {
  constructor(width, height) {
    this.font = '10px sans-serif'
    this.fillStyle = 'black'
    this.strokeStyle = 'black'
    this.fillStyle = 'black'
    this.lineCap = 'butt'
    this.lineJoin = 'miter'
    this.globalAlpha = 1
    this.textAlign = 'start'
    this.textBaseline = 'alphabetic'
    this.lineWidth = 1
    this.saveStack = []
    this._matrix = new Matrix()
    this.width = width
    this.height = height
    this._objects = []
    this._path = []
    this._currentClips = []
    // transform: matrix * (x, y, 1)
    // | xx xy tx |
    // | yx yy ty |
  }
  toSVG() {
    const clipPathIds = {}
    let clipN = 0
    function getClipId(path) {
      let id = clipPathIds[path]
      if (!id) {
        id = `c${clipN++}`
        clipPathIds[path] = id
      }
      return id
    }
    const groups = []
    let last = null
    let textGroup = null
    this._objects.forEach(obj => {
      if (obj.type === 'text_begin') {
        obj.clips.forEach(path => getClipId(path))
        last = null
        groups.push(textGroup = { tagBegin: `<text>`, tagEnd: '</text>', clips: obj.clips, objects: [] })
        return
      } else if (obj.type === 'text_end') {
        textGroup = last = null
        return
      }
      obj.clips.forEach(path => getClipId(path))
      if (textGroup) {
        if (textGroup.matrix == null) {
          const rotate = obj.matrix.averageRotate
          textGroup.matrix = new Matrix().rotate(-rotate)
          textGroup.tagBegin = `<text transform="${new Matrix().rotate(rotate).toTransform()}">`
        }
        textGroup.objects.push(obj.toTSpanSVG(textGroup.matrix.multiply(obj.matrix)))
      } else {
        const transform = obj.matrix.toTransform()
        if (last && last.transform === transform && last.clips === obj.clips) {
          last.objects.push(obj.toSVG())
        } else {
          groups.push(last = { tagBegin: `<g transform="${transform}">`, tagEnd: '</g>', clips: obj.clips, objects: [obj.toSVG()] })
        }
      }
    })
    const clipPaths = Object.entries(clipPathIds).map(([path, id]) => {
      return `<clipPath id="${id}"><path d="${path}" /></clipPath>`
    })
    return [
      '<?xml version="1.0" standalone="no"?>',
      `<svg width="${this.width}px" height="${this.height}px" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`,
      ...clipPaths,
      ...groups.map(({ tagBegin, tagEnd, transform, objects, clips }) => [
          clips.map(path => `<g clip-path="url(#${getClipId(path)})">`).join(''),
          tagBegin,
          objects.join(''),
          tagEnd,
          clips.map(() => '</g>').join('')
        ].join('')
      ),
      '</svg>'
    ].join("\n")
  }
  save() {
    this.saveStack.push({
      font: this.font,
      lineWidth: this.lineWidth,
      lineJoin: this.lineJoin,
      lineCap: this.lineCap,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      globalAlpha: this.globalAlpha,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      _matrix: this._matrix,
      _currentClips: this._currentClips
    })
  }
  restore() {
    const state = this.saveStack.pop()
    if (!state) return
    for (const key in state) this[key] = state[key]
  }
  scale(sx, sy) {
    this._matrix = this._matrix.scale(sx, sy)
  }
  translate(tx, ty) {
    this._matrix = this._matrix.translate(tx, ty)
  }
  rotate(theta) {
    this._matrix = this._matrix.rotate(theta)
  }
  beginPath() {
    this._path = []
  }
  clip() {
    this._currentClips = [...this._currentClips, this._gpath()]
  }
  moveTo(x, y) {
    this._path.push('M', this._trans({ x, y }))
  }
  lineTo(x, y) {
    this._path.push('L', this._trans({ x, y }))
  }
  measureText(text) {
    if (!this.measureContext) {
      const measureCanvas = document.createElement('canvas')
      measureCanvas.width = measureCanvas.height = 0
      this.measureContext = measureCanvas.getContext('2d')
    }
    this.measureContext.font = this.font
    return this.measureContext.measureText(text)
  }
  arc(x, y, r, th1, th2, anticlockwise) {
    if (anticlockwise) {
      if (th1 < th2) th2 -= Math.ceil((th2 - th1) / 2 / Math.PI) * 2 * Math.PI
      if (th2 <= th1 - 2 * Math.PI) th2 = th1 - 2 * Math.PI
    } else {
      if (th2 < th1) th2 += Math.ceil((th1 - th2) / 2 / Math.PI) * 2 * Math.PI
      if (th2 >= th1 + 2 * Math.PI) th2 = th1 + 2 * Math.PI
    }
    const step = Math.ceil(Math.abs(th2 - th1) * 6 / Math.PI)
    for (let i = 0; i < step; i++) {
      const t1 = th1 + (th2 - th1) * i / step
      const t2 = th1 + (th2 - th1) * (i + 1) / step
      const q = { x: x + r * Math.cos(t2), y: y + r * Math.sin(t2) }
      const tm = (t1 + t2) / 2
      const rm = r / Math.cos((t2 - t1) / 2)
      const m = { x: x + rm * Math.cos(tm), y: y + rm * Math.sin(tm) }
      if (i === 0) {
        const p = { x: x + r * Math.cos(t1), y: y + r * Math.sin(t1) }
        this._path.push((this._path.length === 0 ? 'M' : 'L'), this._trans(p))
      }
      this.quadraticCurveTo(m.x, m.y, q.x, q.y)
    }
  }
  quadraticCurveTo(ax, ay, bx, by) {
    this._path.push('Q', this._trans({ x: ax, y: ay }), ',', this._trans({ x: bx, y: by }))
  }
  bezierCurveTo(ax, ay, bx, by, cx, cy) {
    this._path.push('C', this._trans({ x: ax, y: ay }), ',', this._trans({ x: bx, y: by }), ',', this._trans({ x: cx, y: cy }))
  }
  stroke() {
    this._add(new PathShape({ path: this._tpath(), matrix: this._matrix, ...this._strokeState() }))
  }
  fill() {
    this._add(new PathShape({ path: this._tpath(), matrix: this._matrix, ...this._fillState() }))
  }
  _trans(p) {
    return this._matrix.convert(p)
  }
  _rtrans(p) {
    return this._matrix.reverseConvert(p)
  }
  _strokeState() {
    return { clips: this._currentClips, lineWidth: this.lineWidth, stroke: this.strokeStyle, lineJoin: this.lineJoin, lineCap: this.lineCap, alpha: this.globalAlpha }
  }
  _fillState() {
    return { clips: this._currentClips, fill: this.fillStyle, alpha: this.globalAlpha }
  }
  _textState() {
    return { font: this.font, align: this.textAlign, baseline: this.textBaseline }
  }
  strokeText(text, x, y) {
    this._add(new TextShape({ text, x, y, matrix: this._matrix, ...this._strokeState(), ...this._textState() }))
  }
  fillText(text, x, y) {
    this._add(new TextShape({ text, x, y, matrix: this._matrix, ...this._fillState(), ...this._textState() }))
  }
  closePath() {
    this._path.push('z')
  }
  _beginTextGroup() {
    this._add({ type: 'text_begin', clips: this._currentClips })
  }
  _endTextGroup() {
    this._add({ type: 'text_end' })
  }
  drawImage() {
    let image, dx, dy, dw, dh, sx, sy, sw, sh
    if (arguments.length === 3) {
      [image, dx, dy] = arguments
    } else if (arguments.length === 5) {
      [image, dx, dy, dw, dh] = arguments
    } else if (arguments.length === 9) {
      [image, sx, sy, sw, sh, dx, dy, dw, dh] = arguments
    } else {
      return
    }
    let src, width, height
    if (image instanceof Image) {
      src = image.src
      width = image.naturalWidth
      height = image.naturalHeight
    } else if (image instanceof HTMLVideoElement) {
      width = image.videoWidth
      height = image.videoHeight
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getCotext('2d').drawImage(image, 0, 0, width, height)
      src = canvas.toDataURL('image/jpeg')
    } else {
      width = image.width
      height = image.height
      src = image.toDataURL()
    }
    if (dw == null) dw = width
    if (dh == null) dh = height
    this._add(new ImageShape({
      matrix: this._matrix,
      clips: this._currentClips,
      alpha: this.globalAlpha,
      src, width, height, dx, dy, dw, dh, sx, sy, sw, sh
    }))
  }
  _rectPath(x, y, w, h) {
    return `M${x},${y}L${x + w},${y}L${x + w},${y + h}L${x},${y + h}z`
  }
  _add(obj) {
    const last = this._objects[this._objects.length - 1]
    if (last && last.canMerge && last.canMerge(obj)) {
      last.merge(obj)
    } else {
      this._objects.push(obj)
    }
  }
  rect(x, y, w, h) {
    this._path.push(
      'M', this._trans({ x, y }),
      'L', this._trans({ x: x + w, y }),
      'L', this._trans({ x: x + w, y: y + h }),
      'L', this._trans({ x, y: y + h }),
      'z'
    )
  }
  _gpath() {
    return this._path.map(p => {
      if (typeof p === 'string') return p
      const { x, y } = p
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
    }).join('')
  }
  _tpath() {
    return this._path.map(p => {
      if (typeof p === 'string') return p
      const { x, y } = this._rtrans(p)
      return `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
    }).join('')
  }
  clearRect(x, y, w, h) {
    this._add(new PathShape({ path: this._rectPath(x, y, w, h), clips: [], matrix: this._matrix, fill: 'white', alpha: 1 }))
  }
  strokeRect(x, y, w, h) {
    this._add(new PathShape({ path: this._rectPath(x, y, w, h), matrix: this._matrix, ...this._strokeState() }))
  }
  fillRect(x, y, w, h) {
    this._add(new PathShape({ path: this._rectPath(x, y, w, h), matrix: this._matrix, ...this._fillState() }))
  }
  async _load() {
    const loadableObjects = this._objects.filter(o => o.load)
    await Promise.all(loadableObjects.map(o => o.load()))
  }
}
