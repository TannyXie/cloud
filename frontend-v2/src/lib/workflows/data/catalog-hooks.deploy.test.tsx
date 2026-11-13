import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { UserContext } from '@/app/auth/user'
import { fakeBackend, demoUser } from '@/test/backend'
import { useAgents } from './catalog-hooks'

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <UserContext.Provider value={demoUser}>{children}</UserContext.Provider>
    </QueryClientProvider>
  )
}

function serveProviders(providers: string[]) {
  fakeBackend((c) =>
    c.url === '/auth/providers'
      ? { status: 200, data: { providers, default: providers[0] } }
      : undefined,
  )
}

describe('useAgents in a deployed install', () => {
  it('offers no roles when the gateway is idaas', async () => {
    serveProviders(['idaas'])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useAgents(), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data).toEqual([])
  })

  it('offers the saved roles when the gateway is email (development)', async () => {
    serveProviders(['email'])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useAgents(), { wrapper: wrapperFor(client) })
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data?.map((role) => role.name)).toEqual(['代码审查', '技术写作'])
  })
})
