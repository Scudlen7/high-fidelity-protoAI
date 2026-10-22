/* 经典脚本(非 ES 模块):为支持 file:// 直接双击打开,不使用 import/export。
   本文件挂载到 window.AIGGB.board 命名空间下。 */
;(function (global) {
  'use strict'

/* ==========================================================================
   高保真原型 · 模拟画板(board.js)
   以纯 SVG 还原四种 GeoGebra 计算器的界面形态与图形效果。
   真实项目中此区域由 deployggb.js 加载真实画板(src/board.ts),原型中
   用同构的场景数据(scene)渲染,便于静态预览与演示。
   ========================================================================== */

/* ---------------- 工具栏图标 ---------------- */

const ICON = {
  move: '<path d="M12 2v20M2 12h20M12 2l-2.5 4M12 2l2.5 4M2 12l4-2.5M2 12l4 2.5M20 12l-4-2.5M20 12l-4 2.5"/>',
  point: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  line: '<path d="M3.5 19.5 20.5 4.5"/>',
  segment: '<path d="M5 19 19 5"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  perpendicular: '<path d="M5 5v14M5 19h13M8.5 15.5v3.5h3.5"/>',
  parallel: '<path d="M3 8h18M3 16h18"/>',
  polygon: '<path d="M12 3.5 20.5 18.5H3.5z"/>',
  circle: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  intersect: '<path d="M4 18.5 20 5.5M4 5.5l16 13"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  sphere: '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="7" ry="2.8"/>',
  pyramid: '<path d="M12 3 20 18.5H4zM12 3v6.2M4 18.5l7-5.6M20 18.5l-7-5.6"/>',
  prism: '<path d="M4 9h10l4 4.2v6H4zM4 9v6.4M14 9v6.4"/>',
  cylinder: '<path d="M5 8.5h14M5 8.5v6.4c0 2.1 3.1 3.2 7 3.2s7-1.1 7-3.2V8.5"/><ellipse cx="12" cy="8.5" rx="7" ry="3"/>',
  cone: '<path d="M12 3.5 5 17.8h14z"/><ellipse cx="12" cy="17.8" rx="7" ry="2.4"/>',
  plane: '<path d="M3 12 12 4.8l9 7.2-9 7.2z"/>',
  midpoint: '<path d="M5 19 19 5"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  undo: '<path d="M8 5 3 9.2l5 4.2M3 9.2h8.5a6 6 0 0 1 0 12H8"/>',
  redo: '<path d="M16 5l5 4.2-5 4.2M21 9.2h-8.5a6 6 0 0 0 0 12H16"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.2v3M12 18.8v3M2.2 12h3M18.8 12h3M5.1 5.1l2.1 2.1M16.8 16.8l2.1 2.1M18.9 5.1l-2.1 2.1M7.2 16.8l-2.1 2.1"/>',
}

const GEOMETRY_TOOLS = [
  ['move', '移动'],
  ['point', '点'],
  ['line', '直线'],
  ['segment', '线段'],
  ['perpendicular', '垂线'],
  ['parallel', '平行线'],
  ['polygon', '多边形'],
  ['circle', '圆'],
  ['intersect', '交点'],
  ['midpoint', '中点'],
]

const TOOLS_3D = [
  ['move', '移动视图(旋转)'],
  ['point', '点'],
  ['plane', '平面'],
  ['sphere', '球'],
  ['pyramid', '棱锥'],
  ['prism', '棱柱'],
  ['cylinder', '圆柱'],
  ['cone', '圆锥'],
  ['intersect', '交点'],
  ['midpoint', '中点'],
]

function toolSvg(name) {
  return `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`
}

function toolbarHtml(tools, active) {
  const buttons = tools
    .map(([name, tip]) => `<button type="button" class="ggb-tool ${name === active ? 'on' : ''}" data-tip="${tip}" data-tool="${name}">${toolSvg(name)}</button>`)
    .join('')
  return `
    <div class="ggb-toolbar">
      ${buttons}
      <span class="ggb-tool-sep"></span>
      <button type="button" class="ggb-tool" data-tip="撤销" data-tool="undo">${toolSvg('undo')}</button>
      <button type="button" class="ggb-tool" data-tip="重做" data-tool="redo">${toolSvg('redo')}</button>
      <span class="ggb-tool-sep"></span>
      <button type="button" class="ggb-tool" data-tip="设置" data-tool="gear">${toolSvg('gear')}</button>
    </div>`
}

/* ---------------- 几何画板 ---------------- */

function niceStep(span) {
  const raw = span / 9
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 5, 10]) {
    if (raw <= m * mag) return m * mag
  }
  return 10 * mag
}

