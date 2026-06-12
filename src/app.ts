import { BASE_URL } from './constants.js'
import { PlayScraperParseError, snippet } from './errors.js'
import { htmlToText } from './htmlToText.js'
import { httpRequest } from './http.js'
import { asArray, asNumber, asString, pathGet, type PathKey } from './path.js'
import { parseScriptData } from './scriptData.js'

export interface AppCategory {
	name: string | undefined
	id: string | undefined
}

export interface AppHistogram {
	'1': number
	'2': number
	'3': number
	'4': number
	'5': number
}

export interface AppOptions {
	appId: string
	lang?: string
	country?: string
	/** Custom fetch implementation. Defaults to the global fetch. */
	fetch?: typeof fetch
}

export interface AppDetails {
	appId: string
	url: string
	title: string
	description: string
	descriptionHTML: string
	summary: string | undefined
	installs: string | undefined
	minInstalls: number | undefined
	maxInstalls: number | undefined
	score: number | undefined
	scoreText: string | undefined
	ratings: number | undefined
	reviews: number | undefined
	histogram: AppHistogram
	price: number
	originalPrice: number | undefined
	discountEndDate: string | undefined
	free: boolean
	currency: string | undefined
	priceText: string
	available: boolean
	offersIAP: boolean
	IAPRange: string | undefined
	androidVersion: string
	androidVersionText: string
	androidMaxVersion: string
	developer: string | undefined
	developerId: string | undefined
	developerEmail: string | undefined
	developerWebsite: string | undefined
	developerAddress: string | undefined
	developerLegalName: string | undefined
	developerLegalEmail: string | undefined
	developerLegalAddress: string | undefined
	developerLegalPhoneNumber: string | undefined
	developerInternalID: string | undefined
	privacyPolicy: string | undefined
	genre: string | undefined
	genreId: string | undefined
	categories: AppCategory[]
	icon: string | undefined
	headerImage: string | undefined
	screenshots: string[]
	video: string | undefined
	videoImage: string | undefined
	previewVideo: string | undefined
	contentRating: string | undefined
	contentRatingDescription: string | undefined
	adSupported: boolean
	released: string | undefined
	updated: number | undefined
	version: string
	recentChanges: string | undefined
	comments: (string | undefined)[]
	preregister: boolean
	earlyAccessEnabled: boolean
	isAvailableInPlayPass: boolean
}

/**
 * Fetch the Play Store details page for an app and extract its metadata.
 * Field paths are ported from google-play-scraper's lib/app.js MAPPINGS.
 */
export async function app(options: AppOptions): Promise<AppDetails> {
	if (!options || !options.appId) {
		throw new PlayScraperParseError('appId missing', 'app() requires an appId option')
	}

	const lang = options.lang ?? 'en'
	const country = options.country ?? 'us'
	const params = new URLSearchParams({ id: options.appId, hl: lang, gl: country })
	const url = `${BASE_URL}/store/apps/details?${params.toString()}`

	const { body } = await httpRequest(url, { fetch: options.fetch })
	const parsed = parseScriptData(body)
	return extractAppDetails(parsed, options.appId, url)
}

