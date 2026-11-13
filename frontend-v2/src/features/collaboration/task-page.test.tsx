import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserContext } from '@/app/auth/user'
import type { CollaborationTarget, User } from '@/api/generated.schemas'
import { type Conversation, emptyConversation } from '@/components/agent-thread/model/types'
import * as workflowsApi from '@/lib/workflows/api/generated'
import * as workspaceApi from '@/lib/workspace-api/generated'
import * as api from './tasks-api/generated'
import type { Task, TaskDecomposition, TaskRun, TaskTimeline } from './tasks-api/generated'
import TaskPage from './task-page'

const targets = vi.hoisted(() => ({ items: [] as CollaborationTarget[] }))
const session = vi.hoisted(() => ({ conversation: null as Conversation | null }))
const workspace = vi.hoisted(() => ({ role: 'owner' }))
vi.mock('@/api/me/me', () => ({ useGetApiV1MeTenants: () => ({ data: { items: [{ id: 'tenant', role: workspace.role }] }, isLoading: false, isError: false }) }))
vi.mock('@/api/members/members', () => ({ useGetApiV1TenantsTidMembers: () => ({ data: { items: [] }, isLoading: false, isError: false }) }))
vi.mock('@/api/spaces/spaces', () => ({
  useGetApiV1TenantsTidSpaces: () => ({ data: { items: [], nextCursor: '' }, isLoading: false, isError: false }),
  useGetApiV1TenantsTidSpacesSpaceIdPlugins: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}))
vi.mock('@/api/tenants/tenants', () => ({ useGetApiV1TenantsTidCollaborationTargets: () => ({ data: targets }) }))
vi.mock('@/lib/squads-api/generated', () => ({ listSquads: vi.fn().mockResolvedValue({ items: [], nextCursor: '' }) }))
vi.mock('@/lib/projects-api/generated', () => ({ getApiV2TenantsTidProjects: vi.fn().mockResolvedValue({ items: [], nextCursor: '' }) }))
// The live thread has its own tests; here a run shows the session its stream would fold.
vi.mock('./run-session', () => ({ useRunSession: () => ({ conversation: session.conversation, refused: false }) }))
vi.mock('./tasks-api/generated', () => ({
  getTask: vi.fn(), getTaskTimeline: vi.fn(), listTaskExecutors: vi.fn(), startTaskRun: vi.fn(), stopTaskRun: vi.fn(),
  createTaskComment: vi.fn(), setTaskStatus: vi.fn(), setTaskAssignee: vi.fn(), updateTask: vi.fn(),
  listTasks: vi.fn(), listTaskDecompositions: vi.fn(), startTaskDecomposition: vi.fn(),
}))
vi.mock('@/lib/workflows/api/generated', () => ({
  listWorkflows: vi.fn(), listWorkflowRuns: vi.fn(), createWorkflowRun: vi.fn(), updateWorkflowRunInput: vi.fn(), startWorkflowRun: vi.fn(),
}))
vi.mock('@/lib/workspace-api/generated', () => ({ getTaskRunWorkspaceChanges: vi.fn(), getWorkflowRunWorkspaceChanges: vi.fn() }))
// The run view has its own tests; here it shows which run the page opened and how.
vi.mock('@/features/chat/workflow-run/run-pane', () => ({
  default: ({ runId, tenantId, readOnly, leading }: { runId: string; tenantId: string; readOnly: boolean; leading: ReactNode }) => <div>{leading}<p>运行视图 {runId} {tenantId} {readOnly ? '只读' : '可写'}</p></div>,
}))

const me: User = { id: 'user-me', displayName: '演示用户', status: 'active', version: 1, createdAt: '2026-10-01T00:00:00Z', deletedAt: null }
const agent = { type: 'agent' as const, id: 'agent-1', displayName: 'Claude Code', identifier: 'official/ora-space.claude' }
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', tenantId: 'tenant', title: '修复登录页', description: '按钮错位', projectId: 'project-1',
  assignee: agent, status: 'pending', createdBy: 'user-me', createdByName: '演示用户', version: 1,
  createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', activeRun: null, ...overrides,
})
const run = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  demoSeed: false, id: 'run-1', taskId: 'task-1', startedBy: 'user-me', startedByName: '演示用户', executorId: 'claude:fixture', executorName: 'Claude Code / Fixture',
  state: 'running', lastResult: '', failureCode: '', endReason: '', createdAt: '2026-10-30T01:00:00Z', endedAt: null, ...overrides,
})
const empty: TaskTimeline = { runs: [], comments: [] }

