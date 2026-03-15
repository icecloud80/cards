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

- Five-friends play guide: [five-friends-play-guide.md](/Users/mo.li/Documents/cards/five-friends-play-guide.md)
- AI roadmap: [ai-roadmap.md](/Users/mo.li/Documents/cards/ai-roadmap.md)
- AI declaration plan: [ai-plan-declaration.md](/Users/mo.li/Documents/cards/ai-plan-declaration.md)
- AI search plan: [ai-plan-search.md](/Users/mo.li/Documents/cards/ai-plan-search.md)
- AI status snapshot: [ai-status.md](/Users/mo.li/Documents/cards/ai-status.md)
- PC UI redesign brief: [pc-ui-redesign.md](/Users/mo.li/Documents/cards/pc-ui-redesign.md)
- AI implementation checklist: [ai-checklist.md](/Users/mo.li/Documents/cards/ai-checklist.md)
- JS comment template for AI-generated code: [js-ai-comment-template.md](/Users/mo.li/Documents/cards/js-ai-comment-template.md)
