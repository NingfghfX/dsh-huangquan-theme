/**
 * dsh-huangquan-theme — Host half（黄泉主题）。
 *
 * 职责：
 *   1. 导出 Config（Schemastery schema，volatile 字段 = 可热更新），
 *      通过 ctx.settings.describe/update 读写配置；
 *   2. 用 webserver/index-inject 结构化注入行提供壁纸 + 蒙版 + token 覆盖，
 *      HTTP 与 Electron 两端都首帧生效；
 *   3. 提供 assets/backgrounds 预设图、缩略图、配置读写、余额、自检上报等路由。
 *
 * 数据流：assets/backgrounds/<file> --(assets 路由)--> CSS url()
 *        backgroundPreset 只存文件名字干，图片本身永远由 Host 读盘。
 */

import * as schemastery from '@deepseek-ai/schemastery'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const Schema = schemastery.Schema ?? schemastery.default

export const name = 'dsh-huangquan-theme'
export const inject = ['webServer']

/** 包根目录（本文件在 src/ 下）。 */
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
/** 预设背景目录。 */
const ASSETS_DIR = join(PACKAGE_DIR, 'assets', 'backgrounds')

const BASE = '/plugins/dsh-huangquan-theme'
export const ROUTES = Object.freeze({
  config: `${BASE}/config`,
  presets: `${BASE}/presets`,
  assets: `${BASE}/assets/`,
  thumb: `${BASE}/thumb`,
  flower: `${BASE}/flower`,
  /** 输入框四角装饰用的单朵花（客户端按 /hq-img/flower 引用）。 */
  cornerFlower: '/hq-img/flower',
  /** DeepSeek 余额（Host 侧取 Key 并请求官方接口，页面只拿数字）。 */
  balance: `${BASE}/balance`,
  /** 主动发布一版新的浏览器 bundle（等价于 HMR watcher 的 rebuilt 钩子）。 */
  republish: `${BASE}/republish`,
  report: `${BASE}/report`,
})

const IMAGE_TYPES = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
})

/** 挂件从预设目录里按名字找，"pet" 不出现在背景网格里。 */
const PET_STEM = 'pet'
const THUMB_MIN_BYTES = 300 * 1024
const THUMB_WIDTH = 640

// ---------------------------------------------------------------------------
// Config（Schemastery）
// ---------------------------------------------------------------------------

/**
 * 把字段标记为 volatile：DSH 0.2 对这种字段走 Loader 的 live-commit 路径，
 * 改完不重挂插件、立即生效。老版本没有 volatile 时就原样返回。
 */
function live(schema) {
  return typeof schema?.volatile === 'function' ? schema.volatile() : schema
}

export const Config = Schema.object({
  backgroundPreset: live(
    Schema.string()
      .default('')
      .description('背景预设：assets/backgrounds 里的文件名（不含扩展名）。留空 = 自动用第一张。'),
  ),
  maskOpacity: live(
    Schema.number()
      .min(0)
      .max(1)
      .step(0.05)
      .default(0.5)
      .role('slider')
      .description('蒙版不透明度：0 = 壁纸原样，1 = 完全被主题底色盖住。主面板通透度跟随此值。'),
  ),
  blurAmount: live(
    Schema.number()
      .min(0)
      .max(50)
      .step(1)
      .default(0)
      .role('slider')
      .description('毛玻璃模糊度（作用在壁纸层），0-50。'),
  ),
  petSize: live(
    Schema.number()
      .min(50)
      .max(300)
      .step(1)
      .default(150)
      .role('slider')
      .description('右下角挂件大小（px）。'),
  ),
  flowerScale: live(
    Schema.number()
      .min(0.5)
      .max(2)
      .step(0.1)
      .default(1)
      .role('slider')
      .description('花的尺寸倍率：同时作用于飘落花瓣与输入框四角的花（1 = 默认）。'),
  ),
  particleDensity: live(
    Schema.number()
      .min(0)
      .max(10)
      .step(1)
      .default(3)
      .role('slider')
      .description('花瓣生成频率：数值越大冷却越短（最快 1.2s 一朵，屏幕同时最多 2 朵）。'),
  ),
  particleToggle: live(
    Schema.boolean().default(true).description('花瓣光效总开关：关闭后不再生成飘落的花与紫色荧光点。'),
  ),
  // ---- 输入框四角花环：每个角独立的朵数与大小 ----
  cornerCountTL: live(Schema.number().min(0).max(6).step(1).default(2).role('slider').description('对话框左上角花的个数（0-6，0 = 不放）。')),
  cornerCountTR: live(Schema.number().min(0).max(6).step(1).default(5).role('slider').description('对话框右上角花的个数（0-6）。')),
  cornerCountBL: live(Schema.number().min(0).max(6).step(1).default(1).role('slider').description('对话框左下角花的个数（0-6）。')),
  cornerCountBR: live(Schema.number().min(0).max(6).step(1).default(1).role('slider').description('对话框右下角花的个数（0-6）。')),
  cornerSizeTL: live(Schema.number().min(0.5).max(2).step(0.1).default(1).role('slider').description('对话框左上角花的大小倍率（0.5-2）。')),
  cornerSizeTR: live(Schema.number().min(0.5).max(2).step(0.1).default(1).role('slider').description('对话框右上角花的大小倍率（0.5-2）。')),
  cornerSizeBL: live(Schema.number().min(0.5).max(2).step(0.1).default(1).role('slider').description('对话框左下角花的大小倍率（0.5-2）。')),
  cornerSizeBR: live(Schema.number().min(0.5).max(2).step(0.1).default(1).role('slider').description('对话框右下角花的大小倍率（0.5-2）。')),
  // ---- 背景雨 ----
  rainToggle: live(Schema.boolean().default(true).description('背景雨开关：关闭后不再绘制雨滴。')),
  rainSize: live(Schema.number().min(0.5).max(3).step(0.1).default(1).role('slider').description('雨滴大小倍率（0.5-3）。')),
  rainDensity: live(Schema.number().min(0).max(10).step(1).default(5).role('slider').description('雨滴密度（0-10）：0 = 不下雨，5 = 默认，10 = 最密。')),
  rainAngle: live(Schema.number().min(0).max(60).step(5).default(25).role('slider').description('雨的倾斜角度（0-60 度）：0 = 垂直下落，越大越斜；方向固定从右上飘向左下。')),
}).description('黄泉外观设置')

