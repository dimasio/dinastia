// Назначения файлов модуля schools (скилл files-media).
import { BRANDING_FAVICON, BRANDING_LOGO } from '@dinastia/contracts/branding'
import { AVATAR } from '@dinastia/contracts/schools'
import { defineFilePurpose } from '#/kernel/storage/files.ts'

/** Аватар участника в школе: картинка (лимиты — в контракте, их же проверяет форма); загружает любой участник себе. */
export const avatarPurpose = defineFilePurpose({ key: AVATAR.purpose, maxSize: AVATAR.maxSize, mime: AVATAR.mime })

/** Логотип и фавикон школы (5.9): загружает тот, кто меняет оформление. */
export const logoPurpose = defineFilePurpose({
	key: BRANDING_LOGO.purpose,
	maxSize: BRANDING_LOGO.maxSize,
	mime: BRANDING_LOGO.mime,
	perm: 'schools.branding.manage',
})
export const faviconPurpose = defineFilePurpose({
	key: BRANDING_FAVICON.purpose,
	maxSize: BRANDING_FAVICON.maxSize,
	mime: BRANDING_FAVICON.mime,
	perm: 'schools.branding.manage',
})
