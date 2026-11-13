import { beforeEach, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PluginCatalogEntry } from '@/api/generated.schemas'
import {
  installMarketplaceBackend,
  marketplaceEntry,
  marketplaceSelection,
  renderSettingsPage,
} from '../test-utils'
import PluginsPage from './page'
import { useDemoPluginSelections } from '@/lib/demo/plugin-installs'

const mock = vi.hoisted(() => ({ enabled: false }))
vi.mock('@/lib/demo/flags', () => ({ demoMockEnabled: () => mock.enabled }))
vi.mock('@/lib/demo/plugin-installs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/demo/plugin-installs')>()
  return { ...actual, demoInstallDelayMs: () => 0 }
})

const writing = marketplaceEntry('writing-kit', {
  kind: 'skill',
  title: '写作工具箱',
  description: '让团队文档保持清晰与一致。',
  logo: {
    universal: {
      role: 'universal',
      extension: 'svg',
      data: 'data:image/svg+xml;base64,PHN2Zy8+',
    },
  } as PluginCatalogEntry['logo'],
})
const github = marketplaceEntry('github-tools', {
  title: 'GitHub 工具',
  version: '2.1.0',
})
const pack = marketplaceEntry('starter-pack', {
  kind: 'pack',
  title: '团队入门合集',
})
const official = marketplaceEntry('mattpocock.skills', {
  kind: 'skill',
  title: 'Matt Pocock Skills',
  sourceNamespace: 'official',
})
const opencode = marketplaceEntry('ora-space.opencode', {
  kind: 'agent',
  title: 'OpenCode',
  sourceNamespace: 'official',
  version: '0.6.8',
})
const codex = marketplaceEntry('ora-space.codex', {
  kind: 'agent',
  title: 'Codex',
  sourceNamespace: 'official',
  version: '0.3.14',
})
const workflow = marketplaceEntry('ora-space.requirement-development', {
  kind: 'workflow',
  title: '需求开发',
  sourceNamespace: 'official',
  version: '0.1.0',
})
const hook = marketplaceEntry('sample-hooks', {
  kind: 'hook',
  title: '示例 Hooks',
  description: '生命周期 Hook 的安装和卸载只记录空间选择。',
})

beforeEach(() => {
  mock.enabled = false
  useDemoPluginSelections.getState().reset()
  localStorage.clear()
})

it('searches and filters the server catalog, then confirms a server-backed removal', async () => {
  const backend = installMarketplaceBackend({
    catalog: [writing, github, pack],
    selections: [marketplaceSelection(writing, { version: 4 })],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />, '/settings/plugins')
  const row = await screen.findByRole('article', { name: '写作工具箱' })
  expect(screen.getByRole('heading', { name: '技能' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '合集' })).toBeInTheDocument()
  expect(
    within(row).getByText('技能', { selector: '.settings-plugin-kind' }),
  ).toBeInTheDocument()
  expect(row.querySelector('img')).toHaveAttribute(
    'src',
    'data:image/svg+xml;base64,PHN2Zy8+',
  )
  await user.type(screen.getByRole('textbox', { name: '搜索插件' }), '写作')
  expect(
    screen.queryByRole('article', { name: 'GitHub 工具' }),
  ).not.toBeInTheDocument()
  await user.click(
    within(row).getByRole('button', { name: '查看插件 写作工具箱' }),
  )
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'demo/writing-kit',
  )
  await user.click(screen.getByRole('button', { name: '关闭详情' }))
  await user.click(within(row).getByRole('button', { name: '移除' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: '移除' }))
  await waitFor(() =>
    expect(within(row).getByText('未安装')).toBeInTheDocument(),
  )
  expect(backend.bodies.at(-1)).toEqual({
    identifier: 'demo/writing-kit',
    version: 4,
  })
})

it('keeps MCP read-only with no install entry', async () => {
  const backend = installMarketplaceBackend({
    catalog: [writing, github, pack],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: 'GitHub 工具' })
  expect(within(row).getByText('暂不支持安装')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
  await user.click(
    within(row).getByRole('button', { name: '查看插件 GitHub 工具' }),
  )
  expect(await screen.findByRole('dialog')).toHaveTextContent(
    'demo/github-tools',
  )
  expect(backend.bodies).toHaveLength(0)
  expect(localStorage.getItem('ora-v2-plugin-demo:v1')).toBeNull()
})

it('keeps Hooks read-only with no install entry', async () => {
  const backend = installMarketplaceBackend({ catalog: [hook] })
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: '示例 Hooks' })
  expect(screen.getByRole('heading', { name: 'Hooks' })).toBeInTheDocument()
  expect(within(row).getByText('暂不支持安装')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
  expect(backend.bodies).toHaveLength(0)
})

