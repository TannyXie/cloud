import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  Download,
  FileText,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react'
import type {
  PluginCatalogEntry,
  SpacePlugin,
} from '@/api/generated.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { pluginKey, usePluginMarketplace } from '../data/marketplace'
import {
  ActionError,
  DataState,
  Filter,
  NoResults,
  PageHeader,
  SearchInput,
} from '../components/page-parts'
import { DetailPanel } from '../components/detail-panel'
import { ConfirmDialog } from '../components/confirm-dialog'
import { MarkdownPreview } from '../components/markdown-preview'
import type { Skill as ServerSkill, SkillInput } from '@/lib/skills-api/generated'
import { useSkillDeployments } from '../data/skill-deployments'
import type { SkillProgress } from '../market-api/generated'
import { ImportSkillDialog } from './import-skill-dialog'
import { SkillForm } from './skill-form'
import { useUserSkills } from './use-skills'

type Panel = { kind: 'create' } | { kind: 'detail' | 'edit'; id: string } | null

type SkillSource =
  | { kind: 'local' }
  | { kind: 'plugin'; pluginId: string }

type SkillRow = {
  id: string
  namespace: string
  name: string
  description: string
  content: string
  source: SkillSource
  availability: 'available' | 'unavailable'
  /** Per-project delivery outcome for a selected market Skill; `undefined` before receipts load. */
  deployment?: SkillRowDeployment
  /** Per-project receipts, shown in the detail panel; only for market Skills with a selection. */
  states?: SkillProgress[]
  updatedAt?: string
  local?: ServerSkill
  entry?: PluginCatalogEntry
  selection?: SpacePlugin
  /** Present when an installed market Skill takes this name: the market version wins at runtime. */
  shadowedByMarket?: string
}

/** Aggregates one selection's project receipts into a single visible state. */
type SkillRowDeployment =
  | { state: 'installed' }
  | { state: 'applying' }
  | { state: 'failed'; failure: string }
  | { state: 'waiting' }
  | { state: 'removed' }

type Removing =
  | { kind: 'local'; skill: SkillRow }
  | { kind: 'plugin'; skill: SkillRow }

const deploymentLabel: Record<SkillRowDeployment['state'], string> = {
  installed: '已下发',
  applying: '下发中',
  failed: '下发失败',
  waiting: '等待下发',
  removed: '已移除',
}

function skillStatus(skill: SkillRow, detail = false) {
  if (skill.deployment?.state === 'failed') {
    return detail ? `安装失败：${skill.deployment.failure}` : '安装失败'
  }
  if (skill.availability === 'available') {
    return skill.deployment === undefined
      ? '可用'
      : deploymentLabel[skill.deployment.state]
  }
  return detail ? '不可用，来源插件未安装' : '来源插件未安装'
}

function pluginSkillName(entry: PluginCatalogEntry): string {
  const heading = entry.readme?.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || entry.identifier
}

/** Names of market Skills already installed in this space, keyed by the user-visible skill name. */
function installedMarketSkillNames(
  catalog: PluginCatalogEntry[],
  selection: (entry: PluginCatalogEntry) => SpacePlugin | undefined,
): Map<string, string> {
  const names = new Map<string, string>()
  for (const entry of catalog) {
    if (entry.kind !== 'skill') continue
    if (selection(entry)?.desiredState === 'installed') {
      names.set(pluginSkillName(entry), pluginSkillName(entry))
    }
  }
  return names
}

function localSkillRows(skills: ServerSkill[]): SkillRow[] {
  return skills.map((skill) => ({
    ...skill,
    namespace: 'local',
    source: { kind: 'local' },
    availability: 'available',
    local: skill,
  }))
}

