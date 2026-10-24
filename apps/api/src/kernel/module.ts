// Модуль (скилл module): вертикальный срез — роутер (реализация своего контракта), разрешения, далее события, задачи,
// настройки (фаза 1.6+). Реестр модулей — src/modules/index.ts; роутер и права приложения собираются из него.
import type { ModulePermissions } from './permissions.ts'

export interface ModuleDef<
	N extends string = string,
	R extends object = object,
	P extends ModulePermissions<string> = ModulePermissions<string>,
> {
	/** Имя модуля = папка modules/<name>; совпадает с префиксом разрешений. */
	name: N
	/** Процедуры по namespace контракта: { <namespace>: { <procedure>: … } }. */
	router: R
	permissions: P
}

export function defineModule<const N extends string, R extends object, P extends ModulePermissions<string>>(
	def: ModuleDef<N, R, P>,
) {
	if (def.permissions.module !== def.name) {
		throw new Error(`модуль ${def.name}: разрешения объявлены для «${def.permissions.module}»`)
	}
	return def
}

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never
type Modules = Record<string, ModuleDef>

/** Роутер всех модулей (для impl.router) — namespace контракта не должен повторяться в двух модулях. */
export function collectRouters<M extends Modules>(modules: M): UnionToIntersection<M[keyof M]['router']> {
	const merged: Record<string, unknown> = {}
	for (const m of Object.values(modules)) {
		for (const [ns, procedures] of Object.entries(m.router)) {
			if (ns in merged) throw new Error(`namespace контракта «${ns}» объявлен в двух модулях`)
			merged[ns] = procedures
		}
	}
	return merged as UnionToIntersection<M[keyof M]['router']>
}
