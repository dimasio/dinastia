// Модуль ядра «выгрузки»: процедуры запуска и состояния, задачи сборки файла и очистки истёкших.
import { defineModule } from '../module.ts'
import { cleanupExportsJob, runExportJob } from './exports.ts'
import { permissions } from './permissions.ts'
import { exportsRouter } from './router.ts'

export default defineModule({
	name: 'exports',
	router: { exports: exportsRouter },
	permissions,
	jobs: [runExportJob, cleanupExportsJob],
})
