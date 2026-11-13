# Settings

设置模块包含小队、角色、模型连接、主题、Plugins 和 Skills 六个独立子路由，默认进入小队页。成员属于小队，没有单独的成员页：在小队详情里看成员，在「添加成员」里邀请或加入，`/settings/members` 重定向到小队页。页面沿用 V2 的组件和语义颜色，不引入其他 UI 库。

## 数据边界

「添加成员」的候选人来自 `GET /api/v1/tenants/{tid}/members`，owner 还能填邮箱邀请（`POST /api/v2/tenants/{tid}/members`，契约之外的 v2-server 路由），被邀请人同时加入这个小队。名册里只有启动配置里的 bootstrap owner（显示名取自 `users.json` 的 `displayName`，「协作空间 Owner」）和真实受邀成员；旧 `dev/demo` 账号和启动配置 `retired` 里的旧预置成员会被软删除，不出现在名册中，它们的历史引用保留。v2 没有改角色、停用或移除成员的接口，页面因此不提供这些操作；邀请入口按 `GET /api/v1/me/tenants` 里的真实角色只对 owner 显示，服务端同样会拒绝 member。

小队页（`squads/`，`/settings/squads`）管理工作区内人和 Agent 的协作编组，数据来自候选契约 `v2-server/squads.openapi.json`，客户端在 `src/lib/squads-api`（协作页指派任务和按小队切换也用它），`npm run api:generate:squads` 生成。列表显示有效的人类成员、Agent 成员与维护者计数，详情按类型列成员、职责、维护者与 leader，并保留已退出历史；工作区 owner 和本队维护者可编辑、归档、加入成员与可执行的 Space Agent、移除成员，任何成员可以自己退出，维护者可以交接维护者标记、设置 Agent leader。已删除的账号由 v2-server 结束其成员关系，并且不再出现在小队里，「已退出」历史也不列出。小队关系不授予私人模型、Git 凭据或运行时权限。`?squad=<id>` 直接打开那个小队；协作页的旧地址 `/collaboration/squads` 会重定向过来。弹窗和基础样式来自 `src/components/panel/`，与协作页共用。

成员、Plugins、技能、登录状态与浏览器主题偏好来自真实接口。Plugins 使用 Cloud
契约的目录、空间选择和卸载路由；市场技能与来源插件共享同一份空间选择。Skill 的下载、校验和安装由节点回执确认，尚未确认时显示等待状态。技能与工作流插件通过服务端安装；运行时预装 Agent、市场 Agent、Hook、MCP 与合集当前仅浏览，不提供安装（服务端拒绝新建这些选择，返回 `plugin_kind_not_installable`）。模型连接和角色只保存在当前浏览器。不存在请求失败后自动切换假数据的逻辑。

`lib/settings-demo/` 是本机模型连接和角色的共享存储边界，键包含版本、当前用户 ID 和空间
ID；Settings 与工作流的角色选择读同一份快照。`members/`、`skills/` 与
`data/marketplace.ts` 不使用它。初次读取创建示例；修改先校验 revision 并成功写入
localStorage，再更新 TanStack Query 缓存。schema 2、3、4 的旧快照会升级为 schema 5，
丢弃已经由服务端目录取代的技能和本地插件镜像，同时保留已有角色或为旧快照补上角色。保存
失败和损坏数据会报错，不会自动清空。

- 插件复用生成的 `PluginCatalogEntry` 与 `SpacePlugin`；目录读取与服务端安装、卸载走
  `frontend-v2/src/api` 的生成客户端。以 `sourceNamespace/identifier` 对应，写入带
  `Idempotency-Key` 和当前选择 version。技能与工作流插件可安装/移除（服务端按来源自己的
  `Retrieval`/`Credentials` 下载、校验并导入，来源来源和官方与否不加区别）；运行时预装的
  OpenCode、Claude Code 只读显示「运行时预装」，没有安装入口；市场 Agent、Hook、MCP 与合集
  只浏览并显示「暂不支持安装」（服务端拒绝新建这些选择，返回 `plugin_kind_not_installable`，
  已有用户选择也不允许更新）。安装工作流会把工作流导入库并发布 v1，卸载保留工作流和历史。
  目录来自 v2-server 对 `ora-space/marketplace` 的真实 Git 同步，而不是前端内置数据。目录把来源发布的明暗主题
  图标嵌入快照；页面按插件类型分组，未发布图标的条目使用对应的类型图标。owner 可写，
  member 只读。`lib/demo/plugin-installs.ts` 只在 `VITE_DEMO_MOCK=1` 时给市场 Agent、Hook、
  MCP 提供浏览器本地演示安装（含 3–5 秒等待），状态只存在 localStorage，不会请求服务端。
