import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { SidebarLayout } from '@/components/sidebar-resize-handle'
import type { ChatConversation, ChatEvent, ChatExecutor } from './api/generated'
import type { CreateProject } from '@/lib/projects-api/generated'
import { applyEvent, isResponding } from '@/components/agent-thread/model/conversation'
import { applySessionEvent, conversationOf, emptySessionView, type SessionView } from '@/components/agent-thread/model/history'
import { type Attachment, type Conversation, emptyConversation, type PluginRef } from '@/components/agent-thread/model/types'
import { type Failure, failureOf, projectFailureOf, remote, type RemoteState, syncFailureOf } from './remote'

/**
 * What the first version of the chat backend can do. The input and the history hide what it
 * cannot, rather than offering something that would fail. Each backend conversation runs in a
 * sandbox of its own, cloned from the project's repository, so a new chat picks only the project.
 */
export const backendSupports = { attachments: false, plugins: false }

export interface Project {
  id: string
  name: string
  /** Where the project's main checkout lives, for projects the person added. */
  path?: string
  /** The last successful manual sync, if any. */
  syncAt?: string
  /** A user-facing reason the last sync failed or was interrupted, if it did. */
  syncError?: string
  /** Whether the last successful sync followed a rewritten remote branch. */
  syncForcePushed?: boolean
  /** Whether a manual sync is running. */
  syncRunning?: boolean
  /** Whether a private-repository token is configured. */
  repositoryTokenConfigured?: boolean
}

export interface Session {
  id: string
  projectId: string
  title: string
  /** The agent's id in the selector, and the model it runs with. */
  agent: string
  model: string
  /** Set for conversations the backend runs, each in its own directory: with which executor. */
  remote?: { executorId: string }
  /** The saved executor is no longer in the catalog; history remains readable. */
  executorUnavailable?: boolean
  createdAt: number
}

export interface Draft {
  text: string
  attachments: Attachment[]
  plugins: PluginRef[]
}

/** A session's input before anything is typed. */
export const emptyDraft: Draft = { text: '', attachments: [], plugins: [] }

/** Where a chat that has not been sent yet will start: the session is created by its first prompt. */
export interface NewChat {
  projectId: string
  agent: string
  model: string
}

/** The key the new chat's draft is kept under, next to the sessions' drafts. */
export const newChatKey = 'new'

/** An agent the cloud can run, and the models it offers. */
export interface Agent {
  id: string
  name: string
  models: string[]
}

/** The backend's executors as the selector shows them: each agent with the models it runs. */
export function agentsOf(executors: ChatExecutor[]): Agent[] {
  const byAgent = new Map<string, Agent>()
  for (const x of executors) {
    const agent = byAgent.get(x.agentName) ?? { id: x.agentName, name: x.agentName, models: [] }
    agent.models.push(x.modelName)
    byAgent.set(x.agentName, agent)
  }
  return [...byAgent.values()]
}

/** How the history column is laid out; kept per browser. */
export const defaultSidebar: SidebarLayout = { width: 288, open: true }

/**
 * Whether the backend can run chats: still loading, ready, or unable to (no execution runtime, no
 * projects, or unreachable).
 */
export type BackendState = 'idle' | 'loading' | 'ready' | 'unavailable'

/** Something the person should know about a send, shown above the input until dismissed. */
export type Notice = Failure & { key: string }

interface State {
  projects: Project[]
  sessions: Session[]
  conversations: Record<string, Conversation>
  /** Prompts typed while the agent was busy, sent in order once it is free. */
  queued: Record<string, string[]>
  /** Sessions that finished a turn the person has not looked at yet. */
  unread: Record<string, true>
  /** What the person has typed but not sent, per session. */
  drafts: Record<string, Draft>
  selectedId?: string
  /** The workflow run shown instead of a session, picked from a project's runs. */
  selectedRunId?: string
  /** The history column's width in pixels, and whether it is shown. */
  sidebar: SidebarLayout
  setSidebar: (sidebar: Partial<SidebarLayout>) => void

  tenantId?: string
  /** The signed-in person whose conversations, drafts and streams this state belongs to. */
  userId?: string
  backend: BackendState
  executors: ChatExecutor[]
  /** The execution session behind each backend conversation; empty until its first turn. */
  views: Record<string, SessionView[]>
  /** A prompt sent but not yet in the history, shown so the thread never looks empty meanwhile. */
  pending: Record<string, { text: string; turns: number }>
  /** The latest problem with a send, per session (or the new chat). */
  notices: Record<string, Notice>
  /** Loads the person's projects, executors and conversations in the tenant. */
  connect: (tenantId: string, userId: string) => Promise<void>
  dismiss: (key: string) => void

