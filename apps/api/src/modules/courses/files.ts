// Назначения файлов модуля courses (скилл files-media, карточка 2.7): обложка курса и медиа урока. Загружает тот, кто
// правит курсы; лимиты — в контракте и реестре блоков (их же проверяют формы до загрузки).
import { BLOCK_MEDIA } from '@dinastia/blocks'
import { COURSE_COVER, LESSON_MEDIA_PURPOSE } from '@dinastia/contracts/courses'
import { defineFilePurpose } from '#/kernel/storage/files.ts'

export const coverPurpose = defineFilePurpose({
	key: COURSE_COVER.purpose,
	maxSize: COURSE_COVER.maxSize,
	mime: COURSE_COVER.mime,
	perm: 'courses.manage',
})

export const lessonImagePurpose = defineFilePurpose({
	key: LESSON_MEDIA_PURPOSE.image,
	maxSize: BLOCK_MEDIA.image.maxSize,
	mime: BLOCK_MEDIA.image.mime,
	perm: 'courses.manage',
})

export const lessonFilePurpose = defineFilePurpose({
	key: LESSON_MEDIA_PURPOSE.file,
	maxSize: BLOCK_MEDIA.file.maxSize,
	mime: BLOCK_MEDIA.file.mime,
	perm: 'courses.manage',
})
