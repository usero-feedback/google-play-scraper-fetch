import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PlayScraperParseError } from '../src/errors.js'
import { extractReviews, parseBatchExecuteResponse } from '../src/reviews.js'

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
