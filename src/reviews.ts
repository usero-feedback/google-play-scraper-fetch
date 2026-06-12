import { BASE_URL, sort, type SortValue } from './constants.js'
import { PlayScraperParseError, snippet } from './errors.js'
import { cookieHeaderFromSetCookies, httpRequest } from './http.js'
import { asArray, asNumber, asString, pathGet } from './path.js'

const REVIEWS_PER_REQUEST = 150

export interface ReviewCriteria {
	criteria: string | undefined
	rating: number | null
}

export interface Review {
	id: string
	userName: string | undefined
	userImage: string | undefined
	date: string | null
	score: number | undefined
	scoreText: string
	url: string
	title: null
	text: string | undefined
	replyDate: string | null
	replyText: string | null
	version: string | null
	thumbsUp: number | undefined
	criterias: ReviewCriteria[]
}

export interface ReviewsOptions {
	appId: string
	lang?: string
	country?: string
	sort?: SortValue
	num?: number
	/** When true, make a single request and return the pagination token. */
	paginate?: boolean
	/** Token from a previous paginated call to fetch the next page. */
	nextPaginationToken?: string | null
	/**
	 * Delay in milliseconds between the internal page requests made when num
	 * exceeds one page and paginate is false. There is no delay before the
	 * first request, and the option has no effect when only one request is
	 * made. Default: no delay.
	 */
	throttleMs?: number
	/** Custom fetch implementation. Defaults to the global fetch. */
	fetch?: typeof fetch
}

export interface ReviewsResult {
	data: Review[]
	nextPaginationToken: string | null
}

interface ResolvedReviewsOptions {
	appId: string
	lang: string
	country: string
	sort: SortValue
	num: number
	paginate: boolean
	throttleMs: number | undefined
	fetchFn: typeof fetch | undefined
}

/**
 * Fetch reviews for an app from Play's internal batchexecute endpoint.
 * Request shape and response mappings are ported from google-play-scraper's
 * lib/reviews.js (rpcid UsvDTd).
 */
export async function reviews(options: ReviewsOptions): Promise<ReviewsResult> {
	if (!options || !options.appId) {
		throw new PlayScraperParseError('appId missing', 'reviews() requires an appId option')
	}
	const sortValue = options.sort ?? sort.NEWEST
	if (!Object.values(sort).includes(sortValue)) {
		throw new PlayScraperParseError(
			`Invalid sort ${String(sortValue)}`,
			`valid values: ${Object.values(sort).join(', ')}`,
		)
	}

	const resolved: ResolvedReviewsOptions = {
		appId: options.appId,
		lang: options.lang ?? 'en',
		country: options.country ?? 'us',
		sort: sortValue,
		num: options.num ?? REVIEWS_PER_REQUEST,
		paginate: options.paginate ?? false,
		throttleMs: options.throttleMs,
		fetchFn: options.fetch,
	}

	const accumulated: Review[] = []
	let token = options.nextPaginationToken ?? null
	let cookieHeader: string | undefined

	for (;;) {
		const requestResult = await makeReviewsRequest(resolved, token, cookieHeader)
		cookieHeader = requestResult.cookieHeader ?? cookieHeader
		accumulated.push(...requestResult.reviews)
		token = requestResult.token

		const shouldContinue =
			!resolved.paginate && token !== null && accumulated.length < resolved.num
		if (!shouldContinue) break
		if (resolved.throttleMs !== undefined && resolved.throttleMs > 0) {
			await sleep(resolved.throttleMs)
		}
	}

	return {
		data: accumulated.length > resolved.num ? accumulated.slice(0, resolved.num) : accumulated,
		nextPaginationToken: token,
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}

interface ReviewsRequestResult {
	reviews: Review[]
	token: string | null
	cookieHeader: string | undefined
}

async function makeReviewsRequest(
	options: ResolvedReviewsOptions,
	token: string | null,
	cookieHeader: string | undefined,
): Promise<ReviewsRequestResult> {
	const url =
		`${BASE_URL}/_/PlayStoreUi/data/batchexecute` +
		`?rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0` +
		`&hl=${encodeURIComponent(options.lang)}&gl=${encodeURIComponent(options.country)}` +
		`&authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213`

	const headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
	}
	if (cookieHeader !== undefined) {
		headers.Cookie = cookieHeader
	}

	const { body, setCookies } = await httpRequest(url, {
		method: 'POST',
		body: buildRequestBody(options.appId, options.sort, token),
		headers,
		fetch: options.fetchFn,
	})

	const payload = parseBatchExecuteResponse(body)
	const newCookieHeader = cookieHeaderFromSetCookies(setCookies)

	if (payload === null) {
		return { reviews: [], token: null, cookieHeader: newCookieHeader }
	}

	return {
		reviews: extractReviews(payload, options.appId),
		token: asString(pathGet(payload, [1, 1])) ?? null,
		cookieHeader: newCookieHeader,
	}
}

