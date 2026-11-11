import { defineModule } from '#/kernel/module.ts'
import { backgroundPurpose, signaturePurpose } from './files.ts'
import { permissions } from './permissions.ts'
import { certificatesRouter } from './router.ts'
import { renderCertificateJob } from './service.ts'
import { enrollmentCompletedSubscriber } from './subscribers.ts'

export default defineModule({
	name: 'certificates',
	router: { certificates: certificatesRouter },
	permissions,
	jobs: [renderCertificateJob],
	subscribers: [enrollmentCompletedSubscriber],
	files: [signaturePurpose, backgroundPurpose],
})