/** 四个角的键（配置字段按 corner{Count,Size}<KEY> 命名）。 */
export const CORNER_KEYS = Object.freeze(['TL', 'TR', 'BL', 'BR'])

const DEFAULTS = Object.freeze({
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
})

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function stateFile() {
  return join(dshHome(), 'dsh-huangquan-theme.json')
}

function dataDir() {
  return join(dshHome(), 'dsh-huangquan-theme')
}

function clamp(value, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, numeric))
}

function clamp01(value) {
  return clamp(value, 0, 1)
}

function unwrapField(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

/** 只保留 schema 认识的键并收敛取值范围。 */
export function sanitize(input, base = DEFAULTS) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const next = { ...base }
  if ('backgroundPreset' in source) {
    const preset = String(source.backgroundPreset ?? '').trim()
    next.backgroundPreset = preset.replace(/\.(png|jpe?g|webp|gif|bmp)$/i, '')
  }
  if ('maskOpacity' in source) next.maskOpacity = Math.round(clamp01(source.maskOpacity) * 20) / 20
  if ('blurAmount' in source) next.blurAmount = Math.round(clamp(source.blurAmount, 0, 50))
  if ('petSize' in source) next.petSize = Math.round(clamp(source.petSize, 50, 300))
  if ('flowerScale' in source) next.flowerScale = Math.round(clamp(source.flowerScale, 0.5, 2) * 10) / 10
  if ('particleDensity' in source) next.particleDensity = Math.round(clamp(source.particleDensity, 0, 10))
  if ('particleToggle' in source) {
    const value = source.particleToggle
    next.particleToggle = value === true || value === 1 || value === 'true'
  }
  for (const key of CORNER_KEYS) {
    const countKey = `cornerCount${key}`
    if (countKey in source) next[countKey] = Math.round(clamp(source[countKey], 0, 6))
    const sizeKey = `cornerSize${key}`
    if (sizeKey in source) next[sizeKey] = Math.round(clamp(source[sizeKey], 0.5, 2) * 10) / 10
  }
  if ('rainToggle' in source) {
    const value = source.rainToggle
    next.rainToggle = value === true || value === 1 || value === 'true'
  }
  if ('rainSize' in source) next.rainSize = Math.round(clamp(source.rainSize, 0.5, 3) * 10) / 10
  if ('rainDensity' in source) next.rainDensity = Math.round(clamp(source.rainDensity, 0, 10))
  if ('rainAngle' in source) next.rainAngle = Math.round(clamp(source.rainAngle, 0, 60) / 5) * 5
  return next
}

