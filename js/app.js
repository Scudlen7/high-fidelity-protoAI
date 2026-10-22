/* 经典脚本(非 ES 模块):为支持 file:// 直接双击打开,不使用 import/export。
   本文件依赖 window.AIGGB.store 与 window.AIGGB.board(须先加载)。 */
;(function (global) {
  'use strict'

/* ==========================================================================
   高保真原型 · 主工作区交互(app.js)
   模拟一次完整作图请求:用户输入 → 命令逐条执行(日志)→ 失败自动重试
   → AI 流式中文解释。画板以 SVG 场景渲染,与真实项目 src/chat.ts →
   src/board.ts 的执行链路一一对应。
   ========================================================================== */

const { auth, models, sessions, usage, toast, renderTopbar, delay } = global.AIGGB.store
const { renderBoard, DISTS } = global.AIGGB.board

window.protoToast = toast

/* ==========================================================================
   模式元数据(对应 src/modes.ts)
   ========================================================================== */

const MODES = {
  geometry: {
    label: '几何',
    eyebrow: '几何',
    title: 'AI 几何画板',
    lede: '说一句话,生成 GeoGebra 命令,并在几何画板上执行。失败的命令会停下来,并自动再改一次。Ctrl+Enter 提交 · Esc 停止 · 每个模式分开保存。',
    placeholder: '例如:画一个等腰三角形,并标出底边上的中线',
    empty: '从上面的例子开始,或直接描述要画的图形。',
    submitLabel: '作图',
    logLabel: '命令',
  },
  '3d': {
    label: '3D',
    eyebrow: '3D',
    title: '3D 计算器',
    lede: '说一句话,生成空间作图命令,并在 3D 计算器里执行。可以旋转查看。失败的命令会停下来,并自动再改一次。',
    placeholder: '例如:画一个棱锥,底面在水平面上,顶点在上方',
    empty: '从上面的例子开始,或直接描述要画的空间图形。',
    submitLabel: '作图',
    logLabel: '命令',
  },
  probability: {
    label: '概率',
    eyebrow: '概率',
    title: '概率计算器',
    lede: '说一句话,计算概率分布。失败的命令会停下来,并自动再改一次。',
    placeholder: '例如:标准正态分布,求小于 1.96 的概率',
    empty: '从上面的例子开始,或直接描述分布和要计算的概率。',
    submitLabel: '计算',
    logLabel: '命令',
  },
  scientific: {
    label: '科学',
    eyebrow: '科学计算',
    title: '科学计算器',
    lede: '说一句话,生成算式并求出结果。右上角可以切换角度和弧度。失败的算式会停下来,并自动再改一次。',
    placeholder: '例如:计算 30 度的正弦,再加上 log(100)',
    empty: '从上面的例子开始,或直接说出要计算的内容。',
    submitLabel: '计算',
    logLabel: '算式',
  },
}

/* ==========================================================================
   场景与流程数据(画板 SVG 场景 + 命令批次 + AI 回复)
   ========================================================================== */

const INITIAL_SCENES = {
  geometry: { range: [-1.6, 8.6, -1.8, 5.4], objects: [] },
  '3d': { range: 4, points: {}, objects: [], faces: [], curves: [], segments: [], labels: [] },
  probability: { dist: 'Normal', params: [0, 1], intervalType: 'left', bounds: [0], interval: false },
  scientific: { main: '0', history: [], angleUnit: 'degree' },
}

const GEOMETRY_SCENES = [
  {
    range: [-2.2, 5.8, -1.7, 4.3],
    objects: [
      { kind: 'point', id: 'A', x: 0, y: 0, def: 'A = (0, 0)' },
      { kind: 'point', id: 'B', x: 4, y: 0, def: 'B = (4, 0)' },
      { kind: 'point', id: 'C', x: 1, y: 3, def: 'C = (1, 3)' },
      { kind: 'point', id: 'D', x: 1, y: 0, def: 'D = (1, 0)' },
      { kind: 'polygon', pts: ['A', 'B', 'C'], fill: 'rgba(12,92,86,0.10)', def: 't1 = Polygon(A, B, C)' },
      { kind: 'segment', a: { x: 1, y: 3 }, b: { x: 1, y: 0 }, color: '#c64600', def: 'f = Segment(C, D)' },
      { kind: 'mark', x: 1, y: 0, ax: 0.26, ay: 0, bx: 0, by: 0.26 },
    ],
  },
  {
    range: [-3.6, 6.2, -4.2, 4.2],
    objects: [
      { kind: 'point', id: 'O', x: 0, y: 0, def: 'O = (0, 0)' },
      { kind: 'circle', c: { x: 0, y: 0 }, r: 2, def: 'c: Circle(O, 2)' },
      { kind: 'point', id: 'P', x: 4, y: 2, def: 'P = (4, 2)' },
      { kind: 'segment', a: { x: 4, y: 2 }, b: { x: 0, y: 2 }, color: '#1a5fb4', def: 't1 = Tangent(P, c)' },
      { kind: 'segment', a: { x: 4, y: 2 }, b: { x: 1.6, y: -1.2 }, color: '#1a5fb4', def: 't2 = Tangent(P, c)' },
      { kind: 'dot', x: 0, y: 2 },
      { kind: 'dot', x: 1.6, y: -1.2 },
    ],
  },
  {
    range: [-4.2, 4.6, -3.4, 5.2],
    objects: [
      { kind: 'curve', x0: -3, x1: 3, fn: (x) => x * x - 2, label: 'f(x) = x² − 2', def: 'f(x) = x² − 2' },
      { kind: 'curve', x0: -3.2, x1: 3.2, fn: (x) => x, color: '#c64600', label: 'g: y = x', def: 'g: y = x' },
      { kind: 'point', id: 'A', x: 2, y: 2, color: '#c64600', def: 'A = Intersect(f, g)' },
      { kind: 'point', id: 'B', x: -1, y: -1, color: '#c64600', def: 'B = Intersect(f, g)' },
    ],
  },
  {
    range: [-1.8, 6, -1.7, 3.75],
    objects: [
      { kind: 'point', id: 'A', x: 0, y: 0, def: 'A = (0, 0)' },
      { kind: 'point', id: 'B', x: 3, y: 0, def: 'B = (3, 0)' },
      { kind: 'point', id: 'D', x: 1, y: 2, def: 'D = (1, 2)' },
      { kind: 'point', id: 'C', x: 4, y: 2, def: 'C = B + D − A' },
      { kind: 'polygon', pts: ['A', 'B', 'C', 'D'], fill: 'rgba(12,92,86,0.10)', def: 'q = Polygon(A, B, C, D)' },
      { kind: 'segment', a: { x: 0, y: 0 }, b: { x: 4, y: 2 }, color: '#1a5fb4', def: 'e = Segment(A, C)' },
      { kind: 'segment', a: { x: 3, y: 0 }, b: { x: 1, y: 2 }, color: '#c64600', def: 'f = Segment(B, D)' },
    ],
  },
]

const D3_SCENES = [
  {
    range: 4,
    points: { A: { x: 0, y: 0, z: 0 }, B: { x: 3, y: 0, z: 0 }, C: { x: 1, y: 2, z: 0 }, D: { x: 1, y: 1, z: 3 } },
    faces: [
      { pts: ['A', 'B', 'D'], fill: 'rgba(12,92,86,0.10)' },
      { pts: ['C', 'A', 'D'], fill: 'rgba(12,92,86,0.10)' },
      { pts: ['A', 'B', 'C'], fill: 'rgba(12,92,86,0.13)' },
      { pts: ['B', 'C', 'D'], fill: 'rgba(12,92,86,0.20)' },
    ],
    segments: [
      ['A', 'B', '#1c241f'],
      ['B', 'C', '#1c241f'],
      ['C', 'A', '#1c241f'],
      ['A', 'D', '#1c241f'],
      ['B', 'D', '#1c241f'],
      ['C', 'D', '#1c241f'],
    ],
    curves: [],
    labels: [],
    objects: [
      { id: 'A', def: 'A = (0, 0, 0)' },
      { id: 'B', def: 'B = (3, 0, 0)' },
      { id: 'C', def: 'C = (1, 2, 0)' },
      { id: 'D', def: 'D = (1, 1, 3)' },
      { id: 'p', def: 'Pyramid(A, B, C, D)', color: '#0c5c56' },
    ],
  },
  {
    range: 3.2,
    points: { O: { x: 0, y: 0, z: 0 } },
    faces: [],
    segments: [],
    curves: [
      { fn: (t) => [2 * Math.cos(t), 2 * Math.sin(t), 0], from: 0, to: Math.PI * 2, steps: 72, color: '#2874c9', width: 1.9, fill: 'rgba(40,116,201,0.10)' },
      { fn: (t) => [2 * Math.cos(t), 0, 2 * Math.sin(t)], from: 0, to: Math.PI * 2, steps: 72, color: '#2874c9', width: 1.5 },
      { fn: (t) => [0, 2 * Math.cos(t), 2 * Math.sin(t)], from: 0, to: Math.PI * 2, steps: 72, color: '#2874c9', width: 1.5 },
    ],
    labels: [],
    objects: [
      { id: 'O', def: 'O = (0, 0, 0)' },
      { id: 's', def: 'Sphere(O, 2)', color: '#2874c9' },
    ],
  },
  {
    range: 3.6,
    points: {
      A: { x: 0, y: 0, z: 0 },
      B: { x: 2, y: 0, z: 0 },
      C: { x: 0, y: 2, z: 1 },
      P: { x: 0, y: 0, z: 2 },
      Q: { x: 2, y: 2, z: 0 },
    },
    faces: [{ pts: ['A', 'B', { x: 2, y: 2, z: 1 }, 'C'], fill: 'rgba(40,116,201,0.15)', stroke: 'rgba(40,116,201,0.5)' }],
    segments: [
      [{ x: -0.6, y: -0.6, z: 2.6 }, { x: 2.6, y: 2.6, z: -0.6 }, '#c64600'],
      [{ x: 2.6, y: 2.6, z: -0.6 }, { x: 1.333, y: 1.333, z: 0.667 }, '#c64600'],
    ],
    curves: [],
    labels: [{ id: 'I', x: 4 / 3, y: 4 / 3, z: 2 / 3, color: '#c64600' }],
    objects: [
      { id: 'A', def: 'A = (0, 0, 0)' },
      { id: 'B', def: 'B = (2, 0, 0)' },
      { id: 'C', def: 'C = (0, 2, 1)' },
      { id: 'pl', def: 'Plane(A, B, C)', color: '#2874c9' },
      { id: 'P', def: 'P = (0, 0, 2)' },
      { id: 'Q', def: 'Q = (2, 2, 0)' },
      { id: 'g', def: 'Line(P, Q)', color: '#c64600' },
      { id: 'I', def: 'Intersect(g, pl)', color: '#c64600' },
    ],
  },
  {
    range: 3.4,
    points: {},
    faces: [],
    segments: [],
    curves: [
      { fn: (t) => [Math.sqrt(0.5) * Math.cos(t), Math.sqrt(0.5) * Math.sin(t), 0.5], from: 0, to: Math.PI * 2, steps: 64, color: '#1a5fb4', width: 1.3, opacity: 0.55 },
      { fn: (t) => [Math.cos(t), Math.sin(t), 1], from: 0, to: Math.PI * 2, steps: 64, color: '#1a5fb4', width: 1.5, opacity: 0.8 },
      { fn: (t) => [Math.sqrt(2) * Math.cos(t), Math.sqrt(2) * Math.sin(t), 2], from: 0, to: Math.PI * 2, steps: 64, color: '#1a5fb4', width: 1.5, opacity: 0.8 },
      { fn: (t) => [Math.sqrt(3) * Math.cos(t), Math.sqrt(3) * Math.sin(t), 3], from: 0, to: Math.PI * 2, steps: 64, color: '#1a5fb4', width: 1.3, opacity: 0.55 },
      { fn: (t) => [t, 0, t * t], from: -1.8, to: 1.8, steps: 72, color: '#1a5fb4', width: 1.8 },
      { fn: (t) => [0, t, t * t], from: -1.8, to: 1.8, steps: 72, color: '#1a5fb4', width: 1.8 },
    ],
    labels: [{ id: 'f(x, y) = x² + y²', x: 1.5, y: 1.5, z: 4.1, color: '#1a5fb4', textOnly: true }],
    objects: [{ id: 'f', def: 'f(x, y) = x² + y²', color: '#1a5fb4' }],
  },
]

const PROB_SCENES = [
  { dist: 'Normal', params: [0, 1], intervalType: 'left', bounds: [1.96], interval: true },
  { dist: 'Binomial', params: [10, 0.5], intervalType: 'point', bounds: [6], interval: true },
  { dist: 'Poisson', params: [3], intervalType: 'left', bounds: [2], interval: true },
  { dist: 'ChiSquared', params: [5], intervalType: 'left', bounds: [2], interval: false },
]

const SCI_SCENES = [
  {
    main: '2.5',
    angleUnit: 'degree',
    history: [
      { expr: 'a = sin(30°)', value: '0.5' },
      { expr: 'b = log(100)', value: '2' },
      { expr: 'result = a + b', value: '2.5' },
    ],
  },
  {
    main: '121.4142',
    angleUnit: 'degree',
    history: [
      { expr: 'a = 5!', value: '120' },
      { expr: 'b = √2', value: '1.4142' },
      { expr: 'result = a + b', value: '121.4142' },
    ],
  },
  {
    main: '800',
    angleUnit: 'degree',
    history: [
      { expr: 'a = 2.5 × 10³', value: '2500' },
      { expr: 'b = 3.2 × 10⁻¹', value: '0.32' },
      { expr: 'result = a × b', value: '800' },
    ],
  },
  {
    main: '7',
    angleUnit: 'degree',
    history: [
      { expr: 'a = e²', value: '7.3891' },
      { expr: 'result = ⌊a⌋', value: '7' },
    ],
  },
]

const cmd = (command, status = 'ok', extra = {}) => ({ command, status, ...extra })

const FLOWS = {
  geometry: [
    {
      prompt: '画三角形 ABC,A(0,0)、B(4,0)、C(1,3),并作出 AB 边上的高',
      scene: GEOMETRY_SCENES[0],
      batches: [
        [
          cmd('A = (0, 0)'),
          cmd('B = (4, 0)'),
          cmd('C = (1, 3)'),
          cmd('f = Segment(C, D)', 'failed', { error: '对象 D 还不存在。请先创建这些点,或改用已经在画板上的标签。' }),
          cmd('t1 = Polygon(A, B, C)'),
        ],
        [cmd('D = (1, 0)'), cmd('f = Segment(C, D)'), cmd('t1 = Polygon(A, B, C)')],
      ],
      reply:
        '已在画板上作出三角形 $ABC$,以及 $AB$ 边上的高。\n\n- 先创建三个顶点:$A=(0,0)$、$B=(4,0)$、$C=(1,3)$;\n- 用 `Polygon(A, B, C)` 连成三角形;\n- 求 $AB$ 边上的高:过顶点 $C$ 向 $AB$ 作垂线,垂足为 $D=(1,0)$,线段 $CD$ 即为所求。\n\n第一次尝试中 `Segment(C, D)` 引用了还不存在的点 $D$,已**自动修正并重新执行**。',
    },
    {
      prompt: '画一个圆和圆外一点,过该点作圆的两条切线',
      scene: GEOMETRY_SCENES[1],
      batches: [
        [cmd('O = (0, 0)'), cmd('c = Circle(O, 2)'), cmd('P = (4, 2)'), cmd('t1 = Tangent(P, c)'), cmd('t2 = Tangent(P, c)')],
      ],
      reply:
        '已作出以 $O(0,0)$ 为圆心、半径为 $2$ 的圆 $c$,并取圆外一点 $P(4,2)$。\n\n两次调用 `Tangent(P, c)` 分别返回过 $P$ 的两条切线 $t_1$、$t_2$,它们与圆各有一个切点。切线长相等,均为 $4$ 个单位。',
    },
    {
      prompt: '画出函数 f(x)=x^2-2 与直线 y=x,并标出交点',
      scene: GEOMETRY_SCENES[2],
      batches: [
        [cmd('f(x) = x^2 - 2'), cmd('g: y = x'), cmd('A = Intersect(f, g)'), cmd('B = Intersect(f, g)')],
      ],
      reply:
        '已画出抛物线 $f(x)=x^2-2$ 与直线 $g:y=x$。\n\n`Intersect(f, g)` 求得两个交点:$A=(-1,-1)$、$B=(2,2)$。解方程 $x^2-2=x$ 得 $x=-1$ 或 $x=2$,与图形一致。',
    },
    {
      prompt: '画一个平行四边形,并作出它的两条对角线',
      scene: GEOMETRY_SCENES[3],
      batches: [
        [cmd('A = (0, 0)'), cmd('B = (3, 0)'), cmd('D = (1, 2)'), cmd('C = B + D - A'), cmd('q = Polygon(A, B, C, D)'), cmd('e = Segment(A, C)'), cmd('f = Segment(B, D)')],
      ],
      reply:
        '已作出平行四边形 $ABCD$:先取三个顶点 $A(0,0)$、$B(3,0)$、$D(1,2)$,再由向量关系 $C = B + D - A = (4, 2)$ 得到第四个顶点。\n\n两条对角线 $AC$ 与 $BD$ 互相平分,交点为平行四边形的中心。',
    },
  ],
  '3d': [
    {
      prompt: '画棱锥 ABCD,底面 A(0,0,0)、B(3,0,0)、C(1,2,0),顶点 D(1,1,3)',
      scene: D3_SCENES[0],
      batches: [
        [cmd('A = (0, 0, 0)'), cmd('B = (3, 0, 0)'), cmd('C = (1, 2, 0)'), cmd('D = (1, 1, 3)'), cmd('p = Pyramid(A, B, C, D)')],
      ],
      reply:
        '已作出棱锥 $ABCD$:底面是 $z=0$ 平面上的三角形 $ABC$,顶点 $D$ 在高度 $z=3$ 处。\n\n`Pyramid(A, B, C, D)` 的前三个点确定底面,第四个点确定顶点。可以在右侧拖动旋转视图,从不同角度观察这个四面体。',
    },
    {
      prompt: '画球心 O(0,0,0)、半径为 2 的球',
      scene: D3_SCENES[1],
      batches: [[cmd('O = (0, 0, 0)'), cmd('s = Sphere(O, 2)')]],
      reply:
        '已作出球心在原点 $O(0,0,0)$、半径为 $2$ 的球 $s$。\n\n球面上的点都满足 $x^2+y^2+z^2=4$。经纬线只是辅助显示,拖动视图可以旋转观察。',
    },
    {
      prompt: '画平面 ABC,A(0,0,0)、B(2,0,0)、C(0,2,1),以及直线 PQ,P(0,0,2)、Q(2,2,0),并标出交点',
      scene: D3_SCENES[2],
      batches: [
        [cmd('A = (0, 0, 0)'), cmd('B = (2, 0, 0)'), cmd('C = (0, 2, 1)'), cmd('pl = Plane(A, B, C)'), cmd('P = (0, 0, 2)'), cmd('Q = (2, 2, 0)'), cmd('g = Line(P, Q)'), cmd('I = Intersect(g, pl)')],
      ],
      reply:
        '已作出由 $A$、$B$、$C$ 三点确定的平面 $pl$,以及过 $P(0,0,2)$、$Q(2,2,0)$ 的直线 $g$。\n\n`Intersect(g, pl)` 求得交点 $I=(\\frac{4}{3},\\frac{4}{3},\\frac{2}{3})$。直线穿过平面,交点处已标出。',
    },
    {
      prompt: '画出曲面 f(x, y) = x^2 + y^2',
      scene: D3_SCENES[3],
      batches: [[cmd('f(x, y) = x^2 + y^2')]],
      reply:
        '已画出曲面 $f(x,y)=x^2+y^2$,这是一个旋转抛物面。\n\n它在原点取得最小值 $0$,沿任意方向离开原点,函数值以平方速度增长。图中等高线是同心圆,说明曲面关于 $z$ 轴旋转对称。',
    },
  ],
  probability: [
    {
      prompt: '标准正态分布,求小于 1.96 的概率',
      scene: PROB_SCENES[0],
      batches: [[cmd('p = Normal(0, 1, 1.96, true)', 'ok', { value: 'p = 0.9750' })]],
      reply:
        '标准正态分布 $N(0,1)$ 在 $X < 1.96$ 处的累积概率为\n\n$$P(X \\le 1.96) = 0.9750$$\n\n即约 $97.5\\%$ 的数据落在 $1.96$ 个标准差以内,这也是置信区间 $95\\%$ 对应的常用临界值。',
    },
    {
      prompt: '二项分布:10 次独立试验,每次成功概率 0.5,求恰好成功 6 次的概率',
      scene: PROB_SCENES[1],
      batches: [[cmd('p = BinomialDist(10, 0.5, 6, false)', 'ok', { value: 'p = 0.2051' })]],
      reply:
        '二项分布 $B(10,\\,0.5)$ 中恰好成功 $6$ 次的概率为\n\n$$P(X = 6) = C_{10}^{6} \\cdot 0.5^{6} \\cdot 0.5^{4} \\approx 0.2051$$\n\n即约 $20.5\\%$。最后参数用 `false` 表示求点概率。',
    },
    {
      prompt: '泊松分布,平均次数为 3,求次数不超过 2 的概率',
      scene: PROB_SCENES[2],
      batches: [[cmd('p = Poisson(3, 2, true)', 'ok', { value: 'p = 0.4232' })]],
      reply:
        '泊松分布 $\\mathrm{Pois}(3)$ 中 $X \\le 2$ 的概率为\n\n$$P(X \\le 2) = e^{-3}\\left(1 + 3 + \\frac{9}{2}\\right) \\approx 0.4232$$\n\n即约 $42.3\\%$。',
    },
    {
      prompt: '画出自由度为 5 的卡方分布密度曲线',
      scene: PROB_SCENES[3],
      batches: [[cmd('ChiSquared(5, 2, true)', 'ok', { value: 'p = 0.1509' })]],
      reply:
        '已选择自由度为 $5$ 的卡方分布并绘制密度曲线,分布菜单与参数已同步更新。\n\n参考值:$P(X \\le 2) = 0.1509$。卡方分布只在 $x > 0$ 上有定义,自由度越大,曲线越接近正态。',
    },
  ],
  scientific: [
    {
      prompt: '计算 30 度的正弦,再加上 log(100)',
      scene: SCI_SCENES[0],
      batches: [[cmd('a = sin(30°)', 'ok', { value: 'a = 0.5' }), cmd('b = log(100)', 'ok', { value: 'b = 2' }), cmd('result = a + b', 'ok', { value: 'result = 2.5' })]],
      reply:
        '分步计算:\n\n$$\\sin 30° = 0.5,\\quad \\log 100 = 2$$\n\n$$\\sin 30° + \\log 100 = 0.5 + 2 = 2.5$$\n\n当前为角度制,三角函数的参数需要带 $°$。',
    },
    {
      prompt: '计算 5 的阶乘与根号 2 的和',
      scene: SCI_SCENES[1],
      batches: [[cmd('a = 5!', 'ok', { value: 'a = 120' }), cmd('b = sqrt(2)', 'ok', { value: 'b = 1.4142' }), cmd('result = a + b', 'ok', { value: 'result = 121.4142' })]],
      reply:
        '$$5! = 120,\\quad \\sqrt{2} \\approx 1.4142$$\n\n两者之和为 $121.4142$。',
    },
    {
      prompt: '计算 2.5 乘以 10 的 3 次方,再乘以 3.2 乘以 10 的 -1 次方',
      scene: SCI_SCENES[2],
      batches: [
        [cmd('a = 2.5 * 10^(3)', 'ok', { value: 'a = 2500' }), cmd('b = 3.2 * 10^(-1)', 'ok', { value: 'b = 0.32' }), cmd('result = a * b', 'ok', { value: 'result = 800' })],
      ],
      reply:
        '科学计数法按 $2.5 \\times 10^{3}$ 书写:\n\n$$a = 2500,\\quad b = 0.32$$\n\n$$2500 \\times 0.32 = 800$$',
    },
    {
      prompt: '计算 e 的平方,再向下取整',
      scene: SCI_SCENES[1].history ? null : null,
      batches: [[cmd('a = e^2', 'ok', { value: 'a = 7.3891' }), cmd('result = floor(a)', 'ok', { value: 'result = 7' })]],
      reply:
        '$$e^2 \\approx 7.3891$$\n\n向下取整得到 $\\lfloor e^2 \\rfloor = 7$。',
    },
  ],
}

const FALLBACKS = {
  geometry: {
    scene: {
      range: [-1.4, 5, -1.3, 3.2],
      objects: [
        { kind: 'point', id: 'A', x: 0, y: 0, def: 'A = (0, 0)' },
        { kind: 'point', id: 'B', x: 3, y: 1, def: 'B = (3, 1)' },
        { kind: 'segment', a: { x: 0, y: 0 }, b: { x: 3, y: 1 }, def: 'f = Segment(A, B)' },
      ],
    },
    batches: [
      [cmd('f = Segment(A, B)', 'failed', { error: '对象 A 还不存在。请先创建这些点,或改用已经在画板上的标签。' })],
      [cmd('A = (0, 0)'), cmd('B = (3, 1)'), cmd('f = Segment(A, B)')],
    ],
    reply:
      '我先按「创建两个点并连成线段」演示一次作图流程。\n\n第一次提交的 `Segment(A, B)` 引用了还不存在的点,系统**自动修正并重新执行**:先创建 $A=(0,0)$、$B=(3,1)$,再作线段 $f$。\n\n(原型说明:真实版本中大模型会理解你的需求并生成对应命令。)',
  },
  '3d': {
    scene: D3_SCENES[1],
    batches: [[cmd('O = (0, 0, 0)'), cmd('s = Sphere(O, 2)')]],
    reply:
      '我先演示一个基础空间作图:球心在原点 $O$、半径为 $2$ 的球 $s$。\n\n(原型说明:真实版本中大模型会理解你的需求并生成对应命令。)',
  },
  probability: {
    scene: PROB_SCENES[0],
    batches: [[cmd('p = Normal(0, 1, 1.96, true)', 'ok', { value: 'p = 0.9750' })]],
    reply:
      '我先演示一个标准正态分布的计算:$P(X \\le 1.96) = 0.9750$。\n\n(原型说明:真实版本中大模型会理解你的需求并生成对应命令。)',
  },
  scientific: {
    scene: { main: '14', angleUnit: 'degree', history: [{ expr: 'a = 2 + 3 × 4', value: '14' }] },
    batches: [[cmd('a = 2 + 3 * 4', 'ok', { value: 'a = 14' })]],
    reply:
      '我先演示一个基础算式:$2 + 3 \\times 4 = 14$(先乘后加)。\n\n(原型说明:真实版本中大模型会理解你的需求并生成对应算式。)',
  },
}

/* ==========================================================================
   Markdown + KaTeX 轻量渲染(原型内实现,不依赖外部库;
   真实项目使用 marked + KaTeX + DOMPurify,见 src/markdown.ts)
   ========================================================================== */

const SYMBOLS = {
  '\\pi': 'π',
  '\\mu': 'μ',
  '\\sigma': 'σ',
  '\\lambda': 'λ',
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\theta': 'θ',
  '\\le': '≤',
  '\\ge': '≥',
  '\\approx': '≈',
  '\\times': '×',
  '\\cdot': '·',
  '\\neq': '≠',
  '\\infty': '∞',
  '\\ldots': '…',
  '\\lfloor': '⌊',
  '\\rfloor': '⌋',
  '\\quad': '　',
  '\\mathrm': '',
  '\\left': '',
  '\\right': '',
  '\\%': '%',
  '\\,': ' ',
}

function latex(src) {
  let s = src
  // \frac{a}{b}
  s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => `<span class="frac">${latex(a)}⁄${latex(b)}</span>`)
  // \sqrt{a}
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, (m, a) => `√${latex(a)}`)
  // 函数名直立
  s = s.replace(/\\(sin|cos|tan|log|ln|exp|Pois|mathrm)\b/g, '$1')
  // 上下标
  s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>')
  s = s.replace(/\^(\d+|[A-Za-z])/g, '<sup>$1</sup>')
  s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>')
  s = s.replace(/_(\d+|[A-Za-z])/g, '<sub>$1</sub>')
  // 符号替换(按长度降序,避免 \left 被 \le 等前缀误替换)
  const entries = Object.entries(SYMBOLS).sort((a, b) => b[0].length - a[0].length)
  for (const [from, to] of entries) {
    s = s.split(from).join(to)
  }
  return s
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 将回复源文本渲染为 HTML(Markdown 子集 + 行内/块级公式) */
function renderLite(src) {
  let html = esc(src)
  // 块级公式
  html = html.replace(/\$\$([^$]+)\$\$/g, (m, t) => `<div class="katex-display">${latex(t)}</div>`)
  // 行内公式
  html = html.replace(/\$([^$]+)\$/g, (m, t) => `<span class="katex">${latex(t)}</span>`)
  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // 粗体
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // 无序列表(连续的 "- " 行)
  html = html.replace(/(?:^|\n)((?:- [^\n]+(?:\n|$))+)/g, (m, list) => {
    const items = list
      .split('\n')
      .filter(Boolean)
      .map((li) => `<li>${li.slice(2)}</li>`)
      .join('')
    return `<ul>${items}</ul>`
  })
  // 换行
  html = html.replace(/\n+/g, (m) => (m.length > 1 ? '</p><p>' : '<br>'))
  return `<p>${html}</p>`
}

/** 把源文本切成流式 token(标签与公式整体输出,文字按小段输出) */
function tokenize(src) {
  const html = renderLite(src)
  const tokens = []
  let i = 0
  const tagRe = /<[^>]+>|<\/[^>]+>/g
  let last = 0
  let match
  while ((match = tagRe.exec(html))) {
    if (match.index > last) pushText(html.slice(last, match.index))
    tokens.push(match[0])
    last = tagRe.lastIndex
  }
  if (last < html.length) pushText(html.slice(last))
  return tokens
  function pushText(text) {
    const chunks = text.match(/[\s\S]{1,2}/g) || []
    tokens.push(...chunks)
  }
}

/* ==========================================================================
   应用状态
   ========================================================================== */

const PREFS_KEY = 'aiggb-proto.prefs'

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}
  } catch {
    return {}
  }
}

