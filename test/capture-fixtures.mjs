// Capture real Google Play responses as test fixtures.
// Usage: node test/capture-fixtures.mjs [appId]
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appId = process.argv[2] ?? 'com.pocketguard.android.app'
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

// 1. App details page HTML
const detailsUrl = `https://play.google.com/store/apps/details?id=${appId}&hl=en&gl=us`
const detailsRes = await fetch(detailsUrl)
if (!detailsRes.ok) throw new Error(`details fetch failed: ${detailsRes.status}`)
const html = await detailsRes.text()
await writeFile(join(fixturesDir, 'app-details.html'), html)
console.log(`app-details.html: ${html.length} bytes`)

// 2. Reviews batchexecute response (initial request, NEWEST sort)
const inner = JSON.stringify([null, null, [2, 2, [150, null, null], null, []], [appId, 7]])
const envelope = JSON.stringify([[['UsvDTd', inner, null, 'generic']]])
const reviewsUrl =
	'https://play.google.com/_/PlayStoreUi/data/batchexecute' +
	'?rpcids=qnKhOb&f.sid=-697906427155521722&bl=boq_playuiserver_20190903.08_p0' +
	'&hl=en&gl=us&authuser&soc-app=121&soc-platform=1&soc-device=1&_reqid=1065213'
const reviewsRes = await fetch(reviewsUrl, {
	method: 'POST',
	headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
	body: `f.req=${encodeURIComponent(envelope)}`,
})
if (!reviewsRes.ok) throw new Error(`reviews fetch failed: ${reviewsRes.status}`)
const body = await reviewsRes.text()
await writeFile(join(fixturesDir, 'reviews-batchexecute.txt'), body)
console.log(`reviews-batchexecute.txt: ${body.length} bytes`)
