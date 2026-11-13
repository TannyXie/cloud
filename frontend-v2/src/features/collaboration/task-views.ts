import { isWorkspaceAdministrator } from '@/features/settings/squads/squad-model'
import { isTaskFinished, taskActions, taskStatusLabel } from './task-model'
import type { MySquadTask, Task } from './tasks-api/generated'

/** The tasks of the caller's squads, by task id. */
export type SquadTasks = ReadonlyMap<string, MySquadTask>

/** The task scopes the sidebar offers; each one is a filter over the same team-wide list. */
export type TaskView = 'mine' | 'todo' | 'all'

export const TASK_VIEWS: { id: TaskView; label: string; hint: string }[] = [
  { id: 'mine', label: '我的任务', hint: '指派给我和我所在小队的任务' },
  { id: 'todo', label: '待我处理', hint: '指派给我且未结束的、小队新派来的、我建的等着验收的，以及有人 @ 我还没回复的' },
  { id: 'all', label: '全部任务', hint: '工作区里所有任务，全团队可见' },
]

/** The view a URL names; anything else is the whole list. */
export const viewOf = (raw: string | null): TaskView => (TASK_VIEWS.some(v => v.id === raw) ? (raw as TaskView) : 'all')

/** Whether the task's Agent is running a turn right now. */
export const isAgentRunning = (task: Task): boolean => task.activeRun?.state === 'running'

const finished = (task: Task) => task.status === 'done' || task.status === 'cancelled'

/**
 * The tasks of a view, for the person `me`; a squad narrows any view to the tasks it owns.
 * `mentioned` holds the tasks where someone @-mentioned `me` and is still waiting on a reply;
 * `squadTasks` holds the tasks of `me`'s squads.
 */
export function filterTasks(tasks: Task[], view: TaskView, me: string, mentioned: ReadonlySet<string> = new Set(), squadTasks: SquadTasks = new Map(), squadId?: string | null): Task[] {
  const scoped = squadId ? tasks.filter(t => t.assignee?.type === 'squad' && t.assignee.id === squadId) : tasks
  switch (view) {
    case 'mine':
      return scoped.filter(t => (t.assignee?.type === 'human' && t.assignee.id === me) || squadTasks.has(t.id))
    case 'todo':
      return scoped.filter(t => (t.assignee?.type === 'human' && t.assignee.id === me && !finished(t)) || (t.status === 'review' && t.createdBy === me) || mentioned.has(t.id) || squadTasks.get(t.id)?.waiting)
    default:
      return scoped
  }
}

/**
 * Whether the caller may end the task, by confirming it or cancelling it: its creator or a
 * workspace administrator, as the server's `canCloseTask` decides. Doing the work does not grant it.
 */
export const canCloseTask = (task: Task, me: string, role: string | undefined): boolean =>
  isWorkspaceAdministrator(role) || task.createdBy === me

/** Why the caller cannot end the task, named after who can. */
export const closeRefusal = (task: Task, action: string): string => `只有创建人 ${task.createdByName} 或工作区管理员能${action}。`

/** The filter value of a task's assignee; unassigned work has its own. */
export const UNASSIGNED = 'none'
export const assigneeKey = (task: Task): string => (task.assignee ? `${task.assignee.type}:${task.assignee.id}` : UNASSIGNED)

/** One assignee the filter offers, with how many of the given tasks it holds. */
export interface AssigneeChoice {
  value: string
  label: string
  type: 'human' | 'agent' | 'squad' | typeof UNASSIGNED
  count: number
}

const CHOICE_ORDER: AssigneeChoice['type'][] = ['human', 'agent', 'squad', UNASSIGNED]

/** The assignees of these tasks, people first and by name within a kind, so the filter lists exactly who holds work. */
export function assigneeChoices(tasks: Task[]): AssigneeChoice[] {
  const choices = new Map<string, AssigneeChoice>()
  for (const t of tasks) {
    const value = assigneeKey(t)
    const known = choices.get(value)
    if (known) known.count += 1
    else choices.set(value, { value, label: t.assignee?.displayName ?? '未指派', type: t.assignee?.type ?? UNASSIGNED, count: 1 })
  }
  return [...choices.values()].sort((a, b) => CHOICE_ORDER.indexOf(a.type) - CHOICE_ORDER.indexOf(b.type) || a.label.localeCompare(b.label, 'zh-CN'))
}

