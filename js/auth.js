/* 经典脚本(非 ES 模块):为支持 file:// 直接双击打开,不使用 import/export。
   本文件依赖 window.AIGGB.store(须先加载)。 */
;(function (global) {
  'use strict'

/* ==========================================================================
   高保真原型 · 登录 / 注册 / 找回密码(auth.js)
   模拟后端用户接口:POST /api/auth/login · /api/auth/register 等,
   表单校验、加载态、验证码倒计时、跳转回跳均由本文件处理。
   ========================================================================== */

const { auth, toast } = global.AIGGB.store

const $ = (sel) => document.querySelector(sel)

/** 登录后回跳地址(由 login.html?redirect=... 传入) */
function redirectTarget() {
  const target = new URLSearchParams(window.location.search).get('redirect')
  return target ? decodeURIComponent(target) : 'index.html'
}

/** 给字段标红并显示错误信息 */
function setFieldError(input, message) {
  const field = input.closest('.field')
  if (field) {
    field.classList.add('invalid')
    field.querySelector('.error-msg').textContent = message
  }
  input.setAttribute('aria-invalid', 'true')
}

function clearFieldErrors(form) {
  form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'))
  form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'))
}

/** 提交按钮进入/退出加载态 */
function setLoading(btn, loading, loadingText) {
  if (loading) {
    btn.dataset.label = btn.textContent
    btn.disabled = true
    btn.innerHTML = `<span class="spinner"></span>${loadingText}`
  } else {
    btn.disabled = false
    btn.textContent = btn.dataset.label || btn.textContent
  }
}

/* ==========================================================================
   登录页
   ========================================================================== */

function initLogin() {
  const form = $('#login-form')
  const email = $('#login-email')
  const password = $('#login-password')
  const submitBtn = form.querySelector('[type="submit"]')

  // 演示账号一键填入
  $('#fill-demo')?.addEventListener('click', () => {
    email.value = 'demo@aiggb.cn'
    password.value = 'demo1234'
    clearFieldErrors(form)
    toast('已填入演示账号', 'info')
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearFieldErrors(form)
    let ok = true
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      setFieldError(email, '请输入正确的邮箱地址')
      ok = false
    }
    if (password.value.length < 6) {
      setFieldError(password, '密码至少 6 位')
      ok = false
    }
    if (!ok) return

    setLoading(submitBtn, true, '登录中…')
    try {
      await auth.login(email.value.trim(), password.value)
      toast('登录成功,欢迎回来')
      setTimeout(() => (window.location.href = redirectTarget()), 650)
    } catch (err) {
      setFieldError(password, err.message)
      toast(err.message, 'error')
      setLoading(submitBtn, false)
    }
  })
}

/* ==========================================================================
   注册页
   ========================================================================== */

function initRegister() {
  const form = $('#register-form')
  const name = $('#reg-name')
  const email = $('#reg-email')
  const password = $('#reg-password')
  const confirm = $('#reg-confirm')
  const code = $('#reg-code')
  const agree = $('#reg-agree')
  const submitBtn = form.querySelector('[type="submit"]')

  // 发送验证码(模拟):60 秒倒计时
  const sendBtn = $('#send-code')
  let countdown = 0
  sendBtn.addEventListener('click', async () => {
    if (countdown > 0) return
    clearFieldErrors(form)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      setFieldError(email, '请先填写正确的邮箱地址')
      return
    }
    setLoading(sendBtn, true, '发送中…')
    try {
      await auth.sendCode(email.value.trim())
      toast('验证码已发送(原型演示:输入任意 4 位数字)', 'info')
      setLoading(sendBtn, false)
      countdown = 60
      const tick = () => {
        sendBtn.textContent = `${countdown}s 后重发`
        countdown -= 1
        if (countdown >= 0) setTimeout(tick, 1000)
        else sendBtn.textContent = '发送验证码'
      }
      tick()
    } catch (err) {
      setFieldError(email, err.message)
      setLoading(sendBtn, false)
    }
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    clearFieldErrors(form)
    let ok = true
    if (name.value.trim().length < 2) {
      setFieldError(name, '昵称至少 2 个字符')
      ok = false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      setFieldError(email, '请输入正确的邮箱地址')
      ok = false
    }
    if (password.value.length < 8 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
      setFieldError(password, '至少 8 位,且需同时包含字母和数字')
      ok = false
    }
    if (confirm.value !== password.value) {
      setFieldError(confirm, '两次输入的密码不一致')
      ok = false
    }
    if (!/^\d{4}$/.test(code.value.trim())) {
      setFieldError(code, '请输入 4 位验证码')
      ok = false
    }
    if (!agree.checked) {
      toast('请先阅读并同意用户协议与隐私政策', 'error')
      ok = false
    }
    if (!ok) return

    setLoading(submitBtn, true, '注册中…')
    try {
      await auth.register({
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        code: code.value.trim(),
      })
      toast('注册成功,已自动登录')
      setTimeout(() => (window.location.href = redirectTarget()), 650)
    } catch (err) {
      toast(err.message, 'error')
      setLoading(submitBtn, false)
    }
  })
}

