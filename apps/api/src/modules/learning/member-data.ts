// Выгрузка данных ученика по его запросу (5.5, скилл personal-data): zip — `data.json` и файлы. Ученик выгружает свои
// данные, администратор (`schools.pd.manage`) — данные любого ученика; кто и чьи — в журнале.

import { Id } from '@dinastia/contracts/common'
import { MEMBER_DATA_EXPORT } from '@dinastia/contracts/learning'
import { z } from 'zod'
import { fail } from '#/kernel/errors.ts'
import { defineExport } from '#/kernel/exports/define.ts'
import { dataSubject, personalDataEntries } from '#/kernel/personal-data/personal-data.ts'

type Params = { memberId: string }

export const memberDataExport = defineExport({
	key: MEMBER_DATA_EXPORT,
	format: 'zip',
	// право на чужие данные — в prepare: свои может выгрузить любой участник
	perm: 'schools.access',
	input: z.object({ memberId: Id.optional() }),
	prepare: async (ctx, input): Promise<Params> => {
		const memberId = input.memberId ?? ctx.member.id
		if (memberId !== ctx.member.id && !ctx.can('schools.pd.manage'))
			return fail.forbidden('NO_PERMISSION', { permission: 'schools.pd.manage' })
		const subject = await dataSubject(ctx, memberId)
		if (memberId !== ctx.member.id && subject.role !== 'student') return fail.notFound('MEMBER_NOT_FOUND')
		await ctx.audit('learning.student.data-exported', { entity: 'member', id: memberId })
		return { memberId }
	},
	fileName: (ctx) => `${ctx.school.name} — мои данные`,
	entries: (ctx, p: Params) => personalDataEntries(ctx, p.memberId),
})
