// API и воркер задач в одном процессе: pnpm dev (с watch) и e2e (start:all). В проде — отдельные процессы main.ts и worker.ts.
import './main.ts'
import './worker.ts'
