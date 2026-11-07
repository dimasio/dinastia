import { defineModule } from '#/kernel/module.ts'
import { coverPurpose, lessonFilePurpose, lessonImagePurpose } from './files.ts'
import { videoSyncJob } from './jobs.ts'
import { permissions } from './permissions.ts'
import { coursesRouter } from './router.ts'

export default defineModule({
	name: 'courses',
	router: { courses: coursesRouter },
	permissions,
	jobs: [videoSyncJob],
	files: [coverPurpose, lessonImagePurpose, lessonFilePurpose],
})
