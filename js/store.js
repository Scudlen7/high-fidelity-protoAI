/* 经典脚本(非 ES 模块):为支持 file:// 直接双击打开,不使用 import/export。
   本文件挂载到 window.AIGGB.store 命名空间下。 */
;(function (global) {
  'use strict'

/* ==========================================================================
   高保真原型 · 模拟后端(store.js)
   --------------------------------------------------------------------------
   以 localStorage 模拟真实后端接口,页面间共享登录态 / 模型配置 /
   云端会话 / 用量统计。真实项目中这些数据将由以下接口提供:

   · 用户系统   —— 未来接口(原型中以 mockAuth 系列函数模拟):
                  POST /api/auth/register · POST /api/auth/login
                  POST /api/auth/logout · POST /api/auth/reset-password
   · 会话管理   —— 当前项目仅存 localStorage,云端化为 Roadmap 项:
                  GET/POST/PATCH/DELETE /api/sessions(原型中以 mockSession 系列模拟)
   · 模型状态   —— GET /api/status(真实项目已有,见 functions/api/status.js)
   · LLM 对话   —— POST /llm/chat/completions(真实项目已有,由 Edge Function 转发)
   · 用量统计   —— 可观测性 Roadmap 项(原型中以 mockUsage 模拟)
   ========================================================================== */

const KEY = 'aiggb-proto-v1'

function seed() {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  return {
    user: null,
    model: 'deepseek-chat',
    models: [
      {
        id: 'deepseek-chat',
        name: 'deepseek-chat',
        desc: 'DeepSeek 对话模型 · 通用作图与计算',
        tags: ['默认', 'OpenAI 兼容'],
      },
      {
        id: 'deepseek-flash',
        name: 'deepseek-flash',
        desc: 'DeepSeek 快速模型 · 响应更快,适合高频小任务',
        tags: ['快速'],
      },
      {
        id: '@makers/deepseek-v4-flash',
        name: '@makers/deepseek-v4-flash',
        desc: '经 EdgeOne AI Gateway 路由 · 统一鉴权与用量观测',
        tags: ['AI Gateway'],
        gateway: true,
      },
      {
        id: 'deepseek-reasoner',
        name: 'deepseek-reasoner',
        desc: 'DeepSeek 推理模型 · 复杂构造任务更稳',
        tags: ['推理'],
      },
    ],
    sessions: [
      {
        id: 's-triangle',
        name: '三角形与高',
        mode: 'geometry',
        createdAt: now - 6 * day,
        updatedAt: now - 2 * day,
        messages: [
          { role: 'user', content: '画三角形 ABC,A(0,0)、B(4,0)、C(1,3),并作出 AB 边上的高' },
          {
            role: 'assistant',
            content:
              '已在画板上作出三角形 $ABC$,以及 $AB$ 边上的高。先创建三个顶点 $A=(0,0)$、$B=(4,0)$、$C=(1,3)$,用 `Polygon(A, B, C)` 连成三角形;再由顶点 $C$ 向 $AB$ 作垂线,垂足为 $D=(1,0)$,线段 $CD$ 即为所求的高。',
          },
        ],
      },
      {
        id: 's-normal',
        name: '标准正态概率',
        mode: 'probability',
        createdAt: now - 4 * day,
        updatedAt: now - 1 * day,
        messages: [
          { role: 'user', content: '标准正态分布,求小于 1.96 的概率' },
          {
            role: 'assistant',
            content:
              '标准正态分布 $N(0,1)$ 在 $X < 1.96$ 处的累积概率为 $$P(X \\le 1.96) = 0.9750$$ 即约 $97.5\\%$ 的数据落在 $1.96$ 个标准差以内。',
          },
        ],
      },
      {
        id: 's-pyramid',
        name: '3D 棱锥',
        mode: '3d',
        createdAt: now - 2 * day,
        updatedAt: now - 5 * 60 * 60 * 1000,
        messages: [
          { role: 'user', content: '画棱锥 ABCD,底面 A(0,0,0)、B(3,0,0)、C(1,2,0),顶点 D(1,1,3)' },
          {
            role: 'assistant',
            content:
              '已作出棱锥 $ABCD$:底面是 $z=0$ 平面上的三角形 $ABC$,顶点 $D$ 在高度 $z=3$ 处。可拖动视图旋转查看。',
          },
        ],
      },
    ],
    usage: {
      totalRequests: 328,
      totalTokens: '1.24M',
      daily: [14, 22, 9, 26, 17, 31, 21], // 近 7 天请求数
      byModel: [
        { id: 'deepseek-chat', label: 'deepseek-chat', count: 214, pct: 65 },
        { id: 'deepseek-flash', label: 'deepseek-flash', count: 79, pct: 24 },
        { id: '@makers/deepseek-v4-flash', label: 'AI Gateway 路由', count: 35, pct: 11 },
      ],
    },
  }
}

let state = load()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      // 简单结构校验,防止旧数据导致崩溃
      if (parsed && Array.isArray(parsed.sessions) && parsed.usage && parsed.models) return parsed
    }
  } catch {
    /* 忽略损坏数据 */
  }
  // 首次访问:写入种子数据(直接写存储,不经 persist,避免 TDZ)
  const fresh = seed()
  try {
    localStorage.setItem(KEY, JSON.stringify(fresh))
  } catch {
    /* 存储不可用时保持内存态 */
  }
  return fresh
}

