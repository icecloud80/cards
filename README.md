## Testing

Run all unit regressions:

```bash
npm test
```

Run the same suite explicitly:

```bash
npm run test:unit
```

Git commits are blocked by `.githooks/pre-commit` until the unit regression suite passes.
