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

- AI strategy roadmap: [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md)
- Intermediate search implementation plan: [ai-intermediate-search-plan.md](/Users/mo.li/Documents/cards/ai-intermediate-search-plan.md)
- JS comment template for AI-generated code: [js-ai-comment-template.md](/Users/mo.li/Documents/cards/js-ai-comment-template.md)