function persist(next) {
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* 存储不可用时保持内存态 */
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ==========================================================================
   用户系统(模拟 POST /api/auth/*)
   ========================================================================== */

const auth = {
  isLoggedIn() {
    return Boolean(state.user)
  },
  currentUser() {
    return state.user
  },
  /** 模拟登录:校验演示账号,任意合法邮箱也可通过(演示用途) */
  async login(email, password) {
    await delay(700)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('邮箱格式不正确')
    }
    if (password.length < 6) {
      throw new Error('密码至少 6 位')
    }
    const name = email
      .split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 16)
    persist({ ...state, user: { name, email, joinedAt: new Date().toISOString().slice(0, 10) } })
    return state.user
  },
  async register({ name, email, password, code }) {
    await delay(900)
    if (!name || name.trim().length < 2) throw new Error('昵称至少 2 个字符')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('密码至少 8 位,且需同时包含字母和数字')
    }
    if (!/^\d{4}$/.test(code || '')) throw new Error('请输入 4 位验证码')
    persist({
      ...state,
      user: { name: name.trim(), email, joinedAt: new Date().toISOString().slice(0, 10) },
    })
    return state.user
  },
  async sendCode(email) {
    await delay(600)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确')
    return true
  },
  async resetPassword(email, password) {
    await delay(800)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('邮箱格式不正确')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error('密码至少 8 位,且需同时包含字母和数字')
    }
    return true
  },
  updateUser(patch) {
    if (!state.user) return
    persist({ ...state, user: { ...state.user, ...patch } })
  },
  logout() {
    persist({ ...state, user: null })
  },
  /** 彻底删除账号:清空用户与全部云端会话 */
  deleteAccount() {
    persist({ ...state, user: null, sessions: [] })
  },
}

/* ==========================================================================
   模型配置(对应真实接口 GET /api/status)
   ========================================================================== */

const models = {
  list() {
    return state.models
  },
  current() {
    return state.model
  },
  currentMeta() {
    return state.models.find((m) => m.id === state.model) || state.models[0]
  },
  set(id) {
    if (!state.models.some((m) => m.id === id)) return
    persist({ ...state, model: id })
  },
  /** 模拟 /api/status:返回模型配置状态(带网络延迟) */
  async status() {
    await delay(450)
    return { configured: true, model: state.model }
  },
  /** 模拟"测试连接" */
  async testConnection(modelId) {
    await delay(900)
    return { ok: true, latency: Math.floor(240 + Math.random() * 180), model: modelId }
  },
}