function renderPage(query='') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><UserContext.Provider value={me}>
    <MemoryRouter initialEntries={['/collaboration/tasks/task-1'+query]}>
      <Routes><Route path="/collaboration/tasks/:taskId" element={<TaskPage />} /></Routes>
    </MemoryRouter>
  </UserContext.Provider></QueryClientProvider>)
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.clearAllMocks()
  session.conversation = null
  workspace.role = 'owner'
  targets.items = [
    { type: 'user', id: 'user-2', displayName: '鲍勃', description: '工作区成员', interactionDescriptor: { mode: 'mention', requiresTask: false, formRef: null } },
    { type: 'agent', id: 'agent-1', displayName: 'Claude Code', description: 'official/ora-space.claude', interactionDescriptor: { mode: 'task', requiresTask: true, formRef: null } },
  ]
  vi.mocked(api.getTask).mockResolvedValue(task())
  vi.mocked(api.getTaskTimeline).mockResolvedValue(empty)
  vi.mocked(api.listTasks).mockResolvedValue({ items: [], nextCursor: '' })
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [] })
  vi.mocked(api.listTaskExecutors).mockResolvedValue({ items: [
    { id: 'claude:fixture', name: 'Claude Code / Fixture', agentId: 'official/ora-space.claude', agentName: 'Claude Code', modelId: 'messages-fixture', modelName: 'Fixture' },
    { id: 'claude:configured', name: 'Claude Code / Sonnet', agentId: 'official/ora-space.claude', agentName: 'Claude Code', modelId: 'messages-configured', modelName: 'Sonnet' },
  ] })
})

