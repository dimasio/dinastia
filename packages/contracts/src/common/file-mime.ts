// Тип файла для проверки и загрузки: Windows без Office не знает .docx/.pptx — браузер отдаёт пустой `File.type`;
// тогда тип — по расширению имени.
const MIME_BY_EXT: Record<string, string> = {
	pdf: 'application/pdf',
	doc: 'application/msword',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xls: 'application/vnd.ms-excel',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	ppt: 'application/vnd.ms-powerpoint',
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	zip: 'application/zip',
	txt: 'text/plain',
	csv: 'text/csv',
	mp3: 'audio/mpeg',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	webm: 'video/webm',
	mkv: 'video/x-matroska',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
}

export function fileMime(file: { name: string; type: string }): string {
	return file.type || MIME_BY_EXT[file.name.split('.').pop()?.toLowerCase() ?? ''] || ''
}