/** Exported for testing against captured fixtures. */
export function extractAppDetails(
	parsed: Record<string, unknown>,
	appId: string,
	url: string,
): AppDetails {
	const base = pathGet(parsed, ['ds:5', 1, 2])
	if (base === undefined || base === null) {
		throw new PlayScraperParseError(
			'App data not found at ds:5[1][2]',
			`available datasets: ${snippet(Object.keys(parsed))}`,
		)
	}

	const g = (...path: PathKey[]): unknown => pathGet(base, path)
	const gWithFallback = (path: PathKey[], fallbackPath: PathKey[]): unknown => {
		const primary = pathGet(base, path)
		return primary === null || primary === undefined ? pathGet(base, fallbackPath) : primary
	}

	const title = asString(g(0, 0))
	if (title === undefined) {
		throw new PlayScraperParseError(
			'App title not found at ds:5[1][2][0][0]',
			`value: ${snippet(g(0, 0))}`,
		)
	}

	const descriptionHTML = extractDescriptionHtml(base)
	const priceMicros = asNumber(g(57, 0, 0, 0, 0, 1, 0, 0))
	const originalPriceMicros = asNumber(g(57, 0, 0, 0, 0, 1, 1, 0))
	const developerUrl = asString(g(68, 1, 4, 2))
	const developerId = developerUrl?.split('id=')[1]
	const androidVersionRaw = asString(gWithFallback([140, 1, 1, 0, 0, 1], [-1, '141', 1, 1, 0, 0, 1]))
	const androidMaxVersionRaw = asString(
		gWithFallback([140, 1, 1, 0, 1, 1], [-1, '141', 1, 1, 0, 1, 1]),
	)
	const updatedSeconds = asNumber(gWithFallback([145, 0, 1, 0], [-1, '146', 0, 1, 0]))
	const earlyAccessValue = g(18, 2)

	return {
		appId,
		url,
		title,
		description: htmlToText(descriptionHTML),
		descriptionHTML,
		summary: asString(g(73, 0, 1)),
		installs: asString(g(13, 0)),
		minInstalls: asNumber(g(13, 1)),
		maxInstalls: asNumber(g(13, 2)),
		score: asNumber(g(51, 0, 1)),
		scoreText: asString(g(51, 0, 0)),
		ratings: asNumber(g(51, 2, 1)),
		reviews: asNumber(g(51, 3, 1)),
		histogram: buildHistogram(g(51, 1)),
		price: priceMicros !== undefined ? priceMicros / 1000000 : 0,
		originalPrice: originalPriceMicros !== undefined ? originalPriceMicros / 1000000 : undefined,
		discountEndDate: asString(g(57, 0, 0, 0, 0, 14, 1)),
		free: priceMicros === 0,
		currency: asString(g(57, 0, 0, 0, 0, 1, 0, 1)),
		priceText: asString(g(57, 0, 0, 0, 0, 1, 0, 2)) || 'Free',
		available: Boolean(g(18, 0)),
		offersIAP: Boolean(g(19, 0)),
		IAPRange: asString(g(19, 0)),
		androidVersion: normalizeAndroidVersion(androidVersionRaw),
		androidVersionText: androidVersionRaw ?? 'Varies with device',
		androidMaxVersion: normalizeAndroidVersion(androidMaxVersionRaw),
		developer: asString(g(68, 0)),
		developerId,
		developerEmail: asString(g(69, 1, 0)),
		developerWebsite: asString(g(69, 0, 5, 2)),
		developerAddress: asString(g(69, 2, 0)),
		developerLegalName: asString(g(69, 4, 0)),
		developerLegalEmail: asString(g(69, 4, 1, 0)),
		developerLegalAddress: asString(g(69, 4, 2, 0))?.replace(/\n/g, ', '),
		developerLegalPhoneNumber: asString(g(69, 4, 3)),
		developerInternalID: developerId,
		privacyPolicy: asString(g(99, 0, 5, 2)),
		genre: asString(g(79, 0, 0, 0)),
		genreId: asString(g(79, 0, 0, 2)),
		categories: extractCategoriesWithGenreFallback(base),
		icon: asString(g(95, 0, 3, 2)),
		headerImage: asString(g(96, 0, 3, 2)),
		screenshots: extractScreenshots(g(78, 0)),
		video: asString(g(100, 0, 0, 3, 2)),
		videoImage: asString(g(100, 1, 0, 3, 2)),
		previewVideo: asString(g(100, 1, 2, 0, 2)),
		contentRating: asString(g(9, 0)),
		contentRatingDescription: asString(g(9, 2, 1)),
		adSupported: Boolean(g(48)),
		released: asString(g(10, 0)),
		updated: updatedSeconds !== undefined ? updatedSeconds * 1000 : undefined,
		version: asString(gWithFallback([140, 0, 0, 0], [-1, '141', 0, 0, 0])) || 'VARY',
		recentChanges: asString(gWithFallback([144, 1, 1], [-1, '145', 1, 1])),
		comments: extractComments(parsed),
		preregister: g(18, 0) === 1,
		earlyAccessEnabled: typeof earlyAccessValue === 'string',
		isAvailableInPlayPass: Boolean(g(62)),
	}
}