/**
 * Build the f.req form body. Decoded, the payload is:
 * [[["UsvDTd","[null,null,[2,<sort>,[<count>,null,<token|null>],null,[]],[\"<appId>\",7]]",null,"generic"]]]
 * which matches the pre-encoded template strings in the original library.
 */
function buildRequestBody(appId: string, sortValue: SortValue, token: string | null): string {
	const pageSpec: [number, null, string | null] = [REVIEWS_PER_REQUEST, null, token]
	const innerRequest = JSON.stringify([null, null, [2, sortValue, pageSpec, null, []], [appId, 7]])
	const envelope = JSON.stringify([[['UsvDTd', innerRequest, null, 'generic']]])
	return `f.req=${encodeURIComponent(envelope)}`
}

/**
 * batchexecute responses start with the anti-JSON-hijacking prefix ")]}'".
 * The envelope is a JSON array; element [0][2] is a JSON string containing
 * the actual data (or null when there are no more results).
 */
export function parseBatchExecuteResponse(body: string): unknown {
	const withoutPrefix = body.startsWith(")]}'") ? body.slice(4) : body
	let envelope: unknown
	try {
		envelope = JSON.parse(withoutPrefix) as unknown
	} catch {
		throw new PlayScraperParseError(
			'batchexecute response is not valid JSON',
			snippet(withoutPrefix),
		)
	}

	const inner = pathGet(envelope, [0, 2])
	if (inner === null || inner === undefined) {
		return null
	}
	if (typeof inner !== 'string') {
		throw new PlayScraperParseError(
			'batchexecute envelope[0][2] is not a string',
			snippet(inner),
		)
	}

	try {
		return JSON.parse(inner) as unknown
	} catch {
		throw new PlayScraperParseError(
			'batchexecute inner payload is not valid JSON',
			snippet(inner),
		)
	}
}

/** Exported for testing against captured fixtures. */
export function extractReviews(payload: unknown, appId: string): Review[] {
	const rawReviews = pathGet(payload, [0])
	if (rawReviews === null || rawReviews === undefined) {
		return []
	}
	const reviewList = asArray(rawReviews)
	if (!reviewList) {
		throw new PlayScraperParseError(
			'Reviews payload[0] is not an array',
			snippet(rawReviews),
		)
	}
	return reviewList.map(raw => extractReview(raw, appId))
}

function extractReview(raw: unknown, appId: string): Review {
	const id = asString(pathGet(raw, [0]))
	if (id === undefined) {
		throw new PlayScraperParseError('Review id not found at [0]', snippet(raw))
	}

	const score = asNumber(pathGet(raw, [2]))
	const criteriaList = asArray(pathGet(raw, [12, 0])) ?? []

	return {
		id,
		userName: asString(pathGet(raw, [1, 0])),
		userImage: asString(pathGet(raw, [1, 1, 3, 2])),
		date: generateDate(pathGet(raw, [5])),
		score,
		scoreText: String(score),
		url: `${BASE_URL}/store/apps/details?id=${appId}&reviewId=${id}`,
		title: null,
		text: asString(pathGet(raw, [4])),
		replyDate: generateDate(pathGet(raw, [7, 2])),
		replyText: asString(pathGet(raw, [7, 1])) || null,
		version: asString(pathGet(raw, [10])) || null,
		thumbsUp: asNumber(pathGet(raw, [6])),
		criterias: criteriaList.map(buildCriteria),
	}
}

function buildCriteria(raw: unknown): ReviewCriteria {
	const ratingContainer = pathGet(raw, [1])
	return {
		criteria: asString(pathGet(raw, [0])),
		rating: ratingContainer ? (asNumber(pathGet(ratingContainer, [0])) ?? null) : null,
	}
}

/**
 * Review dates arrive as [seconds, subsecond] tuples. The original library
 * concatenates seconds with the first 3 digits of the subsecond part to get
 * milliseconds, then formats as an ISO string.
 */
function generateDate(dateValue: unknown): string | null {
	const dateArray = asArray(dateValue)
	if (!dateArray) return null
	const seconds = dateArray[0]
	if (typeof seconds !== 'number') return null
	// Matches the original: falsy subsecond (missing or 0) becomes '000'.
	const subsecond = dateArray[1]
	const millisecondsLastDigits = String(subsecond || '000')
	const milliseconds = Number(`${seconds}${millisecondsLastDigits.substring(0, 3)}`)
	const date = new Date(milliseconds)
	return Number.isNaN(date.getTime()) ? null : date.toJSON()
}
