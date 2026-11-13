import { codeOf, statusOf } from '@/lib/api-client'
import type { Task } from './tasks-api/generated'

/** Statuses in lifecycle order; the server enforces the same set. */
export const TASK_STATUSES = ['pending', 'running', 'review', 'done', 'cancelled'] as const

/** One task status, as the server names it. */
export type TaskStatus = (typeof TASK_STATUSES)[number]

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待处理',
  running: '进行中',
  review: '待验收',
  done: '已完成',
  cancelled: '已取消',
}

/** Assignee kinds in the words the page uses; unknown kinds fall back to the server value. */
const ASSIGNEE_LABELS: Record<string, string> = { human: '人', agent: 'Agent', squad: '小队' }

/** A status in Chinese; an unknown status is shown verbatim rather than guessed. */
export const taskStatusLabel = (status: string): string => STATUS_LABELS[status as TaskStatus] ?? status

/** Whether a task has reached a status it cannot leave. */
export const isTaskFinished = (status: string): boolean => status === 'done' || status === 'cancelled'

/** One legal manual move out of a status, with the label its button carries. */
export interface TaskAction {
  status: TaskStatus
  label: string
}

const ACTIONS: Record<TaskStatus, TaskAction[]> = {
  pending: [{ status: 'running', label: '开始处理' }, { status: 'cancelled', label: '取消任务' }],
  running: [{ status: 'review', label: '提交验收' }, { status: 'cancelled', label: '取消任务' }],
  review: [{ status: 'done', label: '确认完成' }, { status: 'cancelled', label: '取消任务' }],
  done: [],
  cancelled: [],
}

/**
 * The moves a person may make by hand. This mirrors the server's `CanTransitionTask`: review is
 * never skipped, and a finished task never reopens.
 */
export const taskActions = (status: string): TaskAction[] => ACTIONS[status as TaskStatus] ?? []

/** The assignee's display name, or 未指派; unassigned work stays visible to the whole team. */
export const assigneeLabel = (task: Task): string => task.assignee?.displayName ?? '未指派'

/** The assignee's kind in words, or '' when nothing is assigned. */
export const assigneeKindLabel = (task: Task): string => (task.assignee ? ASSIGNEE_LABELS[task.assignee.type] ?? task.assignee.type : '')

/** The project's name when the loaded list has it, otherwise the id the task carries. */
export const projectLabel = (projects: { id: string; name: string }[], projectId: string): string =>
  projects.find(project => project.id === projectId)?.name ?? projectId

/** Title and description limits, matching the server's boundary checks. */
export const MAX_TASK_TITLE = 200
export const MAX_TASK_DESCRIPTION = 4000

/** Field errors for a task draft; an empty title is the one thing a task cannot lose. */
export function validateTask(title: string, description: string): Record<string, string> {
  const errors: Record<string, string> = {}
  const trimmed = title.trim()
  if (!trimmed) errors.title = '请填写任务标题。'
  else if ([...trimmed].length > MAX_TASK_TITLE) errors.title = `标题最多 ${MAX_TASK_TITLE} 个字符。`
  if ([...description].length > MAX_TASK_DESCRIPTION) errors.description = `描述最多 ${MAX_TASK_DESCRIPTION} 个字符。`
  return errors
}

/**
 * A user-facing reason for a failed task request. A stale version is the common case, so it gets
 * the same wording everywhere: close the panel and reopen it to read the current task.
 */
export function taskMessageFor(error: unknown): string {
  switch (statusOf(error)) {
    case 401: return '登录已过期，请重新登录。'
    case 403: return '你不是这个工作区的成员。'
    case 404: return '任务不存在或你已无权查看。'
    case 409: return '任务已被其他人修改，请关闭后重新打开。'
    case 428: return '缺少版本号，请关闭后重新打开任务。'
  }
  switch (codeOf(error)) {
    case 'invalid_transition': return '这个状态不能直接切过去：按「待处理 → 进行中 → 待验收 → 已完成」推进。'
    case 'invalid_project': return '所选项目不在当前工作区，请重新选择。'
    case 'invalid_assignee': return '只能指派给当前工作区的成员、已安装的 Agent 或未归档的小队。'
    case 'invalid_title': return `请填写任务标题，最多 ${MAX_TASK_TITLE} 个字符。`
    case 'invalid_description': return `描述最多 ${MAX_TASK_DESCRIPTION} 个字符。`
    default: return '操作失败，请重试。'
  }
}