it('starts the Agent with the configured model and shows the run being prepared', async () => {
  // Once started, the page reads the task and its timeline again and finds the run.
  let started = false
  vi.mocked(api.startTaskRun).mockImplementation(async () => { started = true; return run({ executorId: 'claude:configured' }) })
  vi.mocked(api.getTask).mockImplementation(async () => (started
    ? task({ status: 'running', activeRun: { id: 'run-1', state: 'running', startedBy: 'user-me', startedByName: '演示用户', executorName: 'Claude Code / Sonnet' } })
    : task()))
  vi.mocked(api.getTaskTimeline).mockImplementation(async () => (started ? { runs: [run()], comments: [] } : empty))
  renderPage()
  expect(await screen.findByText(/还没有运行/)).toBeInTheDocument()
  // An Agent task enters 进行中 by running, not by hand: its one 开始处理 starts the Agent.
  await waitFor(() => expect(screen.getByLabelText('执行模型')).toHaveValue('claude:configured'))
  expect(screen.getAllByRole('button', { name: '开始处理' })).toHaveLength(1)
  expect(within(screen.getByLabelText('执行')).getByRole('button', { name: '开始处理' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '开始处理' }))
  await waitFor(() => expect(api.startTaskRun).toHaveBeenCalledWith('tenant', 'task-1', { executorId: 'claude:configured' }, expect.objectContaining({ headers: expect.anything() })))

  expect(await screen.findByText('正在准备…')).toBeInTheDocument()
  expect(await screen.findByText('Agent 正在执行，结束后再推进。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
})

it('shows a running run\'s preparation stages before its first turn reaches the history', async () => {
  session.conversation = { ...emptyConversation, preparation: { stages: [
    { id: 'runtime', startedAt: '2026-11-05T00:00:00.000Z', endedAt: '2026-11-05T00:00:01.500Z' },
    { id: 'workspace', startedAt: '2026-11-05T00:00:01.500Z' },
  ] } }
  vi.mocked(api.getTask).mockResolvedValue(task({ status: 'running', activeRun: { id: 'run-1', state: 'running', startedBy: 'user-me', startedByName: '演示用户', executorName: 'Claude Code / Sonnet' } }))
  vi.mocked(api.getTaskTimeline).mockResolvedValue({ runs: [run()], comments: [] })
  renderPage()
  expect(await screen.findByText('正在准备工作目录…（第 2/5 步）')).toBeInTheDocument()
  expect(screen.getByText('1.5 秒')).toBeInTheDocument()
  expect(screen.queryByText('正在准备…')).not.toBeInTheDocument()
})

it('says an ended run left no record instead of showing it as still preparing', async () => {
  vi.mocked(api.getTaskTimeline).mockResolvedValue({ runs: [run({ state: 'ended', endReason: 'stopped' })], comments: [] })
  renderPage()
  expect(await screen.findByText('这次运行没有留下过程记录。')).toBeInTheDocument()
  expect(screen.queryByText('正在准备…')).not.toBeInTheDocument()
})

it('shows an empty executor state instead of a mock model', async () => {
  vi.mocked(api.listTaskExecutors).mockResolvedValue({ items: [] })
  renderPage()
  const select = await screen.findByLabelText('执行模型')
  await waitFor(() => expect(select).toBeDisabled())
  expect(within(select).getByRole('option', { name: '暂无可用的执行器' })).toBeInTheDocument()
})

it('lets the assignee of a person\'s task pick an Agent to handle it, and nobody else', async () => {
  const mine = task({ assignee: { type: 'human', id: 'user-me', displayName: '演示用户' } })
  vi.mocked(api.getTask).mockResolvedValue(mine)
  vi.mocked(api.listTaskExecutors).mockResolvedValue({ items: [
    { id: 'opencode:configured', name: 'OpenCode / DeepSeek', agentId: 'official/ora-space.opencode', agentName: 'OpenCode', modelId: 'chat-configured', modelName: 'DeepSeek' },
    { id: 'claude:configured', name: 'Claude Code / Sonnet', agentId: 'official/ora-space.claude', agentName: 'Claude Code', modelId: 'messages-configured', modelName: 'Sonnet' },
  ] })
  vi.mocked(api.startTaskRun).mockResolvedValue(run({ executorId: 'claude:configured' }))
  const { unmount } = renderPage()
  const section = await screen.findByLabelText('执行')
  expect(within(section).getByText('Agent 与模型')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText('执行模型')).toHaveValue('opencode:configured'))
  await userEvent.selectOptions(screen.getByLabelText('执行模型'), 'claude:configured')
  await userEvent.click(within(section).getByRole('button', { name: '用 Agent 处理' }))
  await waitFor(() => expect(api.startTaskRun).toHaveBeenCalledWith('tenant', 'task-1', { executorId: 'claude:configured' }, expect.anything()))
  // The person still moves their own task by hand when they work without an Agent.
  expect(screen.getByRole('button', { name: '开始处理' })).toBeInTheDocument()
  unmount()

  // Someone else's task: no Agent controls, and the input only comments.
  vi.mocked(api.listTaskExecutors).mockClear()
  vi.mocked(api.getTask).mockResolvedValue(task({ assignee: { type: 'human', id: 'user-2', displayName: '鲍勃' } }))
  renderPage()
  expect(await screen.findByText('评论全团队可见。')).toBeInTheDocument()
  expect(screen.queryByLabelText('执行')).not.toBeInTheDocument()
  expect(api.listTaskExecutors).not.toHaveBeenCalled()
})

it('sends to the Agent by default while it is reachable, and to the team once switched off', async () => {
  vi.mocked(api.getTask).mockResolvedValue(task({ status: 'review', activeRun: { id: 'run-1', state: 'idle', startedBy: 'user-me', startedByName: '演示用户', executorName: 'Claude Code / Fixture' } }))
  vi.mocked(api.getTaskTimeline).mockResolvedValue({ runs: [run({ state: 'idle', lastResult: 'completed' })], comments: [] })
  vi.mocked(api.createTaskComment).mockResolvedValue({ id: 'c1', taskId: 'task-1', authorId: 'user-me', authorName: '演示用户', body: '再改改', mentions: [], runId: 'run-1', createdAt: '2026-10-30T02:00:00Z' })
  renderPage()
  const toAgent = await screen.findByRole('switch', { name: '发给 Agent' })
  await waitFor(() => expect(toAgent).toHaveAttribute('aria-checked', 'true'))
  const input = screen.getByLabelText('评论或给 Agent 的消息')
  await userEvent.type(input, '再改改')
  await userEvent.click(screen.getByRole('button', { name: '发给 Agent' }))
  await waitFor(() => expect(api.createTaskComment).toHaveBeenCalledWith('tenant', 'task-1', {
    body: '再改改', mentions: [], toAgent: true, executorId: 'claude:configured',
  }, expect.anything()))

  await userEvent.click(toAgent)
  expect(toAgent).toHaveAttribute('aria-checked', 'false')
  await userEvent.type(input, '只给团队看')
  await userEvent.click(screen.getByRole('button', { name: '评论' }))
  await waitFor(() => expect(api.createTaskComment).toHaveBeenLastCalledWith('tenant', 'task-1', {
    body: '只给团队看', mentions: [], toAgent: false, executorId: undefined,
  }, expect.anything()))
})

it('sends a comment to the Agent when its own Agent is picked from the @ menu', async () => {
  vi.mocked(api.getTask).mockResolvedValue(task({ status: 'review', activeRun: { id: 'run-1', state: 'idle', startedBy: 'user-me', startedByName: '演示用户', executorName: 'Claude Code / Fixture' } }))
  vi.mocked(api.getTaskTimeline).mockResolvedValue({ runs: [run({ state: 'idle', lastResult: 'completed' })], comments: [] })
  vi.mocked(api.createTaskComment).mockResolvedValue({ id: 'c1', taskId: 'task-1', authorId: 'user-me', authorName: '演示用户', body: '@Claude Code 按钮再大一点', mentions: [], runId: 'run-1', createdAt: '2026-10-30T02:00:00Z' })
  renderPage()
  const input = await screen.findByLabelText('评论或给 Agent 的消息')
  await userEvent.type(input, '@Cla')
  const menu = await screen.findByRole('listbox', { name: '@ 对象' })
  await userEvent.click(within(menu).getByRole('option', { name: /Claude Code/ }))
  await userEvent.type(input, '按钮再大一点')
  await userEvent.click(screen.getByRole('button', { name: '发给 Agent' }))
  await waitFor(() => expect(api.createTaskComment).toHaveBeenCalledWith('tenant', 'task-1', {
    body: '@Claude Code 按钮再大一点', mentions: [{ type: 'agent', id: 'agent-1' }], toAgent: true, executorId: 'claude:configured',
  }, expect.anything()))
})

it('keeps another member to comments while someone else owns the run', async () => {
  vi.mocked(api.getTask).mockResolvedValue(task({ status: 'review', activeRun: { id: 'run-1', state: 'idle', startedBy: 'user-2', startedByName: '鲍勃', executorName: 'Claude Code / Fixture' } }))
  vi.mocked(api.getTaskTimeline).mockResolvedValue({ runs: [run({ state: 'idle', startedBy: 'user-2', startedByName: '鲍勃' })], comments: [] })
  vi.mocked(api.createTaskComment).mockResolvedValue({ id: 'c1', taskId: 'task-1', authorId: 'user-me', authorName: '演示用户', body: '@鲍勃 看起来不错', mentions: [{ type: 'user', id: 'user-2', displayName: '鲍勃' }], runId: '', createdAt: '2026-10-30T02:00:00Z' })
  renderPage()
  expect(await screen.findByRole('switch', { name: '发给 Agent' })).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByText(/当前运行由 鲍勃 发起，只有发起人能追问/)).toBeInTheDocument()
  const input = screen.getByLabelText('评论或给 Agent 的消息')
  await userEvent.type(input, '@')
  const menu = await screen.findByRole('listbox', { name: '@ 对象' })
  expect(within(menu).getByRole('option', { name: /Claude Code/ })).toBeDisabled()
  await userEvent.type(input, '鲍')
  await userEvent.click(within(await screen.findByRole('listbox', { name: '@ 对象' })).getByRole('option', { name: /鲍勃/ }))
  await userEvent.type(input, '看起来不错')
  await userEvent.click(screen.getByRole('button', { name: '评论' }))
  await waitFor(() => expect(api.createTaskComment).toHaveBeenCalledWith('tenant', 'task-1', {
    body: '@鲍勃 看起来不错', mentions: [{ type: 'user', id: 'user-2' }], toAgent: false, executorId: undefined,
  }, expect.anything()))
})