function pluginSkillRows(
  catalog: PluginCatalogEntry[],
  selection: (entry: PluginCatalogEntry) => SpacePlugin | undefined,
  deployed: (entry: PluginCatalogEntry) => SkillRow['deployment'],
): SkillRow[] {
  return catalog
    .filter((entry) => entry.kind === 'skill')
    .map((entry) => {
      const chosen = selection(entry)
      return {
        id: `plugin-skill-${pluginKey(entry)}`,
        namespace: entry.sourceNamespace,
        name: pluginSkillName(entry),
        description: entry.description,
        content: entry.readme ?? '',
        source: { kind: 'plugin', pluginId: pluginKey(entry) },
        availability: chosen?.desiredState === 'installed' ? 'available' : 'unavailable',
        deployment: chosen?.desiredState === 'installed' ? deployed(entry) : undefined,
        entry,
        selection: chosen,
      }
    })
}

const updatedLabel = (value?: string) => {
  if (!value) return '未知'
  const date = new Date(value)
  return Number.isNaN(date.valueOf())
    ? '未知'
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)
}

export default function SkillsPage() {
  const local = useUserSkills()
  const market = usePluginMarketplace()
  const deployments = useSkillDeployments(
    market.tenantId,
    market.spaceId,
    market.installations,
  )
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('all')
  const [status, setStatus] = useState('all')
  const [order, setOrder] = useState('asc')
  const [panel, setPanel] = useState<Panel>(null)
  const [removing, setRemoving] = useState<Removing>()
  const [importing, setImporting] = useState(false)
  const deploymentOf = (entry: PluginCatalogEntry): SkillRowDeployment | undefined => {
    const selection = market.selection(entry)
    if (!selection) return undefined
    if (selection.installError) {
      return { state: 'failed', failure: selection.installError }
    }
    const summary = deployments.summaryOf(selection)
    if (!summary) return undefined
    if (summary.aggregate === 'failed') return { state: 'failed', failure: summary.failure ?? '未知原因' }
    if (summary.aggregate === 'applying') return { state: 'applying' }
    if (summary.aggregate === 'waiting') return { state: 'waiting' }
    if (summary.aggregate === 'removed') return { state: 'removed' }
    if (summary.aggregate === 'installed') return { state: 'installed' }
    return { state: 'waiting' }
  }
  const statesOf = (entry: PluginCatalogEntry): SkillProgress[] | undefined => {
    const selection = market.selection(entry)
    return selection ? deployments.byKey.get(pluginKey(selection)) : undefined
  }
  const skills: SkillRow[] = [
    ...localSkillRows(local.skills).map((skill) => {
      const marketName = installedMarketSkillNames(market.catalog, market.selection).get(skill.name)
      return marketName ? { ...skill, shadowedByMarket: marketName } : skill
    }),
    ...pluginSkillRows(market.catalog, market.selection, deploymentOf),
  ].map((skill) =>
    skill.entry
      ? { ...skill, states: statesOf(skill.entry) }
      : skill,
  )
  const selected =
    panel && 'id' in panel
      ? skills.find((skill) => skill.id === panel.id)
      : undefined
  const filtered = skills
    .filter(
      (skill) =>
        `${skill.name} ${skill.description} ${skill.namespace}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
        (source === 'all' || skill.source.kind === source) &&
        (status === 'all' ||
          (status === 'available'
            ? skill.availability === 'available' &&
              skill.deployment?.state !== 'failed'
            : status === 'failed'
              ? skill.deployment?.state === 'failed'
              : skill.availability === 'unavailable')),
    )
    .sort(
      (a, b) =>
        (order === 'asc' ? 1 : -1) * a.name.localeCompare(b.name, 'zh-CN'),
    )
  const localSkills = skills.filter((skill) => skill.source.kind === 'local')
  const clear = () => {
    setSearch('')
    setSource('all')
    setStatus('all')
  }
  const open = (next: Panel) => {
    local.resetErrors()
    market.resetErrors()
    setPanel(next)
  }
  const create = () => open({ kind: 'create' })
  const install = (skill: SkillRow) => {
    if (!skill.entry) return
    market.resetErrors()
    void market
      .install(skill.entry)
      .then(() => toast.success(`已选择技能 ${skill.name}`))
      .catch(() => undefined)
  }
  const requestPluginRemove = (skill: SkillRow) => {
    market.resetErrors()
    if (skill.selection) setRemoving({ kind: 'plugin', skill })
  }
  const confirmPluginRemove = () => {
    if (removing?.kind !== 'plugin' || !removing.skill.selection) return
    void market
      .remove(removing.skill.selection)
      .then(() => {
        toast.success(`已提交移除技能 ${removing.skill.name}`)
        setRemoving(undefined)
      })
      .catch(() => undefined)
  }
  const save = async (
    input: SkillInput,
    id: string | undefined,
    done: () => void,
  ) => {
    if (!local.tenantId) return
    local.resetErrors()
    try {
      if (id)
        await local.update({ tid: local.tenantId, sid: id, data: input })
      else await local.create({ tid: local.tenantId, data: input })
      toast.success(id ? `已更新技能 ${input.name}` : `已创建技能 ${input.name}`)
      done()
    } catch {
      // The hook exposes the localized mutation error beside the form.
    }
  }
  const confirmLocalRemove = async () => {
    if (removing?.kind !== 'local' || !removing.skill.local) return
    try {
      await local.remove({
        tid: local.tenantId,
        sid: removing.skill.local.id,
      })
      toast.success(`已删除技能 ${removing.skill.name}`)
      setRemoving(undefined)
      setPanel(null)
    } catch {
      // ConfirmDialog renders the localized mutation error.
    }
  }
  function pluginActions(skill: SkillRow) {
    if (!skill.entry || !market.canManage) return null
    return skill.selection?.desiredState === 'installed' ? (
      <Button
        variant="outline"
        size="sm"
        disabled={market.mutating}
        onClick={() => requestPluginRemove(skill)}
      >
        移除技能
      </Button>
    ) : (
      <Button
        variant="secondary"
        size="sm"
        disabled={market.mutating}
        onClick={() => install(skill)}
      >
        <Download data-icon="inline-start" />
        安装技能
      </Button>
    )
  }
  return (
    <section>
      <PageHeader
        title="Skills"
        description="管理当前工作区的可复用技能。导入或新建后，新开启的 Agent 会话会在项目中自动发现它们。"
        count={skills.length}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!local.tenantId || local.loading}
              onClick={() => {
                local.resetErrors()
                setImporting(true)
              }}
            >
              <Upload data-icon="inline-start" />
              导入技能
            </Button>
            <Button
              disabled={!local.tenantId || local.loading}
              onClick={create}
            >
              <Plus data-icon="inline-start" />
              新建技能
            </Button>
          </>
        }
      />
      <DataState
        pending={local.loading || market.pending}
        error={local.error ?? market.error}
        retry={() => {
          local.refetch()
          void market.refetch()
        }}
      >
        <div className="settings-toolbar">
          {market.spaces.length > 1 && (
            <Filter
              label="空间"
              value={market.spaceId}
              onChange={(id) => {
                market.chooseSpace(id)
                setPanel(null)
                setRemoving(undefined)
              }}
              options={market.spaces.map((s) => [s.id, s.name] as const)}
            />
          )}
          <SearchInput label="搜索技能" value={search} onChange={setSearch} />
          <Filter
            label="技能来源"
            value={source}
            onChange={setSource}
            options={[
              ['all', '全部来源'],
              ['local', '用户技能'],
              ['plugin', '市场技能'],
            ]}
          />
          <Filter
            label="技能状态"
            value={status}
            onChange={setStatus}
            options={[
              ['all', '全部状态'],
              ['available', '可用 / 已下发'],
              ['failed', '安装失败'],
              ['unavailable', '不可用'],
            ]}
          />
          <Filter
            label="技能排序"
            value={order}
            onChange={setOrder}
            options={[
              ['asc', '名称 A–Z'],
              ['desc', '名称 Z–A'],
            ]}
          />
        </div>
        <ActionError error={local.mutationError ?? market.mutationError} />
        <div className="settings-resource-list">
          {filtered.map((skill) => (
            <article
              key={skill.id}
              aria-label={skill.name}
              className="settings-resource-row"
            >
              <button
                type="button"
                className="settings-resource-main"
                aria-label={`查看技能 ${skill.name}`}
                onClick={() => open({ kind: 'detail', id: skill.id })}
              >
                <span className="settings-resource-icon">
                  {skill.source.kind === 'local' ? (
                    <FileText className="size-5" />
                  ) : (
                    <Sparkles className="size-5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="settings-resource-title">{skill.name}</span>
                  <span className="settings-resource-description block">
                    {skill.description || '暂无简介'}
                  </span>
                  {skill.shadowedByMarket && (
                    <span className="settings-resource-description block text-amber-600">
                      与本空间已安装的市场 Skill「{skill.shadowedByMarket}
                      」同名，在这里不生效，使用的是市场版本，可以改名
                    </span>
                  )}
                  <span className="settings-resource-meta">
                    <span>
                      {skill.source.kind === 'local'
                        ? '用户技能 · 服务端'
                        : '市场技能 · 只读'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{skill.namespace}</span>
                  </span>
                </span>
              </button>
              <div className="settings-resource-actions">
                <Badge
                  variant={
                    skill.deployment?.state === 'failed'
                      ? 'destructive'
                      : skill.availability === 'available'
                        ? 'secondary'
                        : 'outline'
                  }
                >
                  {skillStatus(skill)}
                </Badge>
                {pluginActions(skill)}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => open({ kind: 'detail', id: skill.id })}
                >
                  查看详情
                  <ArrowUpRight data-icon="inline-end" />
                </Button>
              </div>
            </article>
          ))}
        </div>
        {!filtered.length && (
          <NoResults filtered={skills.length > 0} onClear={clear}>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  local.resetErrors()
                  setImporting(true)
                }}
              >
                导入 SKILL.md
              </Button>
              <Button onClick={create}>新建技能</Button>
            </div>
          </NoResults>
        )}
        <div className="settings-list-footer">
          <span>
            显示 {filtered.length} / {skills.length} 个技能 · 共{' '}
            {localSkills.length} 个用户技能
          </span>
          <span>用户技能保存在服务端；市场技能跟随插件安装</span>
        </div>
      </DataState>
      {panel?.kind === 'create' && (
        <DetailPanel
          title="新建技能"
          description="写一份可复用的 Agent 技能说明。"
          onClose={() => setPanel(null)}
        >
          <SkillForm
            pending={local.savePending}
            error={local.mutationError}
            onCancel={() => setPanel(null)}
            onSave={(draft) =>
              void save(draft, undefined, () => setPanel(null))
            }
          />
        </DetailPanel>
      )}
      {selected?.local && panel?.kind === 'edit' && (
        <DetailPanel
          title={`编辑 ${selected.name}`}
          description="保存后会更新服务端目录；已有会话保留启动时的技能副本。"
          onClose={() => setPanel(null)}
        >
          <SkillForm
            key={selected.id}
            skill={selected.local}
            pending={local.savePending}
            error={local.mutationError}
            onCancel={() => open({ kind: 'detail', id: selected.id })}
            onSave={(draft) =>
              void save(draft, selected.local?.id, () =>
                setPanel({ kind: 'detail', id: selected.id }),
              )
            }
          />
        </DetailPanel>
      )}
      {selected && panel?.kind === 'detail' && (
        <DetailPanel
          title={selected.name}
          description={selected.description || '技能说明文档'}
          onClose={() => setPanel(null)}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary">
              {selected.source.kind === 'local'
                ? '用户技能 · 服务端'
                : '市场技能 · 只读'}
            </Badge>
            {selected.shadowedByMarket && (
              <p className="text-sm text-amber-600">
                与本空间已安装的市场 Skill「{selected.shadowedByMarket}
                」同名，在这里不生效，使用的是市场版本，可以改名。
              </p>
            )}
            {selected.local ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => open({ kind: 'edit', id: selected.id })}
                >
                  编辑技能
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    local.resetErrors()
                    setRemoving({ kind: 'local', skill: selected })
                  }}
                >
                  删除技能
                </Button>
              </div>
            ) : (
              pluginActions(selected)
            )}
          </div>
          <dl className="settings-facts">
            <dt>命名空间</dt>
            <dd>{selected.namespace}</dd>
            <dt>可用状态</dt>
            <dd>{skillStatus(selected, true)}</dd>
            <dt>来源</dt>
            <dd>
              {selected.source.kind === 'local' ? (
                '当前登录用户的技能库'
              ) : (
                <Link
                  className="underline underline-offset-4"
                  to={`/settings/plugins?plugin=${encodeURIComponent(selected.source.pluginId)}`}
                >
                  {selected.source.pluginId} ↗
                </Link>
              )}
            </dd>
            {selected.local && (
              <>
                <dt>最近更新</dt>
                <dd>{updatedLabel(selected.updatedAt)}</dd>
                <dt>目录版本</dt>
                <dd>v{selected.local.version}</dd>
              </>
            )}
          </dl>
          {selected.entry && selected.selection && (
            <SkillDeploymentStates states={selected.states} />
          )}
          {selected.availability === 'unavailable' && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              说明仍可预览。安装来源插件后，此技能会恢复可用。
            </p>
          )}
          <p className="rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
            新建的 Agent 会话会读取 SKILL.md；编辑或删除不会回写已经开始运行的会话。
          </p>
          <Separator />
          <MarkdownPreview content={selected.content} />
        </DetailPanel>
      )}
      {importing && (
        <ImportSkillDialog
          onClose={() => setImporting(false)}
          onImport={async (input) => {
            local.resetErrors()
            return local.importFile({ tid: local.tenantId, data: input })
          }}
          onImported={(name, overwritten) => {
            toast.success(
              overwritten ? `已覆盖技能 ${name}` : `已导入技能 ${name}`,
            )
            setImporting(false)
          }}
        />
      )}
      {removing?.kind === 'local' && (
        <ConfirmDialog
          title={`删除 ${removing.skill.name}？`}
          description="将从服务端技能库删除这条技能。已经开始的 Agent 会话仍保留启动时的副本。"
          confirmLabel="删除技能"
          pending={local.deletePending}
          error={local.mutationError}
          onClose={() => setRemoving(undefined)}
          onConfirm={() => void confirmLocalRemove()}
        />
      )}
      {removing?.kind === 'plugin' && (
        <ConfirmDialog
          title={`移除技能 ${removing.skill.name}？`}
          description="将移除这条空间技能选择；工作流节点的技能候选会同时更新。技能说明仍可预览，重新安装可恢复。"
          confirmLabel="移除技能"
          pending={market.mutating}
          error={market.mutationError}
          onClose={() => setRemoving(undefined)}
          onConfirm={confirmPluginRemove}
        />
      )}
    </section>
  )
}

const projectStateLabel: Record<string, string> = {
  waiting: '等待下发',
  applying: '下发中',
  installed: '已下发',
  removed: '已移除',
  failed: '下发失败',
}

/** Shows each bound project's delivery receipt for a selected market Skill. */
function SkillDeploymentStates({ states }: { states?: SkillProgress[] }) {
  if (!states || states.length === 0) {
    return (
      <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        当前空间还没有关联项目；运行工作流前请先添加项目并等待技能下发。
      </p>
    )
  }
  return (
    <section className="space-y-2" aria-label="项目下发状态">
      <h3 className="text-sm font-medium">项目下发状态</h3>
      <div className="space-y-2">
        {states.map((item) => (
          <div key={item.projectId} className="rounded border p-2 text-xs">
            <span className="font-medium">{item.name}</span>
            <span> · {projectStateLabel[item.state] ?? item.state}</span>
            {item.installedVersion && <span> · v{item.installedVersion}</span>}
            {item.failure && (
              <p role="alert" className="mt-1 text-destructive">
                {item.failure}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