const app = {
  mode: 'geometry',
  running: false,
  aborted: false,
  messages: { geometry: [], '3d': [], probability: [], scientific: [] },
  scenes: { ...INITIAL_SCENES },
  report: null,
  retried: false,
  prefs: Object.assign({ axes: false, angleUnit: 'degree', showLog: true }, loadPrefs()),
  sessionId: new URLSearchParams(window.location.search).get('session'),
  sessionName: '',
  toolHint: false,
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(app.prefs))
  } catch {
    /* 忽略 */
  }
}

const $ = (sel) => document.querySelector(sel)
const sleep = delay

/* ==========================================================================
   渲染
   ========================================================================== */

function sceneOf(mode) {
  return app.scenes[mode] || INITIAL_SCENES[mode]
}

function objCountOf(mode) {
  const scene = sceneOf(mode)
  if (mode === 'geometry') return scene.objects.filter((o) => o.def).length
  if (mode === '3d') return (scene.objects || []).length
  if (mode === 'probability') return 1
  if (mode === 'scientific') return (scene.history || []).length + 1
  return 0
}

function drawBoard(loading = false) {
  const host = $('#board')
  const mode = app.mode
  if (loading) {
    host.innerHTML = `<div class="ggb-loading"><span class="spinner"></span><span>正在加载${MODES[mode].title}…</span></div>`
    return
  }
  host.innerHTML = renderBoard(mode, sceneOf(mode), { axes: mode === 'geometry' ? app.prefs.axes : undefined })
  // 画板工具栏为静态展示,首次点击给出原型提示
  host.querySelectorAll('.ggb-tool').forEach((tool) => {
    tool.addEventListener('click', () => {
      if (app.toolHint) return
      app.toolHint = true
      toast('原型演示:画板工具栏为静态展示', 'info')
    })
  })
  if (mode === 'scientific') wireScientific()
  if (mode === 'probability') wireProbability()
}

