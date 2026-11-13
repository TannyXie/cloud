/// <reference lib="dom" />
import { expect, test } from '@playwright/test'
import { ownerName, signIn, signInAsInvitedMember } from './login.ts'

// A fresh address per run keeps the invite idempotent against an e2e database that keeps accounts.
const newAddress = () => `invite-${crypto.randomUUID().slice(0, 8)}@demo.ora-space.dev`

test('an owner invites an address and that address signs in', async ({ page }) => {
  const email = newAddress()
  // Names are unique per run too, so a database that keeps old accounts never makes the row match
  // ambiguous.
  const name = `受邀同事-${email.split('@')[0].split('-')[1]}`
  await page.goto('/settings/squads')
  await signIn(page)

  // People join through a squad: the owner invites from inside the one they belong to.
  const tenants = await (await page.request.get('/api/v1/me/tenants')).json()
  const tenantId = tenants.items[0].id
  const squadName = `邀请小队-${email.split('@')[0].split('-')[1]}`
  const created = await page.request.post(`/api/v2/tenants/${tenantId}/squads`, {
    data: { name: squadName, description: '', charter: '' },
  })
  expect(created.ok()).toBeTruthy()
  const squad = await created.json()
  await page.goto(`/settings/squads?squad=${squad.id}`)
  await page.getByRole('dialog').getByRole('button', { name: '添加成员' }).click()

  const invite = page.getByRole('form', { name: '邀请成员' })
  await invite.getByLabel('邮箱').fill(email)
  await invite.getByLabel('显示名（选填）').fill(name)
  await invite.getByRole('button', { name: '邀请' }).click()
  await expect(invite.getByRole('status')).toContainText(`已邀请 ${name}`)
  // The invitation joined the invitee to this squad in the same write.
  const detail = await (await page.request.get(`/api/v2/tenants/${tenantId}/squads/${squad.id}`)).json()
  expect(detail.members.map((member: { displayName: string }) => member.displayName)).toContain(name)
  await page.getByRole('dialog').getByRole('button', { name: '完成' }).click()
  await expect(page.getByRole('dialog').getByText(name)).toBeVisible()

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '退出登录' }).click()
  await page.goto(`/settings/squads?squad=${squad.id}`)
  await signIn(page, email)
  await expect(page.getByRole('img', { name })).toBeVisible()
  // The invited account is a member: the squad is readable, the invitation entry is not.
  await expect(page.getByRole('dialog').getByText(ownerName)).toBeVisible()
  await expect(page.getByRole('dialog').getByRole('button', { name: '添加成员' })).toBeDisabled()
})

test('an address nobody presetted or invited cannot sign in', async ({ page }) => {
  await page.goto('/workflows')
  await page.getByLabel('邮箱').fill(newAddress())
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(
    page.getByText('该邮箱不在演示团队中，请让管理员邀请后再登录。'),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: '登录 Ora' })).toBeVisible()
})

test('a member is refused by the server even without the invitation entry', async ({
  page,
}) => {
  await signInAsInvitedMember(page)

  // Hiding the form is presentation; the workspace API still has to reject the write.
  const tenants = await (await page.request.get('/api/v1/me/tenants')).json()
  const refused = await page.request.post(
    `/api/v2/tenants/${tenants.items[0].id}/members`,
    { data: { email: newAddress() } },
  )
  expect(refused.status()).toBe(403)
  expect((await refused.json()).code).toBe('forbidden')
})
