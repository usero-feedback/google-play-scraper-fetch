import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayScraperParseError } from '../src/errors.js'
import { extractReviews, parseBatchExecuteResponse, reviews } from '../src/reviews.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const body = readFileSync(join(fixturesDir, 'reviews-batchexecute.txt'), 'utf8')

const APP_ID = 'com.pocketguard.android.app'

describe('parseBatchExecuteResponse', () => {
	it('strips the )]}\' prefix and parses the inner payload', () => {
		const payload = parseBatchExecuteResponse(body)
		expect(Array.isArray(payload)).toBe(true)
	})

	it('returns null when the inner payload is null (no more results)', () => {
		const empty = ")]}'\n\n" + JSON.stringify([['wrb.fr', 'UsvDTd', null, null, null, null, 'generic']])
		expect(parseBatchExecuteResponse(empty)).toBeNull()
	})

	it('throws PlayScraperParseError on a non-JSON response', () => {
		expect(() => parseBatchExecuteResponse('<html>captcha page</html>')).toThrow(
			PlayScraperParseError,
		)
	})

	it('throws PlayScraperParseError when the inner payload is not a JSON string', () => {
		const bad = ")]}'\n" + JSON.stringify([['wrb.fr', 'UsvDTd', 'not json {', null]])
		expect(() => parseBatchExecuteResponse(bad)).toThrow(PlayScraperParseError)
	})
})

describe('extractReviews', () => {
	const payload = parseBatchExecuteResponse(body)
	const result = extractReviews(payload, APP_ID)

	it('extracts a full page of reviews', () => {
		expect(result.length).toBe(150)
	})

	it('maps review fields', () => {
		const review = result[0]
		expect(review).toBeDefined()
		if (!review) return
		expect(review.id.length).toBeGreaterThan(10)
		expect(review.userName).toBeTruthy()
		expect(review.score).toBeGreaterThanOrEqual(1)
		expect(review.score).toBeLessThanOrEqual(5)
		expect(review.scoreText).toBe(String(review.score))
		expect(review.url).toBe(
			`https://play.google.com/store/apps/details?id=${APP_ID}&reviewId=${review.id}`,
		)
		expect(review.title).toBeNull()
		expect(typeof review.text).toBe('string')
		expect(review.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
	})

	it('produces valid ISO dates for every review', () => {
		for (const review of result) {
			expect(review.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
		}
	})

	it('returns empty list for a null payload', () => {
		expect(extractReviews(null, APP_ID)).toEqual([])
	})

	it('throws PlayScraperParseError when payload[0] is not an array', () => {
		expect(() => extractReviews(['garbage'], APP_ID)).toThrow(PlayScraperParseError)
	})

	it('throws PlayScraperParseError when a review has no id', () => {
		expect(() => extractReviews([[[null]]], APP_ID)).toThrow(PlayScraperParseError)
	})
})

describe('pagination token', () => {
	it('is present in the fixture payload at [1][1]', () => {
		const payload = parseBatchExecuteResponse(body) as unknown[]
		const tokenContainer = payload[1] as unknown[]
		expect(typeof tokenContainer[1]).toBe('string')
	})
})

/** Build a minimal batchexecute response body with one review per id. */
function fakeBatchExecuteBody(reviewIds: string[], token: string | null): string {
	const payload: unknown[] = [reviewIds.map(id => [id]), [null, token]]
	return ")]}'\n\n" + JSON.stringify([['wrb.fr', 'UsvDTd', JSON.stringify(payload)]])
}

function fakeFetchForPages(bodies: string[]): { fetchFn: typeof fetch; calls: () => number } {
	let callCount = 0
	const fetchFn: typeof fetch = async () => {
		const responseBody = bodies[callCount]
		callCount += 1
		if (responseBody === undefined) {
			throw new Error(`unexpected request number ${callCount}`)
		}
		return new Response(responseBody)
	}
	return { fetchFn, calls: () => callCount }
}

describe('throttleMs', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('delays between internal page requests but not before the first', async () => {
		vi.useFakeTimers()
		const { fetchFn, calls } = fakeFetchForPages([
			fakeBatchExecuteBody(['r1'], 'token-1'),
			fakeBatchExecuteBody(['r2'], 'token-2'),
			fakeBatchExecuteBody(['r3'], null),
		])

		const resultPromise = reviews({ appId: APP_ID, num: 3, throttleMs: 1000, fetch: fetchFn })

		// First request fires immediately, no timer involved.
		await vi.advanceTimersByTimeAsync(0)
		expect(calls()).toBe(1)

		// Second request waits the full throttle delay.
		await vi.advanceTimersByTimeAsync(999)
		expect(calls()).toBe(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(calls()).toBe(2)

		// Third request waits another full delay.
		await vi.advanceTimersByTimeAsync(1000)
		expect(calls()).toBe(3)

		const result = await resultPromise
		expect(result.data.map(review => review.id)).toEqual(['r1', 'r2', 'r3'])
		expect(result.nextPaginationToken).toBeNull()
	})

	it('has no effect when only one request is made', async () => {
		vi.useFakeTimers()
		const { fetchFn, calls } = fakeFetchForPages([fakeBatchExecuteBody(['r1'], 'token-1')])

		// paginate: true means a single request even though a token comes back.
		const resultPromise = reviews({
			appId: APP_ID,
			num: 1,
			paginate: true,
			throttleMs: 1000,
			fetch: fetchFn,
		})

		// Resolves with only microtasks, no timer advancement needed.
		await vi.advanceTimersByTimeAsync(0)
		const result = await resultPromise
		expect(calls()).toBe(1)
		expect(result.data.length).toBe(1)
		expect(vi.getTimerCount()).toBe(0)
	})
})
