import { ProjectResults } from './project-results'
import { listMarketSources, syncMarketSource } from '../market-api/generated'
import { MarketSources } from './market-sources'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Download, ExternalLink } from 'lucide-react'
import type { PluginCatalogEntry, SpacePlugin } from '@/api/generated.schemas'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  pluginInstalled,
  pluginKey,
  usePluginMarketplace,
} from '../data/marketplace'
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
import {
  demoInstallDelayMs,
  demoInstallable,
  demoSelectionFor,
  useDemoPluginSelections,
  waitForDemoInstallDelay,
  withDemoCatalog,
} from '@/lib/demo/plugin-installs'
import { pluginKind, pluginKindOrder } from './plugin-kind'
import { PluginMark } from './plugin-mark'
import { isPreinstalledAgent } from '@/lib/plugin-runtime'
import { useUser } from '@/app/auth/user'

const stateLabels: Record<string, string> = {
  installed: '已安装',
  failed: '安装失败',
  pending: '等待节点',
  installing: '安装中',
  removing: '移除中',
  removed: '未安装',
}

function StateBadge({
  selection,
  kind,
  demoSelected,
}: {
  selection?: SpacePlugin
  kind: string
  demoSelected?: boolean
}) {
  if (selection && isPreinstalledAgent(selection))
    return <Badge variant="outline">运行时预装</Badge>
  if (demoSelected) return <Badge variant="secondary">已安装（演示）</Badge>
  // A removed Skill deletes its selection row, so "未安装" must come from the catalog kind, not
  // the (missing) selection. Other kinds have no server state to report and show no badge.
  const state = selection?.observedState ?? 'removed'
  const label =
    kind === 'skill' || kind === 'workflow'
      ? (stateLabels[state] ?? state)
      : null
  if (label == null) return null
  return (
    <Badge
      variant={
        state === 'failed'
          ? 'destructive'
          : state === 'installed'
            ? 'secondary'
            : 'outline'
      }
    >
      {label}
    </Badge>
  )
}

function missingEntry(selection: SpacePlugin): PluginCatalogEntry {
  return {
    id: pluginKey(selection),
    identifier: selection.identifier,
    title: selection.identifier,
    kind: selection.kind ?? 'skill',
    sourceNamespace: selection.sourceNamespace,
    description: '来源不可用。可以移除已有选择。',
    version: selection.desiredVersion,
    indexedAt: selection.updatedAt,
    sourceUrl: '',
    marketplaceVisible: false,
    homepage: null,
    license: null,
    logo: null,
    packMembers: null,
    readme: null,
    sha256: null,
    targets: null,
    url: null,
  }
}