export function publicConfig(config) {
  const source = config ?? {}
  return sanitize({
    backgroundPreset: unwrapField(source.backgroundPreset) ?? DEFAULTS.backgroundPreset,
    maskOpacity: unwrapField(source.maskOpacity) ?? DEFAULTS.maskOpacity,
    blurAmount: unwrapField(source.blurAmount) ?? DEFAULTS.blurAmount,
    petSize: unwrapField(source.petSize) ?? DEFAULTS.petSize,
    flowerScale: unwrapField(source.flowerScale) ?? DEFAULTS.flowerScale,
    particleDensity: unwrapField(source.particleDensity) ?? DEFAULTS.particleDensity,
    particleToggle: unwrapField(source.particleToggle) ?? DEFAULTS.particleToggle,
    cornerCountTL: unwrapField(source.cornerCountTL) ?? DEFAULTS.cornerCountTL,
    cornerCountTR: unwrapField(source.cornerCountTR) ?? DEFAULTS.cornerCountTR,
    cornerCountBL: unwrapField(source.cornerCountBL) ?? DEFAULTS.cornerCountBL,
    cornerCountBR: unwrapField(source.cornerCountBR) ?? DEFAULTS.cornerCountBR,
    cornerSizeTL: unwrapField(source.cornerSizeTL) ?? DEFAULTS.cornerSizeTL,
    cornerSizeTR: unwrapField(source.cornerSizeTR) ?? DEFAULTS.cornerSizeTR,
    cornerSizeBL: unwrapField(source.cornerSizeBL) ?? DEFAULTS.cornerSizeBL,
    cornerSizeBR: unwrapField(source.cornerSizeBR) ?? DEFAULTS.cornerSizeBR,
    rainToggle: unwrapField(source.rainToggle) ?? DEFAULTS.rainToggle,
    rainSize: unwrapField(source.rainSize) ?? DEFAULTS.rainSize,
    rainDensity: unwrapField(source.rainDensity) ?? DEFAULTS.rainDensity,
    rainAngle: unwrapField(source.rainAngle) ?? DEFAULTS.rainAngle,
  })
}

// ---------------------------------------------------------------------------
// 预设图（assets/backgrounds）
// ---------------------------------------------------------------------------

/**
 * 按内容嗅探真实图片类型：用户把 PNG 存成 .jpg 是常事，
 * 只信扩展名会让浏览器拿到错误的 Content-Type。
 */
function sniffType(file, fallbackType) {
  try {
    const head = readFileSync(file).subarray(0, 12)
    if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png'
    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
    if (head.length >= 6 && head.toString('ascii', 0, 3) === 'GIF') return 'image/gif'
    if (head.length >= 12 && head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
    if (head.length >= 2 && head.toString('ascii', 0, 2) === 'BM') return 'image/bmp'
  } catch {
    // 读失败就用扩展名推断
  }
  return fallbackType
}

function imageInfo(file) {
  try {
    const stat = statSync(file)
    if (!stat.isFile() || stat.size === 0) return null
    const fallbackType = IMAGE_TYPES[extname(file).toLowerCase()]
    if (!fallbackType) return null
    return {
      file,
      type: sniffType(file, fallbackType),
      size: stat.size,
      mtime: Math.round(stat.mtimeMs),
      stem: extname(file) ? file.slice(file.lastIndexOf(sep) + 1).replace(/\.[^.]+$/, '') : file,
    }
  } catch {
    return null
  }
}

/** 扫描 assets/backgrounds，返回稳定顺序的预设（含挂件图示）。 */
export function listPresets() {
  let names = []
  try {
    names = readdirSync(ASSETS_DIR)
  } catch {
    return { backgrounds: [], pet: null }
  }
  const backgrounds = []
  let pet = null
  for (const fileName of names.sort((left, right) => left.localeCompare(right))) {
    const info = imageInfo(join(ASSETS_DIR, fileName))
    if (!info) continue
    const entry = {
      id: info.stem.toLowerCase(),
      label: info.stem,
      file: fileName,
      size: info.size,
      mtime: info.mtime,
      type: info.type,
      url: `${ROUTES.assets}${encodeURIComponent(fileName)}?v=${info.mtime}`,
      thumb: info.size > THUMB_MIN_BYTES
        ? `${ROUTES.thumb}?file=${encodeURIComponent(fileName)}&v=${info.mtime}`
        : `${ROUTES.assets}${encodeURIComponent(fileName)}?v=${info.mtime}`,
    }
    if (entry.id === PET_STEM) {
      pet = { ...entry, url: `${ROUTES.assets}${encodeURIComponent(fileName)}?v=${info.mtime}` }
      continue
    }
    backgrounds.push(entry)
  }
  return { backgrounds, pet }
}

/** 解析当前生效的预设：配置里的 id 优先，找不到就用第一张。 */
export function resolvePreset(presetId) {
  const { backgrounds } = listPresets()
  const wanted = String(presetId ?? '').trim().toLowerCase()
  const found = backgrounds.find((entry) => entry.id === wanted) ?? backgrounds[0] ?? null
  return found
}

function resolveByName(fileName) {
  const safeName = String(fileName ?? '')
  if (safeName === '' || safeName.includes('/') || safeName.includes('\\') || safeName.includes('..')) return null
  const file = join(ASSETS_DIR, safeName)
  if (dirname(file) !== ASSETS_DIR) return null
  return imageInfo(file)
}

// ---------------------------------------------------------------------------
// 缩略图（Windows System.Drawing，缓存到 $DSH_HOME）
// ---------------------------------------------------------------------------

const pendingThumbs = new Map()

function thumbTarget(info, width = THUMB_WIDTH) {
  const key = createHash('sha1').update(`${info.file}:${info.mtime}:${width}`).digest('hex')
  return { key, file: join(dataDir(), 'thumbs', `${key}.jpg`) }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function thumbScript(source, target, width) {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Drawing',
    `$src = ${psQuote(source)}`,
    `$dst = ${psQuote(target)}`,
    '$img = [System.Drawing.Image]::FromFile($src)',
    `$w = ${width}`,
    '$h = [int][Math]::Round($img.Height * $w / $img.Width)',
    'if ($h -lt 1) { $h = 1 }',
    '$bmp = New-Object System.Drawing.Bitmap($w, $h)',
    '$g = [System.Drawing.Graphics]::FromImage($bmp)',
    '$g.Clear([System.Drawing.Color]::FromArgb(24, 22, 30))',
    "$g.InterpolationMode = 'HighQualityBicubic'",
    '$g.DrawImage($img, 0, 0, $w, $h)',
    "$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }",
    '$ps = New-Object System.Drawing.Imaging.EncoderParameters(1)',
    '$ps.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 82)',
    '$bmp.Save($dst, $enc, $ps)',
    '$g.Dispose(); $bmp.Dispose(); $img.Dispose()',
  ].join('\n')
}

function renderThumb(source, target, width) {
  return new Promise((resolve, reject) => {
    mkdirSync(dirname(target), { recursive: true })
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', thumbScript(source, target, width)],
      { windowsHide: true, timeout: 30000 },
      (error) => {
        if (error) reject(error)
        else if (existsSync(target)) resolve(target)
        else reject(new Error('thumbnail not produced'))
      },
    )
  })
}