- 用户技能通过候选契约 `v2-server/skills.openapi.json` 持久化在 PostgreSQL，按登录用户和
  工作区隔离；`npm run api:generate:skills` 生成共享客户端到 `src/lib/skills-api`。页面可新建、
  编辑、删除，或导入单个带 YAML front matter 的 `SKILL.md`；新账号首次登录获得
  `ora-code-review`、`test-plan`、`release-notes` 三个真实 starter skill，删除后不会重新创建。
  同名导入先返回冲突，用户确认后覆盖并保留技能 ID。市场技能仍从 `kind=skill` 的目录 README
  生成，只读，安装或移除来源插件会改变可用性，移除后仍能预览文档。预览不执行 HTML 或加载远程图片。
- 用户技能在新 Agent 会话克隆工作副本后物化到 `.opencode/skills/<name>/SKILL.md` 与
  `.claude/skills/<name>/SKILL.md`。项目已有同名目录时保留项目内容；市场 Skill 与用户技能
  同名时市场优先：用户技能不写入、会话照常启动，列表和详情会标记这只技能并提示改名；
  编辑或删除只影响之后
  启动的会话。
- 角色复用 desktop 的 Agent definition 形状：名称、描述和 Markdown 内容，使用 `local`
  命名空间。可在页面新建、编辑、删除，也可以导入带 YAML front matter（`name` 和
  `description`）的单个 `.md` 文件；同名时选择跳过或覆盖。工作流 Agent 节点按角色名称读取
  这份目录，v2 执行仍不注入角色内容。
- 成员列表复用契约生成的 `MemberListItem`，invite 客户端由 `orval.members.config.ts` 从 `v2-server/members.openapi.json` 生成。邀请填邮箱（必填）和显示名（选填），小队就是当前小队；小队候选来自「协作」的 `GET /api/v2/tenants/{tid}/squads`，只列未归档小队，没有可加入的小队时不显示这一项。本地数据里不再保存成员、申请或邀请链接。
- 模型连接复用生成类型，维护元数据、多模型和默认选择；只记录 credentialConfigured，不提供真实 API Key 输入。默认连接失效时提示重新选择，不悄悄替换模型。

## 结构

- `page.tsx`、`navigation.ts`、`index.ts`：设置容器、导航、懒加载子路由。
- `squads/`、`roles/`、`model-connections/`、`theme/`、`plugins/`、`skills/`：各页界面、表单与测试。
- `components/`：设置页面共用的状态、确认、详情和 Markdown 展示。
- `api/generated.ts`：邀请接口的生成客户端，`npm run api:generate:members` 生成，`npm run check` 校验漂移。
- `data/`：本机设置的类型、示例、持久化边界与领域操作，以及真实插件市场的查询和 mutation。

主题由应用级 next-themes 管理，默认浅色，浏览器键为 `ora-v2-theme`。只有用户明确选择“跟随系统”后才读取系统外观；已有的浅色、深色或跟随系统偏好继续生效。Vite 的 createRoot 模式不会执行组件里的 SSR 脚本，因此 `main.tsx` 在挂载前应用初始主题，provider 的 SSR 脚本显式保持 inert；之后由 provider 管理主题及系统变化。现有定时页仅补深色变量适配。

## 验证

`npm run check` 检查类型、Oxlint、单元测试、客户端一致性与构建。`e2e/login.ts` 提供邮箱
登录辅助，以及 bootstrap owner 的固定邮箱 `ownerEmail`、显示名 `ownerName` 和「邀请一个真实
成员后再以该成员登录」的 `signInAsInvitedMember`；`e2e/settings.spec.ts` 覆盖七页路由、成员页的 owner/member 两种视角、角色增改删
与 Markdown 导入、插件和技能安装/卸载、技能新建与 `SKILL.md` 导入及覆盖、Agent 选择生命周期、
刷新与新浏览器上下文读取服务端状态、错误恢复、主题、375/768/1440 布局与截图；
`e2e/multiuser.spec.ts` 覆盖 owner 邀请（含邀请入队）、被邀请者登录、未邀请邮箱被拒与
member 被服务端拒绝。模型连接和角色的资源操作仍只保存在当前浏览器。

插件市场区分空间选择与项目实际结果。来源管理使用临时市场契约生成的客户端；空间选择供插件和技能页面共享。当前会进入项目运行时的市场类型是 Skill；可执行 Agent 仍只有系统预装的 OpenCode 和 Claude Code；市场 Agent、Hook、MCP 与合集只浏览，服务端拒绝新建或更新这些选择。默认构建里没有任何预装或演示安装：`VITE_DEMO_MOCK=1` 时 `lib/demo/plugin-installs.ts` 才为市场 Agent、Hook、MCP 和预装 Agent 提供浏览器本地演示安装（3–5 秒等待，只写 localStorage，不发请求）。插件详情列出各项目等待、成功或失败的状态。移除市场仅隐藏可安装目录，不移除空间中已有选择。
