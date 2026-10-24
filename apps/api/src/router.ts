// Роутер всего API: реализация контракта (@dinastia/contracts), собранная из модулей (src/modules/index.ts).

import { collectRouters } from './kernel/module.ts'
import { impl } from './kernel/orpc.ts'
import { modules } from './modules/index.ts'

export const router = impl.router(collectRouters(modules))

export type Router = typeof router
