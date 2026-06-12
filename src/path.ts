export type PathKey = string | number

/**
 * Walk a deeply nested structure of arrays/objects by a path of keys.
 * Mirrors Ramda's R.path as used by the original google-play-scraper,
 * including negative array indices (counted from the end).
 * Returns undefined when any step is missing.
 */
export function pathGet(data: unknown, path: readonly PathKey[]): unknown {
	let current: unknown = data
	for (const key of path) {
		if (current === null || current === undefined) return undefined
		if (typeof key === 'number' && Array.isArray(current)) {
			current = key < 0 ? current[current.length + key] : current[key]
			continue
		}
		if (typeof current === 'object') {
			current = (current as Record<string, unknown>)[String(key)]
			continue
		}
		return undefined
	}
	return current
}

export function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined
}

export function asArray(value: unknown): unknown[] | undefined {
	return Array.isArray(value) ? value : undefined
}
