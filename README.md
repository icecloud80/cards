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

Run the browser UI smoke regression explicitly:

```bash
npm run test:ui-smoke
```

Git commits are blocked by `.githooks/pre-commit` until the fast regression suite passes.
The hook only runs the headless full-game regression when staged `.js` changes exceed 200 total lines.
The same hook now also runs a real browser UI smoke regression when staged app-layer `.js / .html / .css` changes exceed 500 total lines.

## Recent Updates

- 初级 AI 的叫朋友与扣底 heuristic 已重新对齐：现在会优先找最短副牌门的 `A`，并在扣底时尽量保留该门的 `A + 1 张回手牌`；若手里还有 `K`，也会尽量保留，方便按 `A -> K` 继续把短门打穿。
- 扣底结算已按新规则拆分为 `普通扣底 / 级牌扣底`：普通扣底继续只看总分是否到 `120`，级牌扣底可直接判闲家胜；同时补齐了无主副级牌、特殊级主副级牌以及“最大同型牌组里的王张会阻断级牌扣底”的结算与测试。
- 结算弹窗已同步调整 PC / mobile：标题直接显示 `获胜 / 失败 - 结果摘要`，并支持 `打家下台 / 闲家升x级 / 小光 / 大光 / 打家升x级 / 降x级` 这类结算标题。
- `级别结算` 区块已从纯文本列表升级为结构化结果卡片：每行分开展示玩家名、阵营胶囊、等级箭头和升级/降级结果胶囊。
- `级别结算` 结果卡片进一步调整为“左侧身份信息、右侧等级胶囊”布局；升级行使用绿色背景，降级行使用红色背景，等级箭头改为图标，结果胶囊不再使用 `【】` 包裹。
- `级别结算` 结果卡片再次压缩为“每位玩家固定一行”的紧凑布局；窄屏下也不再把同一名玩家拆成上下两排，避免结果弹窗过高。
- 手游发牌阶段的“可亮选项”区域已压成紧凑布局：手牌区更矮、可亮候选改成横向滚动 chips，避免中央操作区把整屏撑爆。
- 当手游处于发牌亮主阶段且已出现候选方案时，中央操作区不再显示 `选择 / 开始发牌 / 亮主` 这类额外按钮，直接展示可点击的声明 chips；花色方案改用花色图标压缩宽度。
- 声明 chips 进一步改成真实牌面叠图：例如 `2张大王` 直接显示两张大王缩略牌、`2张方片2` 直接显示两张方片 2，按约 75% 重叠压缩宽度。
- 对局日志导出现在会在末尾追加“最终胜负界面”摘要，完整记录结算弹窗里的标题、正文、逐人等级结算和底牌亮出内容，方便复盘。
- 修复了部分手机 WebView 缺少 `requestAnimationFrame` / `MutationObserver` 时手游页可能白屏打不开的问题；移动端壳层现在会自动降级到安全兜底路径继续启动。
- 修复了手游开始页“点击开始游戏没反应”的问题：mobile 壳层代理的隐藏原始按钮在 ready 阶段恢复为可点击状态，点击后会正常进入发牌。
- 移除了旧的结果胶囊标签，避免“胜负结果、升级降级、阵营变化”继续分散在多个小标签里阅读。
- 新增 `慢 / 中 / 快 / 瞬` 四档对局节奏设置，PC 开始界面、PC 局内菜单、手游开始页和手游设置页已统一接入。
- 修复了 AI 出牌节奏只能写死为慢速的问题；现在节奏只影响等待与过渡，不改变 AI 难度和玩法逻辑。
- 新增基于 Playwright 的真实浏览器 UI smoke：会分别打开 PC 和 mobile 页面，切到 `瞬` 档并开启托管，确认两端都能自动打完整一局。

## Docs

- Basic rules and tutorial: [basic-play-rules-tutorial.md](basic-play-rules-tutorial.md)
- Five-friends play guide: [five-friends-play-guide.md](five-friends-play-guide.md)
- AI roadmap: [ai-roadmap.md](ai-roadmap.md)
- AI declaration plan: [ai-plan-declaration.md](ai-plan-declaration.md)
- AI search plan: [ai-plan-search.md](ai-plan-search.md)
- AI status snapshot: [ai-status.md](ai-status.md)
- PC UI redesign brief: [pc-ui-redesign.md](pc-ui-redesign.md)
- AI implementation checklist: [ai-checklist.md](ai-checklist.md)
- JS comment template for AI-generated code: [js-ai-comment-template.md](js-ai-comment-template.md)