/** 概率计算器控件交互:切换分布 / 修改参数 / 选择区间 → 重新绘制 */
function wireProbability() {
  const host = $('#board')
  const scene = sceneOf('probability')
  const read = () => ({
    dist: host.querySelector('[data-prob="dist"]').value,
    params: [...host.querySelectorAll('[data-param]')].map((i) => parseFloat(i.value) || 0),
    intervalType: host.querySelector('[data-prob="interval"]').value,
    bounds: [...host.querySelectorAll('[data-bound]')].map((i) => parseFloat(i.value) || 0),
    interval: true,
  })
  host.querySelectorAll('select, input').forEach((el) => {
    el.addEventListener('change', () => {
      const next = read()
      if (next.dist !== scene.dist) {
        // 切换分布:使用该分布的默认参数
        const defaults = DISTS[next.dist].params.map((p) => p.d)
        app.scenes.probability = { dist: next.dist, params: defaults, intervalType: 'left', bounds: [0], interval: true }
      } else {
        app.scenes.probability = next
      }
      drawBoard()
    })
  })
}

function renderModeHead() {
  const m = MODES[app.mode]
  $('#mode-eyebrow').textContent = m.eyebrow
  $('#mode-title').textContent = m.title
  $('#mode-lede').textContent = m.lede
  $('#chat-input').placeholder = m.placeholder
  $('#submit-btn').textContent = m.submitLabel
  $('#log-title').textContent = m.logLabel
  $('#log-btn').textContent = app.prefs.showLog ? `隐藏${m.logLabel}` : `显示${m.logLabel}`
  $('#log-empty').textContent = `${m.logLabel}执行后会显示在这里。`
  // #empty-hint 由 renderTranscript 动态创建,存在时才更新
  const hint = $('#empty-hint')
  if (hint) hint.textContent = m.empty
  $('#chat-input').setAttribute('aria-label', `${m.title}输入框`)

  document.querySelectorAll('#mode-nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === app.mode)
  })

  // 模式专属工具栏
  $('#axes-btn').style.display = app.mode === 'geometry' ? '' : 'none'
  $('#angle-btn').style.display = app.mode === 'scientific' ? '' : 'none'
  updateToolButtons()
}