async function ensureThumb(info, width = THUMB_WIDTH) {
  const { key, file } = thumbTarget(info, width)
  if (existsSync(file)) return file
  if (process.platform !== 'win32') return null
  const pending = pendingThumbs.get(key)
  if (pending) return pending
  const job = renderThumb(info.file, file, width)
    .then(() => file)
    .catch(() => null)
    .finally(() => pendingThumbs.delete(key))
  pendingThumbs.set(key, job)
  return job
}

// ---------------------------------------------------------------------------
// 静态样式（index-inject 与客户端共用同一套规则）
// ---------------------------------------------------------------------------

const STYLE_MARKER = '/* dsh-huangquan-theme */'

/**
 * 表面 token 覆盖（唯一事实来源：Host 计算，客户端照搬）。
 *
 * 关键点：壁纸要穿过「蒙版 × 表面」两层才看得见，所以表面 alpha 必须远小于
 * 蒙版 alpha。早期用 alpha+0.28（0.5 → 0.78）会把壁纸压到 ~11% 亮度，
 * 在人眼里就是“插件没生效”。
 */
export function surfaceTokens(alpha) {
  const a = clamp01(alpha)
  const surface = Math.round(a * 0.45 * 100) / 100
  const soft = Math.round(a * 0.55 * 100) / 100
  return {
    '--dsw-alias-bg-base': { light: `rgba(255,255,255,${surface})`, dark: `rgba(21,21,23,${surface})` },
    '--dsw-specific-sidebar-fill': { light: `rgba(249,250,251,${surface})`, dark: `rgba(27,27,28,${surface})` },
    '--dsw-specific-input-major': { light: 'rgba(255,255,255,0.82)', dark: 'rgba(44,44,46,0.82)' },
    '--dsw-specific-tip': { light: `rgba(245,246,247,${soft})`, dark: `rgba(44,44,46,${soft})` },
    '--dsw-specific-bubble': { light: `rgba(237,243,254,${soft})`, dark: `rgba(44,44,46,${soft})` },
    '--dsw-specific-bubble-highlight': { light: `rgba(211,226,255,${soft})`, dark: `rgba(53,54,56,${soft})` },
  }
}

/**
 * 生成主题 CSS（不含 <style> 包装）。
 * 壁纸/蒙版走 body 的伪元素，不需要往 DOM 里插节点；
 * token 覆盖让主表面透明，浮层（菜单/对话框）保持不透明。
 */
export function buildCss(config) {
  const c = publicConfig(config)
  const preset = resolvePreset(c.backgroundPreset)
  const image = preset ? `url("${preset.url}")` : 'none'
  const alpha = clamp01(c.maskOpacity)
  const blur = Math.round(clamp(c.blurAmount, 0, 50))
  const scale = blur > 0 ? '1.06' : '1'
  const tokens = surfaceTokens(alpha)
  const tokenBlock = (selector, values) =>
    `${selector}{${Object.entries(values)
      .map(([key, value]) => `${key}:${value}`)
      .join(';')}}`
  return (
    `${STYLE_MARKER}` +
    `:root{--hq-bg:${image};--hq-mask-alpha:${alpha};--hq-mask-rgb:250, 249, 252;--hq-blur:${blur}px;--hq-scale:${scale}}` +
    `body[data-ds-dark-theme]{--hq-mask-rgb:10, 8, 16}` +
    `html body{background-color:transparent!important}` +
    tokenBlock(
      'html body',
      Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, value.light])),
    ) +
    tokenBlock(
      'html body[data-ds-dark-theme]',
      Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, value.dark])),
    ) +
    `body::before{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;` +
    `background:var(--hq-bg,none) center/cover no-repeat;filter:blur(var(--hq-blur,0px));transform:scale(var(--hq-scale,1))}` +
    `body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;` +
    `background:rgba(var(--hq-mask-rgb,10,8,16),var(--hq-mask-alpha,.5))}`
  )
}

