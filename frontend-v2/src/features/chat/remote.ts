import { statusOf } from '@/lib/api-client'
import {
  type CreateProject,
  getApiV2TenantsTidProjects,
  getApiV2TenantsTidProjectsPid,
  postApiV2TenantsTidProjects,
  postApiV2TenantsTidProjectsPidSync,
} from '@/lib/projects-api/generated'
import { isAxiosError } from 'axios'
import {
  type ChatConversation,
  type ChatEvent,
  type ChatExecutor,
  createChatConversation,
  deleteChatConversation,
  getChatProjectOrder,
  listChatConversations,
  listChatExecutors,
  renameChatConversation,
  sendChatMessage,
  setChatProjectOrder,
  stopChatConversation,
} from './api/generated'

/** A project the backend can run chats in; each conversation gets its own directory of it. */
export interface RemoteProject {
  id: string
  name: string
  syncAt?: string
  syncError?: string
  syncForcePushed?: boolean
  syncRunning?: boolean
  repositoryTokenConfigured?: boolean
}

/** Everything the chat page loads once it knows the tenant. */
export interface RemoteState {
  executors: ChatExecutor[]
  conversations: ChatConversation[]
  projects: RemoteProject[]
  projectOrder: string[]
}

/**
 * Why a request failed, in the terms the page shows: the previous turn is still running (the
 * prompt waits in the queue), the conversation has ended and is read-only, the backend cannot run
 * Agents yet, or something else went wrong.
 */
export type Failure = { kind: 'running' } | { kind: 'ended' } | { kind: 'unavailable' } | { kind: 'error'; message: string }

/** Reads every page of the tenant's projects. */
async function allProjects(tid: string): Promise<RemoteProject[]> {
  const all: RemoteProject[] = []
  let after: string | undefined
  do {
    const page = await getApiV2TenantsTidProjects(tid, { limit: 100, after })
    all.push(...page.items.map((p) => ({ id: p.id, name: p.name, syncAt: p.syncAt, syncError: p.syncError, syncForcePushed: p.syncForcePushed, syncRunning: p.syncRunning, repositoryTokenConfigured: p.repositoryTokenConfigured })))
    after = page.nextCursor || undefined
  } while (after)
  return all
}

/** Turns a failed request into a {@link Failure}; only sends explain a stale Agent or model. */
export function failureOf(error: unknown, operation: 'send' | 'other' = 'other'): Failure {
  const status = statusOf(error)
  const body = isAxiosError(error) ? (error.response?.data as { code?: string } | undefined) : undefined
  if (status === 409 && body?.code === 'turn_running') return { kind: 'running' }
  if (status === 409 && body?.code === 'conversation_ended') return { kind: 'ended' }
  if (status === 503 && body?.code === 'execution_unavailable') return { kind: 'unavailable' }
  if (status === 503 && body?.code === 'stop_unconfirmed') return { kind: 'error', message: '还没确认停下，请稍后再试。' }
  if (status === 400 && body?.code === 'unsupported_content') return { kind: 'error', message: '首版只能发送文字消息。' }
  if (operation === 'send' && ((status === 404 && body?.code === 'not_found') || (status === 400 && body?.code === 'invalid_executor'))) {
    return { kind: 'error', message: '原来的 Agent 或模型已不可用，请新建对话并重新选择。' }
  }
  return { kind: 'error', message: '请求失败，请重试。' }
}

/**
 * Why creating a project failed, as the dialog says it. The backend clones the repository before
 * it records anything, so every failure leaves no project behind.
 */
export function projectFailureOf(error: unknown, input: CreateProject): string {
  const status = statusOf(error)
  const body = isAxiosError(error) ? (error.response?.data as { code?: string } | undefined) : undefined
  if (status === 400 && body?.code === 'invalid_project') return '项目名、仓库地址或分支不合法。仓库地址要用 HTTPS，不能带用户名、查询参数或 #。'
  if (status === 400 && body?.code === 'repository_unavailable') return `无法克隆这个仓库，或仓库里没有分支 ${input.defaultBranch}。请确认地址能公开访问、分支存在。`
  if (status === 409 && body?.code === 'project_conflict') return '和已有项目冲突，请重试。'
  return '新建项目失败，请重试。'
}

/** Why a manual sync failed, as the sidebar says it; the server keeps the detailed reason. */
export function syncFailureOf(error: unknown): string {
  const status = statusOf(error)
  const body = isAxiosError(error) ? (error.response?.data as { code?: string } | undefined) : undefined
  if (status === 400 && body?.code === 'repository_unavailable') return '同步失败，详情见项目。'
  if (status === 400 && body?.code === 'project_token_unavailable') return '同步失败：项目令牌不可用，请重新设置。'
  if (status === 404) return '项目不存在。'
  return '同步失败，请重试。'
}