  select: (id: string) => void
  /** Shows a workflow run in place of the session, as desktop's workspace does. */
  selectRun: (id: string | undefined) => void
  /** What the new chat view starts; shown whenever no session is selected. */
  newChat: NewChat
  /**
   * Opens the new chat view. Without a scope it starts in the selected backend conversation's
   * project, so "new chat" from inside a project stays there.
   */
  startNewChat: (scope?: { projectId: string }) => void
  /** Counts the times the new chat view was asked for, so its input takes the focus each time. */
  newChatOpens: number
  setNewChat: (patch: Partial<NewChat>) => void
  /** Creates the conversation the new chat describes with its first prompt, and selects it. */
  sendNewChat: (draft: Draft) => Promise<void>
  renameSession: (id: string, title: string) => void
  deleteSession: (id: string) => Promise<void>
  /**
   * Creates a project from a repository the backend clones, then starts the new chat in it.
   * Resolves to why it failed, if it did.
   */
  createProject: (input: CreateProject) => Promise<string | undefined>
  /**
   * Pulls the project's bound branch once and replaces it in the list with the advanced record.
   * Resolves to why it failed, if it did; the failure reason stays on the project for the sidebar.
   */
  syncProject: (id: string) => Promise<string | undefined>
  /** Moves project `id` to where `overId` is, as a drag and drop does. */
  moveProject: (id: string, overId: string) => void
  send: (id: string, draft: Draft) => void
  /** Stops the running turn; for a backend conversation this ends it, leaving it read-only. */
  stop: (id: string) => void
  setDraft: (id: string, draft: Draft) => void
  /** Removes the queued prompt at `index`. */
  unqueue: (id: string, index: number) => void
}

/** Everything tied to one person in one tenant; sidebar layout is browser state and stays. */
const blankChat = () => ({
  projects: [] as Project[],
  sessions: [] as Session[],
  conversations: {} as Record<string, Conversation>,
  queued: {} as Record<string, string[]>,
  unread: {} as Record<string, true>,
  drafts: {} as Record<string, Draft>,
  selectedId: undefined,
  selectedRunId: undefined,
  executors: [] as ChatExecutor[],
  views: {} as Record<string, SessionView[]>,
  pending: {} as Record<string, { text: string; turns: number }>,
  notices: {} as Record<string, Notice>,
  newChat: { projectId: '', agent: '', model: '' } as NewChat,
  newChatOpens: 0,
})

/** The event streams being followed, by conversation id. */
const streams = new Map<string, () => void>()
/** Conversations whose stream reached its end: everything their session will ever send has been read. */
const drained = new Set<string>()
/**
 * Conversations whose backend refused a prompt because a turn is still running there, before
 * the page saw it start: their queue waits for that turn's end event rather than retrying.
 */
