// Назначения файлов модуля schools (скилл files-media).
import { AVATAR } from '@dinastia/contracts/schools'
import { defineFilePurpose } from '#/kernel/storage/files.ts'

/** Аватар участника в школе: картинка (лимиты — в контракте, их же проверяет форма); загружает любой участник себе. */
export const avatarPurpose = defineFilePurpose({ key: AVATAR.purpose, maxSize: AVATAR.maxSize, mime: AVATAR.mime })
