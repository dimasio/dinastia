// Назначения файлов модуля assessments (скилл files-media, карточка 3.4): файлы сдачи домашнего задания.
// Загружает ученик; лимиты и типы — в контракте (их же проверяет форма до загрузки).
import { COMMENT_FILE, SUBMISSION_FILE } from '@dinastia/contracts/assessments'
import { defineFilePurpose } from '#/kernel/storage/files.ts'

export const submissionFilePurpose = defineFilePurpose({
	key: SUBMISSION_FILE.purpose,
	maxSize: SUBMISSION_FILE.maxSize,
	mime: SUBMISSION_FILE.mime,
	perm: 'assessments.submit',
})

/** Файл к комментарию в переписке по работе: загружает и проверяющий, и ученик (без `perm`), привязка — только свой готовый файл. */
export const commentFilePurpose = defineFilePurpose({
	key: COMMENT_FILE.purpose,
	maxSize: COMMENT_FILE.maxSize,
	mime: COMMENT_FILE.mime,
})
