import { Settings } from 'lucide-react'
import { redirect } from 'react-router'
import type { Feature } from '@/app/feature'
import { getProviders } from '@/lib/auth-api'
import { isDeployedProviders } from '@/lib/deploy-mode'

/**
 * Settings pages that only persist browser-local data never render in a deployed install; reading
 * their URL redirects to the squad page. A providers failure keeps the development behavior instead
 * of redirecting on a guess.
 */
async function hideInDeployed() {
  const providers = await getProviders().catch(() => undefined)
  return isDeployedProviders(providers?.providers)
    ? redirect('/settings/squads')
    : undefined
}

export const settings: Feature = {
  path: 'settings',
  title: '设置',
  icon: Settings,
  page: () => import('./page'),
  children: [
    { index: true, loader: () => redirect('/settings/squads') },
    { path: 'members', loader: () => redirect('/settings/squads') },
    {
      path: 'squads',
      lazy: async () => ({
        Component: (await import('./squads/page')).default,
      }),
    },
    {
      path: 'model-connections',
      loader: hideInDeployed,
      lazy: async () => ({
        Component: (await import('./model-connections/page')).default,
      }),
    },
    {
      path: 'roles',
      loader: hideInDeployed,
      lazy: async () => ({
        Component: (await import('./roles/page')).default,
      }),
    },
    {
      path: 'theme',
      lazy: async () => ({ Component: (await import('./theme/page')).default }),
    },
    {
      path: 'plugins',
      lazy: async () => ({
        Component: (await import('./plugins/page')).default,
      }),
    },
    {
      path: 'skills',
      lazy: async () => ({
        Component: (await import('./skills/page')).default,
      }),
    },
    { path: '*', loader: () => redirect('/settings/squads') },
  ],
}