function fmtTick(v) {
  return Math.abs(v) < 1e-9 ? '0' : String(Math.round(v * 100) / 100)
}

function geometrySvg(scene, showAxes) {
  const W = 800
  const H = 560
  const pad = 56
  const [xmin, xmax, ymin, ymax] = scene.range
  // 等比映射:横纵使用同一缩放系数,图形不会被拉伸
  const k = Math.min((W - 2 * pad) / (xmax - xmin), (H - 2 * pad) / (ymax - ymin))
  const mx = (xmin + xmax) / 2
  const my = (ymin + ymax) / 2
  const sx = (x) => W / 2 + (x - mx) * k
  const sy = (y) => H / 2 - (y - my) * k

  // 点索引:polygon / segment 可用 point id 引用坐标
  const byId = {}
  for (const obj of scene.objects) {
    if (obj.kind === 'point') byId[obj.id] = obj
  }
  const at = (ref) => (typeof ref === 'string' ? byId[ref] : ref)

  let parts = ''

  if (showAxes) {
    const step = niceStep(Math.max(xmax - xmin, ymax - ymin))
    // 网格
    for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
      parts += `<line x1="${sx(x)}" y1="${sy(ymin)}" x2="${sx(x)}" y2="${sy(ymax)}" stroke="#eceae2" stroke-width="1"/>`
    }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
      parts += `<line x1="${sx(xmin)}" y1="${sy(y)}" x2="${sx(xmax)}" y2="${sy(y)}" stroke="#eceae2" stroke-width="1"/>`
    }
    // 坐标轴(仅当在范围内)
    const axisColor = '#b9b2a4'
    if (xmin < 0 && xmax > 0) {
      parts += `<line x1="${sx(xmin)}" y1="${sy(0)}" x2="${sx(xmax)}" y2="${sy(0)}" stroke="${axisColor}" stroke-width="1.4"/>`
      parts += `<path d="M${sx(xmax)} ${sy(0)} l-9 -4 v8 z" fill="${axisColor}"/>`
      parts += `<text x="${sx(xmax) - 8}" y="${sy(0) - 10}" font-size="13" font-style="italic" fill="${axisColor}">x</text>`
    }
    if (ymin < 0 && ymax > 0) {
      parts += `<line x1="${sx(0)}" y1="${sy(ymin)}" x2="${sx(0)}" y2="${sy(ymax)}" stroke="${axisColor}" stroke-width="1.4"/>`
      parts += `<path d="M${sx(0)} ${sy(ymax)} l-4 9 h8 z" fill="${axisColor}"/>`
      parts += `<text x="${sx(0) + 8}" y="${sy(ymax) + 16}" font-size="13" font-style="italic" fill="${axisColor}">y</text>`
    }
    // 刻度
    for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
      if (Math.abs(x) < 1e-9) continue
      parts += `<line x1="${sx(x)}" y1="${sy(0) - 3}" x2="${sx(x)}" y2="${sy(0) + 3}" stroke="${axisColor}" stroke-width="1.2"/>`
      parts += `<text x="${sx(x)}" y="${sy(0) + 16}" font-size="11" fill="#9a9385" text-anchor="middle">${fmtTick(x)}</text>`
    }
    for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
      if (Math.abs(y) < 1e-9) continue
      parts += `<line x1="${sx(0) - 3}" y1="${sy(y)}" x2="${sx(0) + 3}" y2="${sy(y)}" stroke="${axisColor}" stroke-width="1.2"/>`
      parts += `<text x="${sx(0) - 6}" y="${sy(y) + 4}" font-size="11" fill="#9a9385" text-anchor="end">${fmtTick(y)}</text>`
    }
    if (xmin < 0 && ymin < 0 && xmax > 0 && ymax > 0) {
      parts += `<text x="${sx(0) - 5}" y="${sy(0) + 15}" font-size="11" fill="#9a9385" text-anchor="end">0</text>`
    }
  }

  // 引用缺失时返回 null,由调用方跳过该对象,避免整个画板渲染失败
  const P = (ref) => {
    const o = at(ref)
    if (!o) return null
    return { x: sx(o.x), y: sy(o.y) }
  }

  for (const obj of scene.objects) {
    if (obj.kind === 'curve') {
      const { x0, x1, fn, color = '#1a5fb4', width = 2.2, dash } = obj
      const steps = 180
      let d = ''
      let pen = false
      for (let i = 0; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps
        const y = fn(x)
        if (y >= ymin && y <= ymax) {
          d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1)
          pen = true
        } else {
          pen = false
        }
      }
      parts += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`
      if (obj.label) {
        // 标签放在曲线最高可见点附近
        let lx = obj.lx ?? x0 + (x1 - x0) * 0.72
        let ly = fn(lx)
        if (ly < ymin || ly > ymax) {
          lx = x0
          ly = fn(x0)
        }
        parts += `<text x="${sx(lx) + 6}" y="${sy(ly) - 8}" font-size="13" font-style="italic" fill="${color}">${obj.label}</text>`
      }
    } else if (obj.kind === 'polygon') {
      const pts = obj.pts.map(P)
      if (pts.some((p) => !p)) continue
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('') + 'Z'
      parts += `<path d="${d}" fill="${obj.fill || 'rgba(12,92,86,0.12)'}" stroke="${obj.stroke || '#0c5c56'}" stroke-width="1.8" stroke-linejoin="round"/>`
    } else if (obj.kind === 'circle') {
      const c = P(obj.c)
      if (!c) continue
      parts += `<circle cx="${c.x}" cy="${c.y}" r="${obj.r * k}" fill="none" stroke="${obj.color || '#1a5fb4'}" stroke-width="2"/>`
    } else if (obj.kind === 'segment') {
      const a = P(obj.a)
      const b = P(obj.b)
      if (!a || !b) continue
      parts += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${obj.color || '#0c5c56'}" stroke-width="2" ${obj.dash ? `stroke-dasharray="${obj.dash}"` : ''}/>`
    }
  }

  for (const obj of scene.objects) {
    if (obj.kind === 'point') {
      const p = P(obj)
      const color = obj.color || '#0c5c56'
      parts += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="${color}"/>`
      parts += `<text x="${p.x + 7}" y="${p.y - 7}" font-size="14" font-style="italic" fill="${color}" font-weight="500">${obj.id}</text>`
    } else if (obj.kind === 'dot') {
      const p = P(obj)
      parts += `<circle cx="${p.x}" cy="${p.y}" r="3.4" fill="${obj.color || '#1a5fb4'}"/>`
    } else if (obj.kind === 'mark') {
      // 直角标记:在 (x,y) 处,两条腿沿 a/b 方向各延伸
      const o = { x: sx(obj.x), y: sy(obj.y) }
      const a = { x: sx(obj.x + obj.ax), y: sy(obj.y + obj.ay) }
      const b = { x: sx(obj.x + obj.bx), y: sy(obj.y + obj.by) }
      const c = { x: sx(obj.x + obj.ax + obj.bx), y: sy(obj.y + obj.ay + obj.by) }
      parts += `<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} L${c.x.toFixed(1)},${c.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}" fill="none" stroke="#8b948e" stroke-width="1.3"/>`
    }
  }

  return parts
}