/* ==========================================================================
   找回密码页(两步:发送邮件 → 重置密码)
   ========================================================================== */

function initForgot() {
  const step1 = $('#step-1')
  const step2 = $('#step-2')
  const step3 = $('#step-3')
  const email = $('#forgot-email')
  const password = $('#new-password')
  const confirm = $('#new-confirm')

  function goStep(show) {
    ;[step1, step2, step3].forEach((el) => (el.style.display = 'none'))
    show.style.display = ''
    document.querySelectorAll('.steps-indicator .step').forEach((s) => s.classList.remove('on'))
    document.querySelectorAll('.steps-indicator .bar').forEach((b) => b.classList.remove('done'))
    if (show === step1) {
      document.querySelector('.steps-indicator .step[data-step="1"]').classList.add('on')
    } else if (show === step2) {
      document.querySelector('.steps-indicator .step[data-step="1"]').classList.add('done')
      document.querySelector('.steps-indicator .step[data-step="2"]').classList.add('on')
      document.querySelector('.steps-indicator .bar[data-bar="1"]').classList.add('done')
    } else {
      document.querySelectorAll('.steps-indicator .step').forEach((s) => s.classList.add('done'))
      document.querySelectorAll('.steps-indicator .bar').forEach((b) => b.classList.add('done'))
    }
  }

  $('#step-1').addEventListener('submit', async (e) => {
    e.preventDefault()
    clearFieldErrors(document.querySelector('#step-1'))
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      setFieldError(email, '请输入正确的邮箱地址')
      return
    }
    const btn = $('#step-1 [type="submit"]')
    setLoading(btn, true, '发送中…')
    await auth.sendCode(email.value.trim())
    setLoading(btn, false)
    $('#sent-to').textContent = email.value.trim()
    goStep(step2)
  })

  $('#reset-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    clearFieldErrors(document.querySelector('#reset-form'))
    let ok = true
    if (password.value.length < 8 || !/[A-Za-z]/.test(password.value) || !/\d/.test(password.value)) {
      setFieldError(password, '至少 8 位,且需同时包含字母和数字')
      ok = false
    }
    if (confirm.value !== password.value) {
      setFieldError(confirm, '两次输入的密码不一致')
      ok = false
    }
    if (!ok) return
    const btn = $('#reset-form [type="submit"]')
    setLoading(btn, true, '重置中…')
    try {
      await auth.resetPassword(email.value.trim(), password.value)
      setLoading(btn, false)
      goStep(step3)
    } catch (err) {
      toast(err.message, 'error')
      setLoading(btn, false)
    }
  })
}

/* ---------- 页面入口分发 ---------- */

const PAGE = document.body.dataset.authPage
if (PAGE === 'login') initLogin()
if (PAGE === 'register') initRegister()
if (PAGE === 'forgot') initForgot()

// 认证页的社交登录按钮为静态演示
document.querySelectorAll('[data-social]').forEach((btn) => {
  btn.addEventListener('click', () => toast('原型演示:第三方登录将在后续接入', 'info'))
})

// 用户协议 / 隐私政策为静态演示
document.querySelectorAll('[data-agree]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault()
    toast('原型演示:协议与政策文档将在正式版本提供', 'info')
  })
})

})(window)