/** 结构化注入行：Web 与 Electron 共用这一张表。 */
export function buildStaticInjections(config) {
  return [{ kind: 'style', text: buildCss(config) }]
}

// ---------------------------------------------------------------------------
// 配置存储：settings 服务优先，JSON 镜像兜底
// ---------------------------------------------------------------------------

function readMirror() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return sanitize(parsed)
  } catch {
    // 不存在 / 损坏
  }
  return { ...DEFAULTS }
}

function writeMirror(patch) {
  const next = sanitize(patch, readMirror())
  try {
    mkdirSync(dirname(stateFile()), { recursive: true })
    writeFileSync(stateFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch {
    // 写不进去不影响本次会话
  }
  return next
}

/** 找到本插件自己的 Loader 条目 id（settings 表单按条目 id 寻址）。 */
function ownEntryId(ctx) {
  let fallback
  try {
    for (const entry of ctx.loader?.entries?.() ?? []) {
      const id = entry.options?.id
      if (entry.options?.name !== name || typeof id !== 'string' || id === '') continue
      if (entry.fiber === ctx.fiber) return id
      if (entry.disabled !== true && fallback === undefined) fallback = id
    }
  } catch {
    // loader 不暴露 entries 时退化为 JSON 镜像
  }
  return fallback
}

function createConfigStore(ctx, initial) {
  const seed = publicConfig(initial)
  writeMirror(seed)
  let read = () => readMirror()
  let write = async (patch) => writeMirror({ ...readMirror(), ...patch })

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => {
      const settings = settingsCtx.settings
      if (!settings || typeof settings.describe !== 'function' || typeof settings.update !== 'function') return
      const ns = ownEntryId(ctx)
      if (ns === undefined) {
        ctx.logger?.warn?.('dsh-huangquan-theme: 找不到自己的 Loader 条目，设置只用本地镜像')
        return
      }
      const descriptor = () => {
        try {
          return settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === ns)
        } catch {
          return undefined
        }
      }
      read = () => {
        const value = descriptor()?.value
        const merged = publicConfig(value !== null && typeof value === 'object' ? value : seed)
        writeMirror(merged)
        return merged
      }
      write = async (patch) => {
        const revision = descriptor()?.revision
        const clean = sanitize({ ...read(), ...patch })
        try {
          await settings.update(ns, clean, revision)
        } catch (error) {
          if (error?.code !== 'SETTINGS_CONFLICT') throw error
          await settings.update(ns, clean)
        }
        writeMirror(clean)
        return clean
      }
    })
  }

  return {
    get: () => read(),
    update: async (patch) => {
      await write(patch)
      return read()
    },
  }
}

// ---------------------------------------------------------------------------
// HTTP 辅助
// ---------------------------------------------------------------------------

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'x-content-type-options': 'nosniff',
  })
  res.end(payload)
}

function localOnly(req, res) {
  if (!isLoopback(req.socket?.remoteAddress)) {
    jsonResponse(res, 403, { ok: false, error: 'local access only' })
    return false
  }
  const origin = req.headers?.origin
  if (origin) {
    let originHost
    try {
      originHost = new URL(origin).host
    } catch {
      originHost = undefined
    }
    if (!originHost || originHost !== req.headers.host) {
      jsonResponse(res, 403, { ok: false, error: 'origin mismatch' })
      return false
    }
  }
  return true
}

async function readJsonBody(req, limit = 128 * 1024) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > limit) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be a JSON object')
  return parsed
}

function streamImage(req, res, info) {
  res.writeHead(200, {
    'content-type': info.type,
    'content-length': info.size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(info.file)
  stream.on('error', () => {
    if (!res.headersSent) jsonResponse(res, 500, { ok: false, error: 'read failed' })
    else res.destroy()
  })
  stream.pipe(res)
}

/**
 * 读取浏览器半边当前的构建标识（从 lib/client.js 里解析 `const BUILD = '...'`）。
 * 页面拿到它就能判断自己是不是旧代码，从而自我重载 —— 避免"改了文件但页面不生效"。
 */
let clientBuildCache = { at: -1, value: '' }

function readClientBuild() {
  const file = join(PACKAGE_DIR, 'lib', 'client.js')
  try {
    const stat = statSync(file)
    if (clientBuildCache.at === stat.mtimeMs) return clientBuildCache.value
    const match = /const BUILD = '([^']+)'/.exec(readFileSync(file, 'utf8'))
    clientBuildCache = { at: stat.mtimeMs, value: match ? match[1] : '' }
    return clientBuildCache.value
  } catch {
    return ''
  }
}

