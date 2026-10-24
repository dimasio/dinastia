import '@dinastia/ui/styles.css'
import { ThemeProvider, Toaster } from '@dinastia/ui'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { i18n } from './app/i18n.ts'
import { routeTree } from './routeTree.gen.ts'

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent', scrollRestoration: true })

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router
	}
}

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
	<StrictMode>
		<I18nextProvider i18n={i18n}>
			<ThemeProvider>
				<QueryClientProvider client={queryClient}>
					<RouterProvider router={router} />
					<Toaster position="top-center" />
				</QueryClientProvider>
			</ThemeProvider>
		</I18nextProvider>
	</StrictMode>,
)
