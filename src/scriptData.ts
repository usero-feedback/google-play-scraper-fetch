import { PlayScraperParseError, snippet } from './errors.js'

/**
 * Extract the JS objects passed to AF_initDataCallback in the script tags of
 * a Play Store details page. Returns an object keyed by dataset id ("ds:5" etc).
 *
 * Faithful port of scriptData.parse from google-play-scraper, minus the
 * eval-based AF_dataServiceRequests parsing: that is only needed for mappings
 * using useServiceRequestId, which neither app() nor reviews() use.
 */
export function parseScriptData(html: string): Record<string, unknown> {
	const scriptRegex = />AF_initDataCallback[\s\S]*?<\/script/g
	const keyRegex = /(ds:.*?)'/
	const valueRegex = /data:([\s\S]*?), sideChannel: {}}\);<\//

	const matches = html.match(scriptRegex)
	if (!matches) {
		throw new PlayScraperParseError(
			'No AF_initDataCallback script tags found in the page',
			`html starts with: ${snippet(html, 120)}`,
		)
	}

	const parsed: Record<string, unknown> = {}
	for (const match of matches) {
		const keyMatch = match.match(keyRegex)
		const valueMatch = match.match(valueRegex)
		if (!keyMatch || !valueMatch) continue
		const key = keyMatch[1]
		const rawValue = valueMatch[1]
		if (key === undefined || rawValue === undefined) continue
		try {
			parsed[key] = JSON.parse(rawValue) as unknown
		} catch (error) {
			throw new PlayScraperParseError(
				`Failed to JSON.parse AF_initDataCallback payload for ${key}`,
				snippet(rawValue),
			)
		}
	}

	return parsed
}