const awaitingTurnEnd = new Set<string>()
/** Distinguishes load results for successive account connections. */
let connectionVersion = 0
let ids = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(ids++).toString(36)}`

/** Stops every event stream; their callbacks also check the active account before applying. */
function stopFollowing() {
  for (const stop of streams.values()) stop()
  streams.clear()
  drained.clear()
  awaitingTurnEnd.clear()
}

/** A backend conversation as a history entry, listed directly under its project. */
function sessionOf(c: ChatConversation, executors: ChatExecutor[]): Session {
  const executor = executors.find((x) => x.id === c.executorId)
  return {
    id: c.id,
    projectId: c.projectId,
    title: c.title,
    agent: executor?.agentName ?? '原执行器已不可用',
    model: executor?.modelName ?? '',
    remote: { executorId: c.executorId },
    executorUnavailable: !executor,
    createdAt: Date.parse(c.createdAt),
  }
}

/** The session behind a conversation as the backend lists it, keeping events already seen. */
function viewsOf(c: ChatConversation, known: SessionView[] = []): SessionView[] {
  const s = c.session
  if (!s) return []
  const seen = known.find((v) => v.id === s.id) ?? emptySessionView(s.id)
  return [{ ...seen, ended: seen.ended || s.endedAt != null, endReason: s.endReason || seen.endReason }]
}

/** Whether a backend conversation's session has ended, so it can only be read. */
export const isEnded = (views: SessionView[] | undefined) => !!views?.some((v) => v.ended)

/** The conversation to show: the sessions' history, plus a sent prompt the history lacks yet. */
function shown(views: SessionView[], pending?: { text: string; turns: number }): Conversation {
  const c = conversationOf(views)
  if (!pending || c.turns.length > pending.turns) return c
  return applyEvent(c, { type: 'prompt', turnId: 'pending', text: pending.text }, Date.now())
}

/** Orders projects by `order`, keeping unlisted ones after it in their current order. */
function ordered(projects: Project[], order: string[]): Project[] {
  const rank = (id: string) => {
    const i = order.indexOf(id)
    return i === -1 ? order.length : i
  }
  return [...projects].sort((a, b) => rank(a.id) - rank(b.id))
}

export const useChatStore = create<State>()(
  persist(
    (set, get) => {
      const isRemote = (id: string) => !!get().sessions.find((x) => x.id === id)?.remote
      const isCurrent = (tenantId: string, userId: string) =>
        get().tenantId === tenantId && get().userId === userId

      /** Sends the next queued prompt once the agent is free, as the person would have. */
      const sendQueued = (id: string) => {
        const next = get().queued[id]?.[0]
        // A placeholder's queue moves to its conversation once the backend creates it.
        if (next === undefined || !isRemote(id) || isResponding(get().conversations[id] ?? emptyConversation)) return
        if (isEnded(get().views[id]) || awaitingTurnEnd.has(id)) return
        set((s) => ({ queued: { ...s.queued, [id]: s.queued[id].slice(1) } }))
        void sendRemote(id, next)
      }

      const notify = (key: string, failure: Failure) => set((s) => ({ notices: { ...s.notices, [key]: { ...failure, key } } }))

      /** Recomputes what a backend conversation shows after its sessions or pending prompt change. */
      const refresh = (id: string, change: (s: State) => Partial<State>) => {
        set((s) => {
          const patch = change(s)
          const next = { ...s, ...patch }
          const views = next.views[id] ?? []
          let pending: { text: string; turns: number } | undefined = next.pending[id]
          const before = s.conversations[id] ?? emptyConversation
          let after = shown(views, pending)
          if (pending && conversationOf(views).turns.length > pending.turns) {
            pending = undefined
            after = shown(views)
          }
          const { [id]: _, ...otherPending } = next.pending
          const finished = isResponding(before) && !isResponding(after) && s.selectedId !== id
          return {
            ...patch,
            pending: pending ? { ...otherPending, [id]: pending } : otherPending,
            conversations: { ...s.conversations, [id]: after },
            unread: finished ? { ...s.unread, [id]: true } : s.unread,
          }
        })
        if (!isResponding(get().conversations[id] ?? emptyConversation)) {
          sendQueued(id)
          prune(id)
        }
      }

      /**
       * Follows a conversation's session if it is not followed yet, after the last event it has
       * seen; an ended one replays what is left and closes.
       */
      const follow = (id: string) => {
        const { tenantId: tid, userId } = get()
        if (!tid || !userId) return
        for (const view of get().views[id] ?? []) {
          if (streams.has(id) || drained.has(id)) continue
          const done = () => streams.delete(id)
          const apply = (event: ChatEvent) => {
            if (!isCurrent(tid, userId)) return
            if (event.kind === 'turn_ended' || event.kind === 'session_ended') awaitingTurnEnd.delete(id)
            refresh(id, (s) => ({
              views: { ...s.views, [id]: (s.views[id] ?? []).map((v) => (v.id === view.id ? applySessionEvent(v, event) : v)) },
            }))
            // The event does not say why the session ended; the conversation does.
            if (event.kind === 'session_ended' && !get().views[id]?.find((v) => v.id === view.id)?.endReason) void reconcile(id)
          }
          streams.set(
            id,
            remote.follow(tid, id, view.cursor, {
              event: apply,
              end: () => (done(), drained.add(id)),
              failure: () => (done(), notify(id, { kind: 'error', message: '事件流中断，刷新页面后重试。' })),
            }),
          )
        }
      }

      /**
       * Stops following a conversation nobody is watching and that waits on nothing, so open
       * streams stay few: browsers allow only six connections per origin over HTTP/1.1.
       */
      const prune = (id: string) => {
        const s = get()
        if (s.selectedId === id || s.pending[id] || s.queued[id]?.length || isResponding(s.conversations[id] ?? emptyConversation)) return
        streams.get(id)?.()
        streams.delete(id)
      }

      /** Reads a conversation again, for why its session ended outside this page's own actions. */
      const reconcile = async (id: string) => {
        const { tenantId: tid, userId } = get()
        if (!tid || !userId) return
        const c = (await remote.conversations(tid).catch(() => [])).find((x) => x.id === id)
        if (c && isCurrent(tid, userId)) refresh(id, (s) => ({ views: { ...s.views, [id]: viewsOf(c, s.views[id]) } }))
      }

      /** Takes a conversation as the backend returned it after a write. */
      const absorb = (c: ChatConversation) => {
        const { executors } = get()
        refresh(c.id, (s) => ({
          sessions: s.sessions.some((x) => x.id === c.id)
            ? s.sessions.map((x) => (x.id === c.id ? { ...sessionOf(c, executors), title: x.title } : x))
            : [...s.sessions, sessionOf(c, executors)],
          views: { ...s.views, [c.id]: viewsOf(c, s.views[c.id]) },
        }))
        follow(c.id)
      }

      const sendRemote = async (id: string, text: string) => {
        const { tenantId: tid, userId } = get()
        if (!tid || !userId) return
        const turns = (get().conversations[id] ?? emptyConversation).turns.length
        refresh(id, (s) => ({ pending: { ...s.pending, [id]: { text, turns } } }))
        try {
          const { conversation } = await remote.send(tid, id, text)
          if (!isCurrent(tid, userId)) return
          absorb(conversation)
        } catch (error) {
          if (!isCurrent(tid, userId)) return
          const failure = failureOf(error, 'send')
          // Set before the refresh below, which would otherwise send the requeued prompt at once.
          if (failure.kind === 'running') awaitingTurnEnd.add(id)
          refresh(id, (s) => {
            const { [id]: _, ...pending } = s.pending
            // The previous turn is still running: the prompt waits for its end, like any queued one.
            return failure.kind === 'running' ? { pending, queued: { ...s.queued, [id]: [text, ...(s.queued[id] ?? [])] } } : { pending }
          })
          if (failure.kind === 'running') return
          // Ended outside this page (a restart): read why, so the thread says so.
          if (failure.kind === 'ended') void reconcile(id)
          notify(id, failure)
        }
      }

      return {
        projects: [],
        sessions: [],
        conversations: {},
        queued: {},
        unread: {},
        drafts: {},
        sidebar: defaultSidebar,
        backend: 'idle',
        executors: [],
        views: {},
        pending: {},
        notices: {},
        setSidebar: (sidebar) => set((s) => ({ sidebar: { ...s.sidebar, ...sidebar } })),
        connect: async (tenantId, userId) => {
          const before = get()
          if (before.tenantId === tenantId && before.userId === userId && before.backend !== 'idle') return
          const version = ++connectionVersion
          if (before.tenantId !== tenantId || before.userId !== userId) stopFollowing()
          // Clear synchronously: the page may render immediately after the identity changes.
          set({ ...blankChat(), tenantId, userId, backend: 'loading' })
          let loaded: RemoteState
          try {
            loaded = await remote.load(tenantId)
          } catch {
            if (version === connectionVersion && isCurrent(tenantId, userId)) set({ backend: 'unavailable' })
            return
          }
          // An old account's request may finish after a switch. Never let it replace the new state.
          if (version !== connectionVersion || !isCurrent(tenantId, userId)) return
          const projects = loaded.projects.map((p): Project => ({ id: p.id, name: p.name }))
          const order = loaded.projectOrder.length ? loaded.projectOrder : projects.map((p) => p.id)
          const first = loaded.executors[0]
          set((s) => ({
            backend: projects.length && loaded.executors.length ? 'ready' : 'unavailable',
            executors: loaded.executors,
            projects: ordered(projects, order),
            sessions: [...s.sessions.filter((x) => !x.remote), ...loaded.conversations.map((c) => sessionOf(c, loaded.executors))],
            views: Object.fromEntries(loaded.conversations.map((c) => [c.id, viewsOf(c)])),
            newChat: {
              projectId: projects[0]?.id ?? '',
              agent: first?.agentName ?? '',
              model: first?.modelName ?? '',
            },
          }))
          for (const c of loaded.conversations) refresh(c.id, () => ({}))
        },
        dismiss: (key) =>
          set((s) => {
            const { [key]: _, ...notices } = s.notices
            return { notices }
          }),
        select: (id) => {
          const previous = get().selectedId
          set((s) => {
            const { [id]: _, ...unread } = s.unread
            return { selectedId: id, selectedRunId: undefined, unread }
          })
          if (previous && previous !== id) prune(previous)
          if (isRemote(id)) follow(id)
        },
        selectRun: (id) => set({ selectedRunId: id }),
        newChat: { projectId: '', agent: '', model: '' },
        newChatOpens: 0,
        startNewChat: (scope) => {
          const previous = get().selectedId
          set((s) => {
            const current = s.sessions.find((x) => x.id === s.selectedId)
            const fromSelection = current?.remote ? current : undefined
            const where = scope ? { projectId: scope.projectId } : fromSelection ? { projectId: fromSelection.projectId } : {}
            return { selectedId: undefined, selectedRunId: undefined, newChat: { ...s.newChat, ...where }, newChatOpens: s.newChatOpens + 1 }
          })
          if (previous) prune(previous)
        },
        setNewChat: (patch) => set((s) => ({ newChat: { ...s.newChat, ...patch } })),
        sendNewChat: async (draft) => {
          const { tenantId: tid, userId, newChat, executors, projects } = get()
          const executor = executors.find((x) => x.agentName === newChat.agent && x.modelName === newChat.model)
          const project = projects.find((p) => p.id === newChat.projectId)
          if (!tid || !userId || !executor || !project) {
            notify(newChatKey, { kind: 'unavailable' })
            return
          }
          // The conversation exists once the backend admits its first prompt; until then a
          // placeholder holds the prompt, so the input slides down at once as in desktop.
          const placeholder = newId('pending')
          set((s) => ({
            sessions: [...s.sessions, { id: placeholder, projectId: project.id, title: draft.text.slice(0, 24), agent: newChat.agent, model: newChat.model, createdAt: Date.now() }],
            selectedId: placeholder,
            drafts: { ...s.drafts, [newChatKey]: emptyDraft },
            conversations: { ...s.conversations, [placeholder]: applyEvent(emptyConversation, { type: 'prompt', turnId: 'pending', text: draft.text }, Date.now()) },
          }))
          const drop = () =>
            set((s) => {
              const { [placeholder]: _, ...conversations } = s.conversations
              return { sessions: s.sessions.filter((x) => x.id !== placeholder), conversations }
            })
          try {
            const { conversation } = await remote.create(tid, { projectId: project.id, executorId: executor.id, prompt: draft.text })
            if (!isCurrent(tid, userId)) return
            const selected = get().selectedId === placeholder
            // Prompts typed while the first one was being sent wait for the conversation.
            const queued = get().queued[placeholder] ?? []
            set((s) => {
              const { [placeholder]: _, ...rest } = s.queued
              return { queued: queued.length ? { ...rest, [conversation.id]: queued } : rest }
            })
            drop()
            refresh(conversation.id, (s) => ({ pending: { ...s.pending, [conversation.id]: { text: draft.text, turns: 0 } } }))
            absorb(conversation)
            if (selected) get().select(conversation.id)
          } catch (error) {
            if (!isCurrent(tid, userId)) return
            drop()
            set((s) => ({ selectedId: s.selectedId === placeholder ? undefined : s.selectedId, drafts: { ...s.drafts, [newChatKey]: draft } }))
            notify(newChatKey, failureOf(error, 'send'))
          }
        },
        renameSession: (id, title) => {
          const trimmed = title.trim()
          const before = get().sessions.find((x) => x.id === id)
          if (!before || !trimmed || trimmed === before.title) return
          set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: trimmed } : x)) }))
          const { tenantId: tid, userId } = get()
          if (before.remote && tid && userId) {
            remote.rename(tid, id, trimmed).catch((error: unknown) => {
              if (!isCurrent(tid, userId)) return
              set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, title: before.title } : x)) }))
              notify(id, failureOf(error))
            })
          }
        },
        deleteSession: async (id) => {
          const session = get().sessions.find((x) => x.id === id)
          const { tenantId: tid, userId } = get()
          if (session?.remote && tid && userId) {
            try {
              await remote.remove(tid, id)
            } catch (error) {
              if (!isCurrent(tid, userId)) return
              notify(id, failureOf(error))
              return
            }
            if (!isCurrent(tid, userId)) return
            streams.get(id)?.()
            streams.delete(id)
          }
          set((s) => {
            const { [id]: _, ...conversations } = s.conversations
            const { [id]: __, ...views } = s.views
            return {
              sessions: s.sessions.filter((x) => x.id !== id),
              conversations,
              views,
              selectedId: s.selectedId === id ? undefined : s.selectedId,
            }
          })
        },
        createProject: async (input) => {
          const { tenantId: tid, userId } = get()
          if (!tid || !userId) return '还没连上后端，请稍后再试。'
          let project: Project
          try {
            project = await remote.createProject(tid, input)
          } catch (error) {
            if (!isCurrent(tid, userId)) return undefined
            return projectFailureOf(error, input)
          }
          if (!isCurrent(tid, userId)) return undefined
          set((s) => ({
            projects: [...s.projects.filter((p) => p.id !== project.id), project],
            // The page waited only for a project to start chats in.
            backend: s.executors.length ? 'ready' : s.backend,
          }))
          // From the history column a session may be showing: the new chat opens in its place.
          get().startNewChat({ projectId: project.id })
          return undefined
        },
        syncProject: async (id) => {
          const { tenantId: tid, userId } = get()
          if (!tid || !userId) return '还没连上后端，请稍后再试。'
          try {
            const project = await remote.syncProject(tid, id)
            if (!isCurrent(tid, userId)) return undefined
            set((s) => ({ projects: s.projects.map((p) => (p.id === project.id ? project : p)) }))
            return undefined
          } catch (error) {
            if (!isCurrent(tid, userId)) return undefined
            // Reload the record so the sidebar shows the server-recorded failure reason.
            try {
              const project = await remote.project(tid, id)
              if (isCurrent(tid, userId)) set((s) => ({ projects: s.projects.map((p) => (p.id === project.id ? project : p)) }))
            } catch {
              // Keep the last known state; the toast already says it failed.
            }
            return syncFailureOf(error)
          }
        },
        moveProject: (id, overId) => {
          set((s) => {
            const from = s.projects.findIndex((p) => p.id === id)
            const to = s.projects.findIndex((p) => p.id === overId)
            if (from === -1 || to === -1 || from === to) return s
            const projects = [...s.projects]
            projects.splice(to, 0, ...projects.splice(from, 1))
            return { projects }
          })
          const tid = get().tenantId
          if (tid && get().backend === 'ready') void remote.saveOrder(tid, get().projects.map((p) => p.id)).catch(() => {})
        },
        send: (id, draft) => {
          if (isRemote(id) && isEnded(get().views[id])) {
            notify(id, { kind: 'ended' })
            return
          }
          const conversation = get().conversations[id] ?? emptyConversation
          // A placeholder still waiting for its conversation keeps what is typed until it exists.
          if (!isRemote(id) || isResponding(conversation) || get().pending[id]) {
            set((s) => ({ queued: { ...s.queued, [id]: [...(s.queued[id] ?? []), draft.text] } }))
            return
          }
          void sendRemote(id, draft.text)
        },
        stop: (id) => {
          const { tenantId: tid, userId } = get()
          // A first prompt still being admitted has nothing to stop yet.
          if (!isRemote(id) || !tid || !userId) return
          // The fixed Node ends the whole session, and its stream can report that before the
          // stop request returns; the reason is set first so the marker reads right either way.
          // Prompts queued behind the stopped turn can never be sent.
          const reason = (endReason: SessionView['endReason']) =>
            refresh(id, (s) => ({ views: { ...s.views, [id]: (s.views[id] ?? []).map((v) => (v.ended ? v : { ...v, endReason })) } }))
          set((s) => ({ queued: { ...s.queued, [id]: [] } }))
          reason('stopped')
          remote.stop(tid, id).catch((error: unknown) => {
            if (!isCurrent(tid, userId)) return
            reason('')
            notify(id, failureOf(error))
          })
        },
        setDraft: (id, draft) => set((s) => ({ drafts: { ...s.drafts, [id]: draft } })),
        unqueue: (id, index) =>
          set((s) => ({ queued: { ...s.queued, [id]: (s.queued[id] ?? []).filter((_, i) => i !== index) } })),
      }
    },
    {
      name: 'ora-v2-chat',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // The backend keeps project order per person. Only browser layout survives a reload.
      partialize: (s) => ({ sidebar: s.sidebar }),
      merge: (persisted, current) => {
        const saved = persisted as { sidebar?: SidebarLayout } | undefined
        return {
          ...current,
          sidebar: { ...current.sidebar, ...saved?.sidebar },
        }
      },
    },
  ),
)

/** Resets everything to the initial state; tests call it between cases. */
export function resetChatStore() {
  connectionVersion++
  stopFollowing()
  useChatStore.setState({
    ...blankChat(),
    sidebar: defaultSidebar,
    tenantId: undefined,
    userId: undefined,
    backend: 'idle',
  })
}