it('keeps unsupported packs disabled and clears no-result filters', async () => {
  installMarketplaceBackend({ catalog: [writing, github, pack] })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const packRow = await screen.findByRole('article', { name: '团队入门合集' })
  expect(within(packRow).getByText('暂不支持安装')).toBeInTheDocument()
  await user.type(
    screen.getByRole('textbox', { name: '搜索插件' }),
    'nothing-matches',
  )
  await user.click(screen.getByRole('button', { name: '清除筛选' }))
  expect(screen.getAllByRole('article')).toHaveLength(3)
})

it('lets a member browse the catalog but not change it', async () => {
  installMarketplaceBackend({
    role: 'member',
    catalog: [writing, github],
    selections: [marketplaceSelection(github)],
  })
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: '写作工具箱' })
  expect(within(row).getByRole('button', { name: '安装' })).toBeDisabled()
  expect(
    screen.getByText(/安装与移除需要工作区管理员权限/),
  ).toBeInTheDocument()
})

it('keeps a marketplace Agent read-only', async () => {
  const backend = installMarketplaceBackend({
    catalog: [writing, opencode, codex],
    selections: [marketplaceSelection(opencode)],
  })
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: 'Codex' })
  expect(screen.getByRole('heading', { name: 'Agent' })).toBeInTheDocument()
  expect(within(row).getByText('暂不支持安装')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
  expect(backend.bodies).toHaveLength(0)
})

it('installs and removes an official workflow through the server', async () => {
  const backend = installMarketplaceBackend({
    catalog: [workflow],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: '需求开发' })
  expect(screen.getByRole('heading', { name: '工作流' })).toBeInTheDocument()
  await user.click(within(row).getByRole('button', { name: '安装' }))
  await waitFor(() => expect(within(row).getByText('已安装')).toBeInTheDocument())
  expect(backend.bodies.at(-1)).toEqual({
    identifier: 'official/ora-space.requirement-development',
    pluginVersion: '0.1.0',
    version: 0,
  })
  await user.click(within(row).getByRole('button', { name: '卸载' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog).toHaveTextContent('已导入的工作流和运行历史会保留')
  await user.click(within(dialog).getByRole('button', { name: '卸载' }))
  await waitFor(() => expect(within(row).getByText('未安装')).toBeInTheDocument())
})

it('installs a non-official workflow through the server like any workflow', async () => {
  const example = marketplaceEntry('ora-space.workflow-examples', {
    kind: 'workflow', title: 'Workflow Examples', sourceNamespace: 'official', version: '0.1.0',
  })
  const backend = installMarketplaceBackend({
    catalog: [example],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: 'Workflow Examples' })
  expect(screen.getByRole('heading', { name: '工作流' })).toBeInTheDocument()
  await user.click(within(row).getByRole('button', { name: '安装' }))
  await waitFor(() => expect(within(row).getByText('已安装')).toBeInTheDocument())
  expect(backend.bodies.at(-1)).toEqual({
    identifier: 'official/ora-space.workflow-examples',
    pluginVersion: '0.1.0',
    version: 0,
  })
})

it('reports a runtime-preinstalled Agent without any install action', async () => {
  const backend = installMarketplaceBackend({
    catalog: [opencode],
    selections: [marketplaceSelection(opencode)],
  })
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: 'OpenCode' })
  expect(within(row).getByText('运行时预装')).toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '安装' })).not.toBeInTheDocument()
  expect(within(row).queryByRole('button', { name: '移除' })).not.toBeInTheDocument()
  expect(backend.bodies).toHaveLength(0)
  expect(localStorage.getItem('ora-v2-plugin-demo:v1')).toBeNull()
})