/** 对象名:优先取 id,否则从定义式 "名字 = ..." 中提取 */
function objectName(o) {
  if (o.id) return o.id
  const match = /^\s*([^=]+?)\s*=/.exec(o.def || '')
  return match ? match[1] : 'obj'
}

function algebraHtml(objects) {
  if (!objects.length) {
    return `<p class="empty" style="padding:0.9rem 0.8rem">作图后,对象会显示在这里。</p>`
  }
  const rows = objects
    .map((o) => {
      const glyph =
        o.kind === 'point'
          ? `<span class="g-dot" style="background:${o.color || '#0c5c56'}"></span>`
          : o.kind === 'circle'
            ? `<span class="g-line" style="background:${o.color || '#1a5fb4'}"></span>`
            : `<span class="g-line" style="background:${o.color || '#0c5c56'}"></span>`
      // 名称单独显示,定义列只留值(避免 "t1 t1 = Polygon(...)" 的重复)
      const value = (o.def || '').replace(/^\s*[^=]+?=\s*/, '')
      return `<li class="ggb-object" title="${o.def}">${glyph}<span class="g-name">${objectName(o)}</span><span class="g-def">${value}</span></li>`
    })
    .join('')
  return rows
}

function geometryBoard(scene, opts) {
  const objects = scene.objects.filter((o) => o.def)
  return `
  <div class="ggb">
    ${toolbarHtml(GEOMETRY_TOOLS, 'move')}
    <div class="ggb-main">
      <aside class="ggb-algebra">
        <div class="ggb-algebra-head">代数区</div>
        <ul class="ggb-objects">${algebraHtml(objects)}</ul>
      </aside>
      <div class="ggb-canvas">
        <svg class="ggb-svg" viewBox="0 0 800 560" preserveAspectRatio="xMidYMid meet">${geometrySvg(scene, opts?.axes)}</svg>
        <div class="ggb-hint">拖动平移 · 滚轮缩放</div>
      </div>
    </div>
  </div>`
}