/** Whether 「拆分」 applies: a big requirement still open, not a subtask. */
export const canDecompose = (task: Task): boolean => !task.parentId && !isTaskFinished(task.status)

/**
 * A card's family line, by task id: a subtask names the requirement it was split from, and a
 * requirement counts its subtasks. Read from the whole team list, so a filtered view still names a
 * parent it does not show.
 */
export function familyLabels(all: Task[]): ReadonlyMap<string, string> {
  const titles = new Map(all.map(t => [t.id, t.title]))
  const counts = new Map<string, number>()
  for (const t of all) if (t.parentId) counts.set(t.parentId, (counts.get(t.parentId) ?? 0) + 1)
  const out = new Map<string, string>()
  for (const t of all) {
    if (t.parentId) out.set(t.id, `拆分自 ${titles.get(t.parentId) ?? '大需求'}`)
    else if (counts.has(t.id)) out.set(t.id, `${counts.get(t.id)} 个子任务`)
  }
  return out
}

/** The board's columns in lifecycle order; cancelled work is hidden unless asked for. */
export const BOARD_COLUMNS = ['pending', 'running', 'review', 'done'] as const

/** Whether a card can be picked up at all: a running Agent owns its task, and finished work stays put. */
export function boardDraggable(task: Task): { ok: boolean; reason: string } {
  if (isAgentRunning(task)) return { ok: false, reason: 'Agent 正在执行，这张卡片不能拖动；等这一轮结束或在任务里停止。' }
  if (finished(task)) return { ok: false, reason: '任务已结束，不能再改状态。' }
  return { ok: true, reason: '' }
}

/**
 * Whether dropping the card on the column `to` is a move a person may make, and why not. The board
 * offers exactly the task's own buttons (the server's `CanTransitionTask`), so 待验收 is never
 * skipped; an Agent task reaches 进行中 only by starting its run, never by hand. `canClose` is
 * whether the caller may end this task, so a person who cannot confirm it sees why at the column.
 */
export function boardMove(task: Task, to: string, canClose = true): { ok: boolean; reason: string } {
  const pickable = boardDraggable(task)
  if (!pickable.ok || task.status === to) return pickable.ok ? { ok: false, reason: '' } : pickable
  if (to === 'running' && task.assignee?.type === 'agent') {
    return { ok: false, reason: '指派给 Agent 的任务要在任务里「开始处理」，跑起来才进入进行中。' }
  }
  if (!taskActions(task.status).some(a => a.status === to)) {
    return { ok: false, reason: `「${taskStatusLabel(task.status)}」不能直接拖到「${taskStatusLabel(to)}」：按「待处理 → 进行中 → 待验收 → 已完成」逐步推进。` }
  }
  if (isTaskFinished(to) && !canClose) return { ok: false, reason: closeRefusal(task, to === 'done' ? '确认完成' : '取消任务') }
  return { ok: true, reason: '' }
}

/**
 * Whether the caller may run an Agent on the task at all: any member on an Agent's task, on a
 * person's task only that person, and on a squad's task its members, with the Agent they pick.
 */
export const runsAgent = (task: Task, me: string, inSquad = false): boolean =>
  task.assignee?.type === 'agent' || (task.assignee?.type === 'human' && task.assignee.id === me) || (task.assignee?.type === 'squad' && inSquad)

/** Whether the caller may send the Agent a turn now, and why not. */
export function agentReach(task: Task, me: string, inSquad = false): { ok: boolean; reason: string } {
  if (task.assignee?.type === 'human' && task.assignee.id !== me) return { ok: false, reason: `任务派给了 ${task.assignee.displayName}，只有负责人本人能用 Agent 处理。` }
  if (task.assignee?.type === 'squad' && !inSquad) return { ok: false, reason: `任务派给了小队 ${task.assignee.displayName}，只有队员能用 Agent 处理。` }
  if (!runsAgent(task, me, inSquad)) return { ok: false, reason: '任务没有指派给 Agent。' }
  if (task.status === 'done' || task.status === 'cancelled') return { ok: false, reason: '任务已结束。' }
  const run = task.activeRun
  if (run?.state === 'running') return { ok: false, reason: 'Agent 正在执行，等这一轮结束。' }
  if (run && run.startedBy !== me) return { ok: false, reason: `当前运行由 ${run.startedByName} 发起，只有发起人能追问；可以在右侧重新执行。` }
  return { ok: true, reason: run ? '作为同一次运行的下一轮发给 Agent。' : '用你的身份开一次新运行。' }
}
