// Назначения файлов модуля certificates (скилл files-media): картинки шаблона загружает сотрудник с правом шаблона; PDF
// делает задача — назначение `certificates.pdf` не регистрируется (пользователь его загрузить не может).
import { CERTIFICATE_BACKGROUND, CERTIFICATE_SIGNATURE } from '@dinastia/contracts/certificates'
import { defineFilePurpose } from '#/kernel/storage/files.ts'

export const CERTIFICATE_PDF_PURPOSE = 'certificates.pdf'

export const signaturePurpose = defineFilePurpose({
	key: CERTIFICATE_SIGNATURE.purpose,
	mime: CERTIFICATE_SIGNATURE.mime,
	maxSize: CERTIFICATE_SIGNATURE.maxSize,
	perm: 'certificates.manage',
})
export const backgroundPurpose = defineFilePurpose({
	key: CERTIFICATE_BACKGROUND.purpose,
	mime: CERTIFICATE_BACKGROUND.mime,
	maxSize: CERTIFICATE_BACKGROUND.maxSize,
	perm: 'certificates.manage',
})
