import { beforeEach, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  installMarketplaceBackend,
  marketplaceEntry,
  marketplaceSelection,
  renderSettingsPage,
} from '../test-utils'
import type { Skill } from '@/lib/skills-api/generated'
import SkillsPage from './page'

const writing = marketplaceEntry('writing-kit', {
  kind: 'skill',
  title: '写作工具箱',
  description: '让团队文档保持清晰与一致。',
  readme: '# writing-guide\n\n先明确读者和目的，再组织内容。',
})

const serverSkill = (overrides: Partial<Skill> = {}): Skill => ({
  id: '00000000-0000-4000-8000-000000000801',
  name: 'review',
  description: '检查改动的正确性和测试覆盖。',
  content: '# 代码审查\n\n先看行为，再看实现。',
  version: 1,
  createdAt: '2026-11-02T08:00:00Z',
  updatedAt: '2026-11-02T08:00:00Z',
  ...overrides,
})

const reviewing = marketplaceEntry('reviewing', {
  kind: 'skill',
  readme: '# review\n\n代码审查，用于说明同名冲突。',
})

const pocock = marketplaceEntry('mattpocock.skills', {
  kind: 'skill',
  title: 'Matt Pocock Skills',
  readme:
    '# Matt Pocock Skills\n\n## Included skills\n\n- tdd\n- code-review\n- prototype\n',
})

const skillFile = (
  name: string,
  description = '导入的技能',
  body = '# 导入说明\n\n按步骤执行。',
) =>
  new File(
    [`---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`],
    'SKILL.md',
    { type: 'text/markdown' },
  )

beforeEach(() => localStorage.clear())

it('marks a user skill shadowed by a bundled market Skill name', async () => {
  installMarketplaceBackend({
    catalog: [pocock],
    selections: [marketplaceSelection(pocock)],
    skills: [serverSkill({ id: '00000000-0000-4000-8000-000000000802', name: 'tdd' })],
  })
  renderSettingsPage(<SkillsPage />)
  expect(
    await screen.findByText(/与本空间已安装的市场 Skill「tdd」同名/),
  ).toBeInTheDocument()
})

it('marks a user skill whose name an installed market Skill takes', async () => {
  installMarketplaceBackend({
    catalog: [reviewing],
    selections: [marketplaceSelection(reviewing)],
    skills: [serverSkill()],
  })
  renderSettingsPage(<SkillsPage />)
  expect(
    await screen.findByText(/与本空间已安装的市场 Skill「review」同名/),
  ).toBeInTheDocument()
  const localRow = (await screen.findAllByRole('article', { name: 'review' }))[0]
  const user = userEvent.setup()
  await user.click(
    within(localRow).getByRole('button', { name: '查看技能 review' }),
  )
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(/同名，在这里不生效，使用的是市场版本/)).toBeInTheDocument()
})

it('creates, edits, renders and deletes a server-backed skill', async () => {
  const backend = installMarketplaceBackend({
    catalog: [writing],
    skills: [serverSkill()],
  })
  const user = userEvent.setup()
  renderSettingsPage(<SkillsPage />)
  expect(await screen.findByRole('article', { name: 'review' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '新建技能' }))
  await user.type(screen.getByLabelText('技能名称'), 'release-notes')
  await user.type(screen.getByLabelText('简介'), '发布说明')
  await user.type(
    screen.getByLabelText('说明文档（Markdown）'),
    '# 发布清单\n\n检查兼容性。',
  )
  await user.click(screen.getByRole('button', { name: '保存技能' }))
  const row = await screen.findByRole('article', { name: 'release-notes' })
  await user.click(
    within(row).getByRole('button', { name: '查看技能 release-notes' }),
  )
  expect(
    await screen.findByRole('heading', { name: '发布清单' }),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '编辑技能' }))
  await user.clear(screen.getByLabelText('简介'))
  await user.type(screen.getByLabelText('简介'), '已更新')
  await user.click(screen.getByRole('button', { name: '保存技能' }))
  await screen.findByRole('button', { name: '编辑技能' })
  await user.click(screen.getByRole('button', { name: '删除技能' }))
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '删除技能',
    }),
  )
  await waitFor(() =>
    expect(
      screen.queryByRole('article', { name: 'release-notes' }),
    ).not.toBeInTheDocument(),
  )
  expect(backend.state.skills.map((skill) => skill.name)).not.toContain(
    'release-notes',
  )
})