/** Run states and results in the page's words. */
export const runStateLabel = (state: string): string => ({ running: '执行中', idle: '等待追问', ended: '已结束' } as Record<string, string>)[state] ?? state

/** Why a run ended, in words; empty for a live run. */
export const runEndLabel = (reason: string): string =>
  ({ stopped: '已停止', replaced: '已被重新执行替代', closed: '任务已结束', interrupted: '服务重启后中断' } as Record<string, string>)[reason] ?? ''

/** A finished turn's result in words. */
export const runResultLabel = (result: string): string =>
  ({ completed: '已完成', failed: '执行失败', cancelled: '已取消', interrupted: '已中断' } as Record<string, string>)[result] ?? ''

/** A user-facing reason for a refused run, follow-up or comment; codes stay out of the page. */
export function taskRunMessageFor(error: unknown): string {
  switch (codeOf(error)) {
    case 'run_active': return 'Agent 正在执行，等这一轮结束或先停止。'
    case 'run_owned': return '当前运行由别人发起，只有发起人能继续追问；你可以重新执行，用自己的身份开一次新运行。'
    case 'not_agent_task': return '任务还没有指派给 Agent，先在右侧把它指派给一个 Agent。'
    case 'not_assignee': return '任务派给了别人，只有负责人本人能用 Agent 处理。'
    case 'task_closed': return '任务已结束，不能再执行。'
    case 'no_live_run': return '这次运行已经结束了。'
    case 'invalid_executor': return '所选模型不属于这个 Agent，请重新选择。'
    case 'invalid_mention': return '@ 的对象已不在工作区里，请重新选择。'
    case 'execution_unavailable': return '执行服务暂时不可用，请稍后重试。'
    case 'invalid_project': return '任务所属项目不可用。'
  }
  return statusOf(error) === 404 ? '任务不存在或你已无权查看。' : '操作失败，请重试。'
}

/** A refused manual move: the run's own reason when it owns the status, else the task's. */
export function taskMoveMessageFor(error: unknown): string {
  // Only ending a task answers 403 here: a caller outside the workspace gets 404.
  if (statusOf(error) === 403) return '只有任务创建人或工作区管理员能确认完成或取消任务。'
  const message = taskRunMessageFor(error)
  return message === '操作失败，请重试。' ? taskMessageFor(error) : message
}

/**
 * A refused drop on the board. The board has just been read again, so a stale version asks for one
 * more drag instead of reopening a panel.
 */
export function boardMoveMessageFor(error: unknown): string {
  if (statusOf(error) === 409 && codeOf(error) !== 'run_active') return '任务刚被其他人改过，看板已刷新，请再拖一次。'
  return taskMoveMessageFor(error)
}

/** The workflow the demo seeds for 「拆分」; the dialog picks it when the workspace has it. */
export const DEMO_DECOMPOSITION_WORKFLOW = '需求拆分'

/** A user-facing reason for a refused decomposition. */
export function decompositionMessageFor(error: unknown): string {
  switch (codeOf(error)) {
    case 'decomposition_active': return '这个任务正在拆分，等这次跑完再拆。'
    case 'invalid_workflow': return '所选工作流不存在或还没有发布，请重新选择。'
    case 'task_closed': return '任务已结束，不能再拆分。'
    case 'subtask_not_decomposable': return '子任务不能再拆分。'
    case 'invalid_project': return '任务所属项目不可用。'
    case 'workflow_run_host_unavailable': return '工作流执行服务不可用，请稍后重试。'
  }
  return statusOf(error) === 404 ? '任务不存在或你已无权查看。' : '拆分没有启动，请重试。'
}

/** Local date and time of a server instant; the demo runs in one timezone. */
export const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
