// Хелперы схемы Drizzle (ядро, скилл db-schema). Модули импортируют их отсюда, а не из drizzle-orm напрямую.
export { blockChildTable, blockState, blockTable, lessonBlocks } from './blocks.ts'
export { jsonKind, opaqueJson, type RichTextDoc, richText } from './json.ts'
export { isPii, pii } from './pii.ts'
export {
	QUESTION_ITEM_KINDS,
	QUESTION_SCORING,
	questionItemKind,
	questionItems,
	questionScoring,
	questions,
} from './questions.ts'
export { appUser } from './roles.ts'
export { schoolStatus, schools } from './schools.ts'
export { settingsTable } from './settings.ts'
export { currentSchoolId, schoolIdColumn, tenantColumns, tenantIsolation, tenantRef, tenantTable } from './tenant.ts'
