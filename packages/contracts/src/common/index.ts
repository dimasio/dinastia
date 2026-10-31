import { z } from 'zod'

export const Id = z.uuid()
export const Email = z.string().trim().toLowerCase().pipe(z.email())
export const DateTime = z.coerce.date()

export { PAGE_SIZE_MAX, type Page, page, pageInput } from './page.ts'
export * from './rich-text.ts'
export { hasPath, valuesAt } from './secrets.ts'
