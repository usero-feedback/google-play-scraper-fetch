export const BASE_URL = 'https://play.google.com'

/** Review sort orders, matching the original google-play-scraper values. */
export const sort = {
	NEWEST: 2,
	RATING: 3,
	HELPFULNESS: 1,
} as const

export type SortValue = (typeof sort)[keyof typeof sort]
