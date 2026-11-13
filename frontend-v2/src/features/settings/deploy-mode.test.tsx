import { expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { fakeBackend } from '@/test/backend'
import { isDeployedProviders } from '@/lib/deploy-mode'
import { renderSettingsPage } from './test-utils'
import SettingsPage from './page'

function serveProviders(providers?: string[]) {
  fakeBackend((c) => {
    if (c.url === '/auth/providers')
      return providers === undefined
        ? undefined
        : { status: 200, data: { providers, default: providers[0] } }
    if (c.url === '/api/v1/me/tenants')
      return {
        status: 200,
        data: { items: [{ id: 't', name: '演示团队', status: 'active', role: 'owner' }], nextCursor: '' },
      }
    return undefined
  })
}

it('recognizes a deployed install only when idaas is offered', () => {
  expect(isDeployedProviders(['email'])).toBe(false)
  expect(isDeployedProviders(['idaas'])).toBe(true)
  expect(isDeployedProviders(undefined)).toBe(false)
  expect(isDeployedProviders([])).toBe(false)
})

it('hides the browser-only pages from the navigation in a deployed install', async () => {
  serveProviders(['idaas'])
  renderSettingsPage(<SettingsPage />, '/settings/squads')
  await waitFor(() => expect(screen.getByRole('navigation', { name: '设置导航' })).toBeInTheDocument())
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: '角色' })).not.toBeInTheDocument(),
  )
  expect(screen.queryByRole('link', { name: '模型连接' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '小队' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Plugins' })).toBeInTheDocument()
})

it('keeps the browser-only pages in the navigation in a development install', async () => {
  serveProviders(['email'])
  renderSettingsPage(<SettingsPage />, '/settings/squads')
  await waitFor(() => expect(screen.getByRole('navigation', { name: '设置导航' })).toBeInTheDocument())
  expect(screen.getByRole('link', { name: '角色' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '模型连接' })).toBeInTheDocument()
})

it('falls back to development when providers cannot be read', async () => {
  serveProviders(undefined)
  renderSettingsPage(<SettingsPage />, '/settings/squads')
  await waitFor(() => expect(screen.getByRole('navigation', { name: '设置导航' })).toBeInTheDocument())
  expect(screen.getByRole('link', { name: '角色' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '模型连接' })).toBeInTheDocument()
})
