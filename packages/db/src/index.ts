// Хелперы схемы Drizzle (ядро, скилл db-schema). Модули импортируют их отсюда, а не из drizzle-orm напрямую.
export { opaqueJson, type RichTextDoc, richText } from './json.ts'
export { appUser } from './roles.ts'
export { schoolStatus, schools } from './schools.ts'
export { currentSchoolId, tenantColumns, tenantRef, tenantTable } from './tenant.ts'
