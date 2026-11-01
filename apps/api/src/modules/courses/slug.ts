// Адрес курса из названия (карточка 2.1): транслит кириллицы, латиница/цифры/дефис, 3–60 символов.
const MAP: Record<string, string> = {
	а: 'a',
	б: 'b',
	в: 'v',
	г: 'g',
	д: 'd',
	е: 'e',
	ё: 'e',
	ж: 'zh',
	з: 'z',
	и: 'i',
	й: 'y',
	к: 'k',
	л: 'l',
	м: 'm',
	н: 'n',
	о: 'o',
	п: 'p',
	р: 'r',
	с: 's',
	т: 't',
	у: 'u',
	ф: 'f',
	х: 'h',
	ц: 'ts',
	ч: 'ch',
	ш: 'sh',
	щ: 'sch',
	ъ: '',
	ы: 'y',
	ь: '',
	э: 'e',
	ю: 'yu',
	я: 'ya',
}

export const SLUG_MAX = 60

/** «Основы акварели: 2026» → `osnovy-akvareli-2026`; слишком коротко или пусто — `course`. */
export function slugify(title: string): string {
	const latin = [...title.toLowerCase()].map((ch) => MAP[ch] ?? ch).join('')
	const slug = latin
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, SLUG_MAX)
		.replace(/-+$/g, '')
	return slug.length >= 3 ? slug : `course${slug ? `-${slug}` : ''}`
}

/** Свободный адрес: `base`, иначе `base-2`, `base-3`… (с учётом длины). */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base
	for (let n = 2; ; n++) {
		const suffix = `-${n}`
		const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`
		if (!taken.has(candidate)) return candidate
	}
}
