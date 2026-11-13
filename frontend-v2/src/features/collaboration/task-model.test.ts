import { describe, expect, it } from 'vitest'
import type { Task } from './tasks-api/generated'
import {
  assigneeKindLabel, assigneeLabel, isTaskFinished, MAX_TASK_TITLE, projectLabel, taskActions,
  boardMoveMessageFor, taskMessageFor, taskStatusLabel, validateTask,
} from './task-model'

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 'task', tenantId: 'tenant', title: '整理演示数据', description: '', projectId: 'project',
  assignee: null, status: 'pending', createdBy: 'user', createdByName: '演示用户', version: 1,
  createdAt: '2026-10-30T00:00:00Z', updatedAt: '2026-10-30T00:00:00Z', activeRun: null, ...overrides,
})

describe('task status', () => {
  it('labels every status and leaves unknown ones verbatim', () => {
    expect(['pending', 'running', 'review', 'done', 'cancelled'].map(taskStatusLabel))
      .toEqual(['待处理', '进行中', '待验收', '已完成', '已取消'])
    expect(taskStatusLabel('blocked')).toBe('blocked')
  })

  it('moves one step at a time and never reopens a finished task', () => {
    expect(taskActions('pending')).toEqual([{ status: 'running', label: '开始处理' }, { status: 'cancelled', label: '取消任务' }])
    expect(taskActions('running').map(action => action.status)).toEqual(['review', 'cancelled'])
    expect(taskActions('review').map(action => action.status)).toEqual(['done', 'cancelled'])
    expect(taskActions('done')).toEqual([])
    expect(taskActions('cancelled')).toEqual([])
    expect(isTaskFinished('done')).toBe(true)
    expect(isTaskFinished('cancelled')).toBe(true)
    expect(isTaskFinished('review')).toBe(false)
  })
})

describe('task names', () => {
  it('shows unassigned work and the assignee kind', () => {
    expect(assigneeLabel(task())).toBe('未指派')
    expect(assigneeKindLabel(task())).toBe('')
    const agent = task({ assignee: { type: 'agent', id: 'agent-1', displayName: 'OpenCode', identifier: 'official/ora-space.opencode' } })
    expect(assigneeLabel(agent)).toBe('OpenCode')
    expect(assigneeKindLabel(agent)).toBe('Agent')
  })

  it('resolves a project name and falls back to the id it has', () => {
    const projects = [{ id: 'project', name: '演示项目' }]
    expect(projectLabel(projects, 'project')).toBe('演示项目')
    expect(projectLabel(projects, 'gone')).toBe('gone')
  })
})

describe('task validation', () => {
  it('requires a title within the server limit', () => {
    expect(validateTask('   ', '')).toEqual({ title: '请填写任务标题。' })
    expect(validateTask('x'.repeat(MAX_TASK_TITLE + 1), '')).toEqual({ title: `标题最多 ${MAX_TASK_TITLE} 个字符。` })
    expect(validateTask('整理演示数据', '两行描述')).toEqual({})
  })

  it('rejects an over-long description', () => {
    expect(validateTask('整理演示数据', 'x'.repeat(4001))).toEqual({ description: '描述最多 4000 个字符。' })
  })
})

describe('task errors', () => {
  const http = (status: number, code = '') => ({ isAxiosError: true, response: { status, data: { code } } })

  it('explains a stale version before the specific code', () => {
    expect(taskMessageFor(http(409, 'version_conflict'))).toBe('任务已被其他人修改，请关闭后重新打开。')
    expect(taskMessageFor(http(428))).toBe('缺少版本号，请关闭后重新打开任务。')
  })

  it('names the state machine when a move is not allowed', () => {
    expect(taskMessageFor(http(400, 'invalid_transition'))).toContain('待处理 → 进行中 → 待验收 → 已完成')
    expect(taskMessageFor(http(400, 'invalid_assignee'))).toBe('只能指派给当前工作区的成员、已安装的 Agent 或未归档的小队。')
    expect(taskMessageFor(http(400, 'invalid_project'))).toBe('所选项目不在当前工作区，请重新选择。')
  })

  it('falls back for anything else', () => {
    expect(taskMessageFor(new Error('boom'))).toBe('操作失败，请重试。')
  })

  it('tells a refused drop apart from a stale board', () => {
    expect(boardMoveMessageFor(http(409, 'run_active'))).toBe('Agent 正在执行，等这一轮结束或先停止。')
    expect(boardMoveMessageFor(http(409, 'version_conflict'))).toBe('任务刚被其他人改过，看板已刷新，请再拖一次。')
    expect(boardMoveMessageFor(http(400, 'invalid_transition'))).toContain('待处理 → 进行中 → 待验收 → 已完成')
    expect(boardMoveMessageFor(http(403, 'forbidden'))).toBe('只有任务创建人或工作区管理员能确认完成或取消任务。')
  })
})