/* ---------------- 3D 画板(等距投影) ---------------- */

const COS30 = 0.866
const SIN30 = 0.5

function project(x, y, z, cx, cy, k) {
  return { x: cx + (x - y) * COS30 * k, y: cy + (x + y) * SIN30 * k - z * k }
}

function polylinePath(pts) {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
}

function threeDSvg(scene) {
  const W = 800
  const H = 560
  const cx = W / 2
  const cy = H / 2 + 26
  const k = (scene.scale || 1) * 72
  const pr = (x, y, z) => project(x, y, z, cx, cy, k)

  let parts = ''

  // 地面网格(z = 0)
  const gmin = -1
  const gmax = Math.ceil((scene.range ?? 4) + 0.6)
  for (let v = gmin; v <= gmax; v++) {
    const a = pr(v, gmin, 0)
    const b = pr(v, gmax, 0)
    const c = pr(gmin, v, 0)
    const d = pr(gmax, v, 0)
    parts += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#efede6" stroke-width="1"/>`
    parts += `<line x1="${c.x}" y1="${c.y}" x2="${d.x}" y2="${d.y}" stroke="#efede6" stroke-width="1"/>`
  }

  // 坐标轴:原点为场景中心偏左下
  const origin = pr(0, 0, 0)
  const axisLen = 2.6 * k
  const axes = [
    { end: pr(axisLen / k, 0, 0), color: '#c0392b' },
    { end: pr(0, axisLen / k, 0), color: '#2e8b57' },
    { end: pr(0, 0, axisLen / k), color: '#2874c9' },
  ]
  for (const a of axes) {
    parts += `<line x1="${origin.x}" y1="${origin.y}" x2="${a.end.x}" y2="${a.end.y}" stroke="${a.color}" stroke-width="1.6"/>`
  }
  parts += `<text x="${axes[0].end.x + 4}" y="${axes[0].end.y + 4}" font-size="14" font-style="italic" fill="${axes[0].color}">x</text>`
  parts += `<text x="${axes[1].end.x + 4}" y="${axes[1].end.y - 2}" font-size="14" font-style="italic" fill="${axes[1].color}">y</text>`
  parts += `<text x="${axes[2].end.x + 4}" y="${axes[2].end.y + 4}" font-size="14" font-style="italic" fill="${axes[2].color}">z</text>`

  // 面(按深度排序绘制)
  const faces = (scene.faces || [])
    .map((f) => ({
      ...f,
      pts: f.pts.map((p) => (typeof p === 'string' ? scene.points[p] : p)),
      depth: f.pts.map((p) => (typeof p === 'string' ? scene.points[p] : p)).reduce((s, p) => s + p.x + p.y, 0),
    }))
    .sort((a, b) => a.depth - b.depth)
  for (const f of faces) {
    const pts = f.pts.map((p) => pr(p.x, p.y, p.z))
    parts += `<path d="${polylinePath(pts)}Z" fill="${f.fill || 'rgba(12,92,86,0.13)'}" stroke="${f.stroke || 'rgba(12,92,86,0.55)'}" stroke-width="1.4" stroke-linejoin="round"/>`
  }

  // 曲线(球经纬线 / 抛物面轮廓等,采样绘制)
  for (const curve of scene.curves || []) {
    const pts = []
    for (let i = 0; i <= curve.steps; i++) {
      const t = (i / curve.steps) * (curve.to - curve.from) + curve.from
      pts.push(pr(...curve.fn(t)))
    }
    const opacity = curve.opacity != null ? ` stroke-opacity="${curve.opacity}"` : ''
    const fill = curve.fill ? ` fill="${curve.fill}"` : ' fill="none"'
    parts += `<path d="${polylinePath(pts)}${curve.fill ? 'Z' : ''}"${fill} stroke="${curve.color || '#2874c9'}" stroke-width="${curve.width || 1.7}"${opacity} ${curve.dash ? `stroke-dasharray="${curve.dash}"` : ''}/>`
  }

  // 线段
  for (const seg of scene.segments || []) {
    const a = typeof seg[0] === 'string' ? scene.points[seg[0]] : seg[0]
    const b = typeof seg[1] === 'string' ? scene.points[seg[1]] : seg[1]
    const pa = pr(a.x, a.y, a.z)
    const pb = pr(b.x, b.y, b.z)
    parts += `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="${seg[2] || '#1c241f'}" stroke-width="1.8" ${seg[3] ? `stroke-dasharray="${seg[3]}"` : ''}/>`
  }

  // 点与标签
  for (const [id, p] of Object.entries(scene.points || {})) {
    const sp = pr(p.x, p.y, p.z)
    const color = p.color || '#0c5c56'
    parts += `<circle cx="${sp.x}" cy="${sp.y}" r="4" fill="${color}"/>`
    parts += `<text x="${sp.x + 7}" y="${sp.y - 7}" font-size="14" font-style="italic" fill="${color}" font-weight="500">${id}</text>`
  }

  // 独立标注(交点 / 纯文字标签)
  for (const label of scene.labels || []) {
    const sp = pr(label.x, label.y, label.z)
    if (!label.textOnly) {
      parts += `<circle cx="${sp.x}" cy="${sp.y}" r="4" fill="${label.color || '#c64600'}"/>`
    }
    parts += `<text x="${sp.x + (label.textOnly ? 0 : 7)}" y="${sp.y - (label.textOnly ? 0 : 7)}" font-size="14" font-style="italic" fill="${label.color || '#c64600'}" font-weight="500">${label.id}</text>`
  }

  return parts
}

