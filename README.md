# google-play-scraper-fetch

Fetch-only port of [google-play-scraper](https://github.com/facundoolano/google-play-scraper) covering `app()` and `reviews()`. Zero runtime dependencies. Runs on Cloudflare Workers, Deno, Bun, Node 18+, and browsers.

## Why this exists

The original google-play-scraper depends on `got`, `cheerio`, and Node streams, so it only runs on Node. This package reimplements the two functions most apps need (app metadata and reviews) on top of the global `fetch` API, with the same request shapes and response field mappings. If your code runs on a Cloudflare Worker or an edge runtime, this works where the original cannot.

## Install

```sh
npm install google-play-scraper-fetch
```

## Usage

### App details

```ts
import { app } from 'google-play-scraper-fetch'

const details = await app({ appId: 'com.pocketguard.android.app' })
console.log(details.title, details.score, details.icon)
```

Options: `appId` (required), `lang` (default `en`), `country` (default `us`), `fetch` (custom fetch implementation).

### Reviews

```ts
import { reviews, sort } from 'google-play-scraper-fetch'

// First page
const page1 = await reviews({
	appId: 'com.pocketguard.android.app',
	sort: sort.NEWEST,
	num: 50,
	paginate: true,
})
console.log(page1.data.length, 'reviews')

// Next page
const page2 = await reviews({
	appId: 'com.pocketguard.android.app',
	sort: sort.NEWEST,
	paginate: true,
	nextPaginationToken: page1.nextPaginationToken,
})
```

Options: `appId` (required), `lang`, `country`, `sort` (`sort.NEWEST`, `sort.RATING`, `sort.HELPFULNESS`), `num` (default 150), `paginate` (default false, set true to page manually), `nextPaginationToken`, `fetch`.

With `paginate: false`, the library keeps requesting pages internally until it has `num` reviews or runs out. Each review includes `id`, `userName`, `date` (ISO string), `score`, `text`, `replyText`, `version`, `thumbsUp`, and `criterias`.

## Errors

Everything thrown by this package extends `PlayScraperError`:

- `PlayScraperHttpError` for failed requests (includes `status` and `url`, 404 means the app does not exist)
- `PlayScraperParseError` when the response cannot be parsed into the expected shape (includes a `context` snippet to help diagnose)

The package throws rather than returning partial or garbage data, so wrap calls in try/catch and treat `PlayScraperParseError` as a signal that the protocol may have changed.

## Caveat

Google Play has no public API for this data. Both functions wrap an internal, undocumented protocol (`batchexecute` and the script payloads embedded in the details page). Google can change it at any time without notice. Field mappings are ported from google-play-scraper and verified against captured fixtures, but expect occasional breakage and pin your version.

## Differences from the original

- Only `app()` and `reviews()` are implemented.
- No throttling option. Rate-limit in your own code if you need it.
- No `requestOptions` passthrough. Pass a custom `fetch` instead.
- No persistent cookie jar. Cookies from the first reviews response are reused for follow-up pages within a single `reviews()` call.
- `memoized()` is not implemented.

## License

MIT

---

Want these reviews clustered and turned into shipped fixes automatically? https://usero.io