function extractDescriptionHtml(base: unknown): string {
	const translated = asString(pathGet(base, [12, 0, 0, 1]))
	const original = asString(pathGet(base, [72, 0, 1]))
	const description = translated || original
	if (description === undefined) {
		throw new PlayScraperParseError(
			'App description not found',
			'checked ds:5[1][2][12][0][0][1] and ds:5[1][2][72][0][1]',
		)
	}
	return description
}

function normalizeAndroidVersion(versionText: string | undefined): string {
	if (!versionText) return 'VARY'
	const number = versionText.split(' ')[0]
	if (number !== undefined && Number.parseFloat(number)) {
		return number
	}
	return 'VARY'
}

function buildHistogram(container: unknown): AppHistogram {
	const empty: AppHistogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
	if (!Array.isArray(container)) return empty
	return {
		1: asNumber(pathGet(container, [1, 1])) ?? 0,
		2: asNumber(pathGet(container, [2, 1])) ?? 0,
		3: asNumber(pathGet(container, [3, 1])) ?? 0,
		4: asNumber(pathGet(container, [4, 1])) ?? 0,
		5: asNumber(pathGet(container, [5, 1])) ?? 0,
	}
}

function extractScreenshots(screenshots: unknown): string[] {
	const list = asArray(screenshots)
	if (!list || list.length === 0) return []
	return list
		.map(screenshot => asString(pathGet(screenshot, [3, 2])))
		.filter((screenshotUrl): screenshotUrl is string => screenshotUrl !== undefined)
}

/**
 * Recursively extract category {name, id} pairs, falling back to genre/genreId
 * when the categories array is empty, like the Play UI does.
 */
function extractCategoriesWithGenreFallback(base: unknown): AppCategory[] {
	const categories = extractCategories(pathGet(base, [118]), [])
	if (categories.length === 0) {
		categories.push({
			name: asString(pathGet(base, [79, 0, 0, 0])),
			id: asString(pathGet(base, [79, 0, 0, 2])),
		})
	}
	return categories
}

function extractCategories(searchValue: unknown, categories: AppCategory[]): AppCategory[] {
	if (!Array.isArray(searchValue) || searchValue.length === 0) return categories

	if (searchValue.length >= 4 && typeof searchValue[0] === 'string') {
		categories.push({
			name: searchValue[0],
			id: asString(searchValue[2]),
		})
	} else {
		for (const sub of searchValue) {
			extractCategories(sub, categories)
		}
	}

	return categories
}

/**
 * Comments migrate between ds:8 and ds:9. Check both for the expected fields
 * and take up to 5 comment texts from whichever matches.
 */
function extractComments(parsed: Record<string, unknown>): (string | undefined)[] {
	for (const datasetKey of ['ds:8', 'ds:9']) {
		const hasAuthor = pathGet(parsed, [datasetKey, 0, 0, 1, 0])
		const hasVersion = pathGet(parsed, [datasetKey, 0, 0, 10])
		const hasDate = pathGet(parsed, [datasetKey, 0, 0, 5, 0])
		if (hasAuthor && hasVersion && hasDate) {
			const comments = asArray(pathGet(parsed, [datasetKey, 0])) ?? []
			return comments.slice(0, 5).map(comment => asString(pathGet(comment, [4])))
		}
	}
	return []
}
