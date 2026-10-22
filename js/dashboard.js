/* 经典脚本(非 ES 模块):为支持 file:// 直接双击打开,不使用 import/export。
   本文件依赖 window.AIGGB.store(须先加载)。 */
;(function (global) {
  'use strict'

/* ==========================================================================
   高保真原型 · 个人工作台(dashboard.js)
   云端会话管理(模拟 /api/sessions)与用量统计(可观测性 Roadmap 项)。
   图表遵循单色系、细标记、基线对齐、文字承载标签的原则。
   ========================================================================== */

const { auth, models, sessions, usage, toast, renderTopbar, openModal, requireLogin } = global.AIGGB.store

if (!requireLogin()) return

const $ = (sel) => document.querySelector(sel)

/* ---------------- 统计卡片 ---------------- */

function renderStats() {
  const u = usage.get()
  const user = auth.currentUser()
  $('#welcome').textContent = `${user ? user.name + ',' : ''}欢迎回来。这里汇总你的作图数据与云端会话。`
  $('#stat-requests').textContent = u.totalRequests.toLocaleString()
  $('#stat-requests-foot').textContent = `近 7 天 +${u.daily.reduce((a, b) => a + b, 0)} 次`
  $('#stat-sessions').textContent = sessions.list().length
  $('#stat-tokens').textContent = u.totalTokens
  $('#stat-model').textContent = models.current()
}

/* ---------------- 近 7 天柱状图 ---------------- */

function niceMax(value) {
  if (value <= 5) return 5
  const step = Math.pow(10, Math.floor(Math.log10(value)))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    if (value <= m * step) return m * step
  }
  return 10 * step
}

function renderUsageChart() {
  const u = usage.get()
  const data = u.daily
  const W = 640
  const H = 240
  const padL = 32
  const padR = 14
  const padT = 26
  const padB = 34
  const max = niceMax(Math.max(...data) * 1.15)
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const slot = innerW / data.length
  const barW = Math.min(46, slot * 0.56)

  const now = new Date()
  const days = data.map((v, i) => {
    const d = new Date(now.getTime() - (data.length - 1 - i) * 24 * 60 * 60 * 1000)
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
    return { v, label: `${d.getMonth() + 1}/${d.getDate()}`, week }
  })

  // 刻度取整且互不重复(0 与 max 之间等分 4 段)
  let grid = ''
  for (let g = 0; g <= 4; g++) {
    const y = padT + innerH - (innerH * g) / 4
    const value = Math.round((max * g) / 4)
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eceae2" stroke-width="1"/>`
    grid += `<text x="${padL - 6}" y="${y + 4}" font-size="11" fill="#8b948e" text-anchor="end">${value}</text>`
  }

  let bars = ''
  days.forEach((d, i) => {
    const h = Math.max((d.v / max) * innerH, 2)
    const x = padL + slot * i + (slot - barW) / 2
    const y = padT + innerH - h
    const color = i === data.length - 1 ? '#0c5c56' : '#7fb0a7'
    bars += `<rect class="bar" data-i="${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW}" height="${h.toFixed(1)}" rx="4" fill="${color}"/>`
    bars += `<text x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${y - 7}" font-size="11" fill="#66706a" text-anchor="middle">${d.v}</text>`
    bars += `<text x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${H - 12}" font-size="11" fill="#8b948e" text-anchor="middle">${d.label}</text>`
    bars += `<text x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${H - 1}" font-size="10" fill="#b0a99c" text-anchor="middle">${d.week}</text>`
  })

  $('#usage-plot').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="近 7 天作图请求柱状图">
      <line x1="${padL}" y1="${padT + innerH}" x2="${W - padR}" y2="${padT + innerH}" stroke="#b9b2a4" stroke-width="1.2"/>
      ${grid}${bars}
    </svg>
    <div class="usage-tip" id="usage-tip"></div>`

  // 悬停提示
  const tip = $('#usage-tip')
  const plot = $('#usage-plot')
  plot.querySelectorAll('.bar').forEach((bar) => {
    bar.addEventListener('mousemove', (e) => {
      const d = days[Number(bar.dataset.i)]
      tip.textContent = `${d.week} ${d.label} · ${d.v} 次请求`
      tip.style.opacity = '1'
      const rect = plot.getBoundingClientRect()
      const bx = Number(bar.getAttribute('x')) + barW / 2
      const by = Number(bar.getAttribute('y'))
      const scale = rect.width / W
      tip.style.left = bx * scale + 'px'
      tip.style.top = by * scale + 'px'
    })
    bar.addEventListener('mouseleave', () => {
      tip.style.opacity = '0'
    })
  })
}

/* ---------------- 模型用量分布 ---------------- */

function renderModelList() {
  const u = usage.get()
  const palette = ['#0c5c56', '#2a78d6', '#eb6834']
  $('#model-list').innerHTML = u.byModel
    .map(
      (m, i) => `
      <li>
        <div class="ml-row">
          <span class="ml-name">
            <span class="m-dot" style="background:${palette[i % palette.length]}"></span>
            ${esc(m.label)}
          </span>
          <span class="ml-count">${m.count} 次 · ${m.pct}%</span>
        </div>
        <div class="ml-bar"><i style="width:${m.pct}%"></i></div>
      </li>`
    )
    .join('')
}

/* ---------------- 会话列表 ---------------- */

const MODE_META = {
  geometry: { label: '几何', cls: 'badge-mode-geometry' },
  '3d': { label: '3D', cls: 'badge-mode-3d' },
  probability: { label: '概率', cls: 'badge-mode-probability' },
  scientific: { label: '科学', cls: 'badge-mode-scientific' },
}

const MODE_ICON = {
  geometry: '<path d="M12 3.5 20 19H4z" /><circle cx="12" cy="14.6" r="2.4" />',
  '3d': '<path d="M12 3 20 18.5H4zM12 3v6M4 18.5l7-5.4M20 18.5l-7-5.4"/>',
  probability: '<path d="M3.5 18.5c4 0 4-6 8-6s4 6 9 0" /><circle cx="3.5" cy="18.5" r="1.6"/><circle cx="20.5" cy="12.5" r="1.6"/>',
  scientific: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6M9 13h6M9 17h3"/>',
}

function timeAgo(ts) {
  const diff = Date.now() - ts
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(ts).toLocaleDateString('zh-CN')
}

function renderSessions() {
  const list = sessions.list()
  const box = $('#session-list')
  if (!list.length) {
    box.innerHTML = `
      <div class="card empty-state">
        <span class="e-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3 21 19H3z"/><circle cx="12" cy="15" r="2.4"/></svg>
        </span>
        <p>还没有保存的会话。登录后在工作区完成的作图会自动同步到这里,也可以点击右上角「新建会话」。</p>
        <a class="btn btn-sm" href="index.html">去工作区作图</a>
      </div>`
    return
  }
  box.innerHTML = list
    .map((s) => {
      const meta = MODE_META[s.mode]
      const preview = s.messages.find((m) => m.role === 'user')?.content || '暂无内容'
      return `
      <li class="session-item">
        <span class="s-icon">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MODE_ICON[s.mode]}</svg>
        </span>
        <div class="s-main">
          <div class="s-title"><b>${esc(s.name)}</b><span class="badge ${meta.cls}">${meta.label}</span></div>
          <p class="s-preview">${esc(preview)}</p>
          <div class="s-meta">
            <span>${s.messages.length} 条消息</span>
            <span>更新于 ${timeAgo(s.updatedAt)}</span>
          </div>
        </div>
        <div class="s-actions">
          <a class="a-btn open" href="index.html?session=${s.id}" title="继续作图">打开</a>
          <button class="a-btn" data-act="rename" data-id="${s.id}" title="重命名">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="a-btn" data-act="export" data-id="${s.id}" title="导出 JSON">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
          </button>
          <button class="a-btn danger" data-act="remove" data-id="${s.id}" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </li>`
    })
    .join('')
}

function bindSessionActions() {
  $('#session-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]')
    if (!btn) return
    const id = btn.dataset.id
    const item = sessions.get(id)
    if (!item) return

    if (btn.dataset.act === 'rename') {
      const result = await openModal({
        title: '重命名会话',
        sub: '修改后会自动同步到云端。',
        inputs: [{ id: 'name', label: '会话名称', value: item.name, required: true }],
        okText: '保存',
        icon: 'normal',
      })
      if (result && result.name !== item.name) {
        sessions.update(id, { name: result.name })
        toast('已重命名')
        renderSessions()
      }
    } else if (btn.dataset.act === 'export') {
      const payload = sessions.export(id)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aiggb-session-${id}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast('会话已导出为 JSON 文件', 'success')
    } else if (btn.dataset.act === 'remove') {
      const ok = await openModal({
        title: '删除会话',
        sub: `确定删除「${item.name}」吗?该操作不可撤销。`,
        icon: 'danger',
        danger: true,
        okText: '删除',
      })
      if (ok !== null && ok !== undefined) {
        sessions.remove(id)
        toast('会话已删除', 'info')
        renderSessions()
        renderStats()
      }
    }
  })
}

/* ---------------- 新建会话 ---------------- */

/* 模式选择使用自定义弹层(openModal 只支持文本输入,模式用按钮组呈现) */
function pickModeThenCreate(name) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>选择模式</h3>
        <p class="modal-sub">新会话「${esc(name)}」将使用哪种计算器?</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem">
          ${Object.entries(MODE_META)
            .map(
              ([id, m]) => `
            <button class="btn btn-ghost mode-pick" data-mode="${id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${MODE_ICON[id]}</svg>
              ${m.label}
            </button>`
            )
            .join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost btn-sm" data-act="cancel">取消</button>
        </div>
      </div>`
    document.body.appendChild(overlay)
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => {
      overlay.remove()
      resolve(null)
    })
    overlay.querySelectorAll('.mode-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        overlay.remove()
        resolve(btn.dataset.mode)
      })
    })
  })
}

async function createSession() {
  const result = await openModal({
    title: '新建会话',
    sub: '会话创建后会同步到云端。',
    icon: 'normal',
    inputs: [{ id: 'name', label: '会话名称', placeholder: '例如:三角形的中线与高', required: true }],
    okText: '下一步',
  })
  if (!result) return
  const mode = await pickModeThenCreate(result.name)
  if (!mode) return
  const created = await sessions.createAsync({ name: result.name, mode })
  toast('会话已创建并同步到云端', 'success')
  setTimeout(() => (window.location.href = 'index.html?session=' + created.id), 500)
}

/* ---------------- 工具 ---------------- */

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ---------------- 初始化 ---------------- */

renderTopbar()
renderStats()
renderUsageChart()
renderModelList()
renderSessions()
bindSessionActions()
$('#new-session-btn').addEventListener('click', createSession)

})(window)
