> **来源声明 / Attribution**：小鲸鱼本体来自 **MeteorNOX** 的 [DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)（MIT 协议）；独立 Electron 桌面版来自 **GoRmiTz**。此分支增加原生 Codex 额度读取、中文额度界面和 Windows 安装功能。保留原作者许可及署名。本项目是非官方衍生版本。

> **AI 开发声明**：本 fork 的 Codex 额度读取、中文额度界面、Windows 安装及开机自启、Chrome/Edge 网页提醒扩展等新增功能，主要由 **OpenAI Codex（AI）** 按 RetaeFengs1078 的需求编写、构建和测试；气泡动画修复也由 Codex 完成。原鲸鱼插件与桌面版的作者分别是 MeteorNOX 和 GoRmiTz，不能将他们的作品归为 AI 创作。详见 [AI 开发说明](AI_DEVELOPMENT.md)。

---

# 鲸鱼余额 · 桌面透明挂件

## Codex 原生额度版

### Windows 安装与应用启动联动

下载安装包，解压后双击 `安装鲸鱼.cmd`。安装脚本将完整程序复制到当前用户的 `%LOCALAPPDATA%\Programs\CodexWhaleWidget`，在开始菜单建立「Codex 额度小鲸鱼」入口，并注册到 Windows「已安装的应用」；不需要管理员权限。**默认登录 Windows 后自动启动小鲸鱼**。原「打开 VS Code/ChatGPT 时启动」功能仍在鲸鱼及托盘设置中，默认关闭；开机自启动开启时，该开关置灰，关闭开机自启动后才可启用。关闭 VS Code 或 ChatGPT 不会关闭已启动的小鲸鱼。Windows「已安装的应用」中可卸载，卸载时保留 `config.json`、`data` 和 `sounds` 等个人配置。

### Codex 对话完成提醒

小鲸鱼每 3 秒检查本机 Codex 会话日志中的 `task_complete`，完成时直接打开**点击鲸鱼时使用的原有气泡**，显示来源与对话标题，并播放内置小黄鸭音效（遵循音量和静音设置）。支持本机 **Codex 客户端**、**VS Code Codex 插件**及命令行；过滤后台子任务，启动时不补弹旧提醒。0.4.3 修复了完成时间为 Unix 秒数时提醒被丢弃的问题，本机桌面端与 VS Code 的现有日志均已验证。对话标题优先取本机 Codex 数据库，读不到时显示首条提问或「未命名对话」。不读取聊天正文用于网络传输。

**0.6.1：暂时关闭完成气泡的点击跳转。**点击气泡只会关闭提醒；来源、对话标题和小黄鸭音效继续正常显示。0.6.0 的回跳代码仍保留，当前版本默认不调用。

VS Code Remote SSH 可通过现有 SSH 配置读取远端 `~/.codex/sessions`。本机 `config.json` 的 `CODEX_REMOTE_SSH_HOSTS` 默认为 `["gpu-5", "gpu-7"]`；换电脑时可改成自己的 SSH Host 别名。需要 SSH 免交互登录且远端有 `python3`；登录失败时会退避重试。远端会话标题和完成时间只返回本机小鲸鱼，不上传第三方。

### Chrome 与 Edge 的 ChatGPT 网页提醒

