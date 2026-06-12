/** Base class for all errors thrown by this package. */
export class PlayScraperError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'PlayScraperError'
	}
}

/** Thrown when the HTTP request to Google Play fails or returns a non-2xx status. */
export class PlayScraperHttpError extends PlayScraperError {
	readonly status: number
	readonly url: string

	constructor(message: string, status: number, url: string) {
		super(message)
		this.name = 'PlayScraperHttpError'
		this.status = status
		this.url = url
	}
}

/**
 * Thrown when the response from Google Play cannot be parsed into the expected
 * shape. Google Play uses an internal, undocumented protocol; when it changes,
 * this error is the signal. The `context` field describes which part of the
 * parse failed and includes a snippet of the offending data.
 */
export class PlayScraperParseError extends PlayScraperError {
	readonly context: string

	constructor(message: string, context: string) {
		super(`${message} (${context})`)
		this.name = 'PlayScraperParseError'
		this.context = context
	}
}

/** Render an unknown value as a short diagnostic snippet for error context. */
export function snippet(value: unknown, max = 200): string {
	let text: string
	try {
		text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value)
	} catch {
		text = String(value)
	}
	return text.length > max ? `${text.slice(0, max)}...` : text
}
