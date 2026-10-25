// Каждый тестовый процесс — как приложение: реестр модулей (задачи, подписчики, письма) загружен. Очередь задач — своя
// схема pg-boss на процесс: файлы идут параллельно, и задачу файла A не выполнит воркер файла B (письма в памяти
// процесса ушли бы не туда).
process.env.BOSS_SCHEMA = `pgboss_${process.env.VITEST_POOL_ID ?? '0'}`
const { installBoss } = await import('#/kernel/boss.ts')
await installBoss(process.env.DATABASE_URL_OWNER ?? '')
await import('#/modules/index.ts')