function threeDBoard(scene) {
  const objects = scene.objects || []
  const rows = objects.length
    ? objects
        .map(
          (o) => `<li class="ggb-object" title="${o.def}"><span class="g-dot" style="background:${o.color || '#0c5c56'}"></span><span class="g-name">${objectName(o)}</span><span class="g-def">${(o.def || '').replace(/^\s*[^=]+?=\s*/, '')}</span></li>`
        )
        .join('')
    : `<p class="empty" style="padding:0.9rem 0.8rem">作图后,对象会显示在这里。</p>`
  return `
  <div class="ggb">
    ${toolbarHtml(TOOLS_3D, 'move')}
    <div class="ggb-main">
      <aside class="ggb-algebra">
        <div class="ggb-algebra-head">代数区</div>
        <ul class="ggb-objects">${rows}</ul>
      </aside>
      <div class="ggb-canvas">
        <svg class="ggb-svg" viewBox="0 0 800 560" preserveAspectRatio="xMidYMid meet">${threeDSvg(scene)}</svg>
        <div class="ggb-hint">拖动旋转视图 · 滚轮缩放</div>
      </div>
    </div>
  </div>`
}

/* ---------------- 概率计算器 ---------------- */

const DISTS = {
  Normal: { label: '正态分布', params: [{ n: 'μ', d: 0 }, { n: 'σ', d: 1 }], continuous: true },
  TDistribution: { label: 't 分布', params: [{ n: '自由度', d: 5 }], continuous: true },
  ChiSquared: { label: '卡方分布', params: [{ n: '自由度', d: 5 }], continuous: true },
  FDistribution: { label: 'F 分布', params: [{ n: 'df₁', d: 4 }, { n: 'df₂', d: 8 }], continuous: true },
  Exponential: { label: '指数分布', params: [{ n: 'λ', d: 1 }], continuous: true },
  Binomial: { label: '二项分布', params: [{ n: 'n', d: 10 }, { n: 'p', d: 0.5 }], continuous: false },
  Poisson: { label: '泊松分布', params: [{ n: 'λ', d: 3 }], continuous: false },
}

function lnGamma(z) {
  // Lanczos 近似(精度足够用于演示图形)
  const g = 7
  const C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  z -= 1
  let x = C[0]
  for (let i = 1; i < g + 2; i++) x += C[i] / (z + i)
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function fact(n) {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function distDensity(name, params, x) {
  switch (name) {
    case 'Normal': {
      const [mu, sigma] = params
      return Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI))
    }
    case 'TDistribution': {
      const df = params[0]
      return (Math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2)) / Math.sqrt(df * Math.PI)) * (1 + (x * x) / df) ** (-(df + 1) / 2)
    }
    case 'ChiSquared': {
      const df = params[0]
      if (x <= 0) return 0
      return Math.exp((df / 2 - 1) * Math.log(x) - x / 2 - (df / 2) * Math.log(2) - lnGamma(df / 2))
    }
    case 'FDistribution': {
      const [d1, d2] = params
      if (x <= 0) return 0
      const c = lnGamma((d1 + d2) / 2) - lnGamma(d1 / 2) - lnGamma(d2 / 2)
      return Math.exp(c + (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x) - ((d1 + d2) / 2) * Math.log(1 + (d1 * x) / d2))
    }
    case 'Exponential': {
      const lam = params[0]
      return x < 0 ? 0 : lam * Math.exp(-lam * x)
    }
    default:
      return 0
  }
}