it('imports one SKILL.md and asks before overwriting a conflict', async () => {
  const backend = installMarketplaceBackend({ catalog: [writing] })
  const user = userEvent.setup()
  renderSettingsPage(<SkillsPage />)
  await screen.findByRole('article', { name: 'writing-guide' })

  await user.click(screen.getByRole('button', { name: '导入技能' }))
  await user.upload(screen.getByLabelText(/选择 SKILL.md/), skillFile('review'))
  await user.click(screen.getByRole('button', { name: '导入' }))
  expect(await screen.findByRole('article', { name: 'review' })).toBeVisible()
  expect(backend.state.skills).toHaveLength(1)

  await user.click(screen.getByRole('button', { name: '导入技能' }))
  await user.upload(
    screen.getByLabelText(/选择 SKILL.md/),
    skillFile('review', '覆盖后的说明'),
  )
  await user.click(screen.getByRole('button', { name: '导入' }))
  expect(await screen.findByText('已有同名技能')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '覆盖并导入' }))
  await waitFor(() => expect(backend.state.skills).toHaveLength(1))
  expect(backend.state.skills[0]).toMatchObject({
    name: 'review',
    description: '覆盖后的说明',
    version: 2,
  })
})

it('installs and removes the source plugin from the skill row and keeps the document readonly', async () => {
  const backend = installMarketplaceBackend({ catalog: [writing] })
  const user = userEvent.setup()
  renderSettingsPage(<SkillsPage />)
  const row = await screen.findByRole('article', { name: 'writing-guide' })
  expect(within(row).getByText('来源插件未安装')).toBeInTheDocument()
  await user.click(within(row).getByRole('button', { name: '安装技能' }))
  await waitFor(() =>
    expect(within(row).getByText('等待下发')).toBeInTheDocument(),
  )
  expect(
    backend.state.selections.find(
      (selection) => selection.identifier === 'writing-kit',
    )?.desiredState,
  ).toBe('installed')
  await user.click(within(row).getByRole('button', { name: '移除技能' }))
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '移除技能',
    }),
  )
  await waitFor(() =>
    expect(within(row).getByText('来源插件未安装')).toBeInTheDocument(),
  )
  await user.click(
    within(row).getByRole('button', { name: '查看技能 writing-guide' }),
  )
  expect(
    screen.queryByRole('button', { name: '编辑技能' }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: /demo\/writing-kit/ }),
  ).toHaveAttribute('href', '/settings/plugins?plugin=demo%2Fwriting-kit')
})

it('treats a selected market skill as waiting for delivery without a project node receipt', async () => {
  const backend = installMarketplaceBackend({
    catalog: [writing],
    selections: [
      marketplaceSelection(writing, {
        observedState: 'pending',
        observedVersion: null,
      }),
    ],
  })
  renderSettingsPage(<SkillsPage />)
  const row = await screen.findByRole('article', { name: 'writing-guide' })
  await waitFor(() => {
    expect(backend.seen).toContain(
      'GET /api/v1/tenants/00000000-0000-4000-8000-0000000000aa/spaces/00000000-0000-4000-8000-0000000000bb/plugins/results/demo/writing-kit',
    )
  })
  await waitFor(() =>
    expect(within(row).getByText('等待下发')).toBeInTheDocument(),
  )
  expect(within(row).queryByText('等待节点')).not.toBeInTheDocument()
  expect(within(row).getByRole('button', { name: '移除技能' })).toBeVisible()
})