function configView(store) {
  const config = store.get()
  const presets = listPresets()
  const active = resolvePreset(config.backgroundPreset)
  const flower = flowerInfo()
  return {
    ok: true,
    config,
    /** 磁盘上浏览器半边的构建号：客户端用它判断自己是否过期。 */
    clientBuild: readClientBuild(),
    // 表面 token 由 Host 算好下发，客户端照搬即可：
    // 以后调通透度只需改 Host，不必再刷新浏览器 bundle。
    tokens: surfaceTokens(config.maskOpacity),
    preset: active ? { id: active.id, label: active.label, file: active.file, url: active.url } : null,
    pet: presets.pet ? { id: presets.pet.id, file: presets.pet.file, url: presets.pet.url } : null,
    flower: flower
      ? { file: 'flower.png', cells: 4, cell: 512, url: `${ROUTES.flower}?v=${flower.mtime}` }
      : null,
    assets: { dir: ASSETS_DIR, count: presets.backgrounds.length, exists: existsSync(ASSETS_DIR) },
  }
}

function presetsView(store) {
  const config = store.get()
  const { backgrounds, pet } = listPresets()
  return {
    ok: true,
    selected: resolvePreset(config.backgroundPreset)?.id ?? '',
    items: backgrounds,
    pet: pet ? { id: pet.id, file: pet.file } : null,
  }
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

function createConfigHandler(store) {
  return async (req, res) => {
    if (!localOnly(req, res)) return
    if (req.method === 'GET' || req.method === 'HEAD') {
      jsonResponse(res, 200, configView(store))
      return
    }
    if (req.method !== 'PATCH' && req.method !== 'POST') {
      jsonResponse(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const patch = await readJsonBody(req)
      const unknown = Object.keys(patch).filter((key) => !(key in DEFAULTS))
      if (unknown.length > 0) {
        jsonResponse(res, 400, { ok: false, error: `unknown setting: ${unknown.join(', ')}` })
        return
      }
      await store.update(patch)
      jsonResponse(res, 200, configView(store))
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function createPresetsHandler(store) {
  return (req, res) => {
    if (!localOnly(req, res)) return
    jsonResponse(res, 200, presetsView(store))
  }
}

/** 花瓣素材（assets/flower.png，4 格横排雪碧图）。 */
function flowerInfo() {
  return imageInfo(join(PACKAGE_DIR, 'assets', 'flower.png'))
}

function createFlowerHandler() {
  return (req, res) => {
    if (!localOnly(req, res)) return
    const info = flowerInfo()
    if (!info) {
      jsonResponse(res, 404, { ok: false, error: 'flower sprite not found' })
      return
    }
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': info.size,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(info.file).pipe(res)
  }
}

function createAssetsHandler() {
  return (req, res) => {
    if (!localOnly(req, res)) return
    const pathOnly = String(req.url ?? '').split('?')[0]
    const fileName = decodeURIComponent(pathOnly.slice(ROUTES.assets.length))
    const info = resolveByName(fileName)
    if (!info) {
      jsonResponse(res, 404, { ok: false, error: 'asset not found' })
      return
    }
    streamImage(req, res, info)
  }
}

function createThumbHandler() {
  return async (req, res) => {
    if (!localOnly(req, res)) return
    let fileName = ''
    try {
      fileName = new URL(req.url ?? '/', 'http://localhost').searchParams.get('file') ?? ''
    } catch {
      fileName = ''
    }
    const info = resolveByName(fileName)
    if (!info) {
      jsonResponse(res, 404, { ok: false, error: 'asset not found' })
      return
    }
    if (info.size <= THUMB_MIN_BYTES) {
      streamImage(req, res, info)
      return
    }
    const thumb = await ensureThumb(info)
    if (!thumb) {
      streamImage(req, res, info)
      return
    }
    const stat = statSync(thumb)
    res.writeHead(200, {
      'content-type': 'image/jpeg',
      'content-length': stat.size,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(thumb).pipe(res)
  }
}

/**
 * 浏览器半边自检上报。插件出问题时先看这里：
 * %USERPROFILE%\.dsh\dsh-huangquan-theme\report.json
 */
/** 输入框四角装饰用的单朵花（assets/flower-corner.png）。 */
function createCornerFlowerHandler() {
  return (req, res) => {
    if (!localOnly(req, res)) return
    const info = imageInfo(join(PACKAGE_DIR, 'assets', 'flower-corner.png'))
    if (!info) {
      jsonResponse(res, 404, { ok: false, error: 'corner flower not found' })
      return
    }
    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': info.size,
      'cache-control': 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(info.file).pipe(res)
  }
}

// ---------------------------------------------------------------------------
// DeepSeek 余额（官方接口 + 凭据服务）
//
// 页面不能直接请求 api.deepseek.com：对方没有 CORS 头，带 Authorization 还会
// 触发预检，浏览器必然拦截；而且 API Key 绝不能下发到页面。
// 所以由 Host 用 ctx.credentials 解析 DEEPSEEK_API_KEY、在 Node 侧请求，
// 页面只通过 /balance 拿计算好的数字。
// ---------------------------------------------------------------------------

const BALANCE_API = 'https://api.deepseek.com/user/balance'
/** 页面每 3 秒轮询一次，服务端缓存比它更短，保证读数及时。 */
const BALANCE_TTL_MS = 2500
const BALANCE_TIMEOUT_MS = 8000
const BALANCE_KEY_REF = 'DEEPSEEK_API_KEY'

/** 由 ctx.inject(['credentials']) 填充；取不到时余额功能降级为“未配置”。 */
let credentialsRef = null
let balanceCache = { at: 0, payload: null }

function balanceFile() {
  return join(dataDir(), 'balance.json')
}

function readBalanceDaily() {
  try {
    const parsed = JSON.parse(readFileSync(balanceFile(), 'utf8'))
    return parsed !== null && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeBalanceDaily(record) {
  try {
    mkdirSync(dataDir(), { recursive: true })
    writeFileSync(balanceFile(), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  } catch {
    // 写不进去只影响“今日用量”的基线，不影响余额本身
  }
}

function todayStamp() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function toNumber(value) {
  const numeric = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(numeric) ? numeric : 0
}

async function resolveApiKey() {
  const credentials = credentialsRef
  if (!credentials || typeof credentials.resolve !== 'function') return { key: '', source: '' }
  try {
    // CredentialRef 在运行时就是环境变量名；解析每次现取，不缓存。
    const resolved = await credentials.resolve(BALANCE_KEY_REF)
    return { key: resolved?.value ?? '', source: resolved?.source ?? '' }
  } catch {
    return { key: '', source: '' }
  }
}

async function loadBalance() {
  const { key, source } = await resolveApiKey()
  if (key === '') return { ok: false, reason: 'missing-key', at: Date.now() }

  let response
  try {
    response = await fetch(BALANCE_API, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(BALANCE_TIMEOUT_MS) : undefined,
    })
  } catch (error) {
    return { ok: false, reason: 'network', detail: String(error?.message ?? error), at: Date.now() }
  }
  if (!response.ok) return { ok: false, reason: `http-${response.status}`, at: Date.now() }

  let body
  try {
    body = await response.json()
  } catch {
    return { ok: false, reason: 'bad-json', at: Date.now() }
  }
  const info = Array.isArray(body?.balance_infos) ? body.balance_infos[0] : null
  if (!info) return { ok: false, reason: 'no-balance-info', at: Date.now() }

  const currency = String(info.currency ?? 'CNY')
  const total = toNumber(info.total_balance)
  const toppedUp = toNumber(info.topped_up_balance)
  const granted = toNumber(info.granted_balance)

  // 官方接口不提供“今日用量”，用“当日首次观测余额 − 当前余额”近似；
  // 余额上涨（充值/发赠金）时重新立基线，避免出现负用量。
  const today = todayStamp()
  const previous = readBalanceDaily()
  let record = previous
  const startTotal = Number(previous?.startTotal)
  if (!previous || previous.date !== today || !Number.isFinite(startTotal) || total > startTotal) {
    record = { date: today, startTotal: total }
  }
  const todayUsed = Math.max(0, Number(record.startTotal ?? total) - total)
  writeBalanceDaily({ ...record, lastTotal: total, updatedAt: new Date().toISOString() })

  return {
    ok: true,
    at: Date.now(),
    currency,
    total,
    toppedUp,
    granted,
    todayUsed,
    // 用户要求的“充值余额 − 当前余额”近似（有赠金时会偏低，故单独给出且不为负）
    toppedUpMinusTotal: Math.max(0, toppedUp - total),
    available: body?.is_available !== false,
    keySource: source,
  }
}

async function balanceView(force = false) {
  if (!force && balanceCache.payload && Date.now() - balanceCache.at < BALANCE_TTL_MS) return balanceCache.payload
  const payload = await loadBalance()
  balanceCache = { at: Date.now(), payload }
  return payload
}

function createBalanceHandler() {
  return async (req, res) => {
    if (!localOnly(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      jsonResponse(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    let force = false
    try {
      force = new URL(req.url ?? '/', 'http://localhost').searchParams.get('refresh') === '1'
    } catch {
      force = false
    }
    try {
      jsonResponse(res, 200, await balanceView(force))
    } catch (error) {
      jsonResponse(res, 200, { ok: false, reason: 'failed', detail: String(error?.message ?? error), at: Date.now() })
    }
  }
}

// ---------------------------------------------------------------------------
// 浏览器 bundle 热更新
//
// 桌面版没有 dev watcher，改了 lib/client.js 页面不会自己换（bundle 按 URL+rev
// 缓存）。clientModules.rebuilt(id) 是 bundle 变更进入 graph 的唯一入口：调用它
// 会发布新 rev，页面的 HMR 接收器随即重新拉取该模块 —— 不需要重启应用。
// 这里做两件事：watch 文件变化自动发布 + 暴露一个手动触发的 POST 路由。
// ---------------------------------------------------------------------------

let clientModulesRef = null
let republishTimer = 0

function republishClientBundle(reason) {
  const modules = clientModulesRef
  if (!modules || typeof modules.rebuilt !== 'function') return { ok: false, reason: 'clientModules-unavailable' }
  try {
    const rev = modules.rebuilt(name)
    return { ok: true, rev: rev ?? null, reason }
  } catch (error) {
    return { ok: false, reason: 'rebuilt-failed', detail: String(error?.message ?? error) }
  }
}

function watchClientBundle(ctx) {
  const file = join(PACKAGE_DIR, 'lib', 'client.js')
  try {
    const watcher = watch(file, { persistent: false }, () => {
      // 编辑器保存常常触发多次事件，去抖后只发布一次
      if (republishTimer) clearTimeout(republishTimer)
      republishTimer = setTimeout(() => {
        republishTimer = 0
        const result = republishClientBundle('file-change')
        if (result.ok) ctx.logger?.info?.(`dsh-huangquan-theme: 已发布新的浏览器 bundle (rev=${result.rev})`)
      }, 350)
    })
    ctx.effect(() => () => {
      if (republishTimer) clearTimeout(republishTimer)
      watcher.close()
    }, 'dsh-huangquan-theme: client bundle watch')
  } catch (error) {
    ctx.logger?.warn?.(`dsh-huangquan-theme: 无法监听 lib/client.js（${error?.message ?? error}）`)
  }
}

function createRepublishHandler() {
  return (req, res) => {
    if (!localOnly(req, res)) return
    if (req.method !== 'POST' && req.method !== 'GET') {
      jsonResponse(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    jsonResponse(res, 200, republishClientBundle('manual'))
  }
}

function createReportHandler() {
  return async (req, res) => {
    if (!localOnly(req, res)) return
    const file = join(dataDir(), 'report.json')
    const readAll = () => {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8'))
        return Array.isArray(parsed?.reports) ? parsed.reports : []
      } catch {
        return []
      }
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      jsonResponse(res, 200, { ok: true, reports: readAll() })
      return
    }
    if (req.method !== 'POST') {
      jsonResponse(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    try {
      const body = await readJsonBody(req)
      const reports = [...readAll().slice(-19), { receivedAt: new Date().toISOString(), ...body }]
      mkdirSync(dataDir(), { recursive: true })
      writeFileSync(file, `${JSON.stringify({ reports }, null, 2)}\n`, 'utf8')
      jsonResponse(res, 200, { ok: true })
    } catch (error) {
      jsonResponse(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

// ---------------------------------------------------------------------------
// 插件入口
// ---------------------------------------------------------------------------

export function apply(ctx, config = {}) {
  const store = createConfigStore(ctx, config)

  // 凭据服务是可选的：取不到时余额气泡显示“未配置”，其余功能不受影响。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['credentials'], (credentialCtx) => {
      credentialsRef = credentialCtx.credentials ?? null
    })
    // 浏览器 bundle 的热发布必须走 clientModules.rebuilt()
    ctx.inject(['clientModules'], (modulesCtx) => {
      clientModulesRef = modulesCtx.clientModules ?? null
    })
  }
  watchClientBundle(ctx)

  // 结构化注入行：Web（渲染进 index.html）与 Electron（boot 载荷）共用。
  ctx.on(
    'webserver/index-inject',
    (table) => {
      table.push(...buildStaticInjections(store.get()))
    },
    { prepend: true },
  )

  const server = ctx.webServer
  if (!server || typeof server.register !== 'function') {
    ctx.logger?.warn?.('dsh-huangquan-theme: webServer 不可用，只做首帧样式注入')
    return
  }

  const register = (route, label) => {
    ctx.effect(() => server.register(route), `dsh-huangquan-theme: ${label}`)
  }

  register({ kind: 'exact', path: ROUTES.config, handler: createConfigHandler(store) }, 'config route')
  register({ kind: 'exact', path: ROUTES.presets, handler: createPresetsHandler(store) }, 'presets route')
  register({ kind: 'prefix', path: ROUTES.assets.slice(0, -1), handler: createAssetsHandler() }, 'assets route')
  register({ kind: 'exact', path: ROUTES.thumb, handler: createThumbHandler() }, 'thumbnail route')
  register({ kind: 'exact', path: ROUTES.flower, handler: createFlowerHandler() }, 'flower sprite route')
  register({ kind: 'exact', path: ROUTES.cornerFlower, handler: createCornerFlowerHandler() }, 'corner flower route')
  register({ kind: 'exact', path: ROUTES.balance, handler: createBalanceHandler() }, 'balance route')
  register({ kind: 'exact', path: ROUTES.republish, handler: createRepublishHandler() }, 'bundle republish route')
  register({ kind: 'exact', path: ROUTES.report, handler: createReportHandler() }, 'diagnostics route')

  const { backgrounds } = listPresets()
  ctx.logger?.info?.(`dsh-huangquan-theme: 就绪（${backgrounds.length} 个预设，目录 ${ASSETS_DIR}）`)
}