function distPmf(name, params, k) {
  if (name === 'Binomial') {
    const [n, p] = params
    if (k < 0 || k > n) return 0
    return (fact(n) / (fact(k) * fact(n - k))) * Math.pow(p, k) * Math.pow(1 - p, n - k)
  }
  if (name === 'Poisson') {
    const lam = params[0]
    if (k < 0) return 0
    return Math.exp(-lam) * Math.pow(lam, k) / fact(k)
  }
  return 0
}

function probDomain(name, params) {
  switch (name) {
    case 'Normal': return [params[0] - 4 * params[1], params[0] + 4 * params[1]]
    case 'TDistribution': return [-4.5, 4.5]
    case 'ChiSquared': return [0, Math.max(4, params[0] * 3)]
    case 'FDistribution': return [0, 6]
    case 'Exponential': return [0, 5 / Math.max(params[0], 0.05)]
    case 'Binomial': return [0, params[0]]
    case 'Poisson': return [0, Math.max(4, params[0] + 4 * Math.sqrt(Math.max(params[0], 0.1)))]
    default: return [0, 1]
  }
}

function integrate(fn, a, b, n = 400) {
  const h = (b - a) / n
  let sum = (fn(a) + fn(b)) / 2
  for (let i = 1; i < n; i++) sum += fn(a + i * h)
  return sum * h
}

function probabilitySvg(dist, params, interval) {
  const W = 800
  const H = 430
  const padL = 56
  const padR = 24
  const padT = 26
  const padB = 48
  const meta = DISTS[dist]
  const [d0, d1] = probDomain(dist, params)
  const sx = (x) => padL + ((x - d0) / (d1 - d0)) * (W - padL - padR)
  const sy = (y) => H - padB - y * (H - padT - padB) // y 为 0~1 归一化密度

  let parts = `<line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#9a9385" stroke-width="1.2"/>`
  // 轴名放在轴线上方右端,避开末尾刻度的数字
  parts += `<text x="${W - padR}" y="${H - padB - 8}" font-size="12" font-style="italic" fill="#9a9385" text-anchor="end">x</text>`
  for (let v = 0; v <= 4; v++) {
    const x = d0 + ((d1 - d0) * v) / 4
    parts += `<line x1="${sx(x)}" y1="${H - padB - 3}" x2="${sx(x)}" y2="${H - padB + 3}" stroke="#9a9385" stroke-width="1"/>`
    parts += `<text x="${sx(x)}" y="${H - padB + 17}" font-size="11" fill="#9a9385" text-anchor="middle">${fmtTick(x)}</text>`
  }

  if (meta.continuous) {
    const steps = 240
    const pts = []
    let ymax = 0
    for (let i = 0; i <= steps; i++) {
      const x = d0 + ((d1 - d0) * i) / steps
      const y = distDensity(dist, params, x)
      pts.push([x, y])
      if (y > ymax) ymax = y
    }
    const norm = ymax > 0 ? 1 / ymax : 1
    let curve = ''
    pts.forEach(([x, y], i) => {
      curve += `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y * norm).toFixed(1)}`
    })

    // 阴影区域
    let shade = ''
    if (interval) {
      const x0 = Math.max(interval.low, d0)
      const x1 = Math.min(interval.high, d1)
      const step = (d1 - d0) / steps
      shade = `M${sx(x0).toFixed(1)},${sy(0).toFixed(1)}`
      for (let x = x0; x <= x1; x += step) {
        const y = distDensity(dist, params, x)
        shade += `L${sx(x).toFixed(1)},${sy(y * norm).toFixed(1)}`
      }
      shade += `L${sx(x1).toFixed(1)},${sy(0).toFixed(1)}Z`
    }

    if (shade) parts += `<path d="${shade}" fill="rgba(37,99,168,0.16)"/>`
    parts += `<path d="${curve}" fill="none" stroke="#2563a8" stroke-width="2.4"/>`
    if (interval) {
      for (const x of [interval.low, interval.high]) {
        if (x >= d0 && x <= d1) {
          parts += `<line x1="${sx(x)}" y1="${sy(0)}" x2="${sx(x)}" y2="${sy(distDensity(dist, params, x) * norm)}" stroke="#2563a8" stroke-width="1.2" stroke-dasharray="4 4"/>`
        }
      }
    }
  } else {
    // 离散分布:条形
    const steps = 240
    let ymax = 0
    const vals = []
    for (let k = Math.floor(d0); k <= Math.ceil(d1); k++) {
      const y = distPmf(dist, params, k)
      vals.push([k, y])
      if (y > ymax) ymax = y
    }
    const norm = ymax > 0 ? 1 / ymax : 1
    const bw = ((W - padL - padR) / (d1 - d0)) * 0.62
    for (const [k, y] of vals) {
      const inInterval = interval && k >= interval.low && k <= interval.high
      const h = y * norm * (H - padT - padB)
      parts += `<rect x="${sx(k) - bw / 2}" y="${sy(y * norm)}" width="${bw}" height="${Math.max(h, 0.5)}" rx="3" fill="${inInterval ? '#2563a8' : '#9db8d6'}" opacity="${inInterval ? 1 : 0.55}"/>`
    }
  }

  return parts
}