function updateToolButtons() {
  const axesBtn = $('#axes-btn')
  if (axesBtn) {
    axesBtn.textContent = app.prefs.axes ? '隐藏坐标系' : '显示坐标系'
    axesBtn.classList.toggle('active', app.prefs.axes)
  }
  const angleBtn = $('#angle-btn')
  if (angleBtn) {
    angleBtn.textContent = app.prefs.angleUnit === 'radian' ? '弧度' : '角度'
    angleBtn.classList.toggle('active', app.prefs.angleUnit === 'radian')
  }
  const logBtn = $('#log-btn')
  logBtn.textContent = app.prefs.showLog ? `隐藏${MODES[app.mode].logLabel}` : `显示${MODES[app.mode].logLabel}`
  logBtn.classList.toggle('active', app.prefs.showLog)
}

function renderExamples() {
  const flows = FLOWS[app.mode]
  $('#examples').innerHTML = flows
    .map(
      (f, i) => `<button type="button" data-example="${i}">${esc(f.prompt)}</button>`
    )
    .join('')
}

function renderTranscript() {
  const box = $('#transcript')
  const msgs = app.messages[app.mode]
  let html = ''
  if (!msgs.length && !app.draftEl) {
    html += `<p class="empty" id="empty-hint">${MODES[app.mode].empty}</p>`
  }
  if (app.sessionName && (msgs.length || app.draftEl)) {
    html += `<div class="session-chip">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9"/><path d="M21 3v6h-6"/></svg>
      已同步到云端 · ${esc(app.sessionName)}</div>`
  }
  for (const msg of msgs) {
    html += msg.role === 'user'
      ? `<article class="bubble user"><p>${esc(msg.content)}</p></article>`
      : `<article class="bubble assistant"><div class="md">${renderLite(msg.content)}</div></article>`
  }
  box.innerHTML = html
  box.scrollTop = box.scrollHeight
}