it('says why a refused start failed instead of retrying', async () => {
  vi.mocked(api.startTaskRun).mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { code: 'run_active' } } })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '开始处理' }))
  expect(await screen.findByText('Agent 正在执行，等这一轮结束或先停止。')).toBeInTheDocument()
})

const decomposition = (overrides: Partial<TaskDecomposition> = {}): TaskDecomposition => ({
  id: 'split-1', taskId: 'task-1', startedBy: 'user-me', startedByName: '演示用户', workflowId: 'wf-split', workflowName: '需求拆分',
  workflowRunId: 'wr-1', status: 'running', failure: '', createdCount: 0, createdAt: '2026-11-03T01:00:00Z', finishedAt: null, ...overrides,
})
const requirement = task({ title: '账号体系', description: '登录、注册和找回密码', assignee: null })

it('splits a requirement with the 需求拆分 workflow and lists the subtasks it wrote', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(workflowsApi.listWorkflows).mockResolvedValue({ workflows: [
    { id: 'wf-daily', namespace: 'local', name: '每日巡检', publishedVersion: 'v2', createdAt: 0, updatedAt: 0 },
    { id: 'wf-draft', namespace: 'local', name: '草稿', publishedVersion: null, createdAt: 0, updatedAt: 0 },
    { id: 'wf-split', namespace: 'local', name: '需求拆分', publishedVersion: 'v1', createdAt: 0, updatedAt: 0 },
  ] })
  let started = false
  vi.mocked(api.startTaskDecomposition).mockImplementation(async () => { started = true; return decomposition() })
  vi.mocked(api.listTaskDecompositions).mockImplementation(async () => ({ items: started ? [decomposition({ status: 'succeeded', createdCount: 2 })] : [] }))
  vi.mocked(api.listTasks).mockImplementation(async () => ({ nextCursor: '', items: started ? [
    requirement,
    task({ id: 'sub-1', title: '登录页', parentId: 'task-1', assignee: null, createdAt: '2026-11-03T01:00:02Z' }),
    task({ id: 'sub-2', title: '注册页', parentId: 'task-1', assignee: null, createdAt: '2026-11-03T01:00:01Z' }),
  ] : [requirement] }))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '拆分' }))
  const dialog = await screen.findByRole('dialog')
  // Only published workflows run; the demo's 需求拆分 is picked for the Tech Lead.
  await waitFor(() => expect(within(dialog).getByLabelText('工作流')).toHaveValue('wf-split'))
  expect(within(dialog).queryByRole('option', { name: /草稿/ })).not.toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: '开始拆分' }))
  await waitFor(() => expect(api.startTaskDecomposition).toHaveBeenCalledWith('tenant', 'task-1', { workflowId: 'wf-split' },
    expect.objectContaining({ headers: { 'Idempotency-Key': expect.any(String) } })))
  expect(await screen.findByText(/「需求拆分」拆出了 2 个子任务/)).toBeInTheDocument()
  // The run is open, so the subtasks stay folded until asked for.
  expect(await screen.findByText('运行视图 wr-1 tenant 只读')).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '子任务' })).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: '展开子任务' }))
  const subtasks = await screen.findByRole('list', { name: '子任务' })
  expect(within(subtasks).getAllByRole('link').map(a => a.textContent)).toEqual(['登录页', '注册页'])
  await userEvent.click(screen.getByRole('button', { name: '收起子任务' }))
  expect(screen.queryByRole('list', { name: '子任务' })).not.toBeInTheDocument()
})

