import { createFileRoute } from '@tanstack/react-router'
import { People } from '#/features/ops/people.tsx'

export const Route = createFileRoute('/ops/people')({ component: People })
