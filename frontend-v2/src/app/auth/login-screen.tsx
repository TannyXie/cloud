import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { OraMark } from '@/components/ora-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { codeOf } from '@/lib/api-client'
import { getProviders, startLogin } from '@/lib/auth-api'

const LABELS: Record<string, string> = { github: '使用 GitHub 登录', 'huawei-idaas': '使用华为账号登录' }

/**
 * The login screen the session gate shows in place. v2-server offers one provider, `email`: the
 * address alone signs in whoever the startup preset lists or an owner invited, so the form says
 * plainly that this is a demo where knowing an address is enough. That form only appears when the
 * Gateway lists `email`; against a Gateway that offers only real providers the screen shows their
 * buttons and no address field, rather than an entry that could only fail as `unknown_provider`.
 */
export function LoginScreen({ returnTo }: { returnTo: string }) {
  const providers = useQuery({ queryKey: ['auth', 'providers'], queryFn: getProviders, retry: false })
  const [email, setEmail] = useState('')
  const login = useMutation({
    mutationFn: (address: string) => startLogin('email', returnTo, address),
    onSuccess: (url) => window.location.assign(url),
  })
  const providerLogin = useMutation({
    mutationFn: (provider: string) => startLogin(provider, returnTo),
    onSuccess: (url) => window.location.assign(url),
  })
  const offered = providers.data?.providers ?? []
  const emailOffered = offered.includes('email')
  const providerButtons = offered.filter((p) => p !== 'email')
  const refused = codeOf(login.error) === 'email_not_invited'

  return (
    <div className="flex h-svh items-center justify-center bg-sidebar bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_60%)] px-4">
      <form
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border bg-card p-8 shadow-[0_12px_40px_var(--shadow-color)]"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate(email.trim())
        }}
      >
        <div className="flex flex-col gap-3">
          <OraMark className="size-10" />
          <h1 className="text-xl font-semibold tracking-tight">登录 Ora</h1>
        </div>
        {providers.isPending && <p className="text-sm text-muted-foreground">加载中…</p>}
        {providers.isError && <p className="text-sm text-destructive">无法获取登录方式，请稍后重试。</p>}
        {emailOffered && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-email">邮箱</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                placeholder="owner@demo.ora-space.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg" disabled={login.isPending || email.trim() === ''}>
              登录
            </Button>
            {refused && <p className="text-sm text-destructive">该邮箱不在演示团队中，请让管理员邀请后再登录。</p>}
            {login.isError && !refused && <p className="text-sm text-destructive">登录失败，请重试。</p>}
          </>
        )}
        {providerButtons.map((p) => (
          <Button key={p} type="button" variant="outline" disabled={providerLogin.isPending} onClick={() => providerLogin.mutate(p)}>
            {LABELS[p] ?? p}
          </Button>
        ))}
        {emailOffered && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
            演示环境：只凭邮箱即可登录，知道邮箱就能冒充任何人。请勿在演示环境之外使用。
          </p>
        )}
      </form>
    </div>
  )
}
