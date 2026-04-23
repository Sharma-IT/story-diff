# Mutation Testing

We use [Stryker Mutator](https://stryker-mutator.io/) for mutation testing to ensure our test suite is robust and effectively kills "mutants" (bugs introduced into the code).

## Current Score

| File                 | Mutation Score | Killed | Timeout | Survived | No Coverage |
|----------------------|----------------|--------|---------|----------|-------------|
| **All files**        | **100.00%**    | 670    | 3       | 0        | 0           |
| `browser.ts`         | 100.00%        | 34     | 0       | 0        | 0           |
| `capture.ts`         | 100.00%        | 112    | 2       | 0        | 0           |
| `compare.ts`         | 100.00%        | 74     | 0       | 0        | 0           |
| `config-loader.ts`   | 100.00%        | 61     | 1       | 0        | 0           |
| `errors.ts`          | 100.00%        | 21     | 0       | 0        | 0           |
| `hooks.ts`           | 100.00%        | 33     | 0       | 0        | 0           |
| `logger.ts`          | 100.00%        | 32     | 0       | 0        | 0           |
| `snapshot-manager.ts`| 100.00%        | 15     | 0       | 0        | 0           |
| `story-diff.ts`      | 100.00%        | 220    | 0       | 0        | 0           |
| `storybook.ts`       | 100.00%        | 56     | 0       | 0        | 0           |
| `utils.ts`           | 100.00%        | 12     | 0       | 0        | 0           |

## Equivalent Mutants

Some mutants are "equivalent" to the original code — they produce different syntax but identical observable behaviour. These are marked with `// Stryker disable` comments with inline reasons. Below is a summary of each category.

### 1. Equivalent Defaults

Default parameter values where the mutation produces identical runtime behaviour.

| Location | Code | Why Equivalent |
|----------|------|----------------|
| `browser.ts:89` | `provider = 'puppeteer'` | Mutating to `""` still falls through to the Puppeteer branch because only `'playwright'` is checked explicitly. |
| `logger.ts:16` | `config.level ?? 'silent'` | Mutating to `""` gives `LOG_LEVELS['']` → `undefined`, so `shouldLog()` returns `false` for all levels — same as `silent` (level `0`). |

### 2. Equivalent String Literals (Discriminated Union Tags)

The `type: 'failure'` tag in `capture.ts` appears in four locations. The retry loop only checks `result.type === 'success'`, so any non-`'success'` string (including `""`) produces identical retry and error behaviour.

| Location | Code |
|----------|------|
| `capture.ts:78` | Navigation failure result |
| `capture.ts:111` | Element-not-found result |
| `capture.ts:134` | Zero-height element result |
| `capture.ts:149` | Generic catch-all result |

### 3. Defensive Type Guards

Runtime type checks that are defensive programming; the guarded scenarios cannot occur in practice.

| Location | Code | Why Equivalent |
|----------|------|----------------|
| `capture.ts:121` | `typeof el === 'object'` | `el` is always a DOM element (an object) in the browser `evaluate()` context. The subsequent `'style' in el` check would throw for non-objects anyway. |
| `hooks.ts:16` | `typeof config === 'object' ? config : {}` | When `config` is `true` (boolean), property access (`.timeout`, `.beforeAll`) returns `undefined` on both `true` and `{}`. |
| `hooks.ts:23,27` | `typeof globals.X === 'function'` | The result is further guarded by `typeof hook === 'function'` before calling, so non-function values are never invoked. |

### 4. Optional Chaining Safety Nets

Optional chaining (`?.`) used on values that are always defined in the test context.

| Location | Code | Why Equivalent |
|----------|------|----------------|
| `capture.ts:176` | `logger?.error(...)` | Logger is always provided in tests. The `?.` is a production safety net for callers who omit it. |
| `capture.ts:179` | `lastError?.message` | `lastError` is always set from the retry loop, so `?.` never activates. |

### 5. Unreachable Defensive Code

Fallback branches that exist for safety but are unreachable in practice.

| Location | Code | Why Equivalent |
|----------|------|----------------|
| `capture.ts:182` | `lastError ?? new Error(...)` | `lastError` is always assigned during the retry loop, so the `?? new Error(...)` fallback is dead code. |
| `story-diff.ts:337` | `tests ?? config.tests ?? []` | Both `tests` and `config.tests` are always provided or `undefined`; the `[]` fallback is unreachable. |

### 6. Redundant Early Returns

Code that provides an optimisation but where skipping it produces an identical outcome.

| Location | Code | Why Equivalent |
|----------|------|----------------|
| `story-diff.ts:395` | `getConfig()` early return | `resolveStoryDiffConfig()` performs the exact same `storybookUrl && snapshotsDir` check internally, so skipping the early return causes a redundant but identical function call. |
| `story-diff.ts:246` | `catch { return undefined; }` | In an IIFE, an empty catch block implicitly returns `undefined` — same as the explicit `return undefined`. |

### 7. Environment-Specific NoCoverage

Code that is tested but Stryker's coverage analysis cannot link due to test isolation patterns.

| Location | Code | Why Ignored |
|----------|------|-------------|
| `browser.ts:155-172` | `loadPlaywright` catch block | Fully tested by `browser-isolation.test.ts` using dynamic import cache-busting (`vi.doMock` + `import()`). Stryker cannot trace coverage across dynamic import boundaries. |

### 8. Equivalent Conditional Logic

Conditions where the mutation doesn't change observable behaviour due to surrounding guards.

| Location | Code | Why Equivalent |
|----------|------|----------------|
| `story-diff.ts:274` | `testInfo && snapshotPath &&` | `testInfo` is always truthy when reached (set from `test.info()`), so replacing with `true` or `||` doesn't change the evaluation. |

## Running Mutation Tests

```bash
npx stryker run
```

The HTML report is generated at `reports/mutation/mutation.html`.

## Maintaining 100% Coverage

When adding new code:

1. Write tests first (TDD red-green-refactor).
2. Run `npx stryker run` to verify no new surviving mutants.
3. If a mutant is genuinely equivalent, add a `// Stryker disable` comment with an inline reason explaining why.
4. Update this document if adding a new category of equivalent mutant.
