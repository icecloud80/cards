## Local Preview

Use the local HTTP preview server instead of opening files directly:

```bash
npm run serve
```

If you want the Python entry for future workflows:

```bash
npm run serve:python
```

The server prints the exact URLs after startup. Common pages are:

- `http://127.0.0.1:4173/index1.html` for PC
- `http://127.0.0.1:4173/index2.html` for mobile
- `http://127.0.0.1:4173/index-static.html` for the PC static mock

After each file change, refresh the page in the browser to check the latest effect.

## Testing

Run all unit regressions:

```bash
npm test
```

Run the same suite explicitly:

```bash
npm run test:unit
```

Run the fast pre-commit suite explicitly:

```bash
npm run test:unit:fast
```

Run the headless full-game regression explicitly:

```bash
npm run test:headless
```

Run the mixed headless analysis explicitly:

```bash
npm run analyze:headless:mixed -- --games=20
```

Run the browser UI smoke regression explicitly:

```bash
npm run test:ui-smoke
```

Git commits are blocked by `.githooks/pre-commit` until the fast regression suite passes.
The hook only runs the headless full-game regression when staged `.js` changes exceed 200 total lines.
The same hook now also runs a real browser UI smoke regression when staged app-layer `.js / .html / .css` changes exceed 500 total lines.

## Recent Updates

- 2026-03-16 - 【规划文档】 - 新增 App 化与联机资料包：补齐 `移动 App 产品需求`、`App 与多人在线技术设计`、`移动 / 联机 / 广告路线图`，统一首发范围、免费运营边界、广告位策略以及好友房到匹配的阶段目标。
- 2026-03-16 - 【工具】 - 新增统一的本地 HTTP 预览工作流：可通过 `npm run serve` 启动仓库静态预览服务，通过浏览器访问 `index1.html / index2.html / index-static.html` 看修改效果；同时保留 `npm run serve:python` 作为未来 Python 工作流入口，并让 UI smoke 复用同一套静态服务 helper。
- 2026-03-15 - 【AI改进】 - 初级 AI 的叫朋友与扣底 heuristic 已重新对齐：现在会优先找最短副牌门的 `A`，并在扣底时尽量保留该门的 `A + 1 张回手牌`；若手里还有 `K`，也会尽量保留，方便按 `A -> K` 继续把短门打穿。
- 2026-03-15 - 【规则改进】 - 扣底结算已按新规则拆分为 `普通扣底 / 级牌扣底`：普通扣底继续只看总分是否到 `120`，级牌扣底可直接判闲家胜；同时补齐了无主副级牌、特殊级主副级牌以及“最大同型牌组里的王张会阻断级牌扣底”的结算与测试。
- 2026-03-15 - 【UI增强】 - 结算弹窗已同步调整 PC / mobile：标题直接显示 `获胜 / 失败 - 结果摘要`，并支持 `打家下台 / 闲家升x级 / 小光 / 大光 / 打家升x级 / 降x级` 这类结算标题。
- 2026-03-15 - 【UI增强】 - `级别结算` 区块已从纯文本列表升级为结构化结果卡片：每行分开展示玩家名、阵营胶囊、等级箭头和升级/降级结果胶囊。
- 2026-03-15 - 【UI增强】 - `级别结算` 结果卡片进一步调整为“左侧身份信息、右侧等级胶囊”布局；升级行使用绿色背景，降级行使用红色背景，等级箭头改为图标，结果胶囊不再使用 `【】` 包裹。
- 2026-03-15 - 【UI增强】 - `级别结算` 结果卡片再次压缩为“每位玩家固定一行”的紧凑布局；窄屏下也不再把同一名玩家拆成上下两排，避免结果弹窗过高。
- 2026-03-15 - 【UI增强】 - 手游发牌阶段的“可亮选项”区域已压成紧凑布局：手牌区更矮、可亮候选改成横向滚动 chips，避免中央操作区把整屏撑爆。
- 2026-03-15 - 【UI增强】 - 当手游处于发牌亮主阶段且已出现候选方案时，中央操作区不再显示 `选择 / 开始发牌 / 亮主` 这类额外按钮，直接展示可点击的声明 chips；花色方案改用花色图标压缩宽度。
- 2026-03-15 - 【UI增强】 - 声明 chips 进一步改成真实牌面叠图：例如 `2张大王` 直接显示两张大王缩略牌、`2张方片2` 直接显示两张方片 2，按约 75% 重叠压缩宽度。
- 2026-03-15 - 【UI增强】 - 手游翻底定主公示层已单独精修：浮层视觉更轻、底牌卡位整体上提；底牌下方增加类似 `关闭 (12s)` 的读秒按钮，整个 panel 右上角另补独立 `X` 关闭入口。
- 2026-03-15 - 【工具】 - 对局日志导出现在会在末尾追加“最终胜负界面”摘要，完整记录结算弹窗里的标题、正文、逐人等级结算和底牌亮出内容，方便复盘。
- 2026-03-15 - 【Bug修复】 - 修复了部分手机 WebView 缺少 `requestAnimationFrame` / `MutationObserver` 时手游页可能白屏打不开的问题；移动端壳层现在会自动降级到安全兜底路径继续启动。
- 2026-03-15 - 【Bug修复】 - 修复了手游开始页“点击开始游戏没反应”的问题：mobile 壳层代理的隐藏原始按钮在 ready 阶段恢复为可点击状态，点击后会正常进入发牌。
- 2026-03-15 - 【UI增强】 - 移除了旧的结果胶囊标签，避免“胜负结果、升级降级、阵营变化”继续分散在多个小标签里阅读。
- 2026-03-15 - 【UI增强】 - 新增 `慢 / 中 / 快 / 瞬` 四档对局节奏设置，PC 开始界面、PC 局内菜单、手游开始页和手游设置页已统一接入。
- 2026-03-15 - 【Bug修复】 - 修复了 AI 出牌节奏只能写死为慢速的问题；现在节奏只影响等待与过渡，不改变 AI 难度和玩法逻辑。
- 2026-03-15 - 【工具】 - 新增基于 Playwright 的真实浏览器 UI smoke：会分别打开 PC 和 mobile 页面，切到 `瞬` 档并开启托管，确认两端都能自动打完整一局。
- 2026-03-15 - 【工具】 - 新增混编 headless 批跑脚本：支持每局按 seed 随机生成 `2-3 个中级 + 2-3 个初级` 的 5 人阵容，并把座位难度、单局日志和分析摘要一起落盘，方便专门排查中级 AI 在混桌环境下的问题。

