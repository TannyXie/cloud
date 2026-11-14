import type { InternalAxiosRequestConfig } from 'axios'
import { demoUser, fakeBackend } from '@/test/backend'
import type { ChatConversation, ChatEvent, ChatExecutor, ChatHistoryRecord } from './api/generated'

export const tenantId = '00000000-0000-4000-8000-0000000000aa'

const at = '2026-10-30T09:00:00Z'
const project = (id: string, name: string) => ({
  id, tenantId, ownerUserId: demoUser.id, name, repositoryUrl: `https://git.example/${name}`, defaultBranch: 'main',
  commitId: '0'.repeat(40), createdAt: at,
})

/** One followed event stream; tests push events into it as the backend would. */
export class FakeEventSource {
  static all: FakeEventSource[] = []
  static readonly CLOSED = 2
  onmessage: ((m: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  readyState = 1
  closed = false
  private listeners: Record<string, (() => void)[]> = {}
  url: string
  constructor(url: string) {
    this.url = url
    FakeEventSource.all.push(this)
  }
  addEventListener(name: string, fn: () => void) {
    ;(this.listeners[name] ??= []).push(fn)
  }
  /** The server answered with an error status: the browser closes the stream for good. */
  refuse() {
    this.readyState = FakeEventSource.CLOSED
    this.onerror?.()
  }
  close() {
    this.closed = true
  }
  private sequence = 0
  /** Delivers the stream's next event; sequences count up per stream, as the backend's do. */
  emit(event: Partial<ChatEvent>) {
    this.onmessage?.({ data: JSON.stringify({ sequence: ++this.sequence, occurredAt: at, turnId: 't', ...event }) } as MessageEvent<string>)
  }
  /** Delivers a named event: `end` or `failure` of a session stream, or a run stream's invalidation. */
  fire(name: 'end' | 'failure' | 'workflow_run_invalidated') {
    for (const fn of this.listeners[name] ?? []) fn()
  }
  /** The latest stream following conversation `cid`. */
  static of(cid: string) {
    const s = FakeEventSource.all.filter((x) => x.url.split('?')[0].endsWith(`/conversations/${cid}/events`)).at(-1)
    if (!s) throw new Error(`no stream for ${cid}`)
    return s
  }
}

/** A settled history line, as the fixed Node records it. */
export const line = {
  user: (seq: number, text: string): ChatHistoryRecord => ({
    sequence: seq,
    data: { at, seq, type: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text } } },
  }),
  say: (seq: number, text: string): ChatHistoryRecord => ({
    sequence: seq,
    data: { at, seq, type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } },
  }),
  ended: (seq: number): ChatHistoryRecord => ({ sequence: seq, data: { at, seq, type: 'turnEnded', stop_reason: 'end_turn' } }),
}

export const executors: ChatExecutor[] = [
  { id: 'oc-fixture', name: 'OpenCode · Fixture', agentId: 'official/ora-space.opencode', agentName: 'OpenCode', modelId: 'fixture', modelName: 'Fixture' },
  { id: 'oc-sonnet', name: 'OpenCode · Claude Sonnet 5.5', agentId: 'official/ora-space.opencode', agentName: 'OpenCode', modelId: 'configured', modelName: 'Claude Sonnet 5.5' },
  { id: 'cc-sonnet', name: 'Claude Code · Claude Sonnet 5.5', agentId: 'official/ora-space.claude', agentName: 'Claude Code', modelId: 'messages-configured', modelName: 'Claude Sonnet 5.5' },
]

const conversation = (id: string, title: string): ChatConversation => ({
  id, projectId: 'p-cloud', executorId: 'oc-fixture', title, createdAt: at, updatedAt: at,
  session: { id: `${id}-s1`, startedAt: at, endedAt: null, endReason: '' },
})

/** What the fake chat backend holds; tests read and change it. */
export interface ChatBackend {
  conversations: ChatConversation[]
  projectOrder: string[]
  /** Makes the next create or send answer this instead of taking the prompt. */
  refuse?: { status: number; data: unknown }
  /** Projects created through the page, listed after the two the backend starts with. */
  created: ReturnType<typeof project>[]
  /** Makes the next project creation answer this instead of cloning. */
  refuseProject?: { status: number; data: unknown }
  /** Makes the next sync answer this instead of succeeding. */
  refuseSync?: { status: number; data: unknown }
  /** The recorded syncError a failed sync leaves on the project, read back by the page. */
  syncError?: string
  /** Requests seen, as "METHOD /path". */
  seen: string[]
  bodies: unknown[]
}

/**
 * Fakes the chat backend for one test: two projects, three executors and two conversations in
 * ora-space/cloud. With `unavailable` every chat route answers 503, as v2-server does without an
 * execution runtime.
 */