/* ==========================================================================
   云端会话(模拟 /api/sessions,当前项目此能力仅存 localStorage)
   ========================================================================== */

const sessions = {
  list() {
    return [...state.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  },
  get(id) {
    return state.sessions.find((s) => s.id === id) || null
  },
  add({ name, mode, messages = [] }) {
    const item = {
      id: 's-' + Math.random().toString(36).slice(2, 8),
      name,
      mode,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages,
    }
    persist({ ...state, sessions: [item, ...state.sessions] })
    return item
  },
  update(id, patch) {
    persist({
      ...state,
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s)),
    })
  },
  remove(id) {
    persist({ ...state, sessions: state.sessions.filter((s) => s.id !== id) })
  },
  export(id) {
    const item = sessions.get(id)
    if (!item) return null
    return {
      app: 'AIGeoGebra',
      exportedAt: new Date().toISOString(),
      session: item,
    }
  },
  /** 模拟新建会话网络延迟 */
  async createAsync({ name, mode }) {
    await delay(650)
    return sessions.add({ name, mode })
  },
}

/* ==========================================================================
   用量统计(可观测性 Roadmap 项)
   ========================================================================== */

const usage = {
  get() {
    return state.usage
  },
  /** 每次模拟提交后调用:请求数 +1,近 7 天最后一天 +1,按模型累计 */
  record(modelId) {
    const daily = [...state.usage.daily]
    daily[daily.length - 1] += 1
    let byModel = state.usage.byModel.map((m) => (m.id === modelId ? { ...m, count: m.count + 1 } : m))
    if (!byModel.some((m) => m.id === modelId)) {
      const meta = models.currentMeta()
      byModel = [...byModel, { id: modelId, label: meta?.name || modelId, count: 1, pct: 0 }]
    }
    const total = byModel.reduce((sum, m) => sum + m.count, 0)
    const finalByModel = byModel.map((m) => ({ ...m, pct: Math.round((m.count / total) * 100) }))
    persist({
      ...state,
      usage: {
        ...state.usage,
        totalRequests: state.usage.totalRequests + 1,
        daily,
        byModel: finalByModel,
      },
    })
  },
}

/** 清空本地缓存(模拟"清空本地数据",保留种子数据重新初始化) */
function clearAll() {
  localStorage.removeItem(KEY)
  state = seed()
  persist(state)
}

/* ==========================================================================
   UI 工具:Toast / 模态框 / 下拉菜单 / 顶部导航登录态
   ========================================================================== */

function toast(message, type = 'success', duration = 2400) {
  let wrap = document.querySelector('.toast-wrap')
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.className = 'toast-wrap'
    document.body.appendChild(wrap)
  }
  const icons = {
    success: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></svg>',
    info: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  }
  const el = document.createElement('div')
  el.className = 'toast ' + type
  el.innerHTML = `<span class="t-icon">${icons[type] || icons.info}</span><span>${message}</span>`
  wrap.appendChild(el)
  setTimeout(() => {
    el.classList.add('out')
    setTimeout(() => el.remove(), 260)
  }, duration)
}

/**
 * 打开确认/输入模态框。
 * opts: { title, sub, icon: 'normal'|'danger', inputs: [{id,label,type,value,placeholder}], okText, cancelText, onOk(values) }
 */
