import { z } from 'zod'

export const Id = z.uuid()
export const Email = z.string().trim().toLowerCase().pipe(z.email())
export const DateTime = z.coerce.date()