it('keeps the subtasks open outside a run, and the workflow tab between the other two', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [decomposition({ status: 'succeeded', createdCount: 1 })] })
  vi.mocked(api.listTasks).mockResolvedValue({ nextCursor: '', items: [requirement, task({ id: 'sub-1', title: '登录页', parentId: 'task-1', assignee: null })] })
  renderPage()
  expect(await screen.findByRole('list', { name: '子任务' })).toBeInTheDocument()
  expect(screen.getAllByRole('tab', { name: /Agent 运行|工作流|讨论/ }).map(t => t.textContent?.replace(/\s*\d+$/, ''))).toEqual(['Agent 运行', '工作流', '讨论'])
})

it('opens the run as soon as a split starts, read-only, and goes back to the list', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(workflowsApi.listWorkflows).mockResolvedValue({ workflows: [{ id: 'wf-split', namespace: 'local', name: '需求拆分', publishedVersion: 'v1', createdAt: 0, updatedAt: 0 }] })
  let started = false
  vi.mocked(api.startTaskDecomposition).mockImplementation(async () => { started = true; return decomposition() })
  vi.mocked(api.listTaskDecompositions).mockImplementation(async () => ({ items: started ? [decomposition()] : [] }))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '拆分' }))
  expect(screen.queryByRole('tab', { name: /工作流/ })).not.toBeInTheDocument()
  const dialog = await screen.findByRole('dialog')
  await waitFor(() => expect(within(dialog).getByLabelText('工作流')).toHaveValue('wf-split'))
  await userEvent.click(within(dialog).getByRole('button', { name: '开始拆分' }))
  expect(await screen.findByText('运行视图 wr-1 tenant 只读')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '工作流 1' })).toHaveAttribute('aria-selected', 'true')
  // The run takes the room the composer would.
  expect(screen.queryByLabelText('评论或给 Agent 的消息')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '返回工作流列表' }))
  expect(await screen.findByRole('list', { name: '工作流运行记录' })).toHaveTextContent('正在拆分')
  expect(screen.getByLabelText('评论或给 Agent 的消息')).toBeInTheDocument()
})

