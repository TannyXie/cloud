import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import { UserContext } from '@/app/auth/user'
import type { User } from '@/api/generated.schemas'
import type { Project } from '@/lib/projects-api/generated'
import * as projectsApi from '@/lib/projects-api/generated'
import * as squadsApi from '@/lib/squads-api/generated'
import * as api from './tasks-api/generated'
import type { Task } from './tasks-api/generated'
import TasksPage from './tasks-page'

vi.mock('@/api/me/me', () => ({ useGetApiV1MeTenants: () => ({ data: { items: [{ id: 'tenant', role: 'owner' }] }, isLoading: false, isError: false }) }))
vi.mock('./tasks-api/generated', () => ({ listTasks: vi.fn(), createTask: vi.fn(), listPendingMentions: vi.fn() }))
vi.mock('@/lib/squads-api/generated', () => ({ listSquads: vi.fn(), getSquad: vi.fn() }))
vi.mock('@/lib/projects-api/generated', () => ({ getApiV2TenantsTidProjects: vi.fn() }))

const me: User = { id: 'user-me', displayName: '演示用户', status: 'active', version: 1, createdAt: '2026-10-01T00:00:00Z', deletedAt: null }
const project: Project = {
  id: 'project-1', tenantId: 'tenant', ownerUserId: 'user-me', name: '演示项目',
  repositoryUrl: 'fixture://demo', defaultBranch: 'main', commitId: 'a'.repeat(40), createdAt: '2026-10-01T00:00:00Z',
  repositoryTokenConfigured: false,
}
const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1', tenantId: 'tenant', title: '整理演示数据', description: '', projectId: 'project-1',
  assignee: null, status: 'pending', createdBy: 'user-me', createdByName: '演示用户', version: 1,
  createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', activeRun: null, ...overrides,
})
const agentTask = task({
  id: 'task-2', title: '修复登录页', status: 'running', version: 2,
  assignee: { type: 'agent', id: 'agent-1', displayName: 'Claude Code', identifier: 'official/ora-space.claude' },
  activeRun: { id: 'run-1', state: 'running', startedBy: 'user-2', startedByName: '鲍勃', executorName: 'Claude Code / Fixture' },
})
const myTask = task({ id: 'task-3', title: '写周报', status: 'review', assignee: { type: 'human', id: 'user-me', displayName: '演示用户' } })

function TaskStub() {
  return <p>任务页 {useParams().taskId}</p>
}

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><UserContext.Provider value={me}>
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/collaboration" element={<TasksPage />} />
        <Route path="/collaboration/tasks/:taskId" element={<TaskStub />} />
      </Routes>
    </MemoryRouter>
  </UserContext.Provider></QueryClientProvider>)
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  vi.clearAllMocks()
  vi.mocked(projectsApi.getApiV2TenantsTidProjects).mockResolvedValue({ items: [project], nextCursor: '' })
  vi.mocked(squadsApi.listSquads).mockResolvedValue({ items: [], nextCursor: '' })
  vi.mocked(api.listTasks).mockResolvedValue({ items: [], nextCursor: '' })
  vi.mocked(api.listPendingMentions).mockResolvedValue({ items: [] })
})

const su = { type: 'human' as const, id: 'user-su', displayName: '苏芮' }

it('narrows the whole team\'s tasks to one assignee, in the URL', async () => {
  vi.mocked(api.listTasks).mockResolvedValue({ items: [
    task({ id: 'a', title: '苏芮的活', assignee: su }), task({ id: 'b', title: '第二件', assignee: su }), task({ id: 'c', title: '没人管' }),
    task({ id: 'd', title: '取消的活', status: 'cancelled', assignee: su }),
  ], nextCursor: '' })
  renderAt('/collaboration?view=all')
  const filter = await screen.findByRole('combobox', { name: '指派对象' })
  // The board hides cancelled work, so the count does too.
  expect(await within(filter).findByRole('option', { name: '苏芮（2）' })).toBeInTheDocument()
  expect(within(filter).getByRole('option', { name: '未指派（1）' })).toBeInTheDocument()
  await userEvent.selectOptions(filter, '苏芮（2）')
  await waitFor(() => expect(screen.queryByRole('button', { name: '查看任务 没人管' })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: '查看任务 苏芮的活' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '查看任务 第二件' })).toBeInTheDocument()
  expect(screen.getByText('3 个任务')).toBeInTheDocument()
})

it('offers the assignee filter only on 全部任务, and falls back from someone without work', async () => {
  vi.mocked(api.listTasks).mockResolvedValue({ items: [task({ title: '我的活', assignee: su })], nextCursor: '' })
  const { unmount } = renderAt('/collaboration?view=all&assignee=human:gone')
  expect(await screen.findByRole('button', { name: '查看任务 我的活' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '指派对象' })).toHaveValue('')
  unmount()
  renderAt('/collaboration?view=mine')
  await screen.findByRole('list', { name: '任务看板' })
  expect(screen.queryByRole('combobox', { name: '指派对象' })).not.toBeInTheDocument()
})

it('shows an explicit empty state instead of sample tasks', async () => {
  renderAt('/collaboration')
  const board = await screen.findByRole('list', { name: '任务看板' })
  expect(within(board).getAllByText('暂无')).toHaveLength(4)
  expect(screen.getByRole('heading', { name: '全部任务' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '列表' }))
  expect(await screen.findByText('还没有任务')).toBeInTheDocument()
})

