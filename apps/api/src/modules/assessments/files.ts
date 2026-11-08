// Назначения файлов модуля assessments (скилл files-media, карточка 3.4): файлы сдачи домашнего задания.
// Загружает ученик; лимиты и типы — в контракте (их же проверяет форма до загрузки).
import { SUBMISSION_FILE } from '@dinastia/contracts/assessments'
import { defineFilePurpose } from '#/kernel/storage/files.ts'

export const submissionFilePurpose = defineFilePurpose({
	key: SUBMISSION_FILE.purpose,
	maxSize: SUBMISSION_FILE.maxSize,
	mime: SUBMISSION_FILE.mime,
	perm: 'assessments.submit',
})
