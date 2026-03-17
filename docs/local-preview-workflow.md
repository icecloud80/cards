# 本地 HTTP 预览工作流

这份文档记录 2026-03-16 起仓库统一采用的本地 HTTP 预览方式，目的是让后续所有页面改动都通过浏览器访问 `http://127.0.0.1:端口` 来验效果，而不是继续直接打开本地文件。

## 1. 背景

- 直接双击本地 `html` 文件时，脚本、缓存和相对路径行为不够稳定。
- UI smoke 已经在走真实浏览器 + 本地 HTTP 的方式；手动预览也应和它保持同一环境。
- 用户后续还希望工作流支持 Python，因此这次同时保留 Node 与 Python 两种入口。

## 2. 目标

- 默认从仓库根目录提供静态文件服务。
- 改完文件后直接刷新浏览器即可看到最新效果，不依赖 `file://`。
- 保持和 UI smoke 一致的资源加载方式、缓存策略与路径安全策略。
- 允许后续纯 Python 工作流直接复用同一套预览约定。

## 3. 启动方式

- Node 入口：`npm run serve`
- Node 显式入口：`npm run serve:js`
- Python 入口：`npm run serve:python`
- 自动确保服务入口：`npm run serve:ensure -- --quiet`

默认行为：

- 默认优先监听 `127.0.0.1:3721`
- Node 入口若发现 `3721` 被占用，会自动回退到随机空闲端口
- Python 入口保持固定端口语义；若冲突，显式改端口再启动
- 静态根目录默认是仓库根目录
- HTTP 响应统一关闭缓存，避免保存后刷新仍看到旧样式或旧脚本

## 4. 常用预览地址

- 首页：`/`
- PC 运行态：`/index1.html`
- App 专用 mobile 运行态：`/index-app.html`
- Mobile 运行态：`/index2.html`
- Mobile 静态对齐页：`/index2-static.html`
- PC 静态对齐页：`/index-static.html`

## 5. 设计约束

- 所有路径解析都必须限制在仓库根目录内，禁止目录穿越。
- 手动预览与自动化 smoke 必须共用同一套 Node 静态服务 helper，避免出现两套资源口径。
- Python 入口需要保持和 Node 入口一致的 `host / port / root` 参数模型，方便未来自动化脚本切换。
- 这套服务只负责静态预览，不承担热更新；保存文件后直接刷新浏览器即可。

## 6. 后续使用建议

- 后续所有 UI 调整默认都先起本地 HTTP 服务，再从浏览器打开对应页面验证。
- 如果只是做手游牌桌视觉评审、截图或菜单交互确认，可优先打开 `index2-static.html`；它不依赖真实对局流程，适合快速检查固定样例。
- 如果要做真实页面自动化验证，继续复用 `npm run test:ui-smoke`，不要再额外造一套只针对 `file://` 的流程。
- UI smoke 应优先操作页面上真实可见的入口；像 PC 开始界面的 `瞬` 档节奏按钮这类可见控件，需要优先于隐藏的同步 `select`，避免测试能改状态但用户实际看不到入口。
- 如果后面要接入 Python 自动脚本，优先复用 `scripts/local_preview_server.py`，不要绕回临时命令。
- App 壳首阶段继续复用这套静态资源根目录；`npm run build:app-web` 会在 `dist/app` 下复制当前运行所需资源，并把 `index-app.html` 额外落成 App 默认入口 `index.html`。
- `build:app-web` 的复制清单应尽量保持精简；像 `elements.cardmeister.min.js` 这种历史遗留但运行态未使用的脚本，不应再进入 App 壳输出目录。

## 7. 临时产物与仓库清理约定

- macOS 预览和 Finder 经常会在目录里写入 `.DS_Store`；这类文件属于本机元数据，不属于项目资源，统一通过仓库根目录 `.gitignore` 忽略。
- iOS 本地调试时，Xcode 还会额外生成 `*.xcuserstate` 这类只和当前机器窗口布局、打开标签页有关的状态文件；它们必须继续留在本地，不允许进入版本库。
- `artifacts/` 现在统一视为本地预览导出目录；默认忽略其中的截图、SVG 和其他临时产物，仅保留 `artifacts/README.md` 说明文件以及 `artifacts/headless-regression/.gitkeep` 这样的目录占位文件。
- `artifacts/headless-regression/` 继续视为本地回归运行产物目录；除 `.gitkeep` 外，默认不纳入版本管理。
- 如果历史上已经有 `.DS_Store` 或 `artifacts/` 下的预览文件被 Git 跟踪，后续清理时需要显式删掉已跟踪文件；仅补 `.gitignore` 不会自动把它们从索引里移除。
- 同理，如果某次误把 `*.xcuserstate` 或其他 Xcode 本地状态文件加进了 Git，后续也必须通过清索引的方式移除；只补忽略规则不会追溯清理历史跟踪记录。
- 清理前先确认哪些产物是“调试日志 / 预览截图”，哪些是仍在文档中被引用的设计稿或对照图，避免误删还在被文档引用的预览资源。

## 8. 目录进入自动启动

- 当前仓库已提供 `scripts/ensure-preview-server.js` 作为“进入目录时自动确保预览服务已启动”的 helper。
- 推荐的 shell 钩子做法是在 `zsh` 的 `chpwd` hook 中调用：
  `node /Users/mo.li/Documents/cards/scripts/ensure-preview-server.js --cwd="$PWD" --quiet`
- helper 只会在当前目录位于 `/Users/mo.li/Documents/cards` 及其子目录时生效。
- 如果 `3721` 端口已有服务监听，helper 会安静退出，不会重复拉起新进程。
- helper 内部带有 `/tmp/cards-preview-autostart.lock` 短时锁，避免多个 shell 同时进入目录时重复启动多个预览进程。