function probControls(dist, params, intervalType, bounds) {
  const meta = DISTS[dist]
  const options = Object.entries(DISTS)
    .map(([key, d]) => `<option value="${key}" ${key === dist ? 'selected' : ''}>${d.label}</option>`)
    .join('')
  const paramInputs = meta.params
    .map((p, i) => `<div class="prob-field"><label>${p.n} =</label><input type="number" step="any" data-param="${i}" value="${params[i] ?? p.d}" /></div>`)
    .join('')
  const boundInputs =
    intervalType === 'interval'
      ? `<div class="prob-field"><label>a =</label><input type="number" step="any" data-bound="0" value="${bounds[0] ?? 0}" /></div>
         <div class="prob-field"><label>b =</label><input type="number" step="any" data-bound="1" value="${bounds[1] ?? 1}" /></div>`
      : `<div class="prob-field"><label>${intervalType === 'right' ? '下界' : '取值'} x =</label><input type="number" step="any" data-bound="0" value="${bounds[0] ?? 0}" /></div>`
  return `
  <div class="prob-bar">
    <div class="prob-field"><label>分布</label>
      <select data-prob="dist">${options}</select>
    </div>
    ${paramInputs}
    <div class="prob-field"><label>区间</label>
      <select data-prob="interval">
        <option value="left" ${intervalType === 'left' ? 'selected' : ''}>左尾 P(X ≤ x)</option>
        <option value="right" ${intervalType === 'right' ? 'selected' : ''}>右尾 P(x ≤ X)</option>
        <option value="interval" ${intervalType === 'interval' ? 'selected' : ''}>区间 P(a ≤ X ≤ b)</option>
        ${!meta.continuous ? `<option value="point" ${intervalType === 'point' ? 'selected' : ''}>点概率 P(X = k)</option>` : ''}
      </select>
    </div>
    ${boundInputs}
  </div>`
}

function probResult(dist, params, intervalType, bounds) {
  const meta = DISTS[dist]
  let text = ''
  let value = null
  if (meta.continuous) {
    const fn = (x) => distDensity(dist, params, x)
    const [d0, d1] = probDomain(dist, params)
    if (intervalType === 'left') {
      const x = bounds[0]
      value = integrate(fn, Math.max(d0, x - 10), x)
      text = `P(X ≤ ${fmtTick(x)})`
    } else if (intervalType === 'right') {
      const x = bounds[0]
      value = integrate(fn, x, Math.min(d1, x + 10))
      text = `P(${fmtTick(x)} ≤ X)`
    } else {
      const [a, b] = bounds
      value = integrate(fn, a, b)
      text = `P(${fmtTick(a)} ≤ X ≤ ${fmtTick(b)})`
    }
  } else {
    const sum = (from, to) => {
      let s = 0
      for (let k = from; k <= to; k++) s += distPmf(dist, params, k)
      return s
    }
    if (intervalType === 'left') {
      const k = Math.round(bounds[0])
      value = sum(0, k)
      text = `P(X ≤ ${k})`
    } else if (intervalType === 'right') {
      const k = Math.round(bounds[0])
      const [d0, d1] = probDomain(dist, params)
      value = sum(k, d1)
      text = `P(${k} ≤ X)`
    } else if (intervalType === 'point') {
      const k = Math.round(bounds[0])
      value = distPmf(dist, params, k)
      text = `P(X = ${k})`
    } else {
      const a = Math.round(bounds[0])
      const b = Math.round(bounds[1])
      value = sum(a, b)
      text = `P(${a} ≤ X ≤ ${b})`
    }
  }
  const formatted = value == null ? '—' : value.toFixed(4)

  // 统计量
  let stats = ''
  if (dist === 'Normal') stats = `<span class="pr-key">均值</span><span class="pr-value">${params[0]}</span><span class="pr-key">标准差</span><span class="pr-value">${params[1]}</span>`
  if (dist === 'Binomial') {
    const [n, p] = params
    stats = `<span class="pr-key">均值</span><span class="pr-value">${(n * p).toFixed(2)}</span><span class="pr-key">标准差</span><span class="pr-value">${Math.sqrt(n * p * (1 - p)).toFixed(2)}</span>`
  }
  if (dist === 'Poisson') stats = `<span class="pr-key">均值</span><span class="pr-value">${params[0]}</span><span class="pr-key">标准差</span><span class="pr-value">${Math.sqrt(params[0]).toFixed(2)}</span>`
  if (dist === 'Exponential') stats = `<span class="pr-key">均值</span><span class="pr-value">${(1 / params[0]).toFixed(2)}</span>`

  return { text, value: formatted, stats }
}

