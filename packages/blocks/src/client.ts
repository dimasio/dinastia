// Клиент (apps/web): хосты блоков и палитра; редакторы и просмотры типов грузятся лениво.
export {
	BlockEditorHost,
	type BlockEditorHostProps,
	BlockViewerHost,
	type BlockViewerHostProps,
} from './client/hosts.tsx'
export { BlockPalette } from './client/palette.tsx'
export { type ClientBlock, clientBlock, clientBlocks } from './registry.client.ts'