it('lists every workflow the task ran and opens the one picked', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [
    decomposition({ id: 'split-3', workflowRunId: 'wr-3', status: 'succeeded', createdCount: 4 }),
    decomposition({ id: 'split-2', workflowRunId: 'wr-2', status: 'failed', failure: '工作流的输出里没有 tasks 数组。' }),
    decomposition({ id: 'split-1', workflowRunId: '', status: 'failed', failure: '工作流启动被拒绝。' }),
  ] })
  renderPage()
  await userEvent.click(await screen.findByRole('tab', { name: '工作流 3' }))
  const list = await screen.findByRole('list', { name: '工作流运行记录' })
  expect(within(list).getAllByRole('listitem').map(row => row.textContent)).toEqual([
    expect.stringContaining('拆出 4 个子任务'), expect.stringContaining('工作流的输出里没有 tasks 数组。'), expect.stringContaining('工作流启动被拒绝。'),
  ])
  // A run the host refused has nothing to open.
  expect(within(list).getAllByRole('button')).toHaveLength(2)
  await userEvent.click(within(list).getAllByRole('button')[1]!)
  expect(await screen.findByText('运行视图 wr-2 tenant 只读')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: /讨论/ }))
  await userEvent.click(screen.getByRole('tab', { name: /工作流/ }))
  expect(await screen.findByRole('list', { name: '工作流运行记录' })).toBeInTheDocument()
})

it('opens a shared link on its run, and on the list when the run is gone', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [decomposition({ status: 'succeeded', createdCount: 2 })] })
  const { unmount } = renderPage('?tab=workflows&workflow=wr-1')
  expect(await screen.findByText('运行视图 wr-1 tenant 只读')).toBeInTheDocument()
  unmount()
  renderPage('?tab=workflows&workflow=gone')
  expect(await screen.findByRole('list', { name: '工作流运行记录' })).toBeInTheDocument()
})

it('shows a running split and holds the button', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [decomposition()] })
  renderPage()
  expect(await screen.findByText(/正在用「需求拆分」拆分/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '拆分中…' })).toBeDisabled()
})

it('explains a failed split and offers to split again', async () => {
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [decomposition({ status: 'failed', failure: '工作流的输出里没有 tasks 数组。' })] })
  vi.mocked(workflowsApi.listWorkflows).mockResolvedValue({ workflows: [] })
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent('拆分失败：工作流的输出里没有 tasks 数组。')
  await userEvent.click(screen.getByRole('button', { name: '重新拆分' }))
  const dialog = await screen.findByRole('dialog')
  expect(await within(dialog).findByText('工作区还没有已发布的工作流，先在工作流页发布一个。')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: '开始拆分' })).toBeDisabled()
})

it('names the requirement a subtask came from and offers no split', async () => {
  vi.mocked(api.getTask).mockResolvedValue(task({ id: 'task-1', parentId: 'parent-1' }))
  vi.mocked(api.listTasks).mockResolvedValue({ nextCursor: '', items: [task({ id: 'parent-1', title: '账号体系' })] })
  renderPage()
  expect(await screen.findByRole('link', { name: '账号体系' })).toHaveAttribute('href', '/collaboration/tasks/parent-1')
  expect(screen.queryByRole('button', { name: '拆分' })).not.toBeInTheDocument()
})