function probabilityBoard(scene) {
  const dist = scene.dist || 'Normal'
  const meta = DISTS[dist]
  const params = scene.params || meta.params.map((p) => p.d)
  const intervalType = scene.intervalType || 'left'
  const bounds = scene.bounds || [0]
  const hasInterval = Boolean(scene.interval)
  const result = probResult(dist, params, intervalType, bounds)
  const effectiveInterval = hasInterval
    ? intervalType === 'interval'
      ? { low: Math.min(bounds[0], bounds[1]), high: Math.max(bounds[0], bounds[1]) }
      : intervalType === 'right'
        ? { low: bounds[0], high: probDomain(dist, params)[1] }
        : intervalType === 'point'
          ? { low: Math.round(bounds[0]), high: Math.round(bounds[0]) }
          : { low: probDomain(dist, params)[0], high: bounds[0] }
    : null

  return `
  <div class="prob">
    ${probControls(dist, params, intervalType, bounds)}
    <div class="prob-plot">
      <svg viewBox="0 0 800 430" preserveAspectRatio="xMidYMid meet">${probabilitySvg(dist, params, effectiveInterval)}</svg>
    </div>
    <div class="prob-result">
      <span class="pr-key">${result.text} =</span>
      <span class="pr-value hl">${hasInterval ? result.value : '—'}</span>
      ${result.stats}
    </div>
  </div>`
}

/* ---------------- 科学计算器 ---------------- */

const SCI_KEYS = [
  ['sin', 'fn'], ['cos', 'fn'], ['tan', 'fn'], ['ln', 'fn'], ['log', 'fn'],
  ['√(', 'fn'], ['(', ''], [')', ''], ['^', 'op'], ['!', 'fn'],
  ['7', ''], ['8', ''], ['9', ''], ['÷', 'op'], ['⌫', 'fn'],
  ['4', ''], ['5', ''], ['6', ''], ['×', 'op'], ['π', 'fn'],
  ['1', ''], ['2', ''], ['3', ''], ['−', 'op'], ['e', 'fn'],
  ['0', ''], ['.', ''], ['AC', 'ac'], ['+', 'op'], ['=', 'eq'],
]

function scientificBoard(scene) {
  const history = (scene.history || []).map((h) => `<div class="sci-history">${h.expr} = ${h.value}</div>`).join('')
  const keys = SCI_KEYS.map(([label, cls]) => `<button type="button" class="sci-key ${cls}" data-key="${label}">${label}</button>`).join('')
  return `
  <div class="sci">
    <div class="sci-display">
      <div class="sci-mode-badge" data-sci-mode>${scene.angleUnit === 'radian' ? 'RAD' : 'DEG'}</div>
      <div class="sci-history" data-sci-history>${history || '&nbsp;'}</div>
      <div class="sci-main" data-sci-main>${scene.main ?? '0'}</div>
    </div>
    <div class="sci-keys">${keys}</div>
  </div>`
}

/* ---------------- 渲染入口 ---------------- */

function renderBoard(mode, scene, opts = {}) {
  if (mode === 'geometry') return geometryBoard(scene, opts)
  if (mode === '3d') return threeDBoard(scene)
  if (mode === 'probability') return probabilityBoard(scene)
  if (mode === 'scientific') return scientificBoard(scene)
  return '<div class="board-state">画板未接入。</div>'
}

/** 工具按钮的静态演示提示(原型说明,每页仅提示一次) */
function wireBoardHint(host, onceFlag) {
  let warned = false
  host.addEventListener('click', (e) => {
    const tool = e.target.closest('.ggb-tool')
    if (!tool) return
    if (onceFlag.toolHint) return
    onceFlag.toolHint = true
    window.protoToast?.('原型演示:画板工具栏为静态展示', 'info')
  })
}


  global.AIGGB = global.AIGGB || {}
  global.AIGGB.board = {
    renderBoard,
    wireBoardHint,
    DISTS,
    // 以下为渲染细节,供调试与自动化测试使用(对应真实项目 DEV 下的 window.__aiggb)
    geometrySvg,
    threeDSvg,
    probabilitySvg,
    probResult,
  }
})(window)
