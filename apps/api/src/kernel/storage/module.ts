// Модуль ядра «файлы»: процедуры загрузки, задачи удаления объекта и очистки незавершённых загрузок.
import { defineModule } from '../module.ts'
import { cleanupPendingJob, deleteObjectJob } from './files.ts'
import { permissions } from './permissions.ts'
import { filesRouter } from './router.ts'

export default defineModule({
	name: 'files',
	router: { files: filesRouter },
	permissions,
	jobs: [deleteObjectJob, cleanupPendingJob],
})