it('lists tasks and who is working on them', async () => {
  vi.mocked(api.listTasks).mockResolvedValue({ items: [task(), agentTask], nextCursor: '' })
  renderAt('/collaboration?layout=list')
  const open = await screen.findByRole('button', { name: '查看任务 整理演示数据' })
  expect(open).toHaveTextContent('演示项目 · 演示用户 创建')
  expect(open).toHaveTextContent('未指派')
  const running = screen.getByRole('button', { name: '查看任务 修复登录页' })
  expect(running).toHaveTextContent('鲍勃 发起 · 执行中')
  expect(running).toHaveTextContent('Claude Code')
})

it('scopes the list by the view in the URL', async () => {
  vi.mocked(api.listTasks).mockResolvedValue({ items: [task(), agentTask, myTask], nextCursor: '' })
  // Someone's @ waiting on me brings their task into 待我处理, and its card says who is waiting.
  vi.mocked(api.listPendingMentions).mockResolvedValue({ items: [
    { taskId: 'task-1', commentId: 'comment-1', authorId: 'user-2', authorName: '鲍勃', createdAt: '2026-10-30T00:00:00Z' },
  ] })
  renderAt('/collaboration?view=todo')
  expect(await screen.findByRole('button', { name: '查看任务 整理演示数据' })).toHaveTextContent('鲍勃 @ 了你')
  expect(screen.getByRole('button', { name: '查看任务 写周报' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看任务 修复登录页' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '待我处理' })).toBeInTheDocument()
})

it('narrows to one squad from the header, with the caller\'s squads first', async () => {
  const row = { archivedAt: null, description: '', charter: '', leaderAgentId: null, version: 1, createdBy: 'user-me', createdAt: '', updatedAt: '', humanCount: 1, agentCount: 0, maintainerCount: 1 }
  vi.mocked(squadsApi.listSquads).mockResolvedValue({ items: [{ ...row, id: 'squad-other', name: '运维组' }, { ...row, id: 'squad-mine', name: '前端组' }], nextCursor: '' })
  vi.mocked(squadsApi.getSquad).mockImplementation(async (_tenant, id) => ({ ...row, id, name: id, members: id === 'squad-mine' ? [{ id: 'm', type: 'human', userId: 'user-me', spaceAgentId: null, displayName: '演示用户', role: '', maintainer: true, joinedAt: '', endedAt: null }] : [] }))
  vi.mocked(api.listTasks).mockResolvedValue({ items: [
    task({ id: 'a', title: '前端任务', assignee: { type: 'squad', id: 'squad-mine', displayName: '前端组' } }),
    task({ id: 'b', title: '运维任务', assignee: { type: 'squad', id: 'squad-other', displayName: '运维组' } }),
  ], nextCursor: '' })
  renderAt('/collaboration?view=all&layout=list')
  const select = await screen.findByRole('combobox', { name: '小队' })
  expect(await within(select).findByRole('group', { name: '我的小队' })).toHaveTextContent('前端组')
  expect(within(select).getByRole('group', { name: '其他小队' })).toHaveTextContent('运维组')
  expect(await screen.findByText('运维任务')).toBeInTheDocument()
  await userEvent.selectOptions(select, 'squad-mine')
  expect(await screen.findByText('前端任务')).toBeInTheDocument()
  expect(screen.queryByText('运维任务')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '小队成员' })).toHaveAttribute('href', '/settings/squads?squad=squad-mine')
})

it('shows a board by default with one column per status', async () => {
  vi.mocked(api.listTasks).mockResolvedValue({ items: [task(), agentTask, myTask], nextCursor: '' })
  renderAt('/collaboration')
  const board = await screen.findByRole('list', { name: '任务看板' })
  expect(within(board).getByRole('listitem', { name: '待处理列' })).toHaveTextContent('整理演示数据')
  expect(within(board).getByRole('listitem', { name: '进行中列' })).toHaveTextContent('修复登录页')
  expect(within(board).getByRole('listitem', { name: '待验收列' })).toHaveTextContent('写周报')
  expect(within(board).queryByRole('listitem', { name: '已取消列' })).not.toBeInTheDocument()
})

it('creates a task in a real project and opens its page', async () => {
  vi.mocked(api.createTask).mockResolvedValue(task({ id: 'task-9' }))
  renderAt('/collaboration')
  await screen.findByRole('list', { name: '任务看板' })
  await userEvent.click(screen.getByRole('button', { name: '新建任务' }))
  const dialog = await screen.findByRole('dialog')
  await waitFor(() => expect(within(dialog).getByLabelText('所属项目')).toHaveValue('project-1'))
  fireEvent.change(within(dialog).getByLabelText('任务标题'), { target: { value: '整理演示数据' } })
  await userEvent.click(within(dialog).getByRole('button', { name: '创建任务' }))
  await waitFor(() => expect(api.createTask).toHaveBeenCalledWith('tenant', { title: '整理演示数据', description: '', projectId: 'project-1' }))
  expect(await screen.findByText('任务页 task-9')).toBeInTheDocument()
})