/** Whether a request's outcome is unknown and must be retried with the same idempotency key. */
const uncertain = (error: unknown) => {
  const body = isAxiosError(error) ? (error.response?.data as { code?: string } | undefined) : undefined
  return statusOf(error) === 503 && body?.code === 'outcome_unknown'
}

/**
 * Sends a prompt with one idempotency key, retrying while the backend says its outcome is
 * unknown: the same key settles it without running the prompt twice.
 */
async function once<T>(run: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  const headers = { 'Idempotency-Key': crypto.randomUUID() }
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(headers)
    } catch (error) {
      if (!uncertain(error) || attempt >= 3) throw error
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

/**
 * The chat backend the store talks to. Conversations and their live event streams are client
 * state driven by Server-Sent Events, so the store owns them instead of TanStack Query; every
 * call still goes through the generated client.
 */
export const remote = {
  /** Loads what the page needs, all from v2-server's candidate routes. */
  async load(tid: string): Promise<RemoteState> {
    const [executors, conversations, projects, order] = await Promise.all([
      listChatExecutors(tid),
      listChatConversations(tid),
      allProjects(tid),
      getChatProjectOrder(tid),
    ])
    return {
      executors: executors.items,
      conversations: conversations.items,
      projects,
      projectOrder: order.projectIds,
    }
  },
  create: (tid: string, input: { projectId: string; executorId: string; prompt: string }) => once((headers) => createChatConversation(tid, input, { headers })),
  send: (tid: string, cid: string, prompt: string) => once((headers) => sendChatMessage(tid, cid, { prompt }, { headers })),
  conversations: async (tid: string) => (await listChatConversations(tid)).items,
  stop: (tid: string, cid: string) => stopChatConversation(tid, cid),
  rename: (tid: string, cid: string, title: string) => renameChatConversation(tid, cid, { title }),
  remove: (tid: string, cid: string) => deleteChatConversation(tid, cid),
  saveOrder: (tid: string, projectIds: string[]) => setChatProjectOrder(tid, { projectIds }),
  /** Clones the repository and records the project; resolves only once both have succeeded. */
  createProject: async (tid: string, input: CreateProject): Promise<RemoteProject> => {
    const p = await postApiV2TenantsTidProjects(tid, input)
    return { id: p.id, name: p.name, syncAt: p.syncAt, syncError: p.syncError, syncForcePushed: p.syncForcePushed, syncRunning: p.syncRunning, repositoryTokenConfigured: p.repositoryTokenConfigured }
  },
  /** Pulls the project's bound branch once and returns the advanced project record. */
  syncProject: async (tid: string, pid: string): Promise<RemoteProject> => {
    const p = await postApiV2TenantsTidProjectsPidSync(tid, pid)
    return { id: p.id, name: p.name, syncAt: p.syncAt, syncError: p.syncError, syncForcePushed: p.syncForcePushed, syncRunning: p.syncRunning, repositoryTokenConfigured: p.repositoryTokenConfigured }
  },
  /** Reads one project, so a failed sync can still refresh the reason the server recorded. */
  project: async (tid: string, pid: string): Promise<RemoteProject> => {
    const p = await getApiV2TenantsTidProjectsPid(tid, pid)
    return { id: p.id, name: p.name, syncAt: p.syncAt, syncError: p.syncError, syncForcePushed: p.syncForcePushed, syncRunning: p.syncRunning, repositoryTokenConfigured: p.repositoryTokenConfigured }
  },

  /**
   * Follows a conversation's session events. The browser's EventSource resumes after the last
   * event id on its own; `end` closes the stream when the session has ended and `failure` when
   * the backend cannot continue it. Returns the function that stops following.
   */
  follow(tid: string, cid: string, after: number, on: { event: (e: ChatEvent) => void; end: () => void; failure: () => void }): () => void {
    const source = remote.eventSource(`/api/v2/tenants/${tid}/chat/conversations/${cid}/events${after ? `?after=${after}` : ''}`)
    source.onmessage = (m: MessageEvent<string>) => on.event(JSON.parse(m.data) as ChatEvent)
    source.addEventListener('end', () => (source.close(), on.end()))
    source.addEventListener('failure', () => (source.close(), on.failure()))
    return () => source.close()
  },
  /** Opens an event stream; the demo backend replaces it with its own. */
  eventSource: (url: string): EventSource => new EventSource(url),
}