export function chatBackend(options: { unavailable?: boolean } = {}): ChatBackend {
  globalThis.EventSource = FakeEventSource as never
  FakeEventSource.all = []
  const state: ChatBackend = {
    conversations: [conversation('c-main', '梳理 v2 接口缺口'), conversation('c-style', '对话页样式')],
    projectOrder: [],
    created: [],
    seen: [],
    bodies: [],
  }
  let next = 0
  const base = `/api/v2/tenants/${tenantId}/chat`
  const route = (config: InternalAxiosRequestConfig) => {
    const url = config.url ?? ''
    const method = config.method?.toUpperCase()
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    if (body !== undefined) state.bodies.push(body)
    if (url === '/api/v1/me') return { status: 200, data: demoUser }
    if (url === '/api/v1/me/tenants') return { status: 200, data: { items: [{ id: tenantId, name: '演示团队', status: 'active', role: 'owner' }], nextCursor: '' } }
    // One project per page, so the page has to follow nextCursor to see both.
    if (url === `/api/v2/tenants/${tenantId}/projects` && method === 'POST') {
      const refused = state.refuseProject
      state.refuseProject = undefined
      if (refused) return refused
      const p = { ...project(`p-new-${state.created.length + 1}`, body.name), repositoryUrl: body.repositoryUrl, defaultBranch: body.defaultBranch }
      state.created.push(p)
      return { status: 201, data: p }
    }
    if (url === `/api/v2/tenants/${tenantId}/projects`) {
      return config.params?.after === 'p-cloud'
        ? { status: 200, data: { items: [project('p-desktop', 'ora-space/desktop'), ...state.created], nextCursor: '' } }
        : { status: 200, data: { items: [project('p-cloud', 'ora-space/cloud')], nextCursor: 'p-cloud' } }
    }
    const projectMatch = url.match(new RegExp(`^/api/v2/tenants/${tenantId}/projects/([^/]+)(/sync)?$`))
    if (projectMatch) {
      const id = projectMatch[1]
      const sync = projectMatch[2]
      if (sync && method === 'POST') {
        state.seen.push(`POST /projects/${id}/sync`)
        if (state.refuseSync) {
          const refused = state.refuseSync
          state.refuseSync = undefined
          return refused
        }
        return { status: 200, data: { ...project(id, id), syncAt: at, syncError: state.syncError ?? '' } }
      }
      if (!sync && method === 'GET') {
        return { status: 200, data: { ...project(id, id), syncAt: at, syncError: state.syncError ?? '' } }
      }
    }
    if (!url.startsWith(base)) return undefined
    if (options.unavailable) return { status: 503, data: { code: 'execution_unavailable', params: {}, requestId: 'r' } }
    const path = url.slice(base.length)
    const find = (id: string) => state.conversations.find((c) => c.id === id)
    if (path === '/executors') return { status: 200, data: { items: executors } }
    if (path === '/project-order') {
      if (method === 'PUT') state.projectOrder = body.projectIds
      return { status: 200, data: { projectIds: state.projectOrder } }
    }
    if (path === '/conversations' && method === 'GET') return { status: 200, data: { items: state.conversations, nextCursor: '' } }
    if (method === 'POST' && state.refuse && (path === '/conversations' || path.endsWith('/messages'))) {
      const refused = state.refuse
      state.refuse = undefined
      return refused
    }
    if (path === '/conversations' && method === 'POST') {
      const c = { ...conversation(`c-new-${++next}`, String(body.prompt).slice(0, 24)), projectId: body.projectId, executorId: body.executorId }
      state.conversations.push(c)
      return { status: 201, data: { conversation: c, turn: { sessionId: c.session!.id, turnId: 't1' } } }
    }
    const [, id, action] = path.match(/^\/conversations\/([^/]+)\/?(.*)$/) ?? []
    const c = id ? find(id) : undefined
    if (!c) return { status: 404, data: { code: 'not_found', params: {}, requestId: 'r' } }
    const session = c.session!
    if (action === 'messages') {
      if (session.endedAt) return { status: 409, data: { code: 'conversation_ended', params: {}, requestId: 'r' } }
      return { status: 201, data: { conversation: c, turn: { sessionId: session.id, turnId: 't2' } } }
    }
    if (action === 'stop') {
      Object.assign(session, { endedAt: at, endReason: 'stopped' })
      return { status: 200, data: { result: { status: 'cancelled', answer: '', answerComplete: false, stopReason: 'cancelled', failureCode: '' } } }
    }
    if (method === 'PATCH') return { status: 200, data: Object.assign(c, { title: body.title }) }
    if (method === 'DELETE') {
      state.conversations = state.conversations.filter((x) => x !== c)
      return { status: 204 }
    }
    return undefined
  }
  const seen = fakeBackend(route)
  state.seen = seen
  return state
}
