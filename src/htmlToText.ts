const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
}

/**
 * Convert the description HTML to plain text, preserving line breaks.
 * Replaces the cheerio dependency in the original: descriptions only contain
 * simple formatting tags (<br>, <b>, <i>, <u>) and HTML entities.
 */
export function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\r\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
			if (entity.startsWith('#x') || entity.startsWith('#X')) {
				const code = Number.parseInt(entity.slice(2), 16)
				return Number.isNaN(code) ? full : String.fromCodePoint(code)
			}
			if (entity.startsWith('#')) {
				const code = Number.parseInt(entity.slice(1), 10)
				return Number.isNaN(code) ? full : String.fromCodePoint(code)
			}
			return NAMED_ENTITIES[entity] ?? full
		})
}