function openModal(opts) {
  const overlay = document.createElement('div')
  overlay.className = 'overlay'
  const inputHtml = (opts.inputs || [])
    .map(
      (f) => `
      <div class="field" style="margin-top:0.75rem">
        <label for="modal-${f.id}">${f.label}</label>
        <input id="modal-${f.id}" type="${f.type || 'text'}" value="${f.value || ''}" placeholder="${f.placeholder || ''}" />
        <p class="error-msg">${f.required ? '此项不能为空' : ''}</p>
      </div>`
    )
    .join('')
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      ${opts.icon ? `<div class="modal-icon ${opts.icon === 'danger' ? 'danger' : ''}">${iconSvg(opts.icon)}</div>` : ''}
      <h3>${opts.title || ''}</h3>
      <p class="modal-sub">${opts.sub || ''}</p>
      ${inputHtml}
      <div class="modal-actions">
        <button class="btn btn-ghost btn-sm" data-act="cancel">${opts.cancelText || '取消'}</button>
        <button class="btn btn-sm ${opts.danger ? 'btn-danger' : ''}" data-act="ok">${opts.okText || '确定'}</button>
      </div>
    </div>`
  document.body.appendChild(overlay)

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.remove()
      resolve(result)
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null)
    })
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null))
    overlay.querySelector('[data-act="ok"]').addEventListener('click', () => {
      const inputs = overlay.querySelectorAll('input')
      const values = {}
      let valid = true
      inputs.forEach((input, i) => {
        values[(opts.inputs || [])[i].id] = input.value.trim()
        if ((opts.inputs || [])[i].required && !input.value.trim()) {
          input.setAttribute('aria-invalid', 'true')
          input.closest('.field').classList.add('invalid')
          valid = false
        }
      })
      if (!valid) return
      close(opts.onOk ? opts.onOk(values) : values)
    })
  })
}

function iconSvg(kind) {
  if (kind === 'danger') {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>'
  }
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
}

/** 全局下拉菜单:点击触发按钮弹出,点击外部关闭 */
function attachMenu(trigger, menu) {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = !menu.classList.contains('open')
    closeAllMenus()
    if (open) menu.classList.add('open')
  })
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) menu.classList.remove('open')
  })
}
function closeAllMenus() {
  document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'))
}

/** 根据登录态渲染顶部导航右侧区域(每个页面共用) */
function renderTopbar() {
  document.querySelectorAll('[data-topbar-right]').forEach((box) => {
    const user = auth.currentUser()
    const initial = user ? user.name.slice(0, 1).toUpperCase() : ''
    box.innerHTML = user
      ? `
      <div class="user-menu">
        <button type="button" id="user-btn">
          <span class="avatar">${initial}</span>
          <span class="u-name">${escapeHtml(user.name)}</span>
          <span class="caret">▼</span>
        </button>
        <div class="menu" id="user-menu">
          <div class="menu-head">${escapeHtml(user.email)}</div>
          <a class="menu-item" href="dashboard.html">个人工作台</a>
          <a class="menu-item" href="settings.html">设置</a>
          <div class="menu-sep"></div>
          <button class="menu-item danger" data-act="logout">退出登录</button>
        </div>
      </div>`
      : `
      <a class="btn btn-ghost btn-sm" href="login.html">登录</a>
      <a class="btn btn-sm" href="register.html">注册</a>`
    const userBtn = box.querySelector('#user-btn')
    const menu = box.querySelector('#user-menu')
    if (userBtn && menu) {
      menu.style.display = 'none'
      userBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const hidden = menu.style.display === 'none'
        document.querySelectorAll('[data-topbar-right] .menu').forEach((m) => (m.style.display = 'none'))
        menu.style.display = hidden ? '' : 'none'
      })
      document.addEventListener('click', () => {
        menu.style.display = 'none'
      })
      box.querySelector('[data-act="logout"]')?.addEventListener('click', () => {
        auth.logout()
        toast('已退出登录', 'info')
        setTimeout(() => (window.location.href = 'index.html'), 400)
      })
    }
  })
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/** 页面守卫:未登录时跳转到登录页(参数 redirect 用于登录后回跳) */
function requireLogin() {
  if (auth.isLoggedIn()) return true
  const page = window.location.pathname.split('/').pop() || 'index.html'
  window.location.href = 'login.html?redirect=' + encodeURIComponent(page)
  return false
}


  global.AIGGB = global.AIGGB || {}
  global.AIGGB.store = {
    delay,
    auth,
    models,
    sessions,
    usage,
    clearAll,
    toast,
    openModal,
    attachMenu,
    closeAllMenus,
    renderTopbar,
    requireLogin,
  }
})(window)
