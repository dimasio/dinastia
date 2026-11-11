// Выгрузка в Excel (скилл documents): поставить задачу, дождаться файла и скачать. Ошибка — `{ code }` для `errorText`:
// EXPORT_FAILED — задача не собрала файл, EXPORT_TIMEOUT — файл не готов за 3 минуты (он появится — запустите снова позже).
import { client } from './orpc.ts'

const POLL_MS = 1000
const TIMEOUT_MS = 3 * 60 * 1000

export async function runExport(key: string, input: Record<string, unknown>) {
	let state = await client.exports.start({ key, input })
	const until = Date.now() + TIMEOUT_MS
	while (state.status === 'pending') {
		if (Date.now() > until) throw { code: 'EXPORT_TIMEOUT' }
		await new Promise((r) => setTimeout(r, POLL_MS))
		state = await client.exports.get({ id: state.id })
	}
	if (state.status !== 'ready' || !state.url) throw { code: 'EXPORT_FAILED' }
	// ссылка отдаёт файл вложением — страница остаётся на месте
	window.location.assign(state.url)
	return state
}