it('shows the shared official market and manages space sources', async () => {
  installMarketplaceBackend({ catalog: [official] })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  await user.click(screen.getByRole('button', { name: '管理市场' }))
  const dialog = await screen.findByRole('dialog')
  const officialRow = within(dialog).getByRole('article', {
    name: '官方市场',
  })
  expect(officialRow).toHaveTextContent('https://github.com/ora-space/marketplace')
  expect(
    within(officialRow).getByRole('button', { name: '同步' }),
  ).toBeEnabled()

  const sourceURL = 'https://github.com/ora-space/marketplace.git'
  await user.type(
    within(dialog).getByLabelText('HTTPS 仓库地址'),
    sourceURL,
  )
  await user.click(within(dialog).getByRole('button', { name: '添加市场' }))
  const sourceRow = (
    await within(dialog).findByText(sourceURL, { selector: 'strong' })
  ).closest('article')
  expect(sourceRow).not.toBeNull()
  await user.click(within(sourceRow!).getByRole('button', { name: '停用' }))
  await waitFor(() =>
    expect(
      within(dialog)
        .getByText(sourceURL, { selector: 'strong' })
        .closest('article'),
    ).toHaveTextContent('已停用'),
  )
  const disabledRow = within(dialog)
    .getByText(sourceURL, { selector: 'strong' })
    .closest('article')!
  await user.click(within(disabledRow).getByRole('button', { name: '移除来源' }))
  await user.click(
    within(disabledRow).getByRole('button', { name: '确认移除来源' }),
  )
  await waitFor(() =>
    expect(within(dialog).queryByText(sourceURL)).not.toBeInTheDocument(),
  )
})

