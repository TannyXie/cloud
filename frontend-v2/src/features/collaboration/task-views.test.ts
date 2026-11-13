import { describe, expect, it } from 'vitest'
import type { Task } from './tasks-api/generated'
import { agentReach, assigneeChoices, assigneeKey, boardDraggable, boardMove, canCloseTask, canDecompose, familyLabels, filterTasks, runsAgent, viewOf } from './task-views'

const task = (overrides: Partial<Task>): Task => ({
  id: 'task', tenantId: 'tenant', title: '任务', description: '', projectId: 'project', assignee: null, status: 'pending',
  createdBy: 'someone', createdByName: '某人', version: 1, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
  activeRun: null, ...overrides,
})
const agent = { type: 'agent' as const, id: 'agent-1', displayName: 'OpenCode', identifier: 'official/ora-space.opencode' }
const running = { id: 'run-1', state: 'running' as const, startedBy: 'me', startedByName: '我', executorName: 'OpenCode / Fixture' }

describe('task views', () => {
  const mine = task({ id: 'mine', assignee: { type: 'human', id: 'me', displayName: '我' } })
  const mineDone = task({ id: 'mine-done', status: 'done', assignee: { type: 'human', id: 'me', displayName: '我' } })
  const myReview = task({ id: 'my-review', status: 'review', createdBy: 'me', assignee: agent })
  const busy = task({ id: 'busy', status: 'running', assignee: agent, activeRun: running })
  const squad = task({ id: 'squad', assignee: { type: 'squad', id: 'squad-1', displayName: '产品小队' } })
  const all = [mine, mineDone, myReview, busy, squad]
  const ids = (list: Task[]) => list.map(t => t.id)

  it('scopes one team-wide list', () => {
    expect(ids(filterTasks(all, 'mine', 'me'))).toEqual(['mine', 'mine-done'])
    expect(ids(filterTasks(all, 'todo', 'me'))).toEqual(['mine', 'my-review'])
    expect(ids(filterTasks(all, 'todo', 'me', new Set(['squad'])))).toEqual(['mine', 'my-review', 'squad'])
    expect(ids(filterTasks(all, 'all', 'me'))).toEqual(ids(all))
    expect(ids(filterTasks(all, 'all', 'me', new Set(), new Map(), 'squad-1'))).toEqual(['squad'])
    expect(ids(filterTasks(all, 'mine', 'me', new Set(), new Map(), 'squad-1'))).toEqual([])
    const squadTasks = new Map([['squad', { taskId: 'squad', squadId: 'squad-1', squadName: '产品小队', waiting: true }]])
    expect(ids(filterTasks(all, 'mine', 'me', new Set(), squadTasks))).toContain('squad')
    expect(ids(filterTasks(all, 'todo', 'me', new Set(), squadTasks))).toContain('squad')
    const handled = new Map([['squad', { taskId: 'squad', squadId: 'squad-1', squadName: '产品小队', waiting: false }]])
    expect(ids(filterTasks(all, 'mine', 'me', new Set(), handled))).toContain('squad')
    expect(ids(filterTasks(all, 'todo', 'me', new Set(), handled))).not.toContain('squad')
  })

  it('reads an unknown view as everything', () => {
    expect(viewOf('todo')).toBe('todo')
    expect(viewOf('running')).toBe('all')
    expect(viewOf('nope')).toBe('all')
    expect(viewOf(null)).toBe('all')
  })
})