export default function PluginsPage() {
  const user = useUser()
  const market = usePluginMarketplace()
  const demoScope = `${user.id}:${market.tenantId}:${market.spaceId}`
  const demoSelection = useDemoPluginSelections(demoSelectionFor(demoScope))
  const setDemoSelected = useDemoPluginSelections((state) => state.setSelected)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const synchronize = async () => {
    setSyncing(true)
    try {
      const { items } = await listMarketSources(market.tenantId, market.spaceId)
      const failures: string[] = []
      for (const source of [
        'official',
        ...items.filter((s) => s.enabled).map((s) => s.namespace),
      ]) {
        try {
          await syncMarketSource(market.tenantId, market.spaceId, source)
        } catch {
          failures.push(source)
        }
      }
      await market.refetch()
      if (failures.length) toast.error('部分来源同步失败，已保留上次目录。')
      else toast.success('市场目录已同步')
    } catch {
      toast.error('未能同步市场，请重试。')
    } finally {
      setSyncing(false)
    }
  }
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [order, setOrder] = useState('asc')
  const [pendingInstalls, setPendingInstalls] = useState<Set<string>>(
    () => new Set(),
  )
  const pendingInstallsRef = useRef(new Set<string>())
  const [removing, setRemoving] = useState<{
    entry: PluginCatalogEntry
    selection?: SpacePlugin
    demo: boolean
  }>()
  const [params, setParams] = useSearchParams()
  const availableCatalog = withDemoCatalog(market.catalog)
  const available = new Set(availableCatalog.map(pluginKey))
  const catalog = [
    ...availableCatalog,
    ...market.installations
      .filter(
        (s) =>
          (s.desiredState === 'installed' ||
            s.observedState === 'removing' ||
            s.observedState === 'failed') &&
          !available.has(pluginKey(s)),
      )
      .map(missingEntry),
  ]
  const selected = catalog.find(
    (entry) => pluginKey(entry) === params.get('plugin'),
  )
  const serverSelection = (entry: PluginCatalogEntry) =>
    market.selection(entry)
  const selectedSelection = selected ? serverSelection(selected) : undefined
  // Only Skill and workflow plugins have a server-backed install in v2; everything else is
  // read-only (runtime-preinstalled Agents, market Agents, Hooks, MCP, packs). Demo mode records
  // the agent/hook/mcp lifecycle in the browser instead of pretending to install it.
  const installable = (entry: PluginCatalogEntry) =>
    entry.kind === 'skill' || entry.kind === 'workflow'
  const demoSelected = (entry: PluginCatalogEntry) =>
    demoInstallable(entry) && demoSelection.includes(pluginKey(entry))
  const filtered = catalog
    .filter((entry) => {
      const selection = serverSelection(entry)
      return (
        `${entry.title} ${entry.description} ${pluginKey(entry)}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
        (kind === 'all' || entry.kind === kind) &&
        (status === 'all' ||
          (status === 'installed'
            ? demoInstallable(entry)
              ? demoSelected(entry)
              : pluginInstalled(selection)
            : status === 'failed'
              ? selection?.observedState === 'failed'
              : demoInstallable(entry)
                ? !demoSelected(entry)
                : !selection || selection.observedState === 'removed'))
      )
    })
    .sort(
      (a, b) =>
        (order === 'asc' ? 1 : -1) * a.title.localeCompare(b.title, 'zh-CN'),
    )
  const knownKinds = new Set(pluginKindOrder)
  const orderedKinds = [
    ...pluginKindOrder,
    ...new Set(
      filtered
        .map((entry) => entry.kind)
        .filter((kindValue) => !knownKinds.has(kindValue)),
    ),
  ]
  const groups = orderedKinds
    .map((kindValue) => ({
      kind: kindValue,
      meta: pluginKind({ kind: kindValue as PluginCatalogEntry['kind'] }),
      items: filtered.filter((entry) => entry.kind === kindValue),
    }))
    .filter((group) => group.items.length > 0)
  const installedSelections = market.installations.filter((selection) =>
    pluginInstalled(selection),
  )
  const installedKeys = new Set([
    ...installedSelections.map(pluginKey),
    ...catalog.filter(demoSelected).map(pluginKey),
  ])
  const clear = () => {
    setSearch('')
    setKind('all')
    setStatus('all')
  }
  const open = (entry: PluginCatalogEntry) => {
    setParams({ plugin: pluginKey(entry) })
  }
  const installing = (entry: PluginCatalogEntry) =>
    pendingInstalls.has(pluginKey(entry))
  const install = async (entry: PluginCatalogEntry) => {
    const key = pluginKey(entry)
    if (pendingInstallsRef.current.has(key)) return
    pendingInstallsRef.current.add(key)
    setPendingInstalls((current) => new Set(current).add(key))
    market.resetErrors()
    const delay = waitForDemoInstallDelay(demoInstallDelayMs())
    try {
      if (demoInstallable(entry)) {
        await delay
        setDemoSelected(demoScope, key, true)
        toast.success(`已安装 ${entry.title}`)
      } else {
        await Promise.all([market.install(entry), delay])
        toast.success(
          entry.kind === 'workflow' ? `已安装 ${entry.title}` : `已选择 ${entry.title}`,
        )
      }
    } catch {
      // The mutation error is shown beside the list.
    } finally {
      pendingInstallsRef.current.delete(key)
      setPendingInstalls((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }
  const requestRemove = (entry: PluginCatalogEntry) => {
    market.resetErrors()
    if (demoInstallable(entry)) {
      if (demoSelected(entry)) setRemoving({ entry, demo: true })
      return
    }
    const selection = serverSelection(entry)
    if (selection) setRemoving({ entry, selection, demo: false })
  }
  const confirmRemove = () => {
    if (!removing) return
    if (removing.demo) {
      setDemoSelected(demoScope, pluginKey(removing.entry), false)
      toast.success(`已移除 ${removing.entry.title}`)
      setRemoving(undefined)
      return
    }
    if (!removing.selection) return
    void market
      .remove(removing.selection)
      .then(() => {
        toast.success(`已提交移除 ${removing.entry.title}`)
        setRemoving(undefined)
      })
      .catch(() => undefined)
  }
  function actions(entry: PluginCatalogEntry) {
    const selection = serverSelection(entry)
    const pending = installing(entry)
    const busy =
      market.mutating ||
      pending ||
      selection?.observedState === 'installing' ||
      selection?.observedState === 'removing'
    if (pending)
      return (
        <Button size="sm" variant="secondary" disabled>
          <Download data-icon="inline-start" />
          安装中…
        </Button>
      )
    // Agents, Hooks and MCP have no server-backed install; only the demo mock records their
    // lifecycle (in the browser) so the recording can show it.
    if (demoInstallable(entry))
      return demoSelected(entry) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!market.canManage || market.mutating}
          onClick={() => requestRemove(entry)}
        >
          {entry.kind === 'workflow' ? '卸载' : '移除'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          disabled={!market.canManage || busy}
          onClick={() => void install(entry)}
        >
          <Download data-icon="inline-start" />
          安装
        </Button>
      )
    // Runtime-preinstalled Agents are managed by the runtime; the page only reports them.
    if (selection && isPreinstalledAgent(selection))
      return null
    // Every remaining kind is read-only, so it never gets an install or removal entry.
    if (!installable(entry))
      return (
        <span className="text-xs text-muted-foreground">暂不支持安装</span>
      )
    if (pending)
      return (
        <Button size="sm" variant="secondary" disabled>
          <Download data-icon="inline-start" />
          安装中…
        </Button>
      )
    if (
      selection?.desiredState === 'removed' &&
      selection.observedState === 'failed'
    )
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={!market.canManage || market.mutating}
          onClick={() => requestRemove(entry)}
        >
          重试移除
        </Button>
      )
    if (selection?.desiredState === 'installed') {
      return (
        <>
          {(entry.kind === 'skill' || entry.kind === 'workflow') &&
            (entry.version !== selection.desiredVersion ||
              selection.observedState === 'failed' ||
              selection.observedState === 'pending') && (
              <Button
                disabled={!market.canManage || busy}
                onClick={() => void install(entry)}
                size="sm"
                variant="secondary"
              >
                {pending
                  ? '安装中…'
                  : entry.version !== selection.desiredVersion
                    ? '更新'
                    : '重新应用'}
              </Button>
            )}
          <Button
            size="sm"
            variant="outline"
            disabled={!market.canManage || busy}
            onClick={() => requestRemove(entry)}
          >
            {entry.kind === 'workflow' ? '卸载' : '移除'}
          </Button>
        </>
      )
    }
    return (
      <Button
        size="sm"
        variant={
          selection?.observedState === 'failed' ? 'outline' : 'secondary'
        }
        disabled={!market.canManage || busy}
        onClick={() => void install(entry)}
      >
        <Download data-icon="inline-start" />
        {pending
          ? '安装中…'
          : selection?.observedState === 'failed'
            ? '重试安装'
            : '安装'}
      </Button>
    )
  }
  return (
    <section>
      <PageHeader
        title="Plugins"
        description="浏览空间插件，查看详情并管理安装状态。"
        count={catalog.length}
        actions={
          <>
            <Button variant="outline" onClick={() => setSourcesOpen(true)}>
              管理市场
            </Button>
            {market.canManage && (
              <Button
                variant="secondary"
                disabled={syncing || !market.spaceId}
                onClick={() => void synchronize()}
              >
                {syncing ? '同步中…' : '同步'}
              </Button>
            )}
          </>
        }
      />
      <DataState
        pending={market.pending}
        error={market.error}
        retry={() => void market.refetch()}
      >
        {!market.canManage && (
          <p className="text-sm text-muted-foreground">
            当前账号为只读成员；安装与移除需要工作区管理员权限。
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          技能和工作流插件通过服务端安装；运行时预装 Agent、市场
          Agent、Hook、MCP 与合集当前仅浏览，不提供安装。
        </p>
        <div className="settings-toolbar">
          {market.spaces.length > 1 && (
            <Filter
              label="空间"
              value={market.spaceId}
              onChange={(id) => {
                market.chooseSpace(id)
                setSourcesOpen(false)
                setRemoving(undefined)
                setParams({})
              }}
              options={market.spaces.map((s) => [s.id, s.name] as const)}
            />
          )}
          <SearchInput label="搜索插件" value={search} onChange={setSearch} />
          <Filter
            label="插件类型"
            value={kind}
            onChange={setKind}
            options={[
              ['all', '全部类型'],
              ...[...new Set(catalog.map((entry) => entry.kind))].map(
                (value) => [value, pluginKind({ kind: value }).label] as const,
              ),
            ]}
          />
          <Filter
            label="安装状态"
            value={status}
            onChange={setStatus}
            options={[
              ['all', '全部状态'],
              ['installed', '已安装 / 已选择'],
              ['available', '未安装'],
              ['failed', '安装失败'],
            ]}
          />
          <Filter
            label="插件排序"
            value={order}
            onChange={setOrder}
            options={[
              ['asc', '名称 A–Z'],
              ['desc', '名称 Z–A'],
            ]}
          />
        </div>
        <ActionError error={market.mutationError} />
        <div className="settings-plugin-groups">
          {groups.map((group) => {
            const GroupIcon = group.meta.icon
            return (
              <section
                key={group.kind}
                className="settings-plugin-group"
                aria-labelledby={`plugin-group-${group.kind}`}
              >
                <header className="settings-plugin-group-header">
                  <span className="settings-plugin-group-icon">
                    <GroupIcon aria-hidden="true" />
                  </span>
                  <span>
                    <span className="flex items-center gap-2">
                      <h2 id={`plugin-group-${group.kind}`}>
                        {group.meta.label}
                      </h2>
                      <Badge variant="secondary">{group.items.length}</Badge>
                    </span>
                    <span>{group.meta.groupDescription}</span>
                  </span>
                </header>
                <div className="settings-plugin-grid">
                  {group.items.map((entry) => {
                    const meta = pluginKind(entry)
                    const KindIcon = meta.icon
                    return (
                      <article
                        key={pluginKey(entry)}
                        aria-label={entry.title}
                        className="settings-plugin-card"
                      >
                        <div className="settings-plugin-card-header">
                          <button
                            type="button"
                            className="settings-plugin-identity"
                            onClick={() => open(entry)}
                            aria-label={`查看插件 ${entry.title}`}
                          >
                            <PluginMark entry={entry} />
                            <span className="min-w-0">
                              <span className="settings-plugin-title">
                                {entry.title}
                              </span>
                              <span className="settings-plugin-id">
                                {pluginKey(entry)}
                              </span>
                            </span>
                          </button>
                          <Badge
                            variant="secondary"
                            className="settings-plugin-kind"
                          >
                            <KindIcon data-icon="inline-start" />
                            {meta.label}
                          </Badge>
                        </div>
                        <p className="settings-plugin-description">
                          {entry.description}
                        </p>
                        <div className="settings-plugin-card-footer">
                          <span className="settings-plugin-version">
                            {entry.sourceNamespace} · v{entry.version}
                          </span>
                          <div className="settings-resource-actions">
                            <StateBadge
                              selection={serverSelection(entry)}
                              kind={entry.kind}
                              demoSelected={demoSelected(entry)}
                            />
                            {actions(entry)}
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
        {!filtered.length && (
          <NoResults filtered={catalog.length > 0} onClear={clear} />
        )}
        <div className="settings-list-footer">
          <span>
            显示 {filtered.length} / {catalog.length} 个插件 · 共{' '}
            {installedKeys.size} 个已安装或已选择
          </span>
        </div>
      </DataState>
      {params.has('plugin') && !market.pending && !selected && (
        <p role="alert" className="mt-4 text-sm text-muted-foreground">
          找不到该插件。
          <Button variant="link" onClick={() => setParams({})}>
            返回全部插件
          </Button>
        </p>
      )}
      {sourcesOpen && (
        <MarketSources
          tenant={market.tenantId}
          space={market.spaceId}
          owner={market.canManage}
          officialUrl={
            market.catalog.find(
              (entry) => entry.sourceNamespace === 'official',
            )?.sourceUrl
          }
          officialSyncedAt={market.syncedAt}
          onClose={() => setSourcesOpen(false)}
          refresh={market.refetch}
        />
      )}
      {selected && (
        <DetailPanel
          title={selected.title}
          description={selected.description}
          onClose={() => setParams({}, { replace: true })}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="settings-plugin-detail-identity">
              <PluginMark entry={selected} large />
              <span className="settings-plugin-detail-meta">
                <Badge variant="outline">{pluginKind(selected).label}</Badge>
                <span>{pluginKey(selected)}</span>
              </span>
              <StateBadge
                selection={selectedSelection}
                kind={selected.kind}
                demoSelected={demoSelected(selected)}
              />
            </div>
            {actions(selected)}
          </div>
          <ActionError error={market.mutationError} />
          {selected.kind === 'skill' && market.selection(selected) && (
            <ProjectResults
              tenant={market.tenantId}
              space={market.spaceId}
              namespace={selected.sourceNamespace}
              identifier={selected.identifier}
            />
          )}
          <dl className="settings-facts">
            <dt>插件标识</dt>
            <dd>{pluginKey(selected)}</dd>
            <dt>类型</dt>
            <dd>{pluginKind(selected).label}</dd>
            <dt>目录版本</dt>
            <dd>
              {available.has(pluginKey(selected))
                ? selected.version
                : '来源不可用'}
            </dd>
            {installable(selected) || demoInstallable(selected) ? (
              <>
                <dt>安装选择</dt>
                <dd>
                  {selectedSelection && isPreinstalledAgent(selectedSelection)
                    ? '运行时预装，未开始本地安装'
                    : demoSelected(selected)
                      ? '已选择（演示）'
                      : selectedSelection?.desiredState === 'installed'
                        ? `安装 ${selectedSelection?.desiredVersion}`
                        : '未选择'}
                </dd>
                <dt>安装结果</dt>
                <dd>
                  {selectedSelection && isPreinstalledAgent(selectedSelection)
                    ? '运行时预装（服务端未变更）'
                    : demoSelected(selected)
                      ? '演示安装（浏览器本地状态）'
                      : (selectedSelection?.observedVersion ?? '尚未安装')}
                </dd>
              </>
            ) : (
              <>
                <dt>安装状态</dt>
                <dd>
                  {selectedSelection && isPreinstalledAgent(selectedSelection)
                    ? '运行时预装'
                    : '暂不支持安装'}
                </dd>
              </>
            )}
            <dt>来源</dt>
            <dd>
              {selected.sourceNamespace} · {selected.sourceUrl}
            </dd>
            <dt>许可证</dt>
            <dd>{selected.license ?? '未提供'}</dd>
          </dl>
          {selectedSelection?.installError && (
            <p role="alert" className="text-sm text-destructive">
              {selectedSelection?.installError}
            </p>
          )}
          <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            {installable(selected)
              ? selected.kind === 'workflow'
                ? '安装会导入工作流并发布初始版本，可在工作流库中运行。'
                : '空间选择适用于该空间的项目。 只有项目节点确认后才显示已安装。'
              : demoInstallable(selected)
                ? '演示安装只记录浏览器本地状态，不会请求服务端。'
                : selectedSelection && isPreinstalledAgent(selectedSelection)
                  ? '该 Agent 由运行时预装，不提供安装操作。'
                  : '该类型当前仅浏览，没有服务端安装支持。'}
          </p>
          <Separator />
          {selected.readme ? (
            <MarkdownPreview content={selected.readme} />
          ) : (
            <p className="text-sm text-muted-foreground">
              该插件未提供 README。
            </p>
          )}
          {selected.homepage?.startsWith('https://') && (
            <a
              href={selected.homepage}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm underline"
            >
              插件主页
              <ExternalLink className="size-3" />
            </a>
          )}
        </DetailPanel>
      )}
      {removing && (
        <ConfirmDialog
          title={`${removing.entry.kind === 'workflow' ? '卸载' : '移除'} ${removing.entry.title}？`}
          description={
            removing.entry.kind === 'workflow'
              ? '已导入的工作流和运行历史会保留。'
              : removing.entry.kind === 'skill'
                ? '将请求项目节点卸载该技能包，完成后不再提供其中的技能。'
                : removing.demo
                  ? '只移除浏览器本地记录的演示安装，不会请求服务端。'
                  : '将从空间移除该插件选择。此操作不会卸载其他工作空间或 Agent 运行时中的包。'
          }
          confirmLabel={removing.entry.kind === 'workflow' ? '卸载' : '移除'}
          pending={market.mutating}
          error={market.mutationError}
          onClose={() => setRemoving(undefined)}
          onConfirm={confirmRemove}
        />
      )}
    </section>
  )
}
