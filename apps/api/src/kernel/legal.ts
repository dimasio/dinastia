/**
 * Версии юридических текстов (D-022, 5.5); тексты — `apps/web/src/features/legal/texts/`, их даёт владелец (до того —
 * черновики с плашкой «проект»). Новая редакция текста — новая версия здесь: согласие даётся заново.
 */
export const LEGAL_VERSIONS = {
	offer: 'draft-2026-10',
	privacy: 'draft-2026-10',
	/** Шаблон политики школы — для школ без своей политики (`schools_settings.privacy_url` пуст). */
	schoolPrivacy: 'draft-2026-11',
} as const
