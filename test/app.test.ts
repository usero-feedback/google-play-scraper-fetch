import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractAppDetails } from '../src/app.js'
import { PlayScraperParseError } from '../src/errors.js'
import { parseScriptData } from '../src/scriptData.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const html = readFileSync(join(fixturesDir, 'app-details.html'), 'utf8')

const APP_ID = 'com.pocketguard.android.app'
const URL = `https://play.google.com/store/apps/details?id=${APP_ID}&hl=en&gl=us`

describe('parseScriptData', () => {
	it('extracts ds:* datasets from the details page', () => {
		const parsed = parseScriptData(html)
		expect(Object.keys(parsed)).toContain('ds:5')
	})

	it('throws PlayScraperParseError on a page without script data', () => {
		expect(() => parseScriptData('<html><body>nothing here</body></html>')).toThrow(
			PlayScraperParseError,
		)
	})
})

describe('extractAppDetails', () => {
	const parsed = parseScriptData(html)
	const details = extractAppDetails(parsed, APP_ID, URL)

	it('extracts core metadata', () => {
		expect(details.appId).toBe(APP_ID)
		expect(details.url).toBe(URL)
		expect(details.title).toContain('PocketGuard')
		expect(details.developer).toBe('PocketGuard, Inc.')
		expect(details.genre).toBe('Finance')
		expect(details.genreId).toBe('FINANCE')
	})

	it('extracts numeric rating fields', () => {
		expect(details.score).toBeGreaterThan(0)
		expect(details.score).toBeLessThanOrEqual(5)
		expect(details.ratings).toBeGreaterThan(0)
		expect(details.minInstalls).toBeGreaterThanOrEqual(100000)
		const histogramTotal =
			details.histogram['1'] +
			details.histogram['2'] +
			details.histogram['3'] +
			details.histogram['4'] +
			details.histogram['5']
		expect(histogramTotal).toBeGreaterThan(0)
	})

	it('extracts pricing fields for a free app', () => {
		expect(details.free).toBe(true)
		expect(details.price).toBe(0)
		expect(details.priceText).toBe('Free')
		expect(details.offersIAP).toBe(true)
	})

	it('extracts media URLs', () => {
		expect(details.icon).toMatch(/^https:\/\//)
		expect(details.headerImage).toMatch(/^https:\/\//)
		expect(details.screenshots.length).toBeGreaterThan(0)
		for (const screenshot of details.screenshots) {
			expect(screenshot).toMatch(/^https:\/\//)
		}
	})

	it('extracts description as both HTML and plain text', () => {
		expect(details.descriptionHTML.length).toBeGreaterThan(100)
		expect(details.description.length).toBeGreaterThan(100)
		expect(details.description).not.toContain('<br>')
		expect(details.description).not.toContain('&amp;')
	})

	it('extracts version and update info', () => {
		expect(details.version).toMatch(/^\d/)
		expect(details.updated).toBeGreaterThan(1700000000000)
		expect(details.androidVersion).toMatch(/^(\d|VARY)/)
	})

	it('extracts categories with at least the genre', () => {
		expect(details.categories.length).toBeGreaterThan(0)
		expect(details.categories[0]?.name).toBeTruthy()
	})

	it('throws PlayScraperParseError when ds:5 is missing', () => {
		expect(() => extractAppDetails({}, APP_ID, URL)).toThrow(PlayScraperParseError)
	})

	it('throws PlayScraperParseError when the title path is broken', () => {
		expect(() => extractAppDetails({ 'ds:5': [null, [null, null, [[]]]] }, APP_ID, URL)).toThrow(
			PlayScraperParseError,
		)
	})
})