it('opens the linked historical run instead of the newest run',async()=>{
  vi.mocked(api.getTaskTimeline).mockResolvedValue({runs:[run({id:'earlier',scheduled:true}),run({id:'later'})],comments:[]})
  const first=renderPage('?run=earlier')
  expect(await screen.findByRole('tab',{name:/运行 1/,selected:true})).toBeVisible()
  expect(screen.getByLabelText('运行概况')).toHaveTextContent('定时计划触发')
  first.unmount();renderPage('?run=missing')
  expect(await screen.findByText('这次运行已不存在或不可见。')).toBeVisible()
  expect(screen.queryByLabelText('运行概况')).not.toBeInTheDocument()
})

const handedToMe = (status: Task['status']) => task({ status, createdBy: 'user-lead', createdByName: '陈默', assignee: { type: 'human', id: 'user-me', displayName: '演示用户' } })

it('keeps 确认完成 and 取消任务 from an assignee, and says who decides', async () => {
  workspace.role = 'member'
  vi.mocked(api.getTask).mockResolvedValue(handedToMe('review'))
  renderPage()
  expect(await screen.findByRole('button', { name: '确认完成' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '取消任务' })).toBeDisabled()
  expect(screen.getByText('等待 陈默 验收。只有创建人 陈默 或工作区管理员能确认完成或取消任务。')).toBeInTheDocument()
})

it('leaves an assignee the moves that are theirs', async () => {
  workspace.role = 'member'
  vi.mocked(api.getTask).mockResolvedValue(handedToMe('running'))
  renderPage()
  expect(await screen.findByRole('button', { name: '提交验收' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '取消任务' })).toBeDisabled()
})

it('lets a workspace owner confirm work someone else asked for', async () => {
  vi.mocked(api.getTask).mockResolvedValue(handedToMe('review'))
  vi.mocked(api.setTaskStatus).mockResolvedValue(handedToMe('done'))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: '确认完成' }))
  await waitFor(() => expect(api.setTaskStatus).toHaveBeenCalledWith('tenant', 'task-1', { status: 'done', version: 1 }))
})

it('opens the newest workflow run with its workspace from the page header', async () => {
  localStorage.clear()
  vi.mocked(api.getTask).mockResolvedValue(requirement)
  vi.mocked(api.listTaskDecompositions).mockResolvedValue({ items: [decomposition({ status: 'succeeded', createdCount: 2 })] })
  vi.mocked(workspaceApi.getWorkflowRunWorkspaceChanges).mockResolvedValue({ baseCommit: 'abc', files: [], truncated: false })
  renderPage()

  const button = await screen.findByRole('button', { name: '工作区' })
  expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('complementary', { name: '任务属性' })).toBeInTheDocument()
  await userEvent.click(button)
  expect(await screen.findByText('运行视图 wr-1 tenant 只读')).toBeInTheDocument()
  expect(button).toHaveAttribute('aria-pressed', 'true')
  // The panel takes the side column's place, and closing it brings the column back.
  expect(await screen.findByRole('complementary', { name: '工作区' })).toBeInTheDocument()
  expect(screen.queryByRole('complementary', { name: '任务属性' })).not.toBeInTheDocument()
  await waitFor(() => expect(workspaceApi.getWorkflowRunWorkspaceChanges).toHaveBeenCalledWith('tenant', 'wr-1'))
  await userEvent.click(button)
  expect(button).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('complementary', { name: '任务属性' })).toBeInTheDocument()
  expect(screen.getByText('运行视图 wr-1 tenant 只读')).toBeInTheDocument()
  localStorage.clear()
})

it('shows the workspace of the Agent run on screen', async () => {
  localStorage.clear()
  vi.mocked(api.getTaskTimeline).mockResolvedValue({ runs: [run({ id: 'run-1', state: 'ended' }), run({ id: 'run-2', state: 'idle' })], comments: [] })
  vi.mocked(workspaceApi.getTaskRunWorkspaceChanges).mockResolvedValue({ baseCommit: 'abc', files: [], truncated: false })
  renderPage('?run=run-1')

  await userEvent.click(await screen.findByRole('button', { name: '工作区' }))
  const panel = await screen.findByRole('complementary', { name: '工作区' })
  expect(within(panel).getByText('Agent 运行 1')).toBeInTheDocument()
  await waitFor(() => expect(workspaceApi.getTaskRunWorkspaceChanges).toHaveBeenCalledWith('tenant', 'task-1', 'run-1'))
  localStorage.clear()
})

