import type { ReactNode } from 'react'

/** Экраны входа/регистрации/приглашения: по центру, одна колонка. */
export function Centered({ children }: { children: ReactNode }) {
	return <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">{children}</div>
}
