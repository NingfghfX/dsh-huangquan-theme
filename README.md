# dsh-huangquan-theme · 黄泉外观

给 **DeepSeek Harness（DSH）Web / Desktop** 用的一套「黄泉」主题插件：本地壁纸、可调蒙版与毛玻璃、输入框外的彼岸花环、右下角呼吸挂件、背景斜雨、鼠标花瓣拖尾，以及一个点挂件才弹出的**黄泉外观工作台**（配置直接写进 DSH 的插件 Config，改完即时生效）。

架构参照 [`hyposelen1a/dsh-columbina-theme`](https://github.com/hyposelen1a/dsh-columbina-theme)：Host 侧导出 Schemastery `Config` 并用 `webserver/index-inject` 做首帧注入，Client 侧负责运行时渲染。

> 适配 DSH `0.2.1-rc.3`（`0.2.x` 系列）。DSH 还在 preview 阶段，接口可能变；升级后若失效请先看 [CHANGELOG](#) 与 issue。

---

## 功能

| | 功能 | 说明 |
|---|---|---|
| 🖼 | **全屏壁纸** | 扫描 `assets/backgrounds/`，预设网格点选即换；壁纸层走 `body::before`，首帧就生效（Web 与 Electron 都覆盖） |
| 🌫 | **蒙版 + 毛玻璃** | 蒙版不透明度 0–1（同时驱动主表面通透度，浮层保持不透明），壁纸可加 0–50px 模糊 |
| ❀ | **输入框花环** | 在输入框**外框外侧**铺一圈彼岸花：四个角各自控制朵数（0–6）与大小（×0.5–×2），朵数多了会沿边框连成一串、包住转角 |
| 🐾 | **呼吸挂件** | `assets/backgrounds/pet.png`，浮动 + 可拖拽；**点一下**弹出工作台浮层 |
| 🌧 | **背景雨** | 全屏斜雨，默认右上 → 左下；可调大小、密度（0–10）、倾角（0–60°） |
| ✨ | **花瓣拖尾** | 鼠标划过飘落彼岸花（最多 4 朵同屏），缓慢下坠 + 自转 + 正弦摇摆 + 淡出，周围散出浅紫荧光点 |
| 💰 | **余额气泡** | 挂件旁的对话气泡，显示 DeepSeek 余额与今日用量，**每 3 秒**刷新 |

> 截图：把一张运行截图保存为 `docs/screenshot.png` 后取消下面这行注释即可。
> <!-- ![screenshot](docs/screenshot.png) -->

---

## 安装

### 方式一：插件管理器（推荐）

在 DSH 里打开 **设置 → 插件 → 从本地目录安装**，选择本仓库目录；或让 Agent 调用插件管理器的 `install_bundle`，目标填本仓库的**绝对路径**。

> 注意：**不要**用 `dsh plugin --profile desktop add ...`，桌面版的 profile 由 Electron 独占管理，CLI 会直接报错。

### 方式二：手动链接

把本目录放进 `%USERPROFILE%\.dsh\profiles\<profile>\node_modules\` 下并在 profile 的 `package.json` 里登记（不推荐，插件管理器会覆盖）。

### 安装后

1. 插件管理器会把它写进 profile 的 `cordis.patch.yml` 并激活 **Host** 半边；
2. **浏览器半边需要页面重新加载一次**（桌面版请从托盘退出后重开；`Ctrl+R` 在部分 Electron 版本没有绑定）。之后本插件会自检版本：Host 下发 `clientBuild`，页面发现自己是旧代码会自动重载，升级不用再手动刷新。

---

## 工作台（配置项）

右下角挂件 **点一下** → 浮层「黄泉外观工作台」；`Esc` / 点浮层外 / `✕` 收起。

| 分组 | 配置 | 范围 | 默认 |
|---|---|---|---|
| 壁纸 | `backgroundPreset` | `assets/backgrounds` 里的文件名（不含扩展名），空 = 第一张 | `''` |
| 蒙版 | `maskOpacity` | 0 – 1（步进 0.05） | `0.5` |
| | `blurAmount` | 0 – 50 px | `0` |
| 挂件 | `petSize` | 50 – 300 px | `150` |
| 花环 | `flowerScale` | ×0.5 – ×2（整体尺寸，叠加在各角大小之上） | `1` |
| | `cornerCountTL/TR/BL/BR` | 0 – 6 朵 | `2 / 5 / 1 / 1` |
| | `cornerSizeTL/TR/BL/BR` | ×0.5 – ×2 | `1` |
| 雨 | `rainToggle` | 开 / 关 | `开` |
| | `rainSize` | ×0.5 – ×3 | `1` |
| | `rainDensity` | 0 – 10（0 = 不下雨，10 ≈ 两倍雨量） | `5` |
| | `rainAngle` | 0 – 60°（0 = 垂直，越大越斜） | `25` |
| 花瓣 | `particleToggle` | 开 / 关 | `开` |
| | `particleDensity` | 0 – 10（同屏 1–4 朵、间隔 1.2–3.4s） | `3` |

配置由 DSH 的 settings 服务持久化到 profile 的 `cordis.patch.yml`（`dsh-huangquan-theme` 条目的 `config` 层），同时镜像一份到 `$DSH_HOME/dsh-huangquan-theme.json`。

### 余额气泡

- **API Key 只留在 Host**：通过 DSH 的凭据服务读取 `DEEPSEEK_API_KEY`，由 Host 请求 `https://api.deepseek.com/user/balance`，页面只拿算好的数字 —— 浏览器直连官方接口会被 CORS 拦，也不该把 Key 下发到页面。
- 显示 `余额 ¥xx.xx`，第二行是**今日用量**（近似值：当日首次观测余额 − 当前余额；充值/发赠金时自动重立基线，不会出现负数）。
- 未配置 Key 时气泡显示「未配置 DeepSeek Key」，其余功能不受影响。
- 每 3 秒轮询、Host 侧缓存 2.5s。若看到 `http-429` 说明被限流，把间隔调大即可。

---

## 自定义

### 换壁纸 / 加预设

把图片丢进 `assets/backgrounds/`（支持 `png / jpg / jpeg / webp / gif / bmp`），重启 DSH 后出现在工作台网格里。文件名即预设 id。

- 大于 300KB 的图会由 Host 用 Windows 自带的 `System.Drawing` 生成 640px 缩略图并缓存到 `$DSH_HOME/dsh-huangquan-theme/thumbs/`（不引入 sharp 等原生依赖）；
- **图片类型按内容嗅探**，扩展名写错也能正确显示；
- 挂件固定取 `assets/backgrounds/pet.png`。

### 换花瓣

`assets/flower.png` 是 **4 格横排雪碧图**（每格 512×512，一朵花）。替换时保持这个排布即可，四角花环与飘落花瓣都会从这 4 格里随机取形状。

---

## 目录结构

```
src/index.js        Host：Config、settings 读写、index-inject、assets/thumb/balance/report 路由
lib/client.js       浏览器：壁纸与蒙版、花环、挂件、雨、花瓣、工作台浮层、余额气泡
assets/backgrounds/ 壁纸预设 + pet.png
assets/flower.png   花瓣雪碧图（4 格）
cordis.patch.yml    Loader 补丁：insert 一行 id=dsh-huangquan-theme
locale/*.json       Plugin Manager 里显示的标题与描述
```

### 自检

插件会把浏览器侧的真实状态写到：

```
%USERPROFILE%\.dsh\dsh-huangquan-theme\report.json
```

包含当前 `build`、壁纸/蒙版 CSS 变量、各层元素的 `background-color` 链（用来判断壁纸是不是被某个不透明面板挡住）、花环挂载点与外框矩形、雨的滴数等。反馈问题请附上这个文件。

---

## 开发

```bash
npm install          # 只有一个运行时依赖：@deepseek-ai/schemastery
```

- 改 `lib/client.js`：Host 会监听文件并通过 `clientModules.rebuilt()` 发布新 bundle，页面自检到版本不一致会自动重载；
- 改 `src/index.js`：需要在插件管理器里把本插件 **禁用再启用**（或重启 DSH）才会重新加载 Host 模块；
- 手动触发发布：`curl -X POST http://127.0.0.1:<port>/plugins/dsh-huangquan-theme/republish`。

## 许可

[MIT](LICENSE)。`assets/` 下的图片素材随插件分发，二次使用请自行确认授权。
