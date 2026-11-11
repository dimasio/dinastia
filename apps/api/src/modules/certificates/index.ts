import { defineModule } from '#/kernel/module.ts'
import { certificateIssuedEmail } from './emails/issued.tsx'
import { backgroundPurpose, signaturePurpose } from './files.ts'
import { permissions } from './permissions.ts'
import { certificatesRouter } from './router.ts'
import { renderCertificateJob } from './service.ts'
import { certificateIssuedSubscriber, enrollmentCompletedSubscriber } from './subscribers.ts'

export default defineModule({
	name: 'certificates',
	router: { certificates: certificatesRouter },
	permissions,
	jobs: [renderCertificateJob],
	subscribers: [enrollmentCompletedSubscriber, certificateIssuedSubscriber],
	emails: [certificateIssuedEmail],
	files: [signaturePurpose, backgroundPurpose],
})
