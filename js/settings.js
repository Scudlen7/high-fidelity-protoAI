/* 经典脚本(非 ES 模块):为支持 file:// 直接双击打开,不使用 import/export。
   本文件依赖 window.AIGGB.store(须先加载)。 */
;(function (global) {
  'use strict'

/* ==========================================================================
   高保真原型 · 设置页(settings.js)
   模型接入(对应 .env 的 LLM_MODEL / AI_GATEWAY_*)、账户信息、数据管理。
   ========================================================================== */

const { auth, models, sessions, usage, toast, renderTopbar, openModal, clearAll, requireLogin } = global.AIGGB.store

if (!requireLogin()) return

const $ = (sel) => document.querySelector(sel)

/* ---------------- 面板切换 ---------------- */

document.querySelectorAll('#settings-nav button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#settings-nav button').forEach((b) => b.classList.toggle('active', b === btn))
    document.querySelectorAll('.settings-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === btn.dataset.panel))
  })
})

/* ---------------- 模型接入 ---------------- */

function renderModelOptions() {
  const current = models.current()
  $('#model-options').innerHTML = models
    .list()
    .map(
      (m) => `
      <label class="model-option ${m.id === current ? 'selected' : ''}">
        <input type="radio" name="model" value="${esc(m.id)}" ${m.id === current ? 'checked' : ''} />
        <span class="mo-main">
          <span class="mo-title">
            <b>${esc(m.name)}</b>
            ${m.gateway ? '<span class="badge badge-mode-geometry">EdgeOne AI Gateway</span>' : ''}
            ${m.id === current ? '<span class="badge badge-ok">使用中</span>' : ''}
          </span>
          <span class="mo-desc">${esc(m.desc)}</span>
          <span class="mo-tags">${(m.tags || []).map((t) => `<span class="badge badge-neutral">${esc(t)}</span>`).join('')}</span>
        </span>
      </label>`
    )
    .join('')
  $('#model-options').querySelectorAll('input[name="model"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (radio.checked) {
        models.set(radio.value)
        toast('已切换模型:' + radio.value, 'success')
        renderModelOptions()
      }
    })
  })
}

const REAL_KEY = 'sk-aiggb-demo-key-7d2e4f3a9b' // 原型演示密钥(非真实)

function bindApiKey() {
  const text = $('#api-key-text')
  let visible = false
  $('#key-eye').addEventListener('click', () => {
    visible = !visible
    text.textContent = visible ? REAL_KEY : 'sk-••••••••••••••••••••••••3f8a'
    $('#key-eye').textContent = visible ? '隐藏' : '显示'
  })
  $('#key-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(REAL_KEY)
    } catch {
      /* 剪贴板不可用时忽略 */
    }
    toast('API Key 已复制(原型演示密钥)', 'success')
  })
  $('#key-reset').addEventListener('click', async () => {
    const ok = await openModal({
      title: '重置 API Key',
      sub: '重置后旧密钥立即失效,需要更新服务端环境变量 LLM_API_KEY。',
      icon: 'danger',
      danger: true,
      okText: '确认重置',
    })
    if (ok !== null && ok !== undefined) {
      toast('API Key 已重置(原型演示)', 'success')
    }
  })
}

function bindTestConnection() {
  const btn = $('#test-conn')
  const result = $('#test-result')
  btn.addEventListener('click', async () => {
    btn.disabled = true
    btn.innerHTML = '<span class="spinner"></span>测试中…'
    result.hidden = true
    const res = await models.testConnection(models.current())
    btn.disabled = false
    btn.textContent = '测试连接'
    result.hidden = false
    result.className = 'test-result ' + (res.ok ? 'ok' : 'err')
    result.innerHTML = res.ok
      ? `<span class="dot dot-ok"></span>连接正常 · 延迟 ${res.latency}ms · ${esc(res.model)}`
      : `<span class="dot dot-err"></span>连接失败,请检查服务端环境变量`
    toast(res.ok ? '连接正常,延迟 ' + res.latency + 'ms' : '连接失败', res.ok ? 'success' : 'error')
  })
}

/* ---------------- 账户信息 ---------------- */

function renderProfile() {
  const user = auth.currentUser()
  if (!user) return
  $('#profile-avatar').textContent = user.name.slice(0, 1).toUpperCase()
  $('#profile-name').textContent = user.name
  $('#profile-email').textContent = user.email
  $('#pf-name').value = user.name
  $('#pf-email').value = user.email
}

function bindProfile() {
  $('#avatar-btn').addEventListener('click', () => toast('原型演示:头像上传将在正式版本提供', 'info'))

  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const form = $('#profile-form')
    form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'))
    const name = $('#pf-name').value.trim()
    const email = $('#pf-email').value.trim()
    let ok = true
    if (name.length < 2) {
      $('#pf-name').closest('.field').classList.add('invalid')
      ok = false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      $('#pf-email').closest('.field').classList.add('invalid')
      ok = false
    }
    if (!ok) return
    auth.updateUser({ name, email })
    toast('资料已更新并同步到云端', 'success')
    renderProfile()
    renderTopbar()
  })

  $('#password-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const form = $('#password-form')
    form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'))
    const current = $('#pw-current').value
    const next = $('#pw-new').value
    const confirm = $('#pw-confirm').value
    let ok = true
    if (!current) {
      $('#pw-current').closest('.field').classList.add('invalid')
      ok = false
    }
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      $('#pw-new').closest('.field').classList.add('invalid')
      ok = false
    }
    if (confirm !== next) {
      $('#pw-confirm').closest('.field').classList.add('invalid')
      ok = false
    }
    if (!ok) return
    form.reset()
    toast('密码已更新(原型演示)', 'success')
  })
}

/* ---------------- 数据管理 ---------------- */

function bindData() {
  $('#export-all').addEventListener('click', () => {
    const payload = {
      app: 'AIGeoGebra',
      exportedAt: new Date().toISOString(),
      user: auth.currentUser(),
      usage: usage.get(),
      sessions: sessions.list(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aiggb-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('全部会话已导出', 'success')
  })

  $('#clear-cache').addEventListener('click', async () => {
    const ok = await openModal({
      title: '清空本地缓存',
      sub: '将清空原型演示的全部本地数据(登录态、会话、用量统计),并重新载入示例数据。',
      icon: 'normal',
      okText: '清空',
    })
    if (ok !== null && ok !== undefined) {
      clearAll()
      toast('本地缓存已清空', 'info')
      setTimeout(() => window.location.reload(), 600)
    }
  })

  $('#delete-account').addEventListener('click', async () => {
    const ok = await openModal({
      title: '删除账号',
      sub: '将永久删除账号与全部云端会话,且不可恢复。确定继续吗?',
      icon: 'danger',
      danger: true,
      okText: '永久删除',
    })
    if (ok !== null && ok !== undefined) {
      auth.deleteAccount()
      toast('账号已删除', 'info')
      setTimeout(() => (window.location.href = 'login.html'), 600)
    }
  })
}

/* ---------------- 工具 ---------------- */

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/* ---------------- 初始化 ---------------- */

renderTopbar()
renderModelOptions()
bindApiKey()
bindTestConnection()
renderProfile()
bindProfile()
bindData()

})(window)
