/**
 * dsh-huangquan-theme — Client half（黄泉主题，复刻 dsh-columbina-theme 的架构）。
 *
 * 运行时：
 *   - 壁纸/蒙版走 body 的 ::before/::after（与 Host 注入的 index 样式同一套规则，
 *     所以首帧就已经正确，这里只负责“改完立刻生效”）；
 *   - 右下角挂件（assets/backgrounds/pet.png）带呼吸浮动 + 拖拽；
 *   - 鼠标紫红光点拖尾（Canvas，零依赖）。
 *
 * 工作台「黄泉外观工作台」：不再占设置页，而是挂在 shell.overlay 浮层上，
 * 默认收起，点击右下角 Q 版挂件才展开（Esc / 点外部 / ✕ 收起）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-huangquan-theme',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState, useSyncExternalStore } = React

    const BASE = '/plugins/dsh-huangquan-theme'
    const STYLE_ID = 'dsh-huangquan-theme-style'
    const PET_ID = 'dsh-huangquan-theme-pet'
    const PANEL_ID = 'dsh-huangquan-theme-panel'
    const LAUNCHER_ID = 'dsh-huangquan-theme-launcher'
    const CANVAS_ID = 'dsh-huangquan-theme-particles'
    /** 自检标记：出现在 /report 里就说明这份 bundle 正在跑。 */
    const BUILD = 'huangquan-columbina-arch/14-rain-density'

    const DEFAULTS = {
      backgroundPreset: '',
      maskOpacity: 0.5,
      blurAmount: 0,
      petSize: 150,
      flowerScale: 1,
      particleDensity: 3,
      particleToggle: true,
      cornerCountTL: 2,
      cornerCountTR: 5,
      cornerCountBL: 1,
      cornerCountBR: 1,
      cornerSizeTL: 1,
      cornerSizeTR: 1,
      cornerSizeBL: 1,
      cornerSizeBR: 1,
      rainToggle: true,
      rainSize: 1,
      rainDensity: 5,
      rainAngle: 25,
    }

    const SLIDERS = {
      maskOpacity: { min: 0, max: 1, step: 0.05 },
      blurAmount: { min: 0, max: 50, step: 1 },
      petSize: { min: 50, max: 300, step: 1 },
      flowerScale: { min: 0.5, max: 2, step: 0.1 },
      particleDensity: { min: 0, max: 10, step: 1 },
      cornerCountTL: { min: 0, max: 6, step: 1 },
      cornerCountTR: { min: 0, max: 6, step: 1 },
      cornerCountBL: { min: 0, max: 6, step: 1 },
      cornerCountBR: { min: 0, max: 6, step: 1 },
      cornerSizeTL: { min: 0.5, max: 2, step: 0.1 },
      cornerSizeTR: { min: 0.5, max: 2, step: 0.1 },
      cornerSizeBL: { min: 0.5, max: 2, step: 0.1 },
      cornerSizeBR: { min: 0.5, max: 2, step: 0.1 },
      rainSize: { min: 0.5, max: 3, step: 0.1 },
      rainDensity: { min: 0, max: 10, step: 1 },
      rainAngle: { min: 0, max: 60, step: 5 },
    }

    /** 四个角的键 + 中文名 + 锚点方向。 */
    const CORNERS = [
      { key: 'TL', label: '左上', sx: 'left', sy: 'top' },
      { key: 'TR', label: '右上', sx: 'right', sy: 'top' },
      { key: 'BL', label: '左下', sx: 'left', sy: 'bottom' },
      { key: 'BR', label: '右下', sx: 'right', sy: 'bottom' },
    ]

    /** 与 Host 侧 buildCss() 保持一致（客户端这份用于“没有 index 注入”的兜底）。 */
    const CSS = `
html body{background-color:transparent!important}
body::before{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;background:var(--hq-bg,none) center/cover no-repeat;filter:blur(var(--hq-blur,0px));transform:scale(var(--hq-scale,1))}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:rgba(var(--hq-mask-rgb,10,8,16),var(--hq-mask-alpha,.5))}
#${PET_ID}{position:fixed;right:32px;bottom:32px;z-index:2147482000;width:var(--hq-pet-size,150px);height:auto;cursor:grab;user-select:none;-webkit-user-drag:none;touch-action:none;filter:drop-shadow(0 10px 26px rgba(150,60,220,.45));animation:hq-breathe 4.2s ease-in-out infinite;transition:filter .18s ease}
#${PET_ID}:hover{filter:drop-shadow(0 12px 30px rgba(178,84,255,.7)) brightness(1.06)}
#${PET_ID}[data-dragging="true"]{animation:none;cursor:grabbing;filter:drop-shadow(0 4px 14px rgba(150,60,220,.6))}
@keyframes hq-breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes hq-panel-in{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
#${LAUNCHER_ID}{position:fixed;right:32px;bottom:32px;z-index:2147482000;width:64px;height:64px;border-radius:50%;border:1px solid rgba(168,85,247,.6);color:#fff;font-size:14px;letter-spacing:1px;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#c026d3);box-shadow:0 12px 30px rgba(124,58,237,.45);animation:hq-breathe 4.2s ease-in-out infinite}
#${CANVAS_ID}{position:fixed;inset:0;z-index:2147482500;pointer-events:none;display:block}
#dsh-huangquan-theme-rain{position:fixed;inset:0;z-index:2147481500;pointer-events:none;display:block}
#dsh-huangquan-theme-bubble{position:fixed;z-index:2147481999;min-width:118px;max-width:240px;padding:8px 11px;border-radius:12px;pointer-events:none;white-space:nowrap;font-size:12px;line-height:1.45;color:#fff;background:linear-gradient(135deg,rgba(124,58,237,.86),rgba(192,38,211,.76));border:1px solid rgba(216,180,254,.55);box-shadow:0 10px 26px rgba(88,28,135,.45),inset 0 1px 0 rgba(255,255,255,.22);backdrop-filter:blur(8px);opacity:0;transition:opacity .18s ease}
#dsh-huangquan-theme-bubble[data-ready="true"]{opacity:1}
#dsh-huangquan-theme-bubble .hq-balance-main{display:block;font-weight:700;letter-spacing:.2px}
#dsh-huangquan-theme-bubble .hq-balance-detail{display:block;font-size:11px;opacity:.85}
#dsh-huangquan-theme-bubble::after{content:"";position:absolute;width:0;height:0}
#dsh-huangquan-theme-bubble[data-side="left"]::after{right:-7px;top:50%;margin-top:-7px;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:7px solid rgba(168,66,218,.86)}
#dsh-huangquan-theme-bubble[data-side="top"]::after{bottom:-7px;left:50%;margin-left:-7px;border-left:7px solid transparent;border-right:7px solid transparent;border-top:7px solid rgba(150,60,215,.86)}
`

    // ------------------------------------------------------------------
    // 状态仓库
    // ------------------------------------------------------------------

    let snapshot = {
      config: { ...DEFAULTS },
      tokens: null,
      preset: null,
      pet: null,
      flower: null,
      presets: { items: [], selected: '', status: 'idle', error: '' },
      assets: null,
      status: 'loading',
      saving: false,
      notice: '',
      /** 工作台浮层：默认收起，点挂件才展开。 */
      open: false,
      anchor: null,
    }
    const listeners = new Set()

    function getSnapshot() {
      return snapshot
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }

    function update(patch) {
      snapshot = { ...snapshot, ...patch }
      for (const listener of [...listeners]) listener()
    }

    /**
     * 浮层锚点：贴着挂件左侧展开，放不下就翻到另一边，并限制在视口内。
     * 没有挂件（找不到 pet.png）时退回右下角默认位置。
     */
    function panelAnchor() {
      const width = Math.min(420, Math.max(280, window.innerWidth - 48))
      const maxHeight = Math.max(240, Math.round(window.innerHeight * 0.72))
      const pet = document.getElementById(PET_ID)
      if (!pet) return { left: null, right: 24, bottom: 96, width, maxHeight }
      const rect = pet.getBoundingClientRect()
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))
      const bottom = Math.max(12, Math.min(window.innerHeight - 160, window.innerHeight - rect.top + 12))
      return { left, right: null, bottom, width, maxHeight }
    }

    /** 展开 / 收起工作台浮层。 */
    function setOpen(next) {
      const open = typeof next === 'boolean' ? next : !snapshot.open
      if (open === snapshot.open) return
      update({ open, anchor: open ? panelAnchor() : snapshot.anchor })
      if (open) {
        // 展开时顺手同步一次：预览目录、配置、花瓣素材都可能在这期间变过。
        void loadConfig()
        void loadPresets()
      }
    }

    function clamp01(value) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) return 0
      return Math.min(1, Math.max(0, numeric))
    }

    function isDark() {
      return Boolean(document.body && document.body.hasAttribute('data-ds-dark-theme'))
    }

    function formatSize(bytes) {
      const numeric = Number(bytes) || 0
      if (numeric >= 1024 * 1024) return `${(numeric / 1024 / 1024).toFixed(1)} MB`
      return `${Math.max(1, Math.round(numeric / 1024))} KB`
    }

    // ------------------------------------------------------------------
    // 自检上报（诊断用，出错也不能影响插件本身）
    // ------------------------------------------------------------------

    function computedBackground(node) {
      try {
        if (!node || typeof getComputedStyle !== 'function') return 'n/a'
        return getComputedStyle(node).backgroundColor
      } catch {
        return 'error'
      }
    }

    function backgroundChain() {
      const chain = []
      let node = document.body
      let depth = 0
      while (node && depth < 6) {
        chain.push({
          tag: String(node.tagName || '').toLowerCase(),
          id: node.id || null,
          cls: node.className ? String(node.className).slice(0, 48) : null,
          bg: computedBackground(node),
        })
        node = node.firstElementChild
        depth += 1
      }
      return chain
    }

    function diagnostics() {
      const body = document.body
      return {
        build: BUILD,
        dark: isDark(),
        status: snapshot.status,
        open: snapshot.open,
        viewport: [window.innerWidth, window.innerHeight],
        nodes: {
          style: Boolean(document.getElementById(STYLE_ID)),
          pet: Boolean(document.getElementById(PET_ID)),
          canvas: Boolean(document.getElementById(CANVAS_ID)),
          preset: snapshot.preset ? snapshot.preset.file : null,
        },
        vars: {
          bg: body ? body.style.getPropertyValue('--hq-bg') : '',
          alpha: body ? body.style.getPropertyValue('--hq-mask-alpha') : '',
          blur: body ? body.style.getPropertyValue('--hq-blur') : '',
        },
        config: snapshot.config,
        presets: { status: snapshot.presets.status, count: snapshot.presets.items.length },
        effect: {
          enabled: petals.enabled,
          flowers: petals.flowers.length,
          sparkles: petals.sparkles.length,
          imageReady: petals.imageReady,
          baseSize: Math.round(petals.baseSize),
          maxFlowers: petals.maxFlowers,
        },
        rain: { enabled: rain.enabled, drops: rain.drops.length, size: rain.size, density: rain.density, angle: rain.angle },
        flowerRing: { count: hqFlowerLayout.length, corners: hqFlowerCorners },
        chain: backgroundChain(),
      }
    }

    function sendReport(kind, extra) {
      try {
        const payload = {
          kind,
          ts: Date.now(),
          href: typeof location !== 'undefined' ? String(location.href) : '',
          ...(extra && typeof extra === 'object' ? extra : {}),
          diagnostics: diagnostics(),
        }
        void fetch(`${BASE}/report`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => {})
      } catch {
        // 忽略
      }
    }

    // ------------------------------------------------------------------
    // 运行时：样式 / 壁纸 / 蒙版
    // ------------------------------------------------------------------

    let themeService = null
    let disposeTokens = null

    function ensureStyle() {
      let style = document.getElementById(STYLE_ID)
      if (style) return style
      style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
      return style
    }

    /** 主表面跟着蒙版一起变透明，浮层保持不透明。数值与 Host buildCss() 保持一致。 */
    function buildTokenLayer(alpha) {
      const a = clamp01(alpha)
      // 壁纸要穿过“蒙版 × 表面”两层：表面 alpha 必须远小于蒙版 alpha，
      // 否则 a=0.5 时透过率只剩约 11%，肉眼看起来就是没生效。
      const surface = Math.round(a * 0.45 * 100) / 100
      const soft = Math.round(a * 0.55 * 100) / 100
      const side = surface
      return {
        '--dsw-alias-bg-base': { light: `rgba(255,255,255,${surface})`, dark: `rgba(21,21,23,${surface})` },
        '--dsw-specific-sidebar-fill': { light: `rgba(249,250,251,${side})`, dark: `rgba(27,27,28,${side})` },
        '--dsw-specific-input-major': { light: 'rgba(255,255,255,0.82)', dark: 'rgba(44,44,46,0.82)' },
        '--dsw-specific-tip': { light: `rgba(245,246,247,${soft})`, dark: `rgba(44,44,46,${soft})` },
        '--dsw-specific-bubble': { light: `rgba(237,243,254,${soft})`, dark: `rgba(44,44,46,${soft})` },
        '--dsw-specific-bubble-highlight': { light: `rgba(211,226,255,${soft})`, dark: `rgba(53,54,56,${soft})` },
      }
    }

    function applyTheme(config) {
      if (!document.body) return
      ensureStyle()
      const body = document.body
      const alpha = clamp01(config.maskOpacity)
      const blur = Math.round(Math.min(50, Math.max(0, Number(config.blurAmount) || 0)))
      const nextBg = snapshot.preset ? `url("${snapshot.preset.url}")` : 'none'
      if (body.style.getPropertyValue('--hq-bg') !== nextBg) body.style.setProperty('--hq-bg', nextBg)
      body.style.setProperty('--hq-mask-alpha', String(alpha))
      body.style.setProperty('--hq-mask-rgb', isDark() ? '10, 8, 16' : '250, 249, 252')
      body.style.setProperty('--hq-blur', `${blur}px`)
      body.style.setProperty('--hq-scale', blur > 0 ? '1.06' : '1')

      if (themeService && typeof themeService.overrideTokens === 'function') {
        // 优先用 Host 算好的 token（改通透度只需改 Host，不用刷新页面）；
        // 老版本 Host 没下发 tokens 时退回本地计算。
        const tokens = snapshot.tokens && typeof snapshot.tokens === 'object'
          ? snapshot.tokens
          : buildTokenLayer(alpha)
        disposeTokens = themeService.overrideTokens('dsh-huangquan-theme', tokens) || disposeTokens
      }
    }

    // ------------------------------------------------------------------
    // 运行时：挂件
    // ------------------------------------------------------------------

    let drag = null

    function ensurePet() {
      const desired = snapshot.pet?.url ?? ''
      let pet = document.getElementById(PET_ID)
      if (!desired) {
        if (pet) pet.remove()
        return null
      }
      if (!pet) {
        pet = document.createElement('img')
        pet.id = PET_ID
        pet.alt = ''
        pet.draggable = false
        pet.setAttribute('data-dragging', 'false')
        document.body.appendChild(pet)
        pet.addEventListener('pointerdown', onPetDown)
        pet.addEventListener('pointermove', onPetMove)
        pet.addEventListener('pointerup', onPetUp)
        pet.addEventListener('pointercancel', onPetUp)
        pet.addEventListener('dragstart', (event) => event.preventDefault())
      }
      if (pet.getAttribute('src') !== desired) pet.setAttribute('src', desired)
      return pet
    }

    function onPetDown(event) {
      if (event.button !== 0) return
      const pet = event.currentTarget
      const rect = pet.getBoundingClientRect()
      drag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false,
      }
      pet.setAttribute('data-dragging', 'true')
      try {
        pet.setPointerCapture(event.pointerId)
      } catch {
        // 无指针捕获时也能拖
      }
      event.preventDefault()
    }

    function onPetMove(event) {
      if (!drag || drag.pointerId !== event.pointerId) return
      drag.moved = true
      placePet(event.clientX - drag.offsetX, event.clientY - drag.offsetY)
    }

    function onPetUp(event) {
      if (!drag || drag.pointerId !== event.pointerId) return
      event.currentTarget.setAttribute('data-dragging', 'false')
      try {
        event.currentTarget.releasePointerCapture(drag.pointerId)
      } catch {
        // 忽略
      }
      const moved = drag.moved
      drag = null
      // 没拖动 = 点击：展开 / 收起工作台浮层。
      if (!moved) setOpen()
    }

    function placePet(left, top) {
      const pet = document.getElementById(PET_ID)
      if (!pet) return
      const maxLeft = Math.max(0, window.innerWidth - (pet.offsetWidth || 0))
      const maxTop = Math.max(0, window.innerHeight - (pet.offsetHeight || 0))
      pet.style.left = `${Math.round(Math.min(maxLeft, Math.max(0, left)))}px`
      pet.style.top = `${Math.round(Math.min(maxTop, Math.max(0, top)))}px`
      pet.style.right = 'auto'
      pet.style.bottom = 'auto'
      placeBubble()
    }

    function resetPetPosition() {
      const pet = document.getElementById(PET_ID)
      if (!pet) return
      pet.style.left = ''
      pet.style.top = ''
      pet.style.right = '32px'
      pet.style.bottom = '32px'
      placeBubble()
    }

    // ------------------------------------------------------------------
    // 挂件旁的余额气泡（数字由 Host 的 /balance 提供，页面不含 API Key）
    // ------------------------------------------------------------------

    const BUBBLE_ID = 'dsh-huangquan-theme-bubble'
    /** 余额刷新间隔：3 秒（宿主缓存 2.5s，保证每次轮询都拿到新读数）。 */
    const BALANCE_INTERVAL_MS = 3000
    let balanceTimer = 0
    let balanceBusy = false

    function ensureBubble() {
      if (!document.getElementById(PET_ID)) {
        const stale = document.getElementById(BUBBLE_ID)
        if (stale) stale.remove()
        return null
      }
      let bubble = document.getElementById(BUBBLE_ID)
      if (bubble) return bubble
      bubble = document.createElement('div')
      bubble.id = BUBBLE_ID
      bubble.setAttribute('aria-live', 'polite')
      const main = document.createElement('span')
      main.className = 'hq-balance-main'
      main.textContent = '余额读取中…'
      const detail = document.createElement('span')
      detail.className = 'hq-balance-detail'
      bubble.appendChild(main)
      bubble.appendChild(detail)
      document.body.appendChild(bubble)
      return bubble
    }

    function formatMoney(currency, value) {
      const symbol = currency === 'CNY' || currency === 'RMB' ? '¥' : `${currency} `
      return `${symbol}${(Number(value) || 0).toFixed(2)}`
    }

    /** 气泡放在挂件左侧；左边放不下就翻到上方，并始终限制在视口内。 */
    function placeBubble() {
      const pet = document.getElementById(PET_ID)
      const bubble = document.getElementById(BUBBLE_ID)
      if (!pet || !bubble) return
      const petRect = pet.getBoundingClientRect()
      const rect = bubble.getBoundingClientRect()
      const width = rect.width || 140
      const height = rect.height || 44
      const gap = 14
      let side = 'left'
      let left = petRect.left - width - gap
      let top = petRect.top + (petRect.height - height) / 2

      if (left < 8) {
        side = 'top'
        left = petRect.left + petRect.width / 2 - width / 2
        top = petRect.top - height - gap
      }
      if (top < 8) top = petRect.bottom + gap
      left = Math.max(8, Math.min(window.innerWidth - width - 8, left))
      top = Math.max(8, Math.min(window.innerHeight - height - 8, top))
      bubble.setAttribute('data-side', side)
      bubble.style.left = `${Math.round(left)}px`
      bubble.style.top = `${Math.round(top)}px`
    }

    function renderBubble(data) {
      const bubble = ensureBubble()
      if (!bubble) return
      const main = bubble.querySelector('.hq-balance-main')
      const detail = bubble.querySelector('.hq-balance-detail')
      if (!main || !detail) return
      if (!data) {
        main.textContent = '余额读取中…'
        detail.textContent = ''
      } else if (data.ok) {
        main.textContent = `余额 ${formatMoney(data.currency, data.total)}`
        detail.textContent = `今日 -${formatMoney(data.currency, data.todayUsed)}`
        bubble.title = `充值余额 ${formatMoney(data.currency, data.toppedUp)} · 赠金 ${formatMoney(data.currency, data.granted)}\n今日用量为近似值：当日首次观测余额 − 当前余额`
      } else if (data.reason === 'missing-key') {
        main.textContent = '未配置 DeepSeek Key'
        detail.textContent = '设置里填入即可显示余额'
        bubble.title = 'Host 通过凭据服务读取 DEEPSEEK_API_KEY，页面拿不到也不需要 Key'
      } else {
        main.textContent = '余额获取失败'
        detail.textContent = String(data.reason || 'error')
        bubble.title = String(data.detail || data.reason || '')
      }
      bubble.setAttribute('data-ready', 'true')
      placeBubble()
    }

    async function loadBalance() {
      if (balanceBusy) return
      balanceBusy = true
      try {
        const response = await fetch(`${BASE}/balance`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        renderBubble(await response.json())
      } catch (error) {
        renderBubble({ ok: false, reason: 'offline', detail: String((error && error.message) || error) })
      } finally {
        balanceBusy = false
      }
    }

    /** 页面加载先请求一次，之后每 3 秒刷新。 */
    function startBalancePolling() {
      if (balanceTimer) return
      void loadBalance()
      balanceTimer = window.setInterval(() => void loadBalance(), BALANCE_INTERVAL_MS)
    }

    function applyPet(config) {
      const pet = ensurePet()
      if (!pet) {
        syncLauncher(config)
        return
      }
      pet.setAttribute('title', '点击打开/收起「黄泉外观工作台」；按住可拖动')
      pet.style.setProperty('--hq-pet-size', `${Math.round(Number(config.petSize) || 150)}px`)
      const launcher = document.getElementById(LAUNCHER_ID)
      if (launcher) launcher.remove()
      // 余额气泡：挂在挂件旁边，跟随位置
      ensureBubble()
      placeBubble()
      startBalancePolling()
    }

    /**
     * 没有挂件图时的兜底入口：一颗「黄泉」小圆钮，
     * 保证工作台永远点得开（否则设成“只有点挂件才展开”就没入口了）。
     */
    function syncLauncher(config) {
      let node = document.getElementById(LAUNCHER_ID)
      if (!node) {
        node = document.createElement('button')
        node.id = LAUNCHER_ID
        node.type = 'button'
        node.textContent = '黄泉'
        node.title = '打开/收起「黄泉外观工作台」'
        node.addEventListener('click', () => setOpen())
        document.body.appendChild(node)
      }
      node.setAttribute('aria-label', '黄泉外观工作台')
      return node
    }

    // ------------------------------------------------------------------
    // 运行时：背景雨（全屏 canvas，默认右上 → 左下）
    // ------------------------------------------------------------------

    const RAIN_ID = 'dsh-huangquan-theme-rain'
    const rain = { canvas: null, ctx: null, rAF: 0, last: 0, enabled: false, size: 1, density: 5, angle: 25, drops: [] }

    function ensureRainCanvas() {
      if (rain.canvas) return rain.canvas
      const canvas = document.createElement('canvas')
      canvas.id = RAIN_ID
      canvas.setAttribute('aria-hidden', 'true')
      document.body.appendChild(canvas)
      rain.canvas = canvas
      rain.ctx = canvas.getContext('2d')
      resizeRainCanvas()
      return canvas
    }

    function resizeRainCanvas() {
      const canvas = rain.canvas
      if (!canvas) return
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(window.innerWidth * ratio)
      canvas.height = Math.round(window.innerHeight * ratio)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      if (rain.ctx) rain.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    function makeDrop(anywhere) {
      const width = window.innerWidth
      const height = window.innerHeight
      return {
        x: anywhere ? Math.random() * width : Math.random() * width,
        y: anywhere ? Math.random() * height : -20 - Math.random() * 240,
        len: 9 + Math.random() * 16,
        speed: 520 + Math.random() * 520,
        width: 0.7 + Math.random() * 1.1,
        alpha: 0.12 + Math.random() * 0.26,
      }
    }

    /** 目标雨滴数：按视口面积算基准，再乘以密度（0~10，5 = 基准，10 = 两倍）。 */
    function rainDropCount() {
      const area = Math.max(1, window.innerWidth * window.innerHeight)
      const base = Math.max(40, Math.min(260, Math.round(area / 16000)))
      const scaled = Math.round(base * (rain.density / 5))
      return Math.max(0, Math.min(600, scaled))
    }

    function resetRainDrops() {
      const count = rainDropCount()
      rain.drops = Array.from({ length: count }, () => makeDrop(true))
    }

    /** 密度变化时平滑增减雨滴（拖滑块不会让雨重新开始）。 */
    function syncRainDrops() {
      const target = rainDropCount()
      if (target === rain.drops.length) return target
      if (target < rain.drops.length) {
        rain.drops.length = target
      } else {
        for (let index = rain.drops.length; index < target; index += 1) rain.drops.push(makeDrop(true))
      }
      return target
    }

    function stopRain() {
      if (rain.rAF) {
        window.cancelAnimationFrame(rain.rAF)
        rain.rAF = 0
      }
      rain.last = 0
      if (rain.ctx) rain.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      if (rain.canvas) rain.canvas.style.display = 'none'
    }

    function tickRain(now) {
      rain.rAF = 0
      const ctx = rain.ctx
      if (!ctx || !rain.enabled) return
      const stamp = typeof now === 'number' ? now : typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = rain.last ? Math.min(0.05, (stamp - rain.last) / 1000) : 0.016
      rain.last = stamp
      const width = window.innerWidth
      const height = window.innerHeight
      const rad = (rain.angle * Math.PI) / 180
      const dirX = -Math.sin(rad) // 右上 → 左下
      const dirY = Math.cos(rad)

      ctx.clearRect(0, 0, width, height)
      ctx.strokeStyle = 'rgba(198, 188, 255, 0.92)'
      ctx.lineCap = 'round'
      for (const drop of rain.drops) {
        const speed = drop.speed * (0.7 + rain.size * 0.4)
        const length = drop.len * rain.size
        ctx.globalAlpha = Math.min(1, drop.alpha * (0.8 + rain.size * 0.2))
        ctx.lineWidth = Math.max(0.4, drop.width * rain.size)
        ctx.beginPath()
        ctx.moveTo(drop.x, drop.y)
        ctx.lineTo(drop.x + dirX * length, drop.y + dirY * length)
        ctx.stroke()
        drop.x += dirX * speed * dt
        drop.y += dirY * speed * dt
        if (drop.y > height + 40 || drop.x < -80) Object.assign(drop, makeDrop(false))
      }
      ctx.globalAlpha = 1
      rain.rAF = window.requestAnimationFrame(tickRain)
    }

    function applyRain(config) {
      const enabled = config.rainToggle !== false
      const rawSize = Number(config.rainSize)
      const rawAngle = Number(config.rainAngle)
      const rawDensity = Number(config.rainDensity)
      rain.enabled = enabled
      rain.size = Number.isFinite(rawSize) ? Math.min(3, Math.max(0.5, rawSize)) : 1
      rain.angle = Number.isFinite(rawAngle) ? Math.min(60, Math.max(0, rawAngle)) : 25
      rain.density = Number.isFinite(rawDensity) ? Math.min(10, Math.max(0, rawDensity)) : 5
      if (!enabled || rain.density <= 0) {
        rain.drops = []
        stopRain()
        return
      }
      ensureRainCanvas().style.display = 'block'
      syncRainDrops()
      if (!rain.rAF) {
        rain.last = 0
        rain.rAF = window.requestAnimationFrame(tickRain)
      }
    }

    // 自检/调试入口
    if (typeof window !== 'undefined') window.__hqRain = { apply: applyRain, state: rain }

    // ------------------------------------------------------------------
    // 运行时：花瓣飘落 + 紫色荧光（用 ctx.drawImage 画素材，不用圆点）
    // ------------------------------------------------------------------

    /** assets/flower.png 是 4 格横排雪碧图，每格 512×512（一格一朵花）。 */
    const FLOWER_CELL = 512
    const FLOWER_CELLS = 4
    /** 绝对上限：密度调到 10 也不会超过这个数。 */
    const MAX_FLOWERS = 4
    const MAX_SPARKLES = 220

    const petals = {
      canvas: null,
      ctx: null,
      image: null,
      imageUrl: '',
      imageReady: false,
      flowers: [],
      sparkles: [],
      rAF: 0,
      lastFrame: 0,
      // -1e9：启动后第一次划鼠标就能开一朵，不必先等一个冷却周期。
      lastSpawn: -1e9,
      cooldown: 2600,
      /** 花的尺寸：基准 280px × flowerScale；同时影响四角花。 */
      baseSize: 280,
      cornerScale: 1,
      /** 同屏最多几朵（由密度换算）。 */
      maxFlowers: 2,
      enabled: true,
      listening: false,
      reportedSpawn: false,
    }

    function ensureCanvas() {
      if (petals.canvas) return petals.canvas
      const canvas = document.createElement('canvas')
      canvas.id = CANVAS_ID
      canvas.setAttribute('aria-hidden', 'true')
      document.body.appendChild(canvas)
      petals.canvas = canvas
      petals.ctx = canvas.getContext('2d')
      resizeCanvas()
      return canvas
    }

    function resizeCanvas() {
      const canvas = petals.canvas
      if (!canvas) return
      const ratio = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(window.innerWidth * ratio)
      canvas.height = Math.round(window.innerHeight * ratio)
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      if (petals.ctx) petals.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    /** 载入花瓣雪碧图（URL 由 Host 下发，带版本号，换图会自动重载）。 */
    function ensureFlowerImage(url) {
      if (typeof Image === 'undefined' || !url || petals.imageUrl === url) return
      petals.imageUrl = url
      petals.imageReady = false
      const image = new Image()
      image.onload = () => {
        petals.image = image
        petals.imageReady = true
        petals.lastFrame = 0
        if (petals.flowers.length > 0 && !petals.rAF) petals.rAF = window.requestAnimationFrame(tickPetals)
      }
      image.onerror = () => {
        // 加载失败（例如 Host 刚重启、路由还没挂上）时清掉 URL，
        // 下次 applyParticles 会自动重试，而不是永远停在无图状态。
        petals.imageReady = false
        petals.imageUrl = ''
      }
      image.src = url
    }

    /** 生成一朵花：随机 0.2~0.5 缩放、随机角度、缓慢下坠 + 自转 + 正弦摇摆。 */
    function spawnFlower(x, y) {
      // 顺手补一次素材加载：万一首次加载失败（Host 刚重启），下一朵就能自愈。
      ensureFlowerImage(snapshot.flower?.url)
      const scale = 0.2 + Math.random() * 0.3
      const size = petals.baseSize * scale
      petals.flowers.push({
        cell: Math.floor(Math.random() * FLOWER_CELLS),
        x,
        y,
        size,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.4,
        // 34~60 px/s：像落叶一样缓慢、但能明显看到在下坠（12s 内约落 400~700px）
        vy: 34 + Math.random() * 26,
        drift: (Math.random() - 0.5) * 8,
        swayAmp: 10 + Math.random() * 18,
        swayFreq: 0.1 + Math.random() * 0.16,
        phase: Math.random() * Math.PI * 2,
        age: 0,
        life: 10000 + Math.random() * 5000,
        sparkleBudget: 0,
      })
      if (!petals.reportedSpawn) {
        petals.reportedSpawn = true
        sendReport('flower-spawned', {
          flowers: petals.flowers.length,
          size: Math.round(size),
          scale: Number(scale.toFixed(2)),
          imageReady: petals.imageReady,
        })
      }
      if (!petals.rAF) {
        petals.lastFrame = 0
        petals.rAF = window.requestAnimationFrame(tickPetals)
      }
    }

    function onPointerMove(event) {
      if (!petals.enabled) return
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      // 极度稀疏：屏幕上限两朵 + 冷却，鼠标乱动也不会狂生。
      if (petals.flowers.length >= petals.maxFlowers) return
      if (now - petals.lastSpawn < petals.cooldown) return
      if (!ensureCanvas()) return
      petals.lastSpawn = now
      spawnFlower(event.clientX + (Math.random() - 0.5) * 40, event.clientY + (Math.random() - 0.5) * 40)
    }

    /** 花周围散出的极微小浅紫光点。 */
    function spawnSparkle(flower, drawX, drawY) {
      if (petals.sparkles.length >= MAX_SPARKLES) return
      const spread = flower.size * 0.55
      petals.sparkles.push({
        x: drawX + (Math.random() - 0.5) * spread,
        y: drawY + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 8,
        vy: 6 + Math.random() * 12,
        size: 0.8 + Math.random() * 1.6,
        age: 0,
        life: 1400 + Math.random() * 1400,
        hue: 275 + Math.random() * 25,
        light: 84 + Math.random() * 8,
      })
    }

    function tickPetals(now) {
      petals.rAF = 0
      const ctx = petals.ctx
      if (!ctx) return
      const stamp = typeof now === 'number' ? now : typeof performance !== 'undefined' ? performance.now() : Date.now()
      const dt = petals.lastFrame ? Math.min(0.06, (stamp - petals.lastFrame) / 1000) : 0.016
      petals.lastFrame = stamp
      const width = window.innerWidth
      const height = window.innerHeight
      ctx.clearRect(0, 0, width, height)

      for (let index = petals.flowers.length - 1; index >= 0; index -= 1) {
        const flower = petals.flowers[index]
        flower.age += dt * 1000
        const progress = flower.age / flower.life
        if (progress >= 1 || flower.y > height + flower.size) {
          petals.flowers.splice(index, 1)
          continue
        }
        flower.y += flower.vy * dt
        flower.rot += flower.rotSpeed * dt
        const sway = Math.sin((flower.age / 1000) * Math.PI * 2 * flower.swayFreq + flower.phase) * flower.swayAmp
        const drawX = flower.x + sway + flower.drift * (flower.age / 1000) * 0.1
        const drawY = flower.y
        const fadeIn = Math.min(1, flower.age / 700)
        const fadeOut = progress > 0.72 ? 1 - (progress - 0.72) / 0.28 : 1
        const alpha = Math.max(0, Math.min(1, fadeIn * fadeOut))

        if (petals.imageReady && petals.image) {
          const half = flower.size / 2
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.translate(drawX, drawY)
          ctx.rotate(flower.rot)
          // 花瓣自带的紫色荧光
          ctx.shadowColor = 'rgba(186, 120, 255, 0.85)'
          ctx.shadowBlur = flower.size * 0.42
          ctx.drawImage(
            petals.image,
            flower.cell * FLOWER_CELL,
            0,
            FLOWER_CELL,
            FLOWER_CELL,
            -half,
            -half,
            flower.size,
            flower.size,
          )
          ctx.restore()
        }

        // 每朵花每秒约 9 个光点
        flower.sparkleBudget += dt * 9
        while (flower.sparkleBudget >= 1) {
          flower.sparkleBudget -= 1
          spawnSparkle(flower, drawX, drawY)
        }
      }

      ctx.globalCompositeOperation = 'lighter'
      for (let index = petals.sparkles.length - 1; index >= 0; index -= 1) {
        const sparkle = petals.sparkles[index]
        sparkle.age += dt * 1000
        const t = sparkle.age / sparkle.life
        if (t >= 1) {
          petals.sparkles.splice(index, 1)
          continue
        }
        sparkle.x += sparkle.vx * dt + Math.sin((sparkle.age / 1000) * 6) * 0.15
        sparkle.y += sparkle.vy * dt
        const alpha = Math.pow(1 - t, 1.6) * 0.95
        const radius = sparkle.size * 2.4
        const gradient = ctx.createRadialGradient(sparkle.x, sparkle.y, 0, sparkle.x, sparkle.y, radius)
        gradient.addColorStop(0, `hsla(${sparkle.hue}, 100%, ${sparkle.light}%, ${alpha})`)
        gradient.addColorStop(1, `hsla(${sparkle.hue}, 100%, 70%, 0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(sparkle.x, sparkle.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      if (petals.flowers.length > 0 || petals.sparkles.length > 0) {
        petals.rAF = window.requestAnimationFrame(tickPetals)
      } else {
        petals.lastFrame = 0
      }
    }

    function stopPetals() {
      if (petals.listening) {
        window.removeEventListener('pointermove', onPointerMove)
        petals.listening = false
      }
      petals.flowers.length = 0
      petals.sparkles.length = 0
      if (petals.rAF) {
        window.cancelAnimationFrame(petals.rAF)
        petals.rAF = 0
      }
      petals.lastFrame = 0
      if (petals.ctx) petals.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      if (petals.canvas) petals.canvas.style.display = 'none'
    }

    function applyParticles(config) {
      const enabled = config.particleToggle !== false
      const density = Math.round(Math.min(10, Math.max(0, Number(config.particleDensity) || 0)))
      const rawScale = Number(config.flowerScale)
      const scale = Number.isFinite(rawScale) ? Math.min(2, Math.max(0.5, rawScale)) : 1
      petals.enabled = enabled
      petals.cornerScale = scale
      petals.baseSize = 280 * scale
      // 密度换算（与工作台里的显示公式保持一致）：
      // 同屏朵数 1~4，间隔 1.2~3.4s；density=0 视为不生成。
      petals.maxFlowers = density <= 0 ? 0 : Math.min(MAX_FLOWERS, Math.max(1, Math.round(1 + density / 3)))
      petals.cooldown = density <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(1200, 3400 - density * 220)
      // 四角花环跟着尺寸/各角朵数与大小一起变
      hqFlowerDeco.apply(config)
      if (!enabled) {
        stopPetals()
        return
      }
      ensureFlowerImage(snapshot.flower?.url)
      ensureCanvas().style.display = 'block'
      if (!petals.listening) {
        window.addEventListener('pointermove', onPointerMove, { passive: true })
        petals.listening = true
      }
    }

    function teardownParticles() {
      stopPetals()
      petals.image = null
      petals.imageUrl = ''
      petals.imageReady = false
      petals.canvas = null
      petals.ctx = null
      const canvas = document.getElementById(CANVAS_ID)
      if (canvas) canvas.remove()
    }

    // ------------------------------------------------------------------
    // 与 Host 通讯
    // ------------------------------------------------------------------

    let saveTimer = 0
    let pending = {}

    function applyAll(state) {
      applyTheme(state.config)
      applyPet(state.config)
      applyParticles(state.config)
      applyRain(state.config)
    }

    function commit(patch, options = {}) {
      const config = { ...snapshot.config, ...patch }
      update({ config })
      applyAll({ config })
      pending = { ...pending, ...patch }
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(flush, options.immediate ? 0 : 260)
    }

    async function flush() {
      saveTimer = 0
      const body = pending
      pending = {}
      if (Object.keys(body).length === 0) return
      update({ saving: true })
      try {
        const response = await fetch(`${BASE}/config`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`)
        const idle = !saveTimer && Object.keys(pending).length === 0
        if (idle) {
          const config = { ...DEFAULTS, ...data.config }
          update({
            config,
            tokens: data.tokens ?? snapshot.tokens,
            preset: data.preset ?? null,
            pet: data.pet ?? null,
            flower: data.flower ?? snapshot.flower,
            assets: data.assets ?? null,
            status: 'ready',
            saving: false,
            notice: '',
          })
          applyAll({ config })
          maybeReloadForBuild(data)
        } else {
          update({ saving: false })
        }
      } catch (error) {
        update({
          saving: false,
          status: 'offline',
          notice: `设置没能写入 Host（${error instanceof Error ? error.message : String(error)}），本次修改只在当前页面生效。`,
        })
      }
    }

    function adopt(data) {
      const config = { ...DEFAULTS, ...(data.config ?? {}) }
      update({
        config,
        tokens: data.tokens ?? null,
        preset: data.preset ?? null,
        pet: data.pet ?? null,
        flower: data.flower ?? null,
        assets: data.assets ?? null,
        status: 'ready',
        notice: '',
      })
      applyAll({ config })
      maybeReloadForBuild(data)
    }

    /**
     * 自愈：Host 从 lib/client.js 里解析出当前构建号下发，若与页面里跑的这份不一致，
     * 说明页面缓存了旧 bundle —— 自动重载一次（用 sessionStorage 记账，绝不会循环）。
     */
    function maybeReloadForBuild(data) {
      const remote = String(data?.clientBuild ?? '')
      if (remote === '' || remote === BUILD) return false
      try {
        const storage = window.sessionStorage
        if (!storage) return false
        if (storage.getItem('hq-theme-build') === remote) return false
        storage.setItem('hq-theme-build', remote)
      } catch {
        return false
      }
      sendReport('build-mismatch-reload', { local: BUILD, remote })
      window.setTimeout(() => {
        try {
          window.location.reload()
        } catch {
          // 重载失败就保持原状，不影响现有功能
        }
      }, 600)
      return true
    }

    async function loadConfig() {
      applyAll(snapshot)
      try {
        const response = await fetch(`${BASE}/config`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        adopt(await response.json())
        sendReport('config-loaded')
      } catch (error) {
        update({
          status: 'offline',
          notice: `读取不到 Host 设置接口（${error instanceof Error ? error.message : String(error)}）。`,
        })
        sendReport('config-error', { message: String((error && error.message) || error) })
      }
    }

    async function loadPresets() {
      update({ presets: { ...snapshot.presets, status: 'loading' } })
      try {
        const response = await fetch(`${BASE}/presets`, { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        update({
          presets: {
            items: Array.isArray(data.items) ? data.items : [],
            selected: data.selected ?? '',
            status: 'ready',
            error: '',
          },
        })
        sendReport('presets-loaded', { count: data.items?.length ?? 0 })
      } catch (error) {
        update({
          presets: { ...snapshot.presets, status: 'error', error: error instanceof Error ? error.message : String(error) },
        })
        sendReport('presets-error', { message: String((error && error.message) || error) })
      }
    }

    // ------------------------------------------------------------------
    // 工作台 UI
    // ------------------------------------------------------------------

    const ui = {
      page: { display: 'grid', gap: 16, padding: '4px 2px 28px' },
      /** 工作台浮层本体：固定定位，贴着挂件展开，内部滚动。 */
      panel: {
        position: 'fixed',
        zIndex: 2147482600,
        display: 'grid',
        gap: 16,
        padding: 18,
        borderRadius: 16,
        pointerEvents: 'auto',
        background: 'var(--dsw-alias-bg-overlay, rgba(24,24,28,.95))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3))',
        boxShadow: '0 24px 64px rgba(0,0,0,.45)',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        animation: 'hq-panel-in 160ms ease-out',
      },
      panelClose: {
        marginLeft: 'auto',
        width: 26,
        height: 26,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 8,
        cursor: 'pointer',
        color: 'inherit',
        fontSize: 12,
        lineHeight: '24px',
        border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3))',
        background: 'transparent',
      },
      head: { display: 'grid', gap: 6 },
      titleRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      title: { fontSize: 20, fontWeight: 700, letterSpacing: 0.2 },
      subtitle: { opacity: 0.68, fontSize: 13, lineHeight: 1.65 },
      chip: (tone) => ({
        fontSize: 11,
        lineHeight: '20px',
        padding: '0 9px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28))',
        color: tone === 'warn' ? 'var(--dsw-alias-state-warn-primary, #d97706)' : 'inherit',
        opacity: tone === 'muted' ? 0.6 : 0.9,
        whiteSpace: 'nowrap',
      }),
      card: {
        display: 'grid',
        gap: 16,
        padding: 18,
        borderRadius: 14,
        border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22))',
        background: 'var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06)))',
      },
      cardHead: { display: 'grid', gap: 4 },
      cardTitle: { fontSize: 14, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 8 },
      cardHint: { fontSize: 12, opacity: 0.62, lineHeight: 1.6 },
      field: { display: 'grid', gap: 8 },
      labelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
      label: { fontSize: 13, fontWeight: 600 },
      value: { fontSize: 12, opacity: 0.72, fontVariantNumeric: 'tabular-nums' },
      hint: { fontSize: 12, opacity: 0.6, lineHeight: 1.6 },
      range: { width: '100%', accentColor: '#a855f7' },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      button: {
        padding: '7px 14px',
        borderRadius: 9,
        fontSize: 12,
        cursor: 'pointer',
        color: 'inherit',
        border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.3))',
        background: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,.1))',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 10 },
      swatch: {
        position: 'relative',
        aspectRatio: '16 / 10',
        borderRadius: 10,
        border: '2px solid transparent',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        cursor: 'pointer',
        padding: 0,
        overflow: 'hidden',
        background: 'rgba(127,127,127,.12)',
      },
      swatchSelected: { borderColor: '#a855f7', boxShadow: '0 0 0 2px rgba(168,85,247,.35)' },
      swatchLabel: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        padding: '3px 7px',
        fontSize: 11,
        lineHeight: '16px',
        color: '#fff',
        background: 'linear-gradient(to top, rgba(0,0,0,.72), rgba(0,0,0,0))',
        textAlign: 'left',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      footer: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
      note: { fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-state-warn-primary, #d97706)' },
      okNote: { fontSize: 12, lineHeight: 1.6, opacity: 0.68 },
    }

    function percent(value) {
      return `${Math.round(clamp01(value) * 100)}%`
    }

    function Card(props) {
      return h(
        'section',
        { style: ui.card },
        h(
          'div',
          { style: ui.cardHead },
          h(
            'div',
            { style: ui.cardTitle },
            props.icon ? h('span', { 'aria-hidden': 'true' }, props.icon) : null,
            props.title,
            props.badge ? h('span', { style: ui.chip('muted') }, props.badge) : null,
          ),
          props.hint ? h('div', { style: ui.cardHint }, props.hint) : null,
        ),
        props.children,
      )
    }

    function Field(props) {
      return h(
        'div',
        { style: ui.field },
        h(
          'div',
          { style: ui.labelRow },
          h('span', { style: ui.label }, props.label),
          props.value === undefined ? null : h('span', { style: ui.value }, props.value),
        ),
        props.children,
        props.hint ? h('div', { style: ui.hint }, props.hint) : null,
      )
    }

    function Slider(props) {
      const spec = SLIDERS[props.field]
      return h('input', {
        type: 'range',
        style: ui.range,
        min: spec.min,
        max: spec.max,
        step: spec.step,
        value: Number(props.value),
        'aria-label': props.label,
        onChange: (event) => props.onChange(Number(event.target.value)),
      })
    }

    function PresetGrid(props) {
      const { presets, onPick } = props
      if (presets.status === 'loading') return h('div', { style: ui.hint }, '正在扫描 assets/backgrounds…')
      if (presets.status === 'error') return h('div', { style: ui.note }, `扫描失败：${presets.error}`)
      if (presets.items.length === 0) {
        return h('div', { style: ui.hint }, 'assets/backgrounds 里还没有图片。把 bg1.jpg、bg2.jpg 放进去即可自动出现在这里。')
      }
      return h(
        'div',
        { style: ui.grid },
        ...presets.items.map((item) =>
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              title: `${item.label} · ${formatSize(item.size)}`,
              style: {
                ...ui.swatch,
                backgroundImage: `url("${item.thumb}")`,
                ...(presets.selected === item.id ? ui.swatchSelected : {}),
              },
              onClick: () => onPick(item.id),
            },
            h('span', { style: ui.swatchLabel }, item.label),
          ),
        ),
      )
    }

    function Workbench() {
      const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      const { config, preset, pet, presets, assets, status, saving, notice, open, anchor } = state

      useEffect(() => {
        if (open) sendReport('workbench-open')
      }, [open])

      // 展开时：Esc 关闭；点面板和挂件以外的区域也关闭。
      useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        const onDown = (event) => {
          const panel = document.getElementById(PANEL_ID)
          const petNode = document.getElementById(PET_ID)
          const launcher = document.getElementById(LAUNCHER_ID)
          if (panel && panel.contains(event.target)) return
          if (petNode && petNode.contains(event.target)) return
          if (launcher && launcher.contains(event.target)) return
          setOpen(false)
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onDown, true)
        return () => {
          document.removeEventListener('keydown', onKey)
          document.removeEventListener('pointerdown', onDown, true)
        }
      }, [open])

      // 收起状态不渲染任何东西（工作台只从挂件进）。
      if (!open) return null

      const statusText =
        status === 'offline' ? 'Host 未连接' : saving ? '保存中…' : status === 'ready' ? '已保存' : '读取中…'

      // 与 applyParticles() 里的换算保持一致，供滑块的读数显示
      const rawFlowerScale = Number(config.flowerScale)
      const flowerScale = Number.isFinite(rawFlowerScale) ? Math.min(2, Math.max(0.5, rawFlowerScale)) : 1
      const rawDensity = Number(config.particleDensity)
      const densityValue = Number.isFinite(rawDensity) ? Math.min(10, Math.max(0, rawDensity)) : 0
      const densityCount = densityValue <= 0 ? 0 : Math.min(4, Math.max(1, Math.round(1 + densityValue / 3)))
      const densityCooldown = densityValue <= 0 ? 0 : Math.max(1200, 3400 - densityValue * 220)
      const rainSize = Math.min(3, Math.max(0.5, Number(config.rainSize) || 1))
      const rainAngle = Math.min(60, Math.max(0, Number(config.rainAngle) || 0))
      const rainDensity = Math.min(10, Math.max(0, Math.round(Number(config.rainDensity))))
      const rainBase = Math.max(40, Math.min(260, Math.round((window.innerWidth * window.innerHeight) / 16000)))
      const rainDropsPreview = Math.max(0, Math.min(600, Math.round(rainBase * (rainDensity / 5))))

      const panelStyle = {
        ...ui.panel,
        ...(anchor && anchor.left !== null
          ? { left: anchor.left, bottom: anchor.bottom }
          : { right: (anchor && anchor.right) ?? 24, bottom: (anchor && anchor.bottom) ?? 96 }),
        width: anchor?.width ?? 420,
        maxHeight: anchor?.maxHeight ?? Math.round(window.innerHeight * 0.72),
      }

      return h(
        'div',
        { id: PANEL_ID, style: panelStyle, 'data-testid': 'dsh-huangquan-theme-panel' },
        h(
          'header',
          { style: ui.head },
          h(
            'div',
            { style: ui.titleRow },
            h('div', { style: ui.title }, '黄泉外观工作台'),
            h('span', { style: ui.chip(status === 'offline' ? 'warn' : 'muted') }, statusText),
            h(
              'button',
              { type: 'button', style: ui.panelClose, title: '收起（Esc）', 'aria-label': '收起工作台', onClick: () => setOpen(false) },
              '✕',
            ),
          ),
          h('div', { style: ui.subtitle }, '壁纸、蒙版、毛玻璃、挂件与紫红拖尾。所有修改即时生效，配置写入插件 Config（settings 表单）。'),
        ),
        notice ? h('div', { style: ui.note }, notice) : null,

        h(
          Card,
          {
            title: '背景预设',
            icon: '🖼',
            badge: presets.status === 'ready' ? `${presets.items.length} 张` : null,
            hint: assets?.dir ? `目录：${assets.dir}${assets.exists ? '' : '（目录不存在）'}` : '图片放在插件的 assets/backgrounds 目录里。',
          },
          h(PresetGrid, { presets, onPick: (id) => commit({ backgroundPreset: id }) }),
          h('div', { style: ui.hint }, `当前：${preset ? preset.label : '（无可用预设）'}`),
        ),

        h(
          Card,
          {
            title: '蒙版与毛玻璃',
            icon: '🌫',
            hint: '蒙版压住壁纸保证文字清晰；同一数值也决定主面板通透度，菜单/对话框始终不透明。',
          },
          h(
            Field,
            { label: '蒙版不透明度', value: percent(config.maskOpacity), hint: '0 = 壁纸原样，1 = 完全被主题底色盖住。' },
            h(Slider, { field: 'maskOpacity', label: '蒙版不透明度', value: config.maskOpacity, onChange: (next) => commit({ maskOpacity: next }) }),
          ),
          h(
            Field,
            { label: '毛玻璃模糊度', value: `${Math.round(Number(config.blurAmount) || 0)} px`, hint: '作用在壁纸层，壁纸太花时加一点会干净很多。' },
            h(Slider, { field: 'blurAmount', label: '毛玻璃模糊度', value: config.blurAmount, onChange: (next) => commit({ blurAmount: next }) }),
          ),
        ),

        h(
          Card,
          { title: '挂件', icon: '🐾', hint: '右下角挂件来自 assets/backgrounds/pet.png，会自动呼吸浮动；按住可拖到任意位置。' },
          pet ? h('div', { style: ui.hint }, `已加载：${pet.file}`) : h('div', { style: ui.note }, '没找到 assets/backgrounds/pet.png，挂件暂不显示。'),
          h(
            Field,
            { label: '挂件大小', value: `${Math.round(Number(config.petSize) || 150)} px` },
            h(Slider, { field: 'petSize', label: '挂件大小', value: config.petSize, onChange: (next) => commit({ petSize: next }) }),
          ),
          h('div', { style: ui.row }, h('button', { type: 'button', style: ui.button, onClick: () => resetPetPosition() }, '回到右下角')),
        ),

        h(
          Card,
          {
            title: '四角花环',
            icon: '❀',
            hint: '输入框外面那串花：四个角各自控制朵数（0-6，0 = 该角不放）和大小倍率；朵数多了会沿边框连成一串。',
          },
          ...CORNERS.map((corner) => {
            const countKey = `cornerCount${corner.key}`
            const sizeKey = `cornerSize${corner.key}`
            const count = Math.min(6, Math.max(0, Math.round(Number(config[countKey]) || 0)))
            const sizeValue = Math.min(2, Math.max(0.5, Number(config[sizeKey]) || 1))
            return h(
              Field,
              {
                key: corner.key,
                label: `${corner.label}角`,
                value: `${count} 朵 · ×${sizeValue.toFixed(1)}`,
                hint: `个数 0-6；大小 ×0.5-×2（叠加在“花的尺寸”之上）。`,
              },
              h(
                'div',
                { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' } },
                h('input', {
                  type: 'range',
                  style: ui.range,
                  min: 0,
                  max: 6,
                  step: 1,
                  value: count,
                  'aria-label': `${corner.label}角花的个数`,
                  onChange: (event) => commit({ [countKey]: Number(event.target.value) }),
                }),
                h('input', {
                  type: 'range',
                  style: ui.range,
                  min: 0.5,
                  max: 2,
                  step: 0.1,
                  value: sizeValue,
                  'aria-label': `${corner.label}角花的大小`,
                  onChange: (event) => commit({ [sizeKey]: Number(event.target.value) }),
                }),
              ),
            )
          }),
        ),

        h(
          Card,
          {
            title: '背景雨',
            icon: '🌧',
            hint: '全屏斜雨：方向固定从右上飘向左下，可调雨滴大小与倾斜角度。',
          },
          h(
            Field,
            { label: '雨滴开关', value: config.rainToggle === false ? '已关闭' : '已开启', hint: '关掉后立即停止绘制并清空画布。' },
            h('input', {
              type: 'checkbox',
              checked: config.rainToggle !== false,
              'aria-label': '背景雨开关',
              onChange: (event) => commit({ rainToggle: event.target.checked }),
            }),
          ),
          h(
            Field,
            { label: '雨滴大小', value: `×${rainSize.toFixed(1)}`, hint: '同时放大雨滴的长度与线宽。' },
            h(Slider, { field: 'rainSize', label: '雨滴大小', value: config.rainSize, onChange: (next) => commit({ rainSize: next }) }),
          ),
          h(
            Field,
            { label: '雨滴密度', value: rainDensity <= 0 ? '不下雨' : `${rainDropsPreview} 滴`, hint: '0 = 不下雨，5 = 默认，10 = 最密（约两倍雨量）。' },
            h(Slider, { field: 'rainDensity', label: '雨滴密度', value: config.rainDensity, onChange: (next) => commit({ rainDensity: next }) }),
          ),
          h(
            Field,
            { label: '倾斜角度', value: `${Math.round(rainAngle)}°（右上 → 左下）`, hint: '0° = 垂直下落，60° = 很斜。' },
            h(Slider, { field: 'rainAngle', label: '倾斜角度', value: config.rainAngle, onChange: (next) => commit({ rainAngle: next }) }),
          ),
        ),

        h(
          Card,
          {
            title: '鼠标花瓣光效',
            icon: '🌸',
            hint: '鼠标划过时飘落彼岸花：缓慢下坠 + 缓慢自转 + 左右正弦摇摆，结束时淡出，周围持续散出极微小的浅紫色荧光点。',
          },
          h(
            Field,
            {
              label: '花瓣光效开关',
              value: config.particleToggle === false ? '已关闭' : '已开启',
              hint: '关掉后不再生成花与荧光点（画布同时清空）。',
            },
            h('input', {
              type: 'checkbox',
              checked: config.particleToggle !== false,
              'aria-label': '花瓣光效开关',
              onChange: (event) => commit({ particleToggle: event.target.checked }),
            }),
          ),
          h(
            Field,
            {
              label: '花的尺寸',
              value: `×${flowerScale.toFixed(1)} · 花瓣 ${Math.round(280 * flowerScale)}px · 四角 ${Math.round(40 * flowerScale)}px`,
              hint: '同时作用于飘落的花瓣（基准 280px）和输入框四角的花（基准 40px）。',
            },
            h(Slider, {
              field: 'flowerScale',
              label: '花的尺寸',
              value: config.flowerScale,
              onChange: (next) => commit({ flowerScale: next }),
            }),
          ),
          h(
            Field,
            {
              label: '花瓣密度',
              value: densityCount <= 0 ? '不生成' : `${densityCount} 朵同屏 · ${(densityCooldown / 1000).toFixed(1)}s / 朵`,
              hint: '越大同屏朵数越多、生成间隔越短；上限 4 朵，所以整体始终很稀疏。',
            },
            h(Slider, {
              field: 'particleDensity',
              label: '花瓣密度',
              value: config.particleDensity,
              onChange: (next) => commit({ particleDensity: next }),
            }),
          ),
        ),

        h(
          'footer',
          { style: ui.footer },
          h(
            'button',
            {
              type: 'button',
              style: ui.button,
              onClick: () => {
                resetPetPosition()
                commit({ ...DEFAULTS }, { immediate: true })
              },
            },
            '恢复默认',
          ),
          h('span', { style: ui.okNote, role: 'status' }, statusText),
        ),
      )
    }

    class WorkbenchBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error, info) {
        sendReport('render-error', {
          message: String((error && error.message) || error),
          stack: String((error && error.stack) || '').slice(0, 2000),
          componentStack: String((info && info.componentStack) || '').slice(0, 2000),
        })
      }

      render() {
        const error = this.state.error
        if (error) {
          return h(
            'div',
            { style: ui.card },
            h('div', { style: ui.cardTitle }, '黄泉外观工作台渲染出错'),
            h('div', { style: ui.note }, String((error && error.message) || error)),
            h('div', { style: ui.hint }, '详情已写入 %USERPROFILE%\\.dsh\\dsh-huangquan-theme\\report.json'),
          )
        }
        return this.props.children
      }
    }

    // ==================================================================
    // 输入框四角彼岸花装饰（独立特效：不碰壁纸 / 花瓣飘落逻辑）
    // ==================================================================

    const HQ_FLOWER_STYLE_ID = 'hq-flower-deco-style'
    const HQ_FLOWER_ATTR = 'data-hq-flower'
    const HQ_FLOWER_LAYER_ID = 'hq-flower-layer'
    /** 4 格雪碧图：每格一种花型（形状不一的来源）。 */
    const HQ_FLOWER_SHEET = '/plugins/dsh-huangquan-theme/flower'
    const HQ_FLOWER_CELLS = 4
    /** 花的基准尺寸（px）：实际尺寸 = 26 × 尺寸倍率 × 每朵的随机系数。 */
    const HQ_FLOWER_BASE = 26
    let hqFlowerScale = 1
    /** 四个角各自的朵数与大小倍率（来自工作台）。 */
    let hqFlowerCorners = {
      TL: { count: 2, size: 1 },
      TR: { count: 5, size: 1 },
      BL: { count: 1, size: 1 },
      BR: { count: 1, size: 1 },
    }
    let hqFlowerSignature = ''
    /** 本轮花环的布局（相对外框锚点），place 时按外框矩形换算成 fixed 坐标。 */
    let hqFlowerLayout = []

    function hqFlowerStyle() {
      if (document.getElementById(HQ_FLOWER_STYLE_ID)) return
      const style = document.createElement('style')
      style.id = HQ_FLOWER_STYLE_ID
      style.textContent = `
#hq-flower-layer{position:fixed;inset:0;pointer-events:none;z-index:2147481900}
.hq-flower-slot{position:absolute;display:block;pointer-events:none;transform-origin:50% 50%}
.hq-flower-face{display:block;width:100%;height:100%;background-repeat:no-repeat;
  filter:drop-shadow(0 0 5px rgba(200,150,255,.6));
  animation:hq-flower-breath 4s ease-in-out infinite;transform-origin:50% 50%}
@keyframes hq-flower-breath{
  0%{transform:scale(.9) rotate(-10deg)}
  50%{transform:scale(1.1) rotate(10deg)}
  100%{transform:scale(.9) rotate(-10deg)}
}`
      document.head.appendChild(style)
    }

    /** 找页面底部的输入框：可见、可用、且 top 最大（最靠下）的那个 textarea / contenteditable。 */
    function hqFindComposer() {
      const nodes = [
        ...Array.from(document.querySelectorAll('textarea')),
        ...Array.from(document.querySelectorAll('[contenteditable="true"]')),
      ]
      const areas = nodes.filter((el) => {
        if (el.disabled || el.readOnly) return false
        const rect = el.getBoundingClientRect()
        if (rect.width < 80 || rect.height < 12) return false
        if (typeof getComputedStyle === 'function') {
          const style = getComputedStyle(el)
          if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.1) return false
        }
        return true
      })
      if (areas.length === 0) return null
      areas.sort((left, right) => right.getBoundingClientRect().top - left.getBoundingClientRect().top)
      return areas[0]
    }

    /**
     * 找「对话框外框」：从输入框往上找第一个有**边框或圆角**的元素。
     * 刻意不看背景色 —— 输入框内层往往也有底色，但它在外框里面，
     * 用它定位会把花放进框内（用户明确要求贴在外面）。
     */
    function hqFindFrame(textarea) {
      let node = textarea.parentElement
      let depth = 0
      while (node && depth < 6) {
        if (typeof getComputedStyle === 'function') {
          const style = getComputedStyle(node)
          const hasBorder = parseFloat(style.borderTopWidth || '0') > 0
          const hasRadius = parseFloat(style.borderTopLeftRadius || '0') > 0
          if (hasBorder || hasRadius) return node
        }
        node = node.parentElement
        depth += 1
      }
      return textarea.parentElement
    }

    /** 每种原因只上报一次，避免 2 秒轮询刷屏。 */
    const hqReportedSkips = new Set()
    function hqReportSkipOnce(reason, detail) {
      if (hqReportedSkips.has(reason)) return
      hqReportedSkips.add(reason)
      sendReport('corner-flowers-skip', { reason, ...detail })
    }

    /** 花挂在 body 上的固定浮层里：不受任何容器 overflow 裁切，永远在外侧。 */
    function hqEnsureFlowerLayer() {
      let layer = document.getElementById(HQ_FLOWER_LAYER_ID)
      if (layer) return layer
      layer = document.createElement('div')
      layer.id = HQ_FLOWER_LAYER_ID
      layer.setAttribute('aria-hidden', 'true')
      document.body.appendChild(layer)
      return layer
    }

    function hqRandom(min, max) {
      return min + Math.random() * (max - min)
    }

    /** 单朵花的像素尺寸：基准 × 尺寸倍率 × 本朵随机系数（大小不一）。 */
    function hqFlowerPixels(unit) {
      return Math.max(12, Math.min(72, Math.round(HQ_FLOWER_BASE * hqFlowerScale * unit)))
    }

    /**
     * 生成花环布局：每个角按它自己的「朵数」铺一串，按自己的「大小倍率」定尺寸。
     *   · 第 1 朵压在转角上（向框外偏一点）
     *   · 之后交替沿「横边」和「竖边」向外铺开 → 连成一串、包住转角
     * 每朵的花型、角度、镜像、大小抖动都独立随机。
     */
    function hqBuildLayout(rect) {
      const layout = []
      for (const corner of CORNERS) {
        const setting = hqFlowerCorners[corner.key] ?? { count: 0, size: 1 }
        const count = Math.max(0, Math.min(6, Math.round(setting.count)))
        const sizeMul = Math.max(0.5, Math.min(2, Number(setting.size) || 1))
        // 朝框外的法线方向
        const outX = corner.sx === 'right' ? 1 : -1
        const outY = corner.sy === 'top' ? -1 : 1
        // 沿边铺开的方向（朝框内）
        const alongX = corner.sx === 'right' ? -1 : 1
        const alongY = corner.sy === 'top' ? 1 : -1
        for (let index = 0; index < count; index += 1) {
          let dx
          let dy
          if (index === 0) {
            // 压角：略微探出框外
            dx = outX * hqRandom(2, 10)
            dy = outY * hqRandom(2, 10)
          } else {
            // 交替沿横边、竖边铺开，间距 26~58px，带抖动 + 轻微叠压
            const rank = Math.ceil(index / 2)
            const step = rank * hqRandom(26, 46) + hqRandom(-6, 6)
            if (index % 2 === 1) {
              dx = alongX * step
              dy = outY * hqRandom(2, 14)
            } else {
              dx = outX * hqRandom(2, 14)
              dy = alongY * step
            }
          }
          layout.push({
            corner: corner.key,
            sx: corner.sx,
            sy: corner.sy,
            dx,
            dy,
            unit: sizeMul * hqRandom(0.78, 1.15),
            cell: Math.floor(Math.random() * HQ_FLOWER_CELLS),
            rotate: hqRandom(-26, 26),
            flip: Math.random() < 0.35,
          })
        }
      }
      return layout
    }

    /** 按外框矩形把整串花摆好（fixed 坐标；花可以任意探出框外）。 */
    function hqPlaceFlowers() {
      const layer = document.getElementById(HQ_FLOWER_LAYER_ID)
      if (!layer) return false
      const textarea = hqFindComposer()
      if (!textarea) return false
      const frame = hqFindFrame(textarea)
      if (!frame) return false
      const rect = frame.getBoundingClientRect()
      if (rect.width < 60 || rect.height < 24) return false

      const slots = Array.from(layer.querySelectorAll('.hq-flower-slot'))
      slots.forEach((slot, index) => {
        const item = hqFlowerLayout[index]
        if (!item) return
        const size = hqFlowerPixels(item.unit)
        const centerX = (item.sx === 'right' ? rect.right : rect.left) + item.dx
        const centerY = (item.sy === 'top' ? rect.top : rect.bottom) + item.dy
        slot.style.width = `${size}px`
        slot.style.height = `${size}px`
        slot.style.left = `${Math.round(centerX - size / 2)}px`
        slot.style.top = `${Math.round(centerY - size / 2)}px`
        slot.style.transform = `rotate(${item.rotate.toFixed(1)}deg)${item.flip ? ' scaleX(-1)' : ''}`
        const face = slot.firstElementChild
        if (face) {
          face.style.backgroundSize = `${size * HQ_FLOWER_CELLS}px ${size}px`
          face.style.backgroundPosition = `${-item.cell * size}px 0`
        }
      })
      return true
    }

    /** 挂花环：一次生成整串（每朵花型/大小/角度独立随机），之后只校正位置。 */
    function hqMountFlowerDeco() {
      const textarea = hqFindComposer()
      if (!textarea) {
        hqReportSkipOnce('no-textarea', { textareas: document.querySelectorAll('textarea').length })
        return false
      }
      const frame = hqFindFrame(textarea)
      if (!frame) {
        hqReportSkipOnce('no-frame', {})
        return false
      }
      const layer = hqEnsureFlowerLayer()
      if (!layer) {
        hqReportSkipOnce('no-layer', {})
        return false
      }
      if (layer.querySelector('.hq-flower-slot')) {
        hqPlaceFlowers()
        return false
      }

      hqFlowerStyle()
      const rect = frame.getBoundingClientRect()
      hqFlowerLayout = hqBuildLayout(rect)
      const sheetUrl = snapshot.flower?.url || HQ_FLOWER_SHEET
      for (const item of hqFlowerLayout) {
        const slot = document.createElement('span')
        slot.className = 'hq-flower-slot'
        slot.setAttribute('aria-hidden', 'true')
        const face = document.createElement('span')
        face.className = 'hq-flower-face'
        face.style.backgroundImage = `url("${sheetUrl}")`
        // 每朵花的呼吸动画错开相位
        face.style.animationDelay = `${(-Math.random() * 4).toFixed(2)}s`
        slot.appendChild(face)
        layer.appendChild(slot)
      }
      hqPlaceFlowers()
      const sizes = hqFlowerLayout.map((item) => hqFlowerPixels(item.unit))
      const perCorner = {}
      for (const item of hqFlowerLayout) perCorner[item.corner] = (perCorner[item.corner] ?? 0) + 1
      sendReport('corner-flowers-mounted', {
        mode: 'garland-corners',
        count: hqFlowerLayout.length,
        perCorner,
        shapes: [...new Set(hqFlowerLayout.map((item) => item.cell))].sort(),
        sizes,
        scale: hqFlowerScale,
        frame: frame.className || frame.tagName,
        frameRect: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)],
      })
      return true
    }

    let hqFlowerTimer = 0
    const hqFlowerDeco = {
      start() {
        if (hqFlowerTimer) return
        hqMountFlowerDeco()
        // DSH 是动态渲染的：每 2 秒检查一次，输入框换代后自动补挂、位置也随时校正
        hqFlowerTimer = window.setInterval(() => {
          hqMountFlowerDeco()
        }, 2000)
      },
      stop() {
        if (hqFlowerTimer) {
          window.clearInterval(hqFlowerTimer)
          hqFlowerTimer = 0
        }
        hqFlowerLayout = []
        document.getElementById(HQ_FLOWER_LAYER_ID)?.remove()
        for (const container of Array.from(document.querySelectorAll(`[${HQ_FLOWER_ATTR}]`))) {
          container.removeAttribute(HQ_FLOWER_ATTR)
        }
        document.getElementById(HQ_FLOWER_STYLE_ID)?.remove()
      },
      /** 位置校正（窗口 resize 等时机调用）。 */
      place: hqPlaceFlowers,
      /**
       * 工作台配置入口：同步整体尺寸倍率 + 四个角的朵数/大小。
       * 朵数或大小变了就重建整串（花型/角度重新随机）；否则只重排位置。
       */
      apply(config) {
        const rawScale = Number(config.flowerScale)
        hqFlowerScale = Number.isFinite(rawScale) ? Math.min(2, Math.max(0.5, rawScale)) : 1
        const nextCorners = {}
        for (const corner of CORNERS) {
          const countKey = `cornerCount${corner.key}`
          const sizeKey = `cornerSize${corner.key}`
          const count = Math.round(Number(config[countKey]))
          const size = Number(config[sizeKey])
          nextCorners[corner.key] = {
            count: Number.isFinite(count) ? Math.min(6, Math.max(0, count)) : 1,
            size: Number.isFinite(size) ? Math.min(2, Math.max(0.5, size)) : 1,
          }
        }
        const signature = JSON.stringify(nextCorners)
        const changed = signature !== hqFlowerSignature
        hqFlowerCorners = nextCorners
        hqFlowerSignature = signature
        if (!changed) {
          hqPlaceFlowers()
          return hqFlowerLayout.length
        }
        // 朵数/大小变了：清掉重挂
        hqFlowerLayout = []
        const layer = document.getElementById(HQ_FLOWER_LAYER_ID)
        if (layer) for (const slot of Array.from(layer.querySelectorAll('.hq-flower-slot'))) slot.remove()
        hqMountFlowerDeco()
        return hqFlowerLayout.length
      },
      /** 只改整体倍率（测试与内部使用）。 */
      refresh(scale) {
        const numeric = Number(scale)
        const next = Number.isFinite(numeric) ? Math.min(2, Math.max(0.5, numeric)) : 1
        if (Math.abs(next - hqFlowerScale) < 0.001) return Math.round(HQ_FLOWER_BASE * hqFlowerScale)
        hqFlowerScale = next
        hqPlaceFlowers()
        return Math.round(HQ_FLOWER_BASE * hqFlowerScale)
      },
      mount: hqMountFlowerDeco,
    }
    if (typeof window !== 'undefined') window.__hqFlowerDeco = hqFlowerDeco

    // ------------------------------------------------------------------
    // 插件生命周期
    // ------------------------------------------------------------------

    function apply(ctx) {
      try {
        themeService = ctx.theme || null

        ctx.effect(() => {
          ensureStyle()
          ensurePet()
          hqFlowerDeco.start()
          void loadConfig().then(() => void loadPresets())
          return () => {
            hqFlowerDeco.stop()
            if (balanceTimer) {
              window.clearInterval(balanceTimer)
              balanceTimer = 0
            }
            const bubble = document.getElementById(BUBBLE_ID)
            if (bubble) bubble.remove()
            stopRain()
            const rainCanvas = document.getElementById(RAIN_ID)
            if (rainCanvas) rainCanvas.remove()
            rain.canvas = null
            rain.ctx = null
            rain.drops = []
            if (saveTimer) window.clearTimeout(saveTimer)
            saveTimer = 0
            pending = {}
            teardownParticles()
            if (typeof disposeTokens === 'function') disposeTokens()
            disposeTokens = null
            themeService = null
            const pet = document.getElementById(PET_ID)
            if (pet) pet.remove()
            const launcher = document.getElementById(LAUNCHER_ID)
            if (launcher) launcher.remove()
            const style = document.getElementById(STYLE_ID)
            if (style) style.remove()
            for (const property of ['--hq-bg', '--hq-mask-alpha', '--hq-mask-rgb', '--hq-blur', '--hq-scale', '--hq-pet-size']) {
              document.body?.style.removeProperty(property)
            }
          }
        }, 'dsh-huangquan-theme: runtime')

        let lastDark = isDark()
        const syncScheme = () => {
          const nextDark = isDark()
          if (nextDark === lastDark) return
          lastDark = nextDark
          applyTheme(snapshot.config)
        }
        if (ctx.on) ctx.on('theme/change', () => syncScheme())
        if (typeof MutationObserver !== 'undefined' && document.body) {
          const observer = new MutationObserver(syncScheme)
          observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
          ctx.effect(() => () => observer.disconnect(), 'dsh-huangquan-theme: scheme observer')
        }

        const onResize = () => {
          resizeCanvas()
          resizeRainCanvas()
          if (rain.drops.length > 0) resetRainDrops()
          const pet = document.getElementById(PET_ID)
          if (pet && pet.style.left) placePet(Number.parseFloat(pet.style.left), Number.parseFloat(pet.style.top))
          placeBubble()
          hqFlowerDeco.place()
          if (snapshot.open) update({ anchor: panelAnchor() })
        }
        window.addEventListener('resize', onResize, { passive: true })
        ctx.effect(() => () => window.removeEventListener('resize', onResize), 'dsh-huangquan-theme: resize')

        const section = (props) => h(WorkbenchBoundary, null, h(Workbench, props))
        // 工作台不再是设置页：只挂在全窗口浮层（shell.overlay）上，
        // 由点击右下角挂件展开/收起。
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'dsh-huangquan-theme-panel', order: 40 },
            section,
          ),
        )

        sendReport('apply-ok')
      } catch (error) {
        sendReport('apply-error', {
          message: String((error && error.message) || error),
          stack: String((error && error.stack) || '').slice(0, 2000),
        })
        throw error
      }
    }

    return {
      name: 'dsh-huangquan-theme-client',
      inject: ['slots', 'theme'],
      apply,
    }
  },
})