## Docs

- Basic rules and tutorial / 基础规则与新手教程: [basic-play-rules-tutorial.md](docs/basic-play-rules-tutorial.md)
- Five-friends play guide / 五人找朋友打法指南: [five-friends-play-guide.md](docs/five-friends-play-guide.md)
- Beginner AI heuristics / 初级 AI 启发式说明: [beginner-ai-heuristics.md](docs/beginner-ai-heuristics.md)
- AI roadmap / AI 路线图: [ai-roadmap.md](docs/ai-roadmap.md)
- AI declaration plan / AI 亮主与反主计划: [ai-plan-declaration.md](docs/ai-plan-declaration.md)
- AI search plan / AI 搜索计划: [ai-plan-search.md](docs/ai-plan-search.md)
- AI status snapshot / AI 当前状态快照: [ai-status.md](docs/ai-status.md)
- PC UI redesign brief / PC 界面改版说明: [pc-ui-redesign.md](docs/pc-ui-redesign.md)
- Mobile App product requirements / 移动 App 产品需求: [mobile-app-product-requirements.md](docs/mobile-app-product-requirements.md)
- Mobile and online architecture / App 与多人在线技术设计: [mobile-online-architecture.md](docs/mobile-online-architecture.md)
- Mobile, online and ads roadmap / 移动 / 联机 / 广告路线图: [mobile-online-roadmap.md](docs/mobile-online-roadmap.md)
- AI implementation checklist / AI 实现清单: [ai-checklist.md](docs/ai-checklist.md)
- JS comment template for AI-generated code / AI 生成代码注释模板: [js-ai-comment-template.md](docs/js-ai-comment-template.md)
- Local HTTP preview workflow / 本地 HTTP 预览工作流: [local-preview-workflow.md](docs/local-preview-workflow.md)
