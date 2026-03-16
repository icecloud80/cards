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

## Docs

- Five-friends play guide: [five-friends-play-guide.md](five-friends-play-guide.md)
- AI roadmap: [ai-roadmap.md](ai-roadmap.md)
- AI declaration plan: [ai-plan-declaration.md](ai-plan-declaration.md)
- AI search plan: [ai-plan-search.md](ai-plan-search.md)
- AI status snapshot: [ai-status.md](ai-status.md)
- PC UI redesign brief: [pc-ui-redesign.md](pc-ui-redesign.md)
- AI implementation checklist: [ai-checklist.md](ai-checklist.md)
- JS comment template for AI-generated code: [js-ai-comment-template.md](js-ai-comment-template.md)
