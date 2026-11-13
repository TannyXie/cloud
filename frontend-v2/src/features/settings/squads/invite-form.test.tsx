import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { fakeBackend } from '@/test/backend'
import { renderSettingsPage } from '../test-utils'
import { InviteForm } from './invite-form'

const tenantId = '00000000-0000-4000-8000-0000000000aa'

describe('InviteForm', () => {
  it('invites an address into its squad and clears the form', async () => {
    const user = userEvent.setup()
    const payloads: string[] = []
    fakeBackend((c) => {
      if (c.url === `/api/v2/tenants/${tenantId}/members` && c.method === 'post') {
        payloads.push(String(c.data))
        return { status: 201, data: { displayName: 'alice' } }
      }
      return undefined
    })
    renderSettingsPage(<InviteForm tenantId={tenantId} squadId="squad-1" />, '/settings/squads')
    await user.type(screen.getByLabelText('邮箱'), 'alice@demo.ora-space.dev')
    await user.click(screen.getByRole('button', { name: '邀请' }))
    expect(await screen.findByRole('status')).toHaveTextContent('已邀请 alice')
    expect(JSON.parse(payloads[0])).toEqual({ email: 'alice@demo.ora-space.dev', squadId: 'squad-1' })
    await waitFor(() => expect((screen.getByLabelText('邮箱') as HTMLInputElement).value).toBe(''))
  })

  it('explains a rejected invitation instead of failing silently', async () => {
    const user = userEvent.setup()
    fakeBackend((c) => {
      if (c.url === `/api/v2/tenants/${tenantId}/members`)
        return { status: 409, data: { code: 'member_exists', params: {}, requestId: 'r' } }
      return undefined
    })
    renderSettingsPage(<InviteForm tenantId={tenantId} squadId="squad-1" />, '/settings/squads')
    await user.type(screen.getByLabelText('邮箱'), 'alice@demo.ora-space.dev')
    await user.click(screen.getByRole('button', { name: '邀请' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('这个邮箱已经是团队成员。')
  })

  it('says only an admin can invite when the server forbids the caller', async () => {
    const user = userEvent.setup()
    fakeBackend((c) => {
      if (c.url === `/api/v2/tenants/${tenantId}/members`)
        return { status: 403, data: { code: 'forbidden', params: {}, requestId: 'r' } }
      return undefined
    })
    renderSettingsPage(<InviteForm tenantId={tenantId} squadId="squad-1" />, '/settings/squads')
    await user.type(screen.getByLabelText('邮箱'), 'alice@demo.ora-space.dev')
    await user.click(screen.getByRole('button', { name: '邀请' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('只有管理员可以邀请成员。')
  })
})
