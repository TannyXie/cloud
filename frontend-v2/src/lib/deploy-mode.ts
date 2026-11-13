import { useQuery } from '@tanstack/react-query'
import { getProviders } from './auth-api'

/**
 * The single provider a deployment offers. The login decision (A6) fixes it: `V2_LOGIN=idaas`
 * is a deployed install, `email` is development, and the two never coexist. `GET /auth/providers`
 * therefore returns exactly one of them.
 */
export const deployedProviders = ['idaas'] as const

/** Whether a provider list marks this build as the deployed (IDaaS) install. */
export function isDeployedProviders(providers: string[] | undefined): boolean {
  return (providers ?? []).some((provider) =>
    (deployedProviders as readonly string[]).includes(provider),
  )
}

/**
 * Reads the deployment mode through the same providers query the login screen uses. Unknown,
 * empty or failing responses stay on the development behavior (everything visible), so a gateway
 * hiccup never hides settings pages it cannot prove should be hidden.
 */
export function useDeployedVersion() {
  const query = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: getProviders,
    retry: false,
  })
  return isDeployedProviders(query.data?.providers)
}
