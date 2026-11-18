// Импорт `…?url` — адрес файла в сборке Vite (воркер pdf.js); веб собирает пакет блоков своим Vite.
declare module '*?url' {
	const url: string
	export default url
}
