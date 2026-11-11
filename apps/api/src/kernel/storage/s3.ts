// S3 (D-011): подписанные ссылки на загрузку и чтение, проверка и удаление объекта. Файлы не проходят через API.
import {
	DeleteObjectCommand,
	DeleteObjectsCommand,
	GetObjectCommand,
	HeadBucketCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { config } from '../config.ts'

const client = new S3Client({
	endpoint: config.S3_ENDPOINT,
	region: config.S3_REGION,
	forcePathStyle: config.S3_FORCE_PATH_STYLE,
	credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
	// контрольные суммы — только где обязательны: иначе SDK подписывает CRC-заголовки, которых браузер не пришлёт,
	// а S3-совместимые хранилища (Yandex, SeaweedFS) поддерживают их не все
	requestChecksumCalculation: 'WHEN_REQUIRED',
	responseChecksumValidation: 'WHEN_REQUIRED',
})
const Bucket = config.S3_BUCKET

/** Ссылка на PUT: подписаны тип и длина — объект другого типа или размера S3 не примет. */
export function presignPut(key: string, mime: string, size: number, ttlSeconds = 15 * 60) {
	return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: mime, ContentLength: size }), {
		expiresIn: ttlSeconds,
		signableHeaders: new Set(['content-type', 'content-length']),
	})
}

/** Ссылка на чтение; `downloadName` — отдать как вложение с этим именем. */
export function presignGet(key: string, opts: { ttlSeconds: number; downloadName?: string | undefined }) {
	const disposition = opts.downloadName
		? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`
		: undefined
	return getSignedUrl(
		client,
		new GetObjectCommand({ Bucket, Key: key, ...(disposition ? { ResponseContentDisposition: disposition } : {}) }),
		{ expiresIn: opts.ttlSeconds },
	)
}

/** Размер и тип загруженного объекта; нет объекта — null. */
export async function headObject(key: string): Promise<{ size: number; mime: string } | null> {
	try {
		const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
		return { size: head.ContentLength ?? -1, mime: head.ContentType ?? '' }
	} catch (error) {
		if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
		throw error
	}
}

/** Записать объект с сервера (файлы, которые делает API: выгрузки, документы). */
export async function putObject(key: string, body: Uint8Array, mime: string) {
	await client.send(
		new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: mime, ContentLength: body.length }),
	)
}

/** Прочитать объект с сервера (картинки в PDF документа); нет объекта — null. */
export async function getObject(key: string): Promise<{ body: Uint8Array; mime: string } | null> {
	try {
		const res = await client.send(new GetObjectCommand({ Bucket, Key: key }))
		if (!res.Body) return null
		return { body: await res.Body.transformToByteArray(), mime: res.ContentType ?? '' }
	} catch (error) {
		const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
		if (status === 404 || (error as { name?: string }).name === 'NoSuchKey') return null
		throw error
	}
}

/** Удалить объект (нет объекта — не ошибка). */
export async function deleteObject(key: string) {
	await client.send(new DeleteObjectCommand({ Bucket, Key: key }))
}

/** Удалить все объекты с префиксом (файлы удаляемой школы `schools/<id>/`, 5.5): пачками по 1000; вернёт число. */
export async function deletePrefix(prefix: string): Promise<number> {
	if (!/^schools\/[0-9a-f-]{36}\/$/.test(prefix)) throw new Error(`deletePrefix: только папка школы, а не «${prefix}»`)
	let removed = 0
	for (;;) {
		const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 1000 }))
		const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
		if (!keys.length) return removed
		await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }))
		removed += keys.length
	}
}

/** Хранилище доступно и бакет есть — для `/health/ready` (5.4). */
export async function checkBucket() {
	await client.send(new HeadBucketCommand({ Bucket }))
}
