// Оформление школы (5.9, спека branding.md, D-065): чтение строки `school_branding` и публичная раздача темы по адресу
// школы — CSS `/api/branding.css`, логотип и фавикон (редирект на подписанную ссылку). Без строки — тема Dinastia.
import { type BrandingTheme, brandingCss, DEFAULT_BRANDING } from '@dinastia/contracts/branding'
import { eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Tx } from '#/kernel/context.ts'
import { withTenant } from '#/kernel/db/tenant.ts'
import { resolveHost } from '#/kernel/host.ts'
import { signFileKey } from '#/kernel/storage/files.ts'
import { files } from '#/kernel/storage/schema.ts'
import { schoolBranding } from './schema.ts'
import { findSchoolBySlug } from './service.ts'

export interface BrandingRow {
	theme: BrandingTheme
	version: number
	logoKey: string | null
	faviconKey: string | null
}

const logoFile = alias(files, 'logo_file')
const faviconFile = alias(files, 'favicon_file')

/** Оформление школы транзакции (RLS); строки нет — тема Dinastia, версия 0. */
export async function readBranding(tx: Tx): Promise<BrandingRow> {
	const [row] = await tx
		.select({
			primaryColor: schoolBranding.primaryColor,
			accentColor: schoolBranding.accentColor,
			font: schoolBranding.font,
			radius: schoolBranding.radius,
			defaultScheme: schoolBranding.defaultScheme,
			version: schoolBranding.version,
			logoKey: logoFile.key,
			faviconKey: faviconFile.key,
		})
		.from(schoolBranding)
		.leftJoin(logoFile, eq(logoFile.id, schoolBranding.logoFileId))
		.leftJoin(faviconFile, eq(faviconFile.id, schoolBranding.faviconFileId))
		.limit(1)
	if (!row) return { theme: DEFAULT_BRANDING, version: 0, logoKey: null, faviconKey: null }
	const { version, logoKey, faviconKey, ...theme } = row
	return { theme, version, logoKey, faviconKey }
}

/** Адрес логотипа на сайте школы (стабильный, для `<img>` и писем); null — логотипа нет. */
export const logoPath = (b: Pick<BrandingRow, 'logoKey' | 'version'>) =>
	b.logoKey ? `/api/branding/logo?v=${b.version}` : null

/** Оформление школы по заголовку Host; корень, чужой хост и удалённая школа — null (тема Dinastia). */
export async function brandingForHost(host: string | undefined, appDomain: string) {
	const target = resolveHost(host, appDomain)
	if (target.kind !== 'school') return null
	const school = await findSchoolBySlug(target.slug)
	if (!school || school.status === 'deleted') return null
	return { schoolId: school.id, ...(await withTenant(school.id, readBranding)) }
}

type Reply = { status: 200 | 302 | 304 | 404; headers: Record<string, string>; body?: string }

/**
 * Ответ на публичный запрос темы. CSS — с `ETag` по школе и версии и `no-cache` (изменение видно сразу, повтор — 304);
 * логотип и фавикон — редирект на подписанную ссылку на час, кэш 5 минут.
 */
export async function brandingReply(
	what: 'css' | 'logo' | 'favicon',
	req: { host: string | undefined; ifNoneMatch: string | undefined },
	appDomain: string,
): Promise<Reply> {
	const b = await brandingForHost(req.host, appDomain)
	if (what === 'css') {
		const etag = `W/"${b?.schoolId ?? 'root'}-${b?.version ?? 0}"`
		const headers = { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache', etag }
		if (req.ifNoneMatch === etag) return { status: 304, headers }
		return { status: 200, headers, body: brandingCss(b?.theme ?? DEFAULT_BRANDING) }
	}
	const key = what === 'logo' ? b?.logoKey : b?.faviconKey
	if (!key) return { status: 404, headers: { 'cache-control': 'no-cache' } }
	return {
		status: 302,
		headers: { location: await signFileKey(key), 'cache-control': 'public, max-age=300' },
	}
}
