# google-play-scraper-fetch

Fetch-only port of [google-play-scraper](https://github.com/facundoolano/google-play-scraper), covering `reviews()` and
`app()` only. Zero runtime dependencies, strict TypeScript, runs on Cloudflare Workers / Deno / Bun / Node 18+ / browsers.
Public npm package, maintained by Will (willsmithte). The primary consumer is the Usero app-store-reviews integration
(`~/projects/feedback`), which dogfoods it for Play review ingestion.

## Hard rules

- **Zero runtime dependencies.** This is the package's entire pitch. Never add a dep, however small. Hand-roll it (see
  `src/htmlToText.ts` replacing cheerio) or don't build it.
- **Global `fetch` only, no Node APIs.** No streams, no `Buffer`, no `node:` imports anywhere in `src/`. Everything must run
  on a Cloudflare Worker. Callers who need proxies/headers/retries inject a custom `fetch` via options; do NOT add a
  got-style `requestOptions` bag.
- **Strict TS, no `any`.** Same rule as the other repos. Unlabeled protocol arrays are walked with the typed helpers in
  `src/path.ts` (`pathGet`, `asString`, `asNumber`, `asArray`), never by casting.
- **Parse failures throw typed errors, never return garbage.** `PlayScraperHttpError` / `PlayScraperParseError` (with a
  `context` + data snippet) are the API contract for protocol breakage. The Usero sync catches these and degrades into its
  `lastSyncError` field. Don't soften a parse failure into `undefined` fields.
- **Keep the API surface migration-compatible with the original** (option names, `sort` constant values, response field
  names) so users of google-play-scraper can switch with minimal edits. Deviations are documented in the README's
  Differences section; update that section whenever behavior diverges.
- **No em dashes or double dashes in the README or any user-facing text.** No empty intensifiers (genuinely, truly, simply).

## How it works (protocol notes)

Google Play has no public API. Both functions wrap internal, undocumented endpoints:

- `reviews()`: POST to `https://play.google.com/_/PlayStoreUi/data/batchexecute` with an `f.req` form payload (rpc id +
  nested-array request template). Responses are `)]}'`-prefixed JSON containing doubly-encoded JSON. Pagination uses a
  token from the previous page; `Set-Cookie` from the first response is replayed on follow-up pages within a single
  `reviews()` call (required for pagination to work; verified live). `throttleMs` inserts a plain delay between internal
  page fetches during auto-pagination (no delay before the first request).
- `app()`: GET the app details page and parse the `AF_initDataCallback(...)` script blobs (`src/scriptData.ts`), then map
  fields out of deep unlabeled arrays.

The array index mappings (e.g. review text at one index, score at another) are reverse-engineered knowledge ported from the
original project. They are the most fragile part of the codebase and the most valuable. When Google shuffles the protocol:
fix the mappings by diffing a fresh captured response against the fixtures, re-capture fixtures, and treat public issue
reports as the early-warning system (that's intentional; see the Usero task doc). To consult the original implementation,
`npm pack google-play-scraper` into a temp dir and read `lib/reviews.js`, `lib/app.js`, and `lib/utils/`.

## Layout

- `src/index.ts` exports everything public: `app`, `reviews`, `sort`, types, error classes.
- `src/http.ts` request helper; `src/path.ts` typed deep-array access; `src/scriptData.ts` details-page script parsing;
  `src/errors.ts` error classes; `src/htmlToText.ts` entity/tag stripping.
- Build: tsup to ESM + CJS + d.ts in `dist/` (`npm run build`). Only `dist/` ships (`files` in package.json).

## Testing

- `npm test`: vitest unit tests against checked-in real captured responses in `test/fixtures/` (24 tests). Throttle tests
  use fake timers.
- `LIVE=1 npm test`: 3 additional live tests against real Google Play (`com.pocketguard.android.app`). Run these before any
  release and after any protocol-related change. They are excluded from CI (CI runners get rate-limited/blocked by Google;
  don't "fix" a CI failure by hitting Play from Actions).
- `node test/capture-fixtures.mjs` re-captures fixtures from live responses. Re-capture whenever mappings change; commit the
  fixtures.

## Releasing

- **Never `npm publish` locally.** Releases go through GitHub Actions: the `Publish to npm` workflow (`publish.yml`),
  triggered via workflow_dispatch with a `bump` input (patch/minor/major). It versions, dry-runs, then publishes with
  `--provenance` via npm trusted publishing (OIDC, `id-token: write`); there is no NPM_TOKEN secret anywhere. The trusted
  publisher is configured on npmjs.com pointing at this repo + `publish.yml`. The workflow commits the version bump back to
  main.
- CLI trigger: `gh workflow run publish.yml -R usero-feedback/google-play-scraper-fetch -f bump=patch`
- `test.yml` runs unit tests + typecheck on every push/PR. Keep it green; the publish workflow assumes main is releasable.
- After releasing a change the Usero integration needs, bump the dep in `~/projects/feedback` and smoke the Play sync.

## Scope discipline

`reviews()` and `app()` only. Requests for the original's other functions (`search`, `list`, `similar`, `developer`,
`permissions`, etc.) are out of scope unless Will decides otherwise; point issue authors at the original package for
Node-only use cases. Also intentionally omitted, with reasons documented in the README: persistent cookie jar (module-level
state is wrong on Workers), `memoized()` (cache at the app layer: KV / Cache API), `requestOptions` (inject `fetch`).
