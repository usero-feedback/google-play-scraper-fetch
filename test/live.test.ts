import { describe, expect, it } from 'vitest'
import { app, reviews, sort } from '../src/index.js'

const APP_ID = 'com.pocketguard.android.app'

// Live tests hit play.google.com. Run with: LIVE=1 npx vitest run
describe.skipIf(!process.env.LIVE)('live', () => {
	it('app() returns real metadata', async () => {
		const details = await app({ appId: APP_ID })
		expect(details.title).toContain('PocketGuard')
		expect(details.icon).toMatch(/^https:\/\//)
		expect(details.score).toBeGreaterThan(0)
		expect(details.developer).toBeTruthy()
	}, 30000)

	it('reviews() returns real reviews with a pagination token', async () => {
		const page1 = await reviews({ appId: APP_ID, sort: sort.NEWEST, num: 10, paginate: true })
		expect(page1.data.length).toBeGreaterThan(0)
		expect(page1.nextPaginationToken).toBeTruthy()
		const first = page1.data[0]
		expect(first?.id).toBeTruthy()
		expect(first?.date).toMatch(/^\d{4}-/)

		const page2 = await reviews({
			appId: APP_ID,
			sort: sort.NEWEST,
			paginate: true,
			nextPaginationToken: page1.nextPaginationToken,
		})
		expect(page2.data.length).toBeGreaterThan(0)
		expect(page2.data[0]?.id).not.toBe(first?.id)
	}, 60000)

	it('reviews() auto-paginates past one request when num > 150', async () => {
		const result = await reviews({ appId: APP_ID, num: 200 })
		expect(result.data.length).toBe(200)
		const ids = new Set(result.data.map(review => review.id))
		expect(ids.size).toBe(200)
	}, 60000)
}, 120000)