it('offers no workspace before anything has run', async () => {
  renderPage()
  await screen.findByRole('button', { name: '编辑' })
  expect(screen.queryByRole('button', { name: '工作区' })).not.toBeInTheDocument()
})

describe('handling a task with a workflow', () => {
  const human = { type: 'human' as const, id: 'user-me', displayName: '演示用户', identifier: '' }
  const workflow = (id: string, name: string) => ({ id, namespace: 'team', name, publishedVersion: 'v1', createdAt: 1, updatedAt: 1 })
  const summary = { id: 'wf-run-1', name: '修复登录页', projectId: 'project-1', workflowId: 'wf-dev', version: 'v1', startedAt: 2, finishedAt: null, createdAt: 2 }

  afterEach(() => { vi.unstubAllEnvs() })

  it('is not offered without the demo mock', async () => {
    vi.mocked(api.getTask).mockResolvedValue(task({ assignee: human }))
    renderPage()
    await screen.findByRole('button', { name: '用 Agent 处理' })
    expect(screen.queryByRole('button', { name: '用工作流处理' })).not.toBeInTheDocument()
  })

  it('starts the picked workflow with the requirement and opens the run on the task', async () => {
    vi.stubEnv('VITE_DEMO_MOCK', '1')
    const user = userEvent.setup()
    let started = false
    vi.mocked(api.getTask).mockResolvedValue(task({ assignee: human }))
    vi.mocked(api.setTaskStatus).mockResolvedValue(task({ assignee: human, status: 'running' }))
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue({ workflows: [workflow('wf-split', '需求拆分'), workflow('wf-dev', '需求开发')] })
    vi.mocked(workflowsApi.listWorkflowRuns).mockImplementation(async () => ({ runs: started ? [{ ...summary, status: 'running' as const }] : [] }))
    vi.mocked(workflowsApi.createWorkflowRun).mockResolvedValue({ run: { id: 'wf-run-1' } } as never)
    vi.mocked(workflowsApi.updateWorkflowRunInput).mockResolvedValue({} as never)
    vi.mocked(workflowsApi.startWorkflowRun).mockImplementation(async () => { started = true; return {} as never })
    renderPage()

    await user.click(await screen.findByRole('button', { name: '用工作流处理' }))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(within(dialog).getByLabelText('工作流')).toHaveDisplayValue('需求开发（v1）'))
    const prompt = within(dialog).getByLabelText('需求')
    expect(prompt).toHaveValue('# 修复登录页\n\n按钮错位\n\n## 约束\n- ')
    await user.type(prompt, '不新增依赖')
    await user.click(within(dialog).getByRole('button', { name: '启动工作流' }))

    await screen.findByText('运行视图 wf-run-1 tenant 只读')
    expect(workflowsApi.createWorkflowRun).toHaveBeenCalledWith('tenant', 'wf-dev', { projectId: 'project-1', name: '修复登录页' })
    expect(workflowsApi.updateWorkflowRunInput).toHaveBeenCalledWith('tenant', 'wf-run-1', { input: '# 修复登录页\n\n按钮错位\n\n## 约束\n- 不新增依赖' })
    expect(api.setTaskStatus).toHaveBeenCalledWith('tenant', 'task-1', { status: 'running', version: 1 })
    expect(screen.getByRole('tab', { name: '工作流 1' })).toHaveAttribute('aria-selected', 'true')
  })

  it('lists the handling run with its outcome', async () => {
    vi.stubEnv('VITE_DEMO_MOCK', '1')
    vi.mocked(api.getTask).mockResolvedValue(task({ assignee: human }))
    vi.mocked(workflowsApi.listWorkflows).mockResolvedValue({ workflows: [workflow('wf-dev', '需求开发')] })
    vi.mocked(workflowsApi.listWorkflowRuns).mockResolvedValue({ runs: [{ ...summary, status: 'succeeded' }, { ...summary, id: 'other', name: '别的任务', status: 'running' }] })
    renderPage('?tab=workflows')

    const row = await screen.findByRole('button', { name: /查看工作流运行 需求开发/ })
    expect(row).toHaveTextContent('处理 · 演示用户 发起')
    expect(row).toHaveTextContent('处理完成')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })
})