it('keeps the market source list read-only for members', async () => {
  installMarketplaceBackend({
    role: 'member',
    catalog: [official],
    marketSources: [
      {
        namespace: 'custom-market',
        url: 'https://github.com/ora-space/marketplace.git',
        branch: 'main',
        enabled: true,
        syncedAt: null,
        failure: '',
        retrieval: { mode: 'direct_https', useProxy: false },
      },
    ],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  await user.click(screen.getByRole('button', { name: '管理市场' }))
  const dialog = await screen.findByRole('dialog')
  expect(
    await within(dialog).findByRole('article', { name: '官方市场' }),
  ).toBeVisible()
  expect(
    within(dialog).getByText(
      'https://github.com/ora-space/marketplace.git',
    ),
  ).toBeVisible()
  expect(
    dialog.querySelector('form[aria-label="添加市场"]'),
  ).not.toBeInTheDocument()
  expect(
    within(dialog).queryByRole('button', { name: '添加市场' }),
  ).not.toBeInTheDocument()
  expect(
    within(dialog).queryByRole('button', { name: '同步' }),
  ).not.toBeInTheDocument()
})

it('configures, replaces and clears Git credentials on a space source', async () => {
  const backend = installMarketplaceBackend({
    catalog: [official],
    marketSources: [
      {
        namespace: 'custom-market',
        url: 'https://github.com/ora-space/marketplace.git',
        branch: 'main',
        enabled: true,
        syncedAt: null,
        failure: '',
        retrieval: { mode: 'direct_https', useProxy: false },
      },
    ],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  await user.click(screen.getByRole('button', { name: '管理市场' }))
  const dialog = await screen.findByRole('dialog')
  const sourceRow = (
    await within(dialog).findByText('https://github.com/ora-space/marketplace.git', {
      selector: 'strong',
    })
  ).closest('article')!

  await user.click(within(sourceRow).getByRole('button', { name: '编辑' }))
  await user.type(within(dialog).getByLabelText('用户名'), 'fixture-bot')
  await user.type(within(dialog).getByLabelText('令牌或密码'), 'fixture-token')
  await user.click(within(dialog).getByRole('button', { name: '保存修改' }))
  await waitFor(() =>
    expect(backend.bodies.at(-1)).toEqual({
      url: 'https://github.com/ora-space/marketplace.git',
      branch: 'main',
      enabled: true,
      retrieval: { mode: 'direct_https', useProxy: false },
      gitCredentials: { username: 'fixture-bot', password: 'fixture-token' },
    }),
  )

  backend.state.marketSources[0].gitConfigured = true
  await user.click(within(sourceRow).getByRole('button', { name: '编辑' }))
  await waitFor(() =>
    expect(within(dialog).getByText(/已配置认证/)).toBeInTheDocument(),
  )
  await user.click(
    within(dialog).getByLabelText('清除已保存的 Git 认证'),
  )
  await user.click(within(dialog).getByRole('button', { name: '保存修改' }))
  await waitFor(() =>
    expect(backend.bodies.at(-1)).toEqual({
      url: 'https://github.com/ora-space/marketplace.git',
      branch: 'main',
      enabled: true,
      retrieval: { mode: 'direct_https', useProxy: false },
      clearGitCredentials: true,
    }),
  )
})

it('keeps Git credentials untouched when editing does not change them', async () => {
  const backend = installMarketplaceBackend({
    catalog: [official],
    marketSources: [
      {
        namespace: 'custom-market',
        url: 'https://github.com/ora-space/marketplace.git',
        branch: 'main',
        enabled: true,
        syncedAt: null,
        failure: '',
        retrieval: { mode: 'direct_https', useProxy: false },
        gitConfigured: true,
      },
    ],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  await user.click(screen.getByRole('button', { name: '管理市场' }))
  const dialog = await screen.findByRole('dialog')
  const sourceRow = (
    await within(dialog).findByText('https://github.com/ora-space/marketplace.git', {
      selector: 'strong',
    })
  ).closest('article')!
  await user.click(within(sourceRow).getByRole('button', { name: '编辑' }))
  await user.click(within(dialog).getByRole('button', { name: '保存修改' }))
  await waitFor(() =>
    expect(backend.bodies.at(-1)).toEqual({
      url: 'https://github.com/ora-space/marketplace.git',
      branch: 'main',
      enabled: true,
      retrieval: { mode: 'direct_https', useProxy: false },
    }),
  )
})

it('installs the demo MCP and a market Agent in the browser only, without a server request', async () => {
  mock.enabled = true
  const backend = installMarketplaceBackend({ catalog: [writing, codex] })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const mcpRow = await screen.findByRole('article', { name: '示例 MCP 工具' })
  expect(within(mcpRow).getByRole('button', { name: '安装' })).toBeInTheDocument()
  await user.click(within(mcpRow).getByRole('button', { name: '安装' }))
  await waitFor(() =>
    expect(
      within(mcpRow).getByRole('button', { name: '移除' }),
    ).toBeInTheDocument(),
  )
  expect(within(mcpRow).getByText('已安装（演示）')).toBeInTheDocument()

  const agentRow = await screen.findByRole('article', { name: 'Codex' })
  expect(within(agentRow).getByRole('button', { name: '安装' })).toBeInTheDocument()
  await user.click(within(agentRow).getByRole('button', { name: '安装' }))
  await waitFor(() =>
    expect(
      within(agentRow).getByRole('button', { name: '移除' }),
    ).toBeInTheDocument(),
  )
  expect(backend.bodies).toHaveLength(0)
  expect(localStorage.getItem('ora-v2-plugin-demo:v1')).toContain(
    'demo/sample-mcp',
  )
  expect(localStorage.getItem('ora-v2-plugin-demo:v1')).toContain(
    'official/ora-space.codex',
  )
})

it('records a demo Hook install and removes it without contacting the server', async () => {
  mock.enabled = true
  const backend = installMarketplaceBackend({ catalog: [hook] })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: '示例 Hooks' })
  await user.click(within(row).getByRole('button', { name: '安装' }))
  await waitFor(() =>
    expect(within(row).getByRole('button', { name: '移除' })).toBeInTheDocument(),
  )
  await user.click(within(row).getByRole('button', { name: '移除' }))
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', {
      name: '移除',
    }),
  )
  await waitFor(() =>
    expect(
      within(row).queryByRole('button', { name: '移除' }),
    ).not.toBeInTheDocument(),
  )
  expect(backend.bodies).toHaveLength(0)
})

it('keeps the demo runtime-preinstalled Agent install browser-only', async () => {
  mock.enabled = true
  const backend = installMarketplaceBackend({
    catalog: [opencode],
    selections: [marketplaceSelection(opencode)],
  })
  const user = userEvent.setup()
  renderSettingsPage(<PluginsPage />)
  const row = await screen.findByRole('article', { name: 'OpenCode' })
  expect(within(row).getByText('运行时预装')).toBeInTheDocument()
  expect(within(row).getByRole('button', { name: '安装' })).toBeInTheDocument()
  await user.click(within(row).getByRole('button', { name: '安装' }))
  await waitFor(() =>
    expect(within(row).getByRole('button', { name: '移除' })).toBeInTheDocument(),
  )
  expect(backend.bodies).toHaveLength(0)
})
