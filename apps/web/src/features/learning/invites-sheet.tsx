// Панель «Ссылки-приглашения» на вкладке «Ученики» (карточки 4.1(б), 4.2): создать ссылку (срок, лимит, поток), скопировать
// сразу после создания (позже её не показать — в БД только хэш), список со статусами, отзыв.
import {
	Badge,
	Button,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	toast,
} from '@dinastia/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorText } from '#/app/errors.ts'
import { orpc } from '#/app/orpc.ts'

/** Значение «без потока» в выборе (у Select не бывает пустого значения). */
const NONE = 'none'

export function InvitesSheet(props: { courseId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
	const { courseId } = props
	const { t } = useTranslation(['learning', 'errors', 'common'])
	const qc = useQueryClient()
	const listOpts = orpc.learning.invites.list.queryOptions({ input: { courseId } })
	const invites = useQuery({ ...listOpts, enabled: props.open })
	const groups = useQuery({ ...orpc.learning.groups.list.queryOptions({ input: { courseId } }), enabled: props.open })
	const [groupId, setGroupId] = useState(NONE)
	const [days, setDays] = useState('30')
	const [limit, setLimit] = useState('')
	const [created, setCreated] = useState<string>()
	const onError = (e: unknown) => toast.error(t(errorText(e), { ns: 'errors' }))
	const create = useMutation({
		...orpc.learning.invites.create.mutationOptions(),
		onSuccess: (res) => {
			setCreated(res.url)
			qc.invalidateQueries({ queryKey: listOpts.queryKey })
		},
		onError,
	})
	const revoke = useMutation({
		...orpc.learning.invites.revoke.mutationOptions(),
		onSuccess: () => qc.invalidateQueries({ queryKey: listOpts.queryKey }),
		onError,
	})
	const num = (v: string) => (v.trim() === '' ? null : Number(v))
	const d = num(days)
	const l = num(limit)
	const invalid =
		d === null || !Number.isInteger(d) || d < 1 || d > 365 || (l !== null && (!Number.isInteger(l) || l < 1))
	async function copy(url: string) {
		try {
			await navigator.clipboard.writeText(url)
			toast.success(t('learning:invites.copied'))
		} catch {
			toast.error(t('learning:invites.copyFailed'))
		}
	}
	return (
		<Sheet open={props.open} onOpenChange={props.onOpenChange}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-md" data-testid="invites-sheet">
				<SheetHeader>
					<SheetTitle>{t('learning:invites.title')}</SheetTitle>
					<SheetDescription>{t('learning:invites.description')}</SheetDescription>
				</SheetHeader>
				<div className="grid gap-4 px-4 pb-4">
					<form
						className="grid gap-3"
						onSubmit={(e) => {
							e.preventDefault()
							if (!invalid && d !== null)
								create.mutate({
									courseId,
									expiresInDays: d,
									...(l !== null ? { maxUses: l } : {}),
									...(groupId !== NONE ? { groupId } : {}),
								})
						}}
					>
						<div className="grid grid-cols-2 gap-2">
							<div className="grid gap-1">
								<Label htmlFor="invite-days">{t('learning:invites.days')}</Label>
								<Input
									id="invite-days"
									inputMode="numeric"
									value={days}
									onChange={(e) => setDays(e.target.value)}
									data-testid="invite-days"
								/>
							</div>
							<div className="grid gap-1">
								<Label htmlFor="invite-limit">{t('learning:invites.limit')}</Label>
								<Input
									id="invite-limit"
									inputMode="numeric"
									value={limit}
									onChange={(e) => setLimit(e.target.value)}
									data-testid="invite-limit"
								/>
							</div>
						</div>
						{Boolean(groups.data?.length) && (
							<div className="grid gap-1">
								<Label htmlFor="invite-group">{t('learning:invites.group')}</Label>
								<Select value={groupId} onValueChange={setGroupId}>
									<SelectTrigger id="invite-group" className="w-full" data-testid="invite-group">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={NONE}>{t('learning:invites.groupNone')}</SelectItem>
										{groups.data?.map((g) => (
											<SelectItem key={g.id} value={g.id}>
												{g.title}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<Button type="submit" disabled={invalid || create.isPending} data-testid="invite-create">
							{t('learning:invites.create')}
						</Button>
					</form>
					{created && (
						<div className="grid gap-2 rounded-md border bg-muted/40 p-3" data-testid="invite-created">
							<p className="text-sm">{t('learning:invites.createdHint')}</p>
							<div className="flex gap-2">
								<Input readOnly value={created} aria-label={t('learning:invites.linkLabel')} data-testid="invite-url" />
								<Button
									type="button"
									variant="outline"
									size="icon"
									onClick={() => copy(created)}
									aria-label={t('learning:invites.copy')}
									data-testid="invite-copy"
								>
									<Copy />
								</Button>
							</div>
						</div>
					)}
					<ul className="grid gap-2" data-testid="invites-list">
						{invites.data?.length === 0 && (
							<li className="text-muted-foreground text-sm">{t('learning:invites.empty')}</li>
						)}
						{invites.data?.map((i) => (
							<li
								key={i.id}
								className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
								data-testid="invite-row"
								data-status={i.status}
							>
								<Badge variant={i.status === 'active' ? 'default' : 'outline'}>
									{t(`learning:invites.status.${i.status}`)}
								</Badge>
								<span className="min-w-0 flex-1 truncate">
									{i.email ?? t('learning:invites.kindLink')}
									{i.groupTitle && (
										<span className="text-muted-foreground">
											{' '}
											{t('learning:invites.inGroup', { title: i.groupTitle })}
										</span>
									)}
									<span className="text-muted-foreground">
										{' · '}
										{t('learning:invites.uses', { uses: i.uses, max: i.maxUses ?? '∞' })}
										{' · '}
										{t('learning:invites.until', { date: new Date(i.expiresAt).toLocaleDateString('ru-RU') })}
									</span>
								</span>
								{i.status === 'active' && (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => revoke.mutate({ id: i.id })}
										disabled={revoke.isPending}
										data-testid="invite-revoke"
									>
										{t('learning:invites.revoke')}
									</Button>
								)}
							</li>
						))}
					</ul>
				</div>
			</SheetContent>
		</Sheet>
	)
}