function renderLog() {
  const report = app.report
  const log = $('#log')
  const retryBadge = $('#log-retry')
  const countEl = $('#log-count')
  // 自动修复徽章:发生过重试,且最后一轮全部成功(对应 App.tsx 的 attempts > 1 && !hasFailure(report))
  const lastBatch = report?.batches[report.batches.length - 1] || []
  const lastFailed = lastBatch.some((item) => item.status === 'failed')
  retryBadge.style.display = app.retried && !lastFailed ? '' : 'none'
  countEl.textContent = report ? `${app.currentObjCount || 0} 个对象` : ''
  countEl.style.display = report ? '' : 'none'

  const list = $('#log-list')
  const empty = $('#log-empty')
  if (!report || !report.batches.length) {
    list.innerHTML = ''
    empty.style.display = ''
    return
  }
  empty.style.display = 'none'
  list.innerHTML = report.batches
    .map((b) =>
      b
        .map(
          (item) => `
      <li class="${item.status}">
        <div class="row">
          <code>${esc(item.command)}</code>
          <span class="row-end">
            <span class="st">${STATUS_LABEL[item.status]}</span>
            <button type="button" class="copy" data-copy="${esc(item.command)}">复制</button>
          </span>
        </div>
        ${item.value ? `<p class="value">${esc(item.value)}</p>` : ''}
        ${item.error ? `<p class="err-text">${esc(item.error)}</p>` : ''}
      </li>`
        )
        .join('')
    )
    .join('')
  log.scrollTop = log.scrollHeight
}