**便携下载**：[从 GitHub Releases 下载桌面程序及 Chrome / Edge 扩展](https://github.com/RetaeFengs1078/DeepSeek-Balance-Whale-Widget-Desktop/releases)。下载对应浏览器的 ZIP 并解压，保留整个「小鲸鱼浏览器扩展」文件夹；在浏览器扩展管理页打开开发者模式，选择这个包含 `manifest.json` 的文件夹加载。两款浏览器使用相同源码。现有 0.6.0 浏览器扩展可继续搭配 0.6.1 桌面程序，无需重新加载。详细步骤见[扩展安装说明](browser-extension/README.md)。

0.5.0 起提供 [浏览器扩展](browser-extension/README.md)，Chrome 和 Edge 可分别安装同一份扩展。扩展观察 `chatgpt.com` 中**你提交的新消息**，页面回复结束后把浏览器名称和对话标题交给本机鲸鱼，继续使用原有气泡和小黄鸭提示。扩展图标中可检查连接并发送测试提醒。桌面鲸鱼须先运行 **0.5.1 或更新版本**；0.5.1 修复 Edge 的只读连接检查误报离线问题，扩展本身无需重装。无需 API Key。扩展仅请求 `chatgpt.com` 页面和 `127.0.0.1` 本机地址权限，不发送回复正文。

这个提醒依据网页元素判断，网站改版可能需要更新扩展；关闭的标签页、其他设备和后台云端任务不保证收到。网页 ChatGPT 与本机 Codex 会话不是同一套日志：[OpenAI 官方说明](https://help.openai.com/en/articles/20001275-chatgpt-work-and-codex)将 Chat/Work 与桌面 Codex 区分开。开发者 API 的[完成 Webhook](https://developers.openai.com/api/docs/guides/webhooks)也不提供无密钥读取现有网页对话的能力。

扩展 **0.5.2** 放宽了对网页消息节点稳定性的要求，增加“正在生成 → 结束”的识别路径；弹窗会显示最近的网页检测状态。**0.6.0** 增加与鲸鱼的本机回跳连接，扩展只记住原标签页的位置，不保存或传输回复正文。升级已安装的解压扩展时，在 Chrome/Edge 扩展管理页点「重新加载」，然后刷新 `chatgpt.com` 标签页。

### 视频播放兼容性

0.4.2 起，Windows 桌面窗口的实际尺寸会跟随鲸鱼缩到局部区域，菜单或提示出现时才按需扩展；系统层面的鼠标命中区也始终限制在可见内容附近。点击鲸鱼不会再短暂占用整个屏幕，移开指针后浏览器可以接收滚轮。拖动鲸鱼时保留指针捕获，松开后窗口恢复到局部区域。菜单打开时仍可输入 API Key。

鲸鱼上方的常显额度面板现在默认关闭。点击鲸鱼仍可看到额度气泡；若要恢复常显面板，可在鲸鱼菜单或托盘菜单中勾选「常显额度面板」。

现在无需 DeepSeek Harness、Codex 桌面端或 OpenAI API Key，即可直接运行 Windows 小鲸鱼。程序只读 `%USERPROFILE%\.codex\sessions`；如果设置了 `CODEX_HOME`，则从该目录的 `sessions` 读取，并兼容 `archived_sessions`。它从 `rollout-*.jsonl` 中挑选最新的有效 `rate_limits` 快照，按 `window_minutes` 区分 5 小时（300）和每周（10080）额度。只出现一个窗口时只显示该窗口。开启常显卡片后会显示已用、剩余百分比和本地时间的重置时刻。

便携版可直接双击 `WhaleWidget.exe`，不必填写 `config.json`。鲸鱼每 60 秒自动刷新；点击鲸鱼、挂件菜单中的「Codex 额度 → 立即刷新」也可手动刷新。没有 DeepSeek Key 时，鲸鱼自动进入 Codex 模式；如果填写了 DeepSeek Key，原有的余额功能继续可用。托盘、拖动、置顶、动画与音效功能沿用原桌面版。

源码验证：`node --test test/*.test.mjs`。打包：`npm install` 后运行 `npm run dist`，成品位于 `dist/WhaleWidget-win32-x64/`，分发时须保留整个文件夹。无需上传或修改 Codex 会话文件。

> 把只能在 DeepSeek Harness 里用的「小鲸鱼余额挂件」，搬出来变成一个**无边框、背景透明、只显示小鲸鱼**的 Windows 桌面悬浮窗。
>
> **English:** A standalone Windows desktop version of the DeepSeek balance whale widget — frameless, transparent, and packaged as a Windows application.

**一句话说清三者关系：**

| | 是什么 | 谁做的 |
|---|---|---|
| **原项目**<br>DeepSeek-Balance-Whale-Widget | DeepSeek Harness 网页界面右下角的余额挂件插件 | **MeteorNOX** |
| **桌面版来源**<br>DeepSeek-Balance-Whale-Widget-Desktop | 套在原项目外面的桌面壳，让它能独立运行 | **GoRmiTz** |
| **此分支** | 原生读取 Codex 额度、中文额度界面、Windows 安装及自启 | **OpenAI Codex（AI）参与开发；RetaeFengs1078 提出需求并维护 fork** |
| **原版本体** | `vendor/dsh-whale-widget/` 保留原插件，并加入桌面缩放及菜单点击修补 | **MeteorNOX；此 fork 的菜单修补由 OpenAI Codex 完成** |

**GoRmiTz 桌面版新增的能力**：Electron 无边框透明窗口、鼠标穿透、窗口置顶、任意位置拖动、自定义音效目录、独立的「假 ctx」宿主服务、打包成 exe。此 fork 的 Codex 与安装功能由 OpenAI Codex 参与开发，见文首 AI 声明。

**本仓库没能做到的事**：原插件里的「每轮对话消耗统计」依赖 DSH 的会话事件流，离开 DSH 就没有数据源，这里默认关闭了。也就是说，**本仓库的功能是原项目的子集，不是超集**。想要完整的原版体验，请直接用原项目。

---

## 两种形态，共用同一套服务

| 形态 | 启动方式 | 说明 |
|---|---|---|
| **桌面透明挂件**（推荐） | `start-desktop.bat` | Electron 无边框透明窗口，只显示小鲸鱼，透明处鼠标穿透 |
| 浏览器窗口 | `start-browser.bat` | Chrome/Edge 应用模式，不透明，免安装 Electron |

## 快速开始

**第一步：运行 Codex 模式**

不需要 Key。直接双击 `start-desktop.bat` 即可。已安装并运行过 Codex CLI 或 Codex 应用、会话日志含额度快照时，小鲸鱼自动显示额度。

**可选：继续使用 DeepSeek 余额功能**

把 `config.example.json` 复制一份改名为 `config.json`，然后把 `DEEPSEEK_API_KEY` 填进去（DeepSeek 开放平台创建的 `sk-` 开头密钥）：

```json
{
  "DEEPSEEK_API_KEY": "sk-xxxxxxxxxxxxxxxx",
  "DEEPSEEK_PLATFORM_TOKEN": ""
}
```

`DEEPSEEK_PLATFORM_TOKEN` 留空即可，默认走「小鲸鱼记账」模式（用余额差值自动记今日已用，跨天归零）。这一整套用量模式都是原作的功能，这里只是沿用。

**第二步：双击 `start-desktop.bat`**

首次运行会装 Electron（约 1–2 分钟，只用这一次）。之后右下角就会出现小鲸鱼。

**第三步（可选）：打包成 exe**

双击 `build-exe.bat`，产物在：

```text
dist\WhaleWidget-win32-x64\
```

里面的 `WhaleWidget.exe` 就是成品（约 246MB，整个文件夹约 370MB）。**要运行必须整个文件夹一起保留**，不能只拷 exe。

打包后首次运行会在 exe 同目录自动生成可选的 `config.json` 和 `data/`。

> 未签名的 Electron 程序可能被 Windows 安全中心误报。如果 exe 打不开或提示已隔离：
> Windows 安全中心 → 病毒和威胁防护 → 保护历史记录 → 还原，或把该文件夹加进排除项。
> 不想打包的话，直接 `start-desktop.bat` 从源码运行，效果完全一样。

## 窗口行为

- 无边框 + 背景透明，只有鲸鱼本体可见
- **始终置顶**：默认开启，被其他窗口盖住时会自动抢回层级（Electron 切换鼠标穿透时会丢 TOPMOST，程序在每次切换后、失焦时、每 10 秒都会重新断言一次）
- **可以拖到屏幕任意位置**：窗口覆盖所有显示器的可用区域（不含任务栏），所以挂件的可拖范围就是整块屏幕，支持拖到第二块显示器
- **透明区域鼠标穿透**：可以正常点击下面的窗口；鼠标移到鲸鱼上才接管（拖拽、点击都正常）
- 始终置顶、不占任务栏；托盘里有小鲸鱼图标，右键可「编辑 config.json / 打开数据目录 / 在浏览器中打开 / 退出」
- 接拔外接屏、改分辨率后窗口会自动重新覆盖整屏
- 托盘图标 → 退出，是正常关闭方式

## 在挂件里填 API Key

不用去翻文件：悬停鲸鱼右上角打开汉堡菜单，最下面有两项扩展设置。

- **API Key**：密码框里粘贴 `sk-` 开头的密钥 → 点「保存」→ 自动写入 `config.json` 并刷新页面。已经配置过的话，输入框会提示「已配置 ••••5678」（只显示后四位）
- **窗口置顶**：勾选框，取消后鲸鱼会被普通窗口盖住。状态存在 `data/.whale-settings.json`，托盘右键菜单里也能切换

写入接口是 `/dsh-whale/config`（只接受 `DEEPSEEK_API_KEY` 和 `DEEPSEEK_PLATFORM_TOKEN` 两个键，其他键一律拒绝）。

## 自定义音效

程序会在 `config.json` / exe 同目录自动建一个 **`sounds` 文件夹**，把音频文件直接丢进去就行，支持 mp3 / wav / ogg / m4a / flac / aac / opus / webm。

菜单里「音效包」下拉会列出扫描到的音效，旁边有「刷新」（重新扫描）和「文件夹」（直接打开该目录）两个按钮。

命名规则：

- 想让**按下和松手用不同声音**：两个文件用同一前缀 + `_press` / `_release`
  ```
  mysound_press.mp3
  mysound_release.mp3
  ```
  也认 `-press`/`-release`、`down`/`up`、`按下`/`松手`
- **只有一个文件**：按下和松手都用这一个文件

实现上，挂件本身只认内置的「小黄鸭 / 音效1」两套，所以这里是在页面侧包了一层 `window.Audio`，把请求改写到 `?set=c:<包名>`，服务端再按包名返回对应文件；选「内置」时不改写，完全走原逻辑。选择存在 `data/.whale-settings.json`。

## 挂件用法

以下这些都是**原项目已有的功能**，这里原样沿用，没有任何改动：

- 余额每 60 秒自动刷新；点一下鲸鱼立即刷新
- 再点一下鲸鱼：随机台词气泡（5 秒后自动收起）
- 悬停鲸鱼右上角：汉堡菜单，可调大小、音效开关与音量、用量模式、峰谷提示文案，外加本仓库加的 **API Key** 和 **窗口置顶**
- 拖动鲸鱼：会吸附到四边，拖到左边时整体水平镜像翻转
- 大小和位置会记住（配置在 `data/`，位置在浏览器 localStorage）

**默认大小是 0.6 倍（鲸鱼本体约 89px）**，在菜单里随时可调。原插件的最小档是 0.6；桌面版将 vendored 副本里的 `MIN_SCALE` 改成了 0.3。本 fork 又修复了小尺寸时菜单图标部分区域点不开的问题。两处改动详见 `NOTICE`。

## 目录说明

```text
DeepSeek-Balance-Whale-Widget-Desktop/
├── src/main.js         # 【我写的】Electron 主进程：透明无边框窗口 + 托盘 + 鼠标穿透
├── src/preload.js      # 【我写的】只向页面暴露「桌面模式标记」和「鼠标穿透开关」
├── server.mjs          # 【我写的】假 ctx + HTTP 服务（可被命令行或主进程调用）
├── index.html          # 【我写的】窗口页面（挂件脚本会自动注入到 </body> 前）
├── config.json         # 填你的 DEEPSEEK_API_KEY
├── defaults/           # 首次运行时播种到 data/ 的默认挂件配置
├── data/               # 运行时数据（尺寸配置 .dshw-size.json、记账 .dshw-usage.json）
├── LICENSE             # 我这部分代码的 MIT 协议
├── NOTICE              # 版权归属、改动声明、素材授权边界
├── start-desktop.bat   # 启动桌面透明挂件
├── start-browser.bat   # 启动浏览器窗口版
├── build-exe.bat       # 打包 exe
└── vendor/
    └── dsh-whale-widget/   # 【原作者 MeteorNOX 的作品】原版插件，仅改 1 行
        ├── LICENSE         #   原作者的 MIT 协议（原样保留）
        ├── package.json
        ├── lib/index.js
        └── assets/         #   小鲸鱼图片与音效（美术资源，见下方声明）
```

## 原理：为什么换个地方要写"假 ctx"

原插件 `vendor/dsh-whale-widget/lib/index.js` 导出的是 cordis 风格插件（`name` / `inject` / `apply`），它只用到宿主的 5 个能力：

| 插件用到的 | DSH 里的实现 | 这里的实现 |
|---|---|---|
| `ctx.webServer.register({kind,path,handler})` | DSH 内置 Web 服务 | `node:http` 路由表 |
| `ctx.webServer.tapIndex(html)` | 往 DSH 首页插 script | 往 `index.html` 插同一段 script |
| `ctx.credentials.resolve(key)` | DSH 凭据服务 | 环境变量 → `config.json` |
| `ctx.on('session/event')` | DSH 会话事件流 | 空实现（每轮消耗统计已关闭） |
| `ctx.effect(fn)` | cordis 生命周期 | 收集 disposer |

桌面宿主主要靠这 5 个接口适配。升级插件时请保留 `MIN_SCALE` 调整和菜单点击修补，具体位置见 `NOTICE`。

## 鼠标穿透是怎么做的

不用「转发每一次鼠标移动」那套（整屏窗口下代价太高），改成两级配合：

1. 窗口默认 `setIgnoreMouseEvents(true)`，**不转发**——透明区完全不吃事件，空闲时渲染进程零唤醒
2. 渲染进程每 300ms 检查一次鲸鱼矩形，**只在位置真的变了**才通过 IPC 告诉主进程
3. 主进程每 60ms 用 `screen.getCursorScreenPoint()` 判断光标是否落在鲸鱼矩形内（外扩 8px），命中才 `setIgnoreMouseEvents(false)`
4. 拖拽中 / 菜单展开时由渲染进程置 `force` 标志强制接管，避免拖快了中途掉线

体感延迟约 60ms，代价是从「每次鼠标移动都唤醒渲染进程」降到「每秒十几次取一次光标坐标」。

## 性能优化点

- **鼠标事件不转发**：如上，透明区不产生任何渲染进程开销
- **砍掉每秒轮询**：挂件本体无条件每秒请求一次 `last-turn.json`（每轮消耗统计用，这里没有数据源），桌面模式下把该请求就地短路，省掉每分钟 60 次请求与唤醒
- **位置上报去重**：只在鲸鱼矩形变化时发 IPC，静止时零通信
- **窗口位置缓存**：光标轮询不再每次去问窗口坐标，只在 move/refit 时更新
- **保留后台节流**：`backgroundThrottling: true`（默认），窗口被完全遮挡时 Chromium 自动降频
- 无阴影、无边框、不参与任务栏，合成负担最小

## 故障排查

- **启动就闪退**：日志里出现 `GPU process isn't usable`。程序会自动以安全模式（禁用 Chromium 沙箱）重启一次。如果还不行，手动设环境变量 `WHALE_SAFE=1` 再启动。
- **背景是黑的、不透明**：说明合成器没起来。试试在托盘退出后，右键以「软件渲染」方式启动（设 `WHALE_SAFE=1`）；极少数显卡驱动下透明窗口需要开启系统的「透明效果」。
- **鲸鱼不出现**：确认 `config.json` 里 Key 填了没；托盘 → 在浏览器中打开，能看到同样的页面，方便判断是窗口问题还是数据问题。
- **端口冲突**：默认 8788 起，被占用会顺延到 8789、8790…（最多试 10 个）。也可以设 `WHALE_PORT` 指定。

## 已知限制

- **「每轮对话消耗统计」不可用**：该功能依赖 DSH 的会话事件流，独立宿主里没有数据来源，已在默认配置里关闭。将来想要，加一个 `POST` 上报接口，任何工具调用完把 token 数推过来即可。**这是本仓库相对原项目的功能缺失，不是原项目的问题。**
- 插件源码里有一批 `D:/TestBox/deepseek/...` 的硬编码兜底路径，是原作者本机的残留，找不到会自动跳过，不影响使用。
- 打包体积约 200MB（Electron 运行时自带 Chromium），这是 Electron 应用的常态。

---

## 来源与署名

**本仓库是二次开发作品，小鲸鱼本体的设计与实现归原作者 MeteorNOX。**

| 内容 | 作者 | 协议 | 位置 |
|---|---|---|---|
| 小鲸鱼形象、全部界面与交互、余额逻辑、峰谷定价、音效系统、随机台词 | **[MeteorNOX](https://github.com/MeteorNOX)** | MIT | `vendor/dsh-whale-widget/`（含原作者原版 LICENSE） |
| 桌面壳：无边框透明窗口、鼠标穿透、置顶、自由拖动、自定义音效、独立宿主服务、exe 打包 | GoRmiTz | MIT | `src/`、`server.mjs`、`index.html`、`package.json` |
| 此 fork 的 Codex 读取、中文界面、安装功能和菜单修补 | OpenAI Codex（AI），根据 RetaeFengs1078 的需求 | MIT | `src/`、`installer/` 等增改文件 |

- 原项目主页：<https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget>
- 原作者主页：<https://github.com/MeteorNOX>

### 对原作者代码的改动

桌面版降低最小缩放值，让挂件能做得更小：

```js
// vendor/dsh-whale-widget/lib/index.js
var MIN_SCALE = 0.3   // 上游原值 0.6
```

本 fork 还让上游的点击拦截器放行菜单按钮、菜单和气泡，修复小鲸鱼尺寸下菜单图标只有顶部可点的问题。升级上游版本后需要重新应用这两处改动。

### 关于美术与音频素材

原项目的鲸鱼图片（`assets/*.png`、`rua.gif`）与音效（`assets/*.mp3`）属于**原作者的美术与音频创作**，**不在 MIT 协议覆盖范围内**——MIT 只管代码，不管美术和音频。

本仓库随上游一并分发这些素材，仅作非商业的技术演示与自用。**如果要商业分发，必须先联系原作者 [MeteorNOX](https://github.com/MeteorNOX) 取得素材授权，或者自行替换素材文件**（替换 `assets/` 下同名文件即可，不用改代码）。

### 与原项目的关系

本仓库是独立的下游仓库，不是原项目的 fork，与原作者没有合作关系或背书关系。桌面壳相关的问题请提在本仓库。涉及权益问题时以原作者意愿优先。

## 开源协议

- **桌面版代码与此 fork 的增改**：MIT；保留 GoRmiTz 的原有版权声明及 AI 开发记录，见 [`LICENSE`](./LICENSE)、[`NOTICE`](./NOTICE) 和 [`AI_DEVELOPMENT.md`](./AI_DEVELOPMENT.md)
- **上游组件**：MIT，© 2026 MeteorNOX，见 [`vendor/dsh-whale-widget/LICENSE`](./vendor/dsh-whale-widget/LICENSE)（原样保留）

完整的版权归属、改动声明、素材授权边界与第三方依赖清单，见 [`NOTICE`](./NOTICE)。

## 路线图

已规划但尚未实现：

- **随 CLI 启动**：检测到 Claude CLI / WorkBuddy / Codex 等终端会话启动时自动拉起挂件，退出后跟随退场。
- **静默模式**：平时挂件自动降低不透明度（近乎隐形），只在余额发生变化时短暂恢复到全不透明。

两者可叠加——静默模式下即使 CLI 触发启动，也只在有变化时显形。

---

## English

A standalone Windows desktop port of the **DeepSeek balance whale widget**. The original widget only runs inside DeepSeek Harness (DSH); this project wraps it in an Electron shell so it runs on its own as a frameless, transparent, click-through floating window that shows nothing but the whale.

**Attribution.** This is an unofficial derivative of [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) (MIT), by **MeteorNOX**. The whale itself — art, UI, balance logic, pricing, sounds, quotes — is the original author's work. This repo only adds the desktop shell. Not affiliated with or endorsed by the original author.

**What this repo adds:** frameless transparent window, mouse click-through on empty areas, always-on-top, free dragging anywhere on screen, custom sound folder, a standalone host service (fake `ctx` shim replacing the 5 DSH host APIs), and `.exe` packaging.

**What's missing:** the per-turn cost statistic depends on DSH's session event stream and is disabled here. In other words this is a *subset* of the original, not a superset.

**Quick start**

1. Copy `config.example.json` to `config.json` and fill in `DEEPSEEK_API_KEY` (a `sk-` key from the DeepSeek platform). `DEEPSEEK_PLATFORM_TOKEN` can stay empty.
2. Double-click `start-desktop.bat`. Electron installs on first run (~1–2 min).
3. Optional: run `build-exe.bat` to produce a standalone executable.

**License.** Code in this repo is MIT (© 2026 GoRmiTz); the vendored upstream is MIT (© 2026 MeteorNOX). The whale images and sounds are the original author's art/audio assets and are **not** covered by MIT — see [`NOTICE`](./NOTICE) before any commercial distribution.
