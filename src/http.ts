import { PlayScraperHttpError } from './errors.js'

export interface HttpResult {
	body: string
	/** Raw Set-Cookie header values, used to keep pagination consistent within one call. */
	setCookies: string[]
}

export interface HttpOptions {
	method?: 'GET' | 'POST'
	body?: string
	headers?: Record<string, string>
	fetch?: typeof fetch
}

/** Minimal fetch wrapper. Throws PlayScraperHttpError on non-2xx responses. */
export async function httpRequest(url: string, options: HttpOptions = {}): Promise<HttpResult> {
	const fetchFn = options.fetch ?? fetch
	const response = await fetchFn(url, {
		method: options.method ?? 'GET',
		body: options.body,
		headers: options.headers,
		redirect: 'follow',
	})

	if (!response.ok) {
		const message =
			response.status === 404
				? 'App not found (404)'
				: `Error requesting Google Play: HTTP ${response.status}`
		throw new PlayScraperHttpError(message, response.status, url)
	}

	const setCookies = extractSetCookies(response.headers)
	const body = await response.text()
	return { body, setCookies }
}

function extractSetCookies(headers: Headers): string[] {
	// getSetCookie is in Node 18.14+, Workers, Deno, and Bun, but not in every
	// TS lib definition or older runtime, so feature-detect it.
	const headersWithGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
	if (typeof headersWithGetSetCookie.getSetCookie === 'function') {
		return headersWithGetSetCookie.getSetCookie()
	}
	const single = headers.get('set-cookie')
	return single === null ? [] : [single]
}

/** Turn Set-Cookie header values into a single Cookie request header value. */
export function cookieHeaderFromSetCookies(setCookies: string[]): string | undefined {
	const pairs = setCookies
		.map(cookieLine => cookieLine.split(';', 1)[0]?.trim())
		.filter((pair): pair is string => pair !== undefined && pair.includes('='))
	return pairs.length > 0 ? pairs.join('; ') : undefined
}