const STATUS_LABEL = { ok: '已执行', failed: '失败', skipped: '未执行' }


function setRunning(running) {
  app.running = running
  $('#submit-btn').textContent = running ? `${MODES[app.mode].submitLabel}中…` : MODES[app.mode].submitLabel
  $('#chat-input').disabled = running
  document.querySelectorAll('#examples button').forEach((b) => (b.disabled = running))
}

/* ==========================================================================
   流式草稿
   ========================================================================== */

function startDraft(src) {
  const box = $('#transcript')
  $('#empty-hint')?.remove()
  const el = document.createElement('article')
  el.className = 'bubble assistant streaming'
  el.innerHTML = '<div class="md"><p></p></div>'
  box.appendChild(el)
  box.scrollTop = box.scrollHeight
  const md = el.querySelector('.md')

  const tokens = tokenize(src)
  // 按经过时间计算进度(而非固定每 tick 字符数):
  // 标签页被切到后台、定时器被节流时,仍能在同样时长内输出完
  const totalMs = Math.min(Math.max(tokens.length * 22, 900), 5200)
  const started = performance.now()
  app.draftEl = el
  app.draftTimer = setInterval(() => {
    const ratio = app.aborted ? 1 : Math.min((performance.now() - started) / totalMs, 1)
    md.innerHTML = tokens.slice(0, Math.round(ratio * tokens.length)).join('')
    box.scrollTop = box.scrollHeight
    if (ratio >= 1) finishDraft()
  }, 40)
}

