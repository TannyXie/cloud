import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getGetApiV1TenantsTidMembersQueryKey } from '@/api/members/members'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { codeOf } from '@/lib/api-client'
import { inviteMember } from '../api/generated'

const errors: Record<string, string> = {
  member_exists: '这个邮箱已经是团队成员。',
  user_unavailable: '这个账号已停用，无法邀请。',
  invalid_email: '邮箱格式不正确。',
  invalid_display_name: '显示名最多 64 个字。',
  forbidden: '只有管理员可以邀请成员。',
  not_found: '工作空间不存在或已归档。',
}

/**
 * Owner-only invitation into one squad. The address alone creates the account, so the invitee
 * signs in with it and nothing else — there is no acceptance step — and joins the squad in the
 * same transaction.
 */
export function InviteForm({ tenantId, squadId }: { tenantId: string; squadId: string }) {
  const client = useQueryClient()
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [invited, setInvited] = useState('')
  const invite = useMutation({
    mutationFn: () =>
      inviteMember(tenantId, {
        email: email.trim(),
        displayName: displayName.trim() || undefined,
        squadId,
      }),
    onSuccess: async (member) => {
      setEmail('')
      setDisplayName('')
      setInvited(member.displayName)
      await Promise.all([
        client.invalidateQueries({ queryKey: getGetApiV1TenantsTidMembersQueryKey(tenantId) }),
        // The squad's version moved, so neither its detail nor the list may stay on the old one.
        client.invalidateQueries({ queryKey: ['squads', tenantId] }),
        client.invalidateQueries({ queryKey: ['squad', tenantId, squadId] }),
      ])
    },
  })
  const message = errors[codeOf(invite.error) ?? ''] ?? '邀请失败，请重试。'

  return (
    <form
      aria-label="邀请成员"
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setInvited('')
        invite.mutate()
      }}
    >
      <div className="flex min-w-48 flex-1 flex-col gap-2">
        <Label htmlFor="invite-email">邮箱</Label>
        <Input
          id="invite-email"
          type="email"
          required
          placeholder="teammate@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-2">
        <Label htmlFor="invite-name">显示名（选填）</Label>
        <Input
          id="invite-name"
          placeholder="默认取邮箱 @ 前缀"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>
      <Button type="submit" disabled={invite.isPending || email.trim() === ''}>
        邀请
      </Button>
      {invited !== '' && (
        <p role="status" className="w-full text-sm text-muted-foreground">
          已邀请 {invited}，对方用这个邮箱登录即可。
        </p>
      )}
      {invite.isError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  )
}
