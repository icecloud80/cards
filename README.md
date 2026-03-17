## Local Preview

Use the local HTTP preview server instead of opening files directly:

```bash
npm run serve
```

If you want the Python entry for future workflows:

```bash
npm run serve:python
```

If you want to ensure the preview server is running from scripts or shell hooks:

```bash
npm run serve:ensure -- --quiet
```

The server prints the exact URLs after startup. Common pages are:

- `http://127.0.0.1:3721/index1.html` for PC
- `http://127.0.0.1:3721/index-app.html` for the native App mobile page
- `http://127.0.0.1:3721/index2.html` for mobile
- `http://127.0.0.1:3721/index2-static.html` for the mobile static mock
- `http://127.0.0.1:3721/index-static.html` for the PC static mock

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

## App Shell

Bootstrap the App web bundle:

```bash
npm run build:app-web
```

Sync the latest web bundle into the native shells:

```bash
npm run app:sync
```

If the current machine only has Android tooling or is still missing full Xcode:

```bash
npm run app:sync:android
```

After the native projects exist, open them with:

```bash
npm run app:open:ios
npm run app:open:android
```

Current App shell conventions:

- App Name: `找朋友升级`
- App ID: `com.nolanli.cards`
- Capacitor `webDir`: `dist/app`
- `dist/app/index.html` is generated from `index-app.html`, so the App opens the dedicated native mobile page directly.
- `npm run app:sync:ios` additionally forces `LANG=en_US.UTF-8`; iOS full sync still requires a full Xcode install, not just Command Line Tools.

## Recent Updates

See [docs/recent-updates.md](docs/recent-updates.md) for the full update log.

## Docs

- Recent updates / 最近更新记录: [recent-updates.md](docs/recent-updates.md)
- Basic rules and tutorial / 基础规则与新手教程: [basic-play-rules-tutorial.md](docs/basic-play-rules-tutorial.md)
- Five-friends play guide / 五人找朋友打法指南: [five-friends-play-guide.md](docs/five-friends-play-guide.md)
- Beginner AI heuristics / 初级 AI 启发式说明: [beginner-ai-heuristics.md](docs/beginner-ai-heuristics.md)
- AI roadmap / AI 路线图: [ai-roadmap.md](docs/ai-roadmap.md)
- AI declaration plan / AI 亮主与反主计划: [ai-plan-declaration.md](docs/ai-plan-declaration.md)
- AI search plan / AI 搜索计划: [ai-plan-search.md](docs/ai-plan-search.md)
- AI status snapshot / AI 当前状态快照: [ai-status.md](docs/ai-status.md)
- PC UI redesign brief / PC 界面改版说明: [pc-ui-redesign.md](docs/pc-ui-redesign.md)
- Three-surface UI mock / 三端主战场界面图: [three-surface-ui-mock.md](docs/three-surface-ui-mock.md)
- Mobile App product requirements / 移动 App 产品需求: [mobile-app-product-requirements.md](docs/mobile-app-product-requirements.md)
- Mobile and online architecture / App 与多人在线技术设计: [mobile-online-architecture.md](docs/mobile-online-architecture.md)
- Mobile, online and ads roadmap / 移动 / 联机 / 广告路线图: [mobile-online-roadmap.md](docs/mobile-online-roadmap.md)
- App launch task breakdown / App 首发版本任务拆解清单: [mobile-app-launch-task-breakdown.md](docs/mobile-app-launch-task-breakdown.md)
- Online API and room state machine draft / 联机服务端接口与房间状态机草案: [mobile-online-api-state-machine.md](docs/mobile-online-api-state-machine.md)
- AI implementation checklist / AI 实现清单: [ai-checklist.md](docs/ai-checklist.md)
- JS comment template for AI-generated code / AI 生成代码注释模板: [js-ai-comment-template.md](docs/js-ai-comment-template.md)
- Mobile static mock design / 手游静态牌桌模板说明: [mobile-ui-static-mock.md](docs/mobile-ui-static-mock.md)
- Local HTTP preview workflow / 本地 HTTP 预览工作流: [local-preview-workflow.md](docs/local-preview-workflow.md)