function finishDraft() {
  clearInterval(app.draftTimer)
  const el = app.draftEl
  if (!el) return
  el.classList.remove('streaming')
  const src = app.draftSrc
  app.draftEl = null
  app.messages[app.mode].push({ role: 'assistant', content: src })
  renderTranscript()
}

/* ==========================================================================
   提交与执行(模拟 runTurn 链路)
   ========================================================================== */

async function submit(text) {
  if (!text || app.running) return
  const mode = app.mode

  // 未登录首次提交:弹出登录引导
  if (!auth.isLoggedIn() && !app.guestOk) {
    const go = await showLoginGuide()
    if (!go) return
    app.guestOk = true
  }

  app.aborted = false
  app.messages[mode].push({ role: 'user', content: text })
  app.report = null
  app.retried = false
  app.currentObjCount = 0
  $('#chat-input').value = ''
  $('#error-banner')?.remove()
  renderTranscript()
  renderLog()
  setRunning(true)

  const flow = pickFlow(text)
  const batches = flow.batches

  // 1. 命令执行:逐条写入日志,第一条失败后后续标记为「未执行」;
  //    若存在第二轮,间隔后自动修正重试(对应 chat.ts 的失败重试机制)
  app.report = { batches: [] }
  for (let bi = 0; bi < batches.length; bi++) {
    if (bi > 0) {
      app.retried = true
      renderLog()
      await sleep(app.aborted ? 0 : 850)
    }
    const executed = []
    let failed = false
    for (const item of batches[bi]) {
      if (app.aborted) return finishRun(flow)
      const status = failed ? 'skipped' : item.status
      executed.push({ ...item, status })
      if (status === 'failed') failed = true
      app.report = { batches: [...app.report.batches.slice(0, bi), executed] }
      renderLog()
      await sleep(app.aborted ? 0 : 240)
    }
    app.report = { batches: [...app.report.batches.slice(0, bi), executed] }
    renderLog()
    await sleep(app.aborted ? 0 : 420)
  }

  // 先写入场景,再按场景统计对象数(与画板代数区显示一致)
  app.scenes[mode] = mode === 'scientific' ? { ...flow.scene, angleUnit: app.prefs.angleUnit } : flow.scene
  app.currentObjCount = objCountOf(mode)
  drawBoard()
  renderLog()

  // 2. 流式中文解释
  await sleep(350)
  if (app.aborted) return finishRun(flow)
  app.draftSrc = flow.reply
  startDraft(flow.reply)

  // 等待流式输出完成
  await new Promise((resolve) => {
    const check = () => (app.draftEl ? setTimeout(check, 120) : resolve())
    check()
  })
  finishRun(flow)
}

function finishRun(flow) {
  app.aborted = true
  clearInterval(app.draftTimer)
  if (app.draftEl) finishDraft()
  setRunning(false)
  usage.record(models.current())
  syncSession()
}

/* 自由输入 → 按关键词匹配最近的示例流程,无匹配时使用兜底演示流程 */
const KEYWORDS = {
  geometry: [
    ['三角形', 0], ['切线', 1], ['圆', 1], ['函数', 2], ['交点', 2], ['平行', 3], ['对角', 3],
  ],
  '3d': [
    ['棱锥', 0], ['球', 1], ['平面', 2], ['曲面', 3],
  ],
  probability: [
    ['正态', 0], ['二项', 1], ['泊松', 2], ['卡方', 3],
  ],
  scientific: [
    ['取整', 3], ['正弦', 0], ['对数', 0], ['阶乘', 1], ['根号', 1], ['平方', 3], ['10 的 3 次方', 2], ['次方', 2],
  ],
}

function pickFlow(text) {
  const t = text.trim()
  const exact = FLOWS[app.mode].find((f) => f.prompt === t)
  if (exact) return exact
  for (const [keyword, index] of KEYWORDS[app.mode]) {
    if (t.includes(keyword)) return FLOWS[app.mode][index]
  }
  return FALLBACKS[app.mode]
}

/** 会话云端同步(模拟 PUT /api/sessions/:id) */
function syncSession() {
  if (!auth.isLoggedIn()) return
  const msgs = app.messages[app.mode]
  if (!msgs.length) return
  let id = app.sessionId
  if (!id) {
    const first = msgs.find((m) => m.role === 'user')
    const name = first ? first.content.slice(0, 14) + (first.content.length > 14 ? '…' : '') : '未命名会话'
    const created = sessions.add({ name, mode: app.mode, messages: msgs })
    app.sessionId = created.id
    app.sessionName = name
    // 同步更新地址栏,便于刷新后继续
    history.replaceState(null, '', '?session=' + created.id)
  } else {
    sessions.update(id, { messages: msgs })
    const s = sessions.get(id)
    if (s) app.sessionName = s.name
  }
  renderTranscript()
}

/* ==========================================================================
   科学计算器按键
   ========================================================================== */

function wireScientific() {
  const host = $('#board')
  let buf = ''
  const DEG = app.prefs.angleUnit === 'degree'

  const setMain = (v) => {
    host.querySelector('[data-sci-main]').textContent = v
  }
  const pushHistory = (expr, value) => {
    const h = host.querySelector('[data-sci-history]')
    h.innerHTML = `<div class="sci-history">${expr} = ${value}</div>` + h.innerHTML
  }
  const fmt = (n) => {
    if (!isFinite(n)) return 'Error'
    const r = Math.round(n * 1e6) / 1e6
    return String(r)
  }

  function evaluate(expr) {
    let s = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/√\(/g, 'sqrt(')
      .replace(/\^/g, '**')
      .replace(/π/g, 'PI')
      .replace(/(\d+(?:\.\d+)?)!/g, 'fact($1)')
    const scope = {
      PI: Math.PI,
      E: Math.E,
      fact: (n) => {
        if (n < 0 || n > 170 || Math.floor(n) !== n) return NaN
        let r = 1
        for (let i = 2; i <= n; i++) r *= i
        return r
      },
      sin: DEG ? (x) => Math.sin((x * Math.PI) / 180) : Math.sin,
      cos: DEG ? (x) => Math.cos((x * Math.PI) / 180) : Math.cos,
      tan: DEG ? (x) => Math.tan((x * Math.PI) / 180) : Math.tan,
      asin: DEG ? (x) => (Math.asin(x) * 180) / Math.PI : Math.asin,
      acos: DEG ? (x) => (Math.acos(x) * 180) / Math.PI : Math.acos,
      atan: DEG ? (x) => (Math.atan(x) * 180) / Math.PI : Math.atan,
      ln: Math.log,
      log: Math.log10,
      sqrt: Math.sqrt,
      exp: Math.exp,
      abs: Math.abs,
      floor: Math.floor,
      ceil: Math.ceil,
      e: Math.E,
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function(...Object.keys(scope), `"use strict"; return (${s})`)
    return fn(...Object.values(scope))
  }

  host.querySelectorAll('.sci-key').forEach((key) => {
    key.addEventListener('click', () => {
      const label = key.dataset.key
      if (label === '=') {
        if (!buf) return
        try {
          const value = evaluate(buf)
          pushHistory(buf, fmt(value))
          setMain(fmt(value))
        } catch {
          setMain('Error')
        }
        buf = ''
        return
      }
      if (label === 'AC') {
        buf = ''
        setMain('0')
        return
      }
      if (label === '⌫') {
        buf = buf.slice(0, -1)
        setMain(buf || '0')
        return
      }
      buf += label
      setMain(buf)
    })
  })
}

/* ==========================================================================
   登录引导(未登录时首次提交)
   ========================================================================== */

function showLoginGuide() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>
        </div>
        <h3>登录后,会话将保存到云端</h3>
        <p class="modal-sub">登录后每次作图都会自动同步到你的账号,可以在任意设备继续。现在也可以先体验,但会话只保留在当前页面。</p>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" data-act="guest">继续体验</button>
          <button class="btn btn-sm" data-act="login">去登录</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    overlay.querySelector('[data-act="guest"]').addEventListener('click', () => {
      overlay.remove()
      resolve(true)
    })
    overlay.querySelector('[data-act="login"]').addEventListener('click', () => {
      overlay.remove()
      window.location.href = 'login.html?redirect=' + encodeURIComponent('index.html' + (app.sessionId ? '?session=' + app.sessionId : ''))
      resolve(false)
    })
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove()
        resolve(false)
      }
    })
  })
}

