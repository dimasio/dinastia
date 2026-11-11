// Модуль ядра «настройки»: экран настроек школы из реестра `defineSettings` модулей.
import { defineModule } from '../module.ts'
import { permissions } from './permissions.ts'
import { settingsRouter } from './router.ts'

export default defineModule({
	name: 'settings',
	router: { settings: settingsRouter },
	permissions,
})
