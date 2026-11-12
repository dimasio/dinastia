import { fileURLToPath } from 'node:url'

/**
 * Корень `apps/api`: в исходниках этот файл — `src/kernel/paths.ts`, в сборке он внутри `dist/<вход>.js` (5.8). От него —
 * пути к миграциям и `.env`, одинаковые при запуске через `tsx` и `node dist/*.js`.
 */
export const apiRoot = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? '../../' : '../', import.meta.url))