/* ==========================================================================
   事件绑定
   ========================================================================== */

function bindEvents() {
  // 模式切换
  document.querySelectorAll('#mode-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mode
      if (next === app.mode || app.running) return
      app.mode = next
      app.report = null
      app.retried = false
      finishDraft()
      renderModeHead()
      renderExamples()
      renderTranscript()
      renderLog()
      drawBoard(true)
      setTimeout(() => drawBoard(), 620)
      $('#chat-input').focus()
    })
  })

  // 示例按钮
  $('#examples').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-example]')
    if (!btn) return
    void submit(FLOWS[app.mode][Number(btn.dataset.example)].prompt)
  })

  // 提交
  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault()
    void submit($('#chat-input').value.trim())
  })

  // 输入框快捷键
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      void submit(e.currentTarget.value.trim())
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.running) {
      app.aborted = true
      toast('已停止当前请求', 'info')
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit($('#chat-input').value.trim())
    }
  })

  // 清空
  $('#clear-btn').addEventListener('click', () => {
    if (app.running) return
    app.messages[app.mode] = []
    app.report = null
    app.retried = false
    app.currentObjCount = 0
    app.scenes[app.mode] = INITIAL_SCENES[app.mode]
    app.draftEl = null
    renderTranscript()
    renderLog()
    drawBoard()
  })

  // 坐标系显隐(几何)
  $('#axes-btn').addEventListener('click', () => {
    app.prefs.axes = !app.prefs.axes
    savePrefs()
    updateToolButtons()
    drawBoard()
  })

  // 角度/弧度(科学计算)
  $('#angle-btn').addEventListener('click', () => {
    app.prefs.angleUnit = app.prefs.angleUnit === 'radian' ? 'degree' : 'radian'
    savePrefs()
    updateToolButtons()
    app.scenes.scientific = { ...app.scenes.scientific, angleUnit: app.prefs.angleUnit }
    drawBoard()
  })

  // 日志显隐
  $('#log-btn').addEventListener('click', () => {
    app.prefs.showLog = !app.prefs.showLog
    savePrefs()
    updateToolButtons()
    $('#log').classList.toggle('collapsed', !app.prefs.showLog)
  })

  // 复制命令
  $('#log-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]')
    if (!btn) return
    const command = btn.dataset.copy
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = command
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    btn.textContent = '已复制'
    btn.classList.add('copied')
    setTimeout(() => {
      btn.textContent = '复制'
      btn.classList.remove('copied')
    }, 1200)
  })

  // 模型选择下拉
  const modelBtn = $('#model-btn')
  const modelMenu = $('#model-menu')
  modelBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const hidden = modelMenu.style.display === 'none'
    modelMenu.style.display = hidden ? '' : 'none'
    if (!hidden) return
    renderModelMenu()
  })
  document.addEventListener('click', (e) => {
    if (!modelMenu.contains(e.target)) modelMenu.style.display = 'none'
  })
}

function renderModelMenu() {
  const menu = $('#model-menu')
  const current = models.current()
  menu.innerHTML = `
    <div class="menu-head">选择模型(对应 .env 的 LLM_MODEL)</div>
    ${models
      .list()
      .map(
        (m) => `
      <button class="menu-item" data-model="${m.id}">
        <span>${esc(m.name)}${m.gateway ? ' · 网关' : ''}</span>
        ${m.id === current ? '<span class="check">✓</span>' : ''}
      </button>`
      )
      .join('')}
    <div class="menu-sep"></div>
    <div class="menu-head">模型配置在「设置 → 模型接入」中管理</div>`
  menu.querySelectorAll('[data-model]').forEach((btn) => {
    btn.addEventListener('click', () => {
      models.set(btn.dataset.model)
      menu.style.display = 'none'
      updateModelBadge()
      toast('已切换模型:' + models.current(), 'success')
    })
  })
}

function updateModelBadge() {
  const meta = models.currentMeta()
  const btn = $('#model-btn')
  btn.innerHTML = `<span class="dot dot-ok"></span>${esc(meta.name)}<span class="caret">▼</span>`
  btn.classList.toggle('gateway', Boolean(meta.gateway))
  btn.title = meta.gateway ? '经 EdgeOne AI Gateway 路由' : '当前模型(模拟 GET /api/status)'
}

/* ==========================================================================
   初始化
   ========================================================================== */

function init() {
  // 从 URL 加载云端会话
  if (app.sessionId) {
    const saved = sessions.get(app.sessionId)
    if (saved) {
      app.messages[saved.mode] = saved.messages || []
      app.mode = saved.mode
      app.sessionName = saved.name
    }
  }
  app.scenes.scientific.angleUnit = app.prefs.angleUnit
  renderModeHead()
  renderExamples()
  updateModelBadge()
  renderTranscript()
  renderLog()
  $('#log').classList.toggle('collapsed', !app.prefs.showLog)
  drawBoard(true)
  setTimeout(() => drawBoard(), 650)
  renderTopbar()
  bindEvents()
  const textarea = $('#chat-input')
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  })
}

init()

})(window)