it('shows a member the market state without market write controls', async () => {
  installMarketplaceBackend({
    role: 'member',
    catalog: [writing],
    selections: [marketplaceSelection(writing)],
  })
  renderSettingsPage(<SkillsPage />)
  const row = await screen.findByRole('article', { name: 'writing-guide' })
  await waitFor(() =>
    expect(within(row).getByText('等待下发')).toBeInTheDocument(),
  )
  expect(
    within(row).queryByRole('button', { name: '移除技能' }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '新建技能' })).toBeVisible()
})

it('shows per-project delivery results on the skill row and detail panel', async () => {
  installMarketplaceBackend({
    catalog: [writing],
    selections: [marketplaceSelection(writing)],
    progress: [
      {
        namespace: 'demo',
        identifier: 'writing-kit',
        results: [
          {
            projectId: 'project-a',
            name: '项目 A',
            state: 'installed',
            installedVersion: '1.0.0',
            failure: '',
          },
          {
            projectId: 'project-b',
            name: '项目 B',
            state: 'applying',
            installedVersion: '',
            failure: '',
          },
        ],
      },
    ],
  })
  const user = userEvent.setup()
  renderSettingsPage(<SkillsPage />)
  const row = await screen.findByRole('article', { name: 'writing-guide' })
  await waitFor(() =>
    expect(within(row).getByText('下发中')).toBeInTheDocument(),
  )
  await user.click(
    within(row).getByRole('button', { name: '查看技能 writing-guide' }),
  )
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText('项目下发状态')).toBeInTheDocument()
  expect(within(dialog).getByText('项目 A')).toBeInTheDocument()
  expect(within(dialog).getByText('项目 B')).toBeInTheDocument()
  const blockOf = (name: string) =>
    within(dialog).getByText(name, { exact: false }).closest('div')
  expect(blockOf('项目 A')).toHaveTextContent(/已下发/)
  expect(blockOf('项目 B')).toHaveTextContent(/下发中/)
})

it('marks a failed delivery and shows the failure reason', async () => {
  installMarketplaceBackend({
    catalog: [writing],
    selections: [marketplaceSelection(writing)],
    progress: [
      {
        namespace: 'demo',
        identifier: 'writing-kit',
        results: [
          {
            projectId: 'project-a',
            name: '项目 A',
            state: 'failed',
            installedVersion: '',
            failure: '技能包下载失败或完整性校验未通过，请重新应用。',
          },
        ],
      },
    ],
  })
  const user = userEvent.setup()
  renderSettingsPage(<SkillsPage />)
  const row = await screen.findByRole('article', { name: 'writing-guide' })
  await waitFor(() =>
    expect(within(row).getByText('安装失败')).toBeInTheDocument(),
  )
  await user.click(
    within(row).getByRole('button', { name: '查看技能 writing-guide' }),
  )
  const dialog = await screen.findByRole('dialog')
  await waitFor(() =>
    expect(
      within(dialog).getAllByText(/技能包下载失败或完整性校验未通过/).length,
    ).toBeGreaterThan(0),
  )
})

it('prompts a reinstall for a legacy selection without a frozen package', async () => {
  installMarketplaceBackend({
    catalog: [writing],
    selections: [
      marketplaceSelection(writing, {
        installError: '旧版本没有保留安装包信息，请重新安装。',
      }),
    ],
  })
  const user = userEvent.setup()
  renderSettingsPage(<SkillsPage />)
  const row = await screen.findByRole('article', { name: 'writing-guide' })
  await waitFor(() =>
    expect(within(row).getByText('安装失败')).toBeInTheDocument(),
  )
  await user.click(
    within(row).getByRole('button', { name: '查看技能 writing-guide' }),
  )
  const dialog = await screen.findByRole('dialog')
  await waitFor(() =>
    expect(
      within(dialog).getByText(/旧版本没有保留安装包信息，请重新安装/),
    ).toBeInTheDocument(),
  )
})
