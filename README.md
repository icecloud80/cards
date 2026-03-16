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

Git commits are blocked by `.githooks/pre-commit` until the fast regression suite passes.
The hook only runs the headless full-game regression when staged `.js` changes exceed 200 total lines.

## Recent Updates

- 结算弹窗已同步调整 PC / mobile：标题直接显示 `获胜 / 失败 - 结果摘要`，并改为逐人列出 `玩家名 - 阵营 - LvX -> LvY【结果】` 的等级结算清单。
- 移除了旧的结果胶囊标签，避免“胜负结果、升级降级、阵营变化”继续分散在多个小标签里阅读。
- 新增 `慢 / 中 / 快 / 瞬` 四档对局节奏设置，PC 开始界面、PC 局内菜单、手游开始页和手游设置页已统一接入。
- 修复了 AI 出牌节奏只能写死为慢速的问题；现在节奏只影响等待与过渡，不改变 AI 难度和玩法逻辑。

## Docs

- Five-friends play guide: [five-friends-play-guide.md](five-friends-play-guide.md)
- AI roadmap: [ai-roadmap.md](ai-roadmap.md)
- AI declaration plan: [ai-plan-declaration.md](ai-plan-declaration.md)
- AI search plan: [ai-plan-search.md](ai-plan-search.md)
- AI status snapshot: [ai-status.md](ai-status.md)
- PC UI redesign brief: [pc-ui-redesign.md](pc-ui-redesign.md)
- AI implementation checklist: [ai-checklist.md](ai-checklist.md)
- JS comment template for AI-generated code: [js-ai-comment-template.md](js-ai-comment-template.md)