describe('who may send the Agent a turn', () => {
  it('lets anyone start, and only the starter follow up', () => {
    expect(agentReach(task({ assignee: agent }), 'me').ok).toBe(true)
    expect(agentReach(task({ assignee: agent, activeRun: { ...running, state: 'idle' } }), 'me')).toMatchObject({ ok: true, reason: '作为同一次运行的下一轮发给 Agent。' })
    const other = agentReach(task({ assignee: agent, activeRun: { ...running, state: 'idle', startedBy: 'bob', startedByName: '鲍勃' } }), 'me')
    expect(other.ok).toBe(false)
    expect(other.reason).toMatch(/当前运行由 鲍勃 发起/)
  })

  it('lets only the assignee run an Agent on a person\'s task', () => {
    const mine = task({ assignee: { type: 'human', id: 'me', displayName: '我' } })
    const bobs = task({ assignee: { type: 'human', id: 'bob', displayName: '鲍勃' } })
    expect(runsAgent(mine, 'me')).toBe(true)
    expect(agentReach(mine, 'me')).toMatchObject({ ok: true, reason: '用你的身份开一次新运行。' })
    expect(runsAgent(bobs, 'me')).toBe(false)
    expect(agentReach(bobs, 'me')).toEqual({ ok: false, reason: '任务派给了 鲍勃，只有负责人本人能用 Agent 处理。' })
  })

  it('lets the members of a squad run the Agent they pick on its task', () => {
    const squad = task({ assignee: { type: 'squad', id: 'squad-1', displayName: '产品小队' } })
    expect(runsAgent(squad, 'me', true)).toBe(true)
    expect(agentReach(squad, 'me', true)).toMatchObject({ ok: true, reason: '用你的身份开一次新运行。' })
    expect(runsAgent(squad, 'me')).toBe(false)
    expect(agentReach(squad, 'me')).toEqual({ ok: false, reason: '任务派给了小队 产品小队，只有队员能用 Agent 处理。' })
  })

  it('waits for a running turn and refuses closed or unassigned tasks', () => {
    expect(agentReach(task({ assignee: agent, activeRun: running }), 'me').ok).toBe(false)
    expect(agentReach(task({ assignee: agent, status: 'done' }), 'me').ok).toBe(false)
    expect(agentReach(task({}), 'me').ok).toBe(false)
  })

  it('opens only the next legal step on the board', () => {
    const human = { type: 'human' as const, id: 'me', displayName: '我' }
    const pending = task({ assignee: human })
    expect(boardMove(pending, 'running').ok).toBe(true)
    expect(boardMove(pending, 'cancelled').ok).toBe(true)
    expect(boardMove(pending, 'review')).toEqual({ ok: false, reason: expect.stringContaining('逐步推进') })
    expect(boardMove(pending, 'pending')).toEqual({ ok: false, reason: '' })
    expect(boardMove(task({ status: 'running', assignee: human }), 'review').ok).toBe(true)
    expect(boardMove(task({ status: 'review', assignee: human }), 'done').ok).toBe(true)
    expect(boardMove(task({ status: 'review', assignee: human }), 'running').ok).toBe(false)
  })

  it('keeps a running Agent card and an Agent start off the board', () => {
    expect(boardDraggable(task({ status: 'running', assignee: agent, activeRun: running })).ok).toBe(false)
    expect(boardMove(task({ status: 'running', assignee: agent, activeRun: running }), 'review').reason).toContain('Agent 正在执行')
    expect(boardMove(task({ assignee: agent }), 'running').reason).toContain('开始处理')
    // The Agent's turn ended: a person may hand its work to 待验收 or cancel it.
    const idle = task({ status: 'running', assignee: agent, activeRun: { ...running, state: 'idle' } })
    expect(boardMove(idle, 'review').ok).toBe(true)
    expect(boardDraggable(task({ status: 'done' })).ok).toBe(false)
  })

  it('leaves ending a task to its creator and a workspace owner', () => {
    const assigned = task({ status: 'review', createdBy: 'lead', createdByName: '陈默', assignee: { type: 'human', id: 'me', displayName: '我' } })
    expect(canCloseTask(assigned, 'lead', 'member')).toBe(true)
    expect(canCloseTask(assigned, 'me', 'owner')).toBe(true)
    expect(canCloseTask(assigned, 'me', 'member')).toBe(false)
    expect(canCloseTask(assigned, 'me', undefined)).toBe(false)

    expect(boardMove(assigned, 'done', true).ok).toBe(true)
    const refused = boardMove(assigned, 'done', false)
    expect(refused.ok).toBe(false)
    expect(refused.reason).toBe('只有创建人 陈默 或工作区管理员能确认完成。')
    expect(boardMove(assigned, 'cancelled', false).reason).toBe('只有创建人 陈默 或工作区管理员能取消任务。')
    // Handing the work to 待验收 stays with whoever does it.
    expect(boardMove({ ...assigned, status: 'running' }, 'review', false).ok).toBe(true)
  })

  it('lists who holds work, people first, with unassigned last', () => {
    const su = { type: 'human' as const, id: 'su', displayName: '苏芮' }
    const zhou = { type: 'human' as const, id: 'zhou', displayName: '周衡' }
    const crew = { type: 'squad' as const, id: 'crew', displayName: '看板小队' }
    const tasks = [task({ assignee: crew }), task({}), task({ assignee: agent }), task({ assignee: zhou }), task({ assignee: su }), task({ assignee: su })]
    expect(assigneeChoices(tasks).map(c => [c.label, c.count])).toEqual([['苏芮', 2], ['周衡', 1], ['OpenCode', 1], ['看板小队', 1], ['未指派', 1]])
    expect(assigneeKey(task({ assignee: su }))).toBe('human:su')
    expect(assigneeChoices([])).toEqual([])
  })

  it('names a subtask\'s requirement and counts a requirement\'s subtasks', () => {
    const parent = task({ id: 'parent', title: '账号体系' })
    const labels = familyLabels([parent, task({ id: 'a', parentId: 'parent' }), task({ id: 'b', parentId: 'parent' }), task({ id: 'c', parentId: 'gone' }), task({ id: 'd' })])
    expect(Object.fromEntries(labels)).toEqual({ parent: '2 个子任务', a: '拆分自 账号体系', b: '拆分自 账号体系', c: '拆分自 大需求' })
    expect(canDecompose(parent)).toBe(true)
    expect(canDecompose(task({ parentId: 'parent' }))).toBe(false)
    expect(canDecompose(task({ status: 'done' }))).toBe(false)
  })
})
