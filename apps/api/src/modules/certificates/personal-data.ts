// Сертификаты ученика (5.5, скилл personal-data): номер, курс, дата и PDF — в архив. Обезличивание аннулирует
// сертификат (решение владельца 2026-11-11): имя → «Удалённый ученик», PDF удаляется, проверка по номеру — «аннулирован».
import { eq } from 'drizzle-orm'
import { definePersonalData } from '#/kernel/personal-data/define.ts'
import { DELETED_NAME } from '#/kernel/personal-data/personal-data.ts'
import { certificates } from './schema.ts'

export const certificatesPersonalData = definePersonalData({
	tables: [certificates],
	export: async (ctx, s) => {
		const rows = await ctx.db
			.select({
				number: certificates.number,
				course: certificates.courseTitle,
				name: certificates.studentName,
				issuedAt: certificates.issuedAt,
				revokedAt: certificates.revokedAt,
				fileId: certificates.fileId,
			})
			.from(certificates)
			.where(eq(certificates.memberId, s.memberId))
			.orderBy(certificates.issuedAt)
		return {
			data: { certificates: rows.map(({ fileId: _, ...r }) => r) },
			files: rows.flatMap((r) => (r.fileId ? [{ path: `files/certificates/${r.number}.pdf`, fileId: r.fileId }] : [])),
		}
	},
	anonymize: async (ctx, s) => {
		const rows = await ctx.db
			.select({ id: certificates.id, fileId: certificates.fileId, revokedAt: certificates.revokedAt })
			.from(certificates)
			.where(eq(certificates.memberId, s.memberId))
		for (const r of rows) {
			await ctx.db
				.update(certificates)
				.set({ studentName: DELETED_NAME, fileId: null, revokedAt: r.revokedAt ?? ctx.now() })
				.where(eq(certificates.id, r.id))
			if (r.fileId) await ctx.files.remove(r.fileId)
		}
	},
})
