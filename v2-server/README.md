# v2-server

## 会话分析与模型请求观测

`dashboard.openapi.json` 定义临时 v2 分析契约：`/api/v2/tenants/{tid}/dashboard/sessions` 及其详情、history、statistics、model-calls 子接口。这些接口读取真实 PostgreSQL 数据，按来源展示普通 Chat 与手动任务 Agent 会话。任务保留成员共享权限；Chat 只对 conversation 所属用户可见，同时校验当前成员关系、原始 caller、项目与执行器绑定，删除 conversation 后所有分析接口均不可读。读接口返回 private/no-store，不触发执行。列表按创建时间倒序，筛选和游标绑定；请求明细每页 25 条，汇总独立覆盖全部已记录 attempt。

历史返回有界的定型快照，标为 `persisted_snapshot`，不冒充正式 Cloud 的 Revision 归档，不静默回填缺失数据。普通 Chat 与任务 Agent 模型代理通过 `internal/requestmetrics` 在派发前记录可信 session/turn；登记失败返回 503 且不发上游；完成记录只接受同 ID 同结果的有界幂等重试，失败保留 started。已有 Chat 历史可直接读取，过去未观测的模型请求保持未采集，不从回复反推调用次数或用量。记录仅包含允许的数字和状态，不保存请求/响应正文、模型 key 或 provider URL。OpenAI/Anthropic、JSON/SSE 的 Token 独立、未知和真实零保持原义，fixture/上游来源明确。

B 段及合成 demo 的陈默账号会预置一条有标记的分析历史，未调用模型，也没有虚构 HTTP 请求统计。现场任务的模型请求由真实执行采集。分析使用现有 demo 数据库、用户、重置和 seed 机制，前端团队 mock 开启不影响真实分析读取。

Cloud v2 的**临时**单体后端：一个进程、一个 PostgreSQL 库，实现 `api/openapi.json` 里 v2 用到的子集，供 `frontend-v2` 演示和快速端到端测试。`frontend-v2` 切到正式 Cloud 后删除。

## 运行

需要 Linux/WSL、Git、Go（版本见 `go.mod`）和 PostgreSQL。仓库根目录的 `compose.yaml` 提供本地 PostgreSQL（127.0.0.1:55432）。v2-server 默认连接其中的 `ora_v2` 库，库不存在时自动创建，启动时建表。Node 数据目录放在 Linux 原生文件系统。

```sh
docker compose -p cloud up -d --wait   # 在仓库根目录
go run .                               # 监听 127.0.0.1:8090
```

收到 SIGTERM 或中断信号时，进程会取消 HTTP 请求上下文，让保持打开的对话 SSE 关闭观察并等待其读取协程退出，再结束 HTTP、公共执行服务和数据库。关闭浏览器或单条 SSE 只停止对应观察者，不取消执行 worker；进程退出时的执行停止与完整终态保存仍由公共执行服务负责。

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `V2_ADDR` | `127.0.0.1:8090` | 监听地址 |
| `V2_DATABASE_URL` | `postgres://ora:ora-local@127.0.0.1:55432/ora_v2?sslmode=disable` | PostgreSQL |
| `V2_DATA_DIR` | `$HOME/.ora-v2` | 仓库 mirror、marketplace checkout、Node 与对话目录；同一目录只允许一个进程持有，使用短路径以满足 Unix socket 长度限制；用 release 构建的 Node 时，它和各级父目录都不能组可写或其他人可写（不能放在 `/tmp` 下），否则启动时报错退出 |
| `V2_USERS_FILE` | `users.json` | 启动时预置的账号文件（相对进程工作目录）：`users` 里的 `email`、可选的 `displayName`、`role`（`owner` / `member`）；`retired` 里列出要从成员页移除的旧预置 `email`。`users` 幂等写入，已存在的账号只更新名字和角色；不在 `users` 里的账号默认保留，只有 `retired` 中的地址会在首次启动时软删除。文件缺失、没有 owner、邮箱重复或 `users` 与 `retired` 重叠时拒绝启动 |
| `V2_PLUGIN_MARKETPLACE_URL` | `https://github.com/ora-space/marketplace` | 插件市场 Git HTTPS 地址；禁止携带凭据、query 或 fragment。离线测试直接构造 Syncer 使用本地仓库 |
| `V2_PLUGIN_MARKETPLACE_BRANCH` | `main` | 市场同步分支；启动时浅克隆并拉取，之后按间隔快进工作副本 |
| `V2_PLUGIN_MARKETPLACE_INTERVAL` | `5m` | 市场刷新间隔；必须为正 duration。失败时保留上一版 PostgreSQL 快照 |
| `V2_MARKET_SOCKS_PROXY` | 未设置 | 自定义来源启用代理时使用的部署级 SOCKS5 地址；Git 与 Skill 包下载都使用，客户端只把已校验的公网 IP 交给代理 |
| `V2_MARKET_CREDENTIAL_KEY` | 未设置 | 来源凭据的 AES-256-GCM 密钥（Base64 编码的 32 字节）；启用 S3 来源或自定义来源的 Git 认证时必须持久提供 |
| `V2_NODE_ASSETS_DIR` | 未设置 | `task v2:node:prepare` 生成的固定 Node、reaper、Deno、OpenCode 和 Claude Code 资源；未设置时只启用纯模型路径 |
| `V2_MODEL_BASE_URL` / `V2_MODEL_API_KEY` / `V2_MODEL_NAME` | 未设置 | 可选的一组 HTTPS OpenAI 兼容 provider；必须同时设置，OpenCode 与纯模型共用，清单只公开模型名称与版本 |
| `V2_ANTHROPIC_MODEL_BASE_URL` / `V2_ANTHROPIC_MODEL_API_KEY` / `V2_ANTHROPIC_MODEL_NAME` | 未设置 | 可选的一组 HTTPS Anthropic 兼容 provider（Messages API，base URL 写到 `/v1`，如 `https://api.anthropic.com/v1`）；必须同时提供地址、凭据和模型名，只供 Claude Code 使用。使用 Bearer 网关时以 `V2_ANTHROPIC_MODEL_AUTH_TOKEN` 代替 `V2_ANTHROPIC_MODEL_API_KEY`，二者不能同时配置；Claude Code 的 base URL 若以 `/compatible` 结尾，这里填 `/compatible/v1` |
| `V2_MODEL_IDLE_TIMEOUT` / `V2_MODEL_MAX_DURATION` | `2m` / `30m` | 单次上游模型请求的空闲超时和总上限，两种协议共用；必须为正 duration，空闲超时不能大于总上限。连续这么久收不到上游数据、或总时长到上限时中止响应，Agent 收到的是失败而不是正常结束的流；总上限切断后这一轮不再放行重发，空闲超时切断后只放行 1 次，这一轮按失败结束并显示原因 |

测试需要 `TEST_DATABASE_URL`（任意可建 schema 的库），每个测试用独立的 schema：

```sh
TEST_DATABASE_URL='postgres://ora:ora-local@127.0.0.1:55432/ora?sslmode=disable' go test -race ./...
```

### 录屏场景 seed

新人需求开发、需求拆分和每日巡检的工作流 seed 见 [`demo/README.md`](demo/README.md)。三个 seed 接收各段明确的用户、项目和真实模型绑定，可按任意顺序叠加；每日巡检带三晚可查询的预置历史。演示环境的重置与进程启动由公共框架负责。

### 用 DeepSeek Flash 演示

模型固定为 DeepSeek Flash（`https://api.deepseek.com` 上的 `deepseek-flash`），只需要填 key：

```sh
mkdir -p ~/ora-demo && cp v2-server/.env.example ~/ora-demo/.env   # 填入 DEEPSEEK_API_KEY
task v2:deepseek                                                       # PostgreSQL、v2-server、frontend-v2；打开 http://localhost:5173
```

key 放在仓库外的 `~/ora-demo/.env`，一台机器配一次，主目录和所有 worktree 共用，清理 worktree 也不会删掉它。`scripts/deepseek.sh` 按行读取这个文件（不当作 shell 执行），key 为空或文件不存在时在启动任何服务前退出，再导出上表的三个 `V2_MODEL_*`；如果文件还配置了 `V2_ANTHROPIC_MODEL_*`，也会读取并校验 Claude 的配置。随后运行 `go run .`。chat 页面只提供 Agent 执行器，所以还要求先用 `task v2:node:prepare` 准备 Node 资源（默认 `~/.cache/ora-v2-node`，可在 `~/ora-demo/.env` 里用 `V2_NODE_ASSETS_DIR` 指定），缺少时同样在启动前退出。

### 录屏演示环境

11-06 录屏的三段各有一个命令，另有一个把三段合在一起的命令。每个命令都用独立的库、数据目录和端口，和日常开发的 `ora_v2` 库及 8090/5173 分开，可以同时运行：

| 命令 | 段 | 数据库 | 数据目录 | 后端 / 前端 | 账号 | `VITE_DEMO_MOCK` |
|---|---|---|---|---|---|---|
| `task v2:demo:newcomer` | A 新人 | `ora_v2_demo_newcomer` | `~/.od/a` | 8191 / 5191 | 林新 | 关 |
| `task v2:demo:lead` | B Tech Lead | `ora_v2_demo_lead` | `~/.od/b` | 8192 / 5192 | 陈默、苏芮、周衡 | 开 |
| `task v2:demo:ops` | C 运维 | `ora_v2_demo_ops` | `~/.od/c` | 8193 / 5193 | 许运 | 关 |
| `task v2:demo` | 三段合成 | `ora_v2_demo` | `~/.od/all` | 8190 / 5190 | 以上全部 | 开 |

每个命令依次：按上一节检查 `~/ora-demo/.env` 的 key 和 Node 资源；启动 compose PostgreSQL；删掉并重建本段的库、清空数据目录（同一段还在运行时拒绝，并按可执行文件路径停掉上次留下的 Node 进程）；用 `V2_DATABASE_URL`、`V2_DATA_DIR`、`V2_ADDR`、`V2_USERS_FILE` 启动预先编译的 v2-server；`/healthz` 就绪后运行本段的 seed；最后以 `0.0.0.0` 启动 frontend-v2。所以重跑同一个命令总是回到同一个初始状态。账号用邮箱登录，seed 完成后终端会列出来。前端端口被占用时，用 `ORA_DEMO_WEB_PORT` 换一个。

数据目录没有用 #882 原定的 `~/ora-demo/data/<段>`：Agent 运行时要在数据目录下建 Node 的 Unix socket，路径必须短于 108 字节，数据目录本身最多 67 个字符，所以放在短的 `~/.od/<a|b|c|all>`（A、B、C 三段和合成）。主目录较长时用 `ORA_DEMO_DATA` 换一个更短的目录，太长时命令会在启动前报错。

seed 在 [`demo/`](demo/README.md)：`env.go` 是上表和重置、准备本地 Git 项目、合并用户文件的公共部分，`scenes.go` 接上三段，`lead.go` 是 B 段，`users/<段>.json` 是各段的账号（合成时合并）。同一项目第一次执行 Agent 要多等约一分钟在 Node 上安装 Agent，录屏前先在本段的项目里跑一次热身。

## 租户授权

所有 `/tenants/{tid}` 路由经同一个入口判定成员身份（`internal/server/routes.go`）：

- **一个判定函数**：`store.TenantAccess(tenant, user)` 返回调用者在该租户的角色（`owner` / `member`）。条件只写在这一处：有成员关系、用户 active 且未删除、租户 active。
- **一个路由中间件**：路由只能经路由表的 `public` / `session` / `tenant` / `owner` 四种方式注册。`tenant` 级先判会话（`401 unauthenticated`），再判 `TenantAccess`：非成员、被移出的成员、停用的用户或租户、格式不对的租户 id，一律 `404 not_found`，看不出租户是否存在。通过后把 `{tenant, user, role}` 交给 handler，handler 不再读 `tid`、不再判成员。
- **owner 操作在路由表上声明**：用 `owner` 注册的路由，成员访问得到 `403 forbidden`。现在是邀请成员、插件来源的增改删与同步、空间插件的安装与移除。「owner 或任务创建人 / 表单审核人 / 小队维护者」这类业务规则仍在 store 里判断，角色由路由传入。
- **业务 SQL 只按 `tenant_id` 过滤**，不再各自核对成员关系；读写成员关系本身的查询（成员名单、我所在的团队、登录、邀请）除外。
- **后台工作开始执行时用同一个判定**：执行会话创建与追加一轮、定时任务每次触发、扫描定时任务所属的人、工作流表单提交后续跑。被移出租户的人，已排好的定时任务不再以他的身份执行；已经开始的工作照常收尾。
- **路由表测试**（`routes_test.go`）遍历全部路由，断言非成员一律 404、未登录 401、owner 路由对成员 403，并禁止绕过路由表直接注册路由。

## 已实现

| 路由 | 来源 | 说明 |
|---|---|---|
| `GET /healthz` | 契约 | 数据库可达即 `ok` |
| `GET /auth/providers` | Gateway | 只有 `email` |
| `POST /auth/login` | Gateway | 邮箱登录：`email` 必须是预置文件或 owner 邀请过的账号，否则 `403 email_not_invited`，不会自动建用户；成功后设置 `ora_session` Cookie，`authorizationUrl` 即 `returnTo`（只接受站内路径）。只凭邮箱就能登录等于谁都能冒充谁，**仅用于演示环境** |
| `POST /auth/logout` | Gateway | 吊销会话，`204` |
| `GET /api/v1/me` | 契约 | 当前用户；无会话 `401 unauthenticated`。契约禁止额外字段，当前用户的角色从 `GET /api/v1/me/tenants` 的 `role` 读取 |
| `GET /api/v1/me/tenants` | 契约 | 当前用户所在租户，一页返回全部，`nextCursor` 为空 |
| `GET /api/v1/tenants/{tid}/members` | 契约 | 当前用户所在工作区成员，一页返回全部，按显示名排序；非成员与非法租户 id 都是 `404 not_found` |
| `GET /api/v1/tenants/{tid}/spaces` | 契约 | 当前用户所在工作区的空间，一页返回全部；v2 每个租户一个「演示空间」，`role` 取调用者的工作区角色；非成员 `404 not_found` |
| `GET /api/v1/tenants/{tid}/spaces/{sid}/plugins/catalog` | 契约 | 从 `ora-space/marketplace` 的 `registry/**/orax.toml` 同步的真实市场快照，包含 Agent；启动时先同步，之后每 5 分钟刷新并原子替换 PostgreSQL 目录。成员可读 |
| `GET /api/v1/tenants/{tid}/spaces/{sid}/plugins` | 契约 | 当前空间的全部活动插件选择，包括显式移除的行；空间不属于调用者的工作区时 `403 forbidden` |
| `POST /api/v1/tenants/{tid}/spaces/{sid}/plugins` | 契约 | owner 安装目录中的 Skill 或工作流插件；其他类型（市场 Agent、Hook、MCP、合集等）只读，返回 `400 plugin_kind_not_installable`（已有市场 Agent 选择的更新同样拒绝；预装 Agent 返回 `409 plugin_runtime_managed`）。工作流包由服务端按来源自己的 `Retrieval`/`Credentials` 下载并校验 `.orax`，导入其中的工作流并发布 `v1`；已有同名工作流时自动改名为「名称（插件）」并递增序号，不改动已有定义。重复安装幂等，卸载不删除已导入工作流。升级工作流包时，仍保持导入原样（草稿和生效版本都未改动）的工作流会更新草稿并发布新的顺序版本；用户已保存或发布过编辑的定义保持原样。Skill 立即记录为空间选择，不等项目 Node 确认。支持版本保护与 `Idempotency-Key` 重放 |
| `DELETE /api/v1/tenants/{tid}/spaces/{sid}/plugins` | 契约 | owner 移除 Skill 或工作流选择。Skill 删除整条选择行，立即不再出现在设置页和工作流节点的技能候选里；工作流选择保留 `desiredState=removed` 行；工作流及其历史保留为用户数据。预装 Agent 返回 `409 plugin_runtime_managed`；要求版本与幂等键 |

## 契约之外

任务 Agent 会话分析的五个只读接口见上文「会话分析与模型请求观测」和 `dashboard.openapi.json`。

### 成员邀请

邀请接口不在正式契约里，由独立候选契约 [`members.openapi.json`](members.openapi.json) 描述（正式 Cloud 的成员写入收敛后替换）。

| 路由 | 行为 |
|---|---|
| `POST /api/v2/tenants/{tid}/members` | 只有 owner 可以邀请：`email` 必填，`displayName` 选填（默认取邮箱 @ 前面的部分），`squadId` 选填（同时加入该小队，小队必须属于本工作区且未归档）。提交即创建账号并加入"演示团队"（角色 `member`），不需要对方接受；被邀请的邮箱随后可以直接登录。写权限不足 `403 forbidden`，已在团队 `409 member_exists`，小队不存在 `404 not_found` |

升级已有数据库时，启动会软删除旧开发登录建出的 `dev/demo`「演示用户」，并按 `users.json` 的 `retired` 列表一次性软删除旧预置成员。这些账号的成员记录、小队与对话引用保留，但不再出现在成员页，也不能登录。它们在小队里的成员关系会在每次启动时结束；记录留在库里，但小队详情（包括「已退出」历史）不再列出这些账号，也不计入成员、维护者人数。软删除后账号不会恢复：再邀请同一邮箱返回 `409 user_unavailable`，把它重新写回 `users` 也只会更新名字，既不恢复登录，也不补发 starter skill；`retired` 的清理同样只执行一次，手动恢复的账号不会在下次启动时再被删除。

### 用户技能

用户技能使用独立候选契约 [`skills.openapi.json`](skills.openapi.json)。正式 Cloud 尚无这套 CRUD
契约，因此不改 `api/openapi.json`；前端由独立 Orval 配置生成共享客户端。

| 路由 | 行为 |
|---|---|
| `GET /api/v2/tenants/{tid}/skills` | 当前登录用户的活动技能，最近更新在前；不返回其他用户的行 |
| `POST /api/v2/tenants/{tid}/skills` | 新建，返回 201；名称在同一用户内不区分大小写去重 |
| `GET`/`PUT`/`DELETE /api/v2/tenants/{tid}/skills/{sid}` | 读取、替换或软删除自己的技能；其他用户和已删除行都按不存在处理 |
| `POST /api/v2/tenants/{tid}/skills/import` | 导入一个 1 MiB 以内的 `SKILL.md`；解析 YAML front matter 的 `name`、`description`，正文去掉 front matter 后保存。同名返回 409，显式 `overwrite` 才覆盖并保留 id |

名称遵循 desktop 的安全规则：单个 ASCII slug 路径段，不能以 `.` 开头，不能包含路径分隔符；
简介最多 4096 字节，正文最多 900 KiB。写请求拒绝未知字段和多余 JSON；校验失败返回稳定的
`skill_*` 错误码，不为越权用户暴露其他账号的资源。

账号首次创建或首次被邀请时写入三个真实 starter skill（`ora-code-review`、`test-plan`、
`release-notes`），登记在独立的 `v2_skill_seeds` 一次性标记里；之后它们和用户创建的技能
完全一样，可编辑、删除，删除后不会在下次登录时重新出现。
存量账号中未编辑且目标名仍空闲的旧 `code-review` starter 会在启动时一次性改名为
`ora-code-review`；已编辑、已删除或目标名已被占用的条目不改，留给用户自行处理。

创建或导入的技能会在新 Agent 会话完成工作副本克隆后，物化为
`.opencode/skills/<name>/SKILL.md` 和 `.claude/skills/<name>/SKILL.md`。项目已有同名目录时保留
项目内容；市场 Skill 与用户技能同名时**市场优先**：该用户技能不写入、会话照常启动，只在日志
里带名字记录跳过，设置页会把这只用户技能标记出来提示改名；已经启动的会话保留启动时的副本。
市场 Skill 安装会替换同名且只由 Ora 物化出来的旧目录（旧的用户技能目录登记在 `.git/info/exclude`
自己的标题段下，识别为服务写出的才替换），项目自带的同名技能则保留，安装返回失败并带技能名。
Ora 实际创建的技能目录和市场技能链接会追加到该工作副本自己的 `.git/info/exclude`（不改项目的 `.gitignore`，保留已有规则），所以 Agent 的 `git add -A` 不会提交它们，工作区「变更」也不显示；项目自带的技能和 Agent 自己的改动照常可见。v2 的导入只支持
单个 Markdown 文件，不支持文件夹、归档和附带脚本/资源。

### 定时任务配置

定时任务配置使用独立候选契约 [`schedules.openapi.json`](schedules.openapi.json)，不改变正式 Cloud 的 ScheduledTask（其 issue/agent 执行语义不能表达本次独立对话配置）。前端以独立 Orval 配置生成客户端，后续正式契约收敛时替换这一适配。

| 路由 | 行为 |
|---|---|
| `GET /api/v2/tenants/{tid}/schedule-configs` | 当前创建者在该租户的全部配置；空列表为 `[]` |
| `POST /api/v2/tenants/{tid}/schedule-configs` | 创建配置，返回 201，初始 version 为 1、enabled 为 true |
| `PUT /api/v2/tenants/{tid}/schedule-configs/{id}` | 携带 version 修改配置，保留 enabled 和创建时间 |
| `PATCH /api/v2/tenants/{tid}/schedule-configs/{id}/enabled` | 携带 version 和 enabled 暂停/恢复配置 |
| `GET /api/v2/tenants/{tid}/schedule-resources` | 当前有效成员的真实项目、Agent 和模型投影；Agent 带自己的可运行模型，分别标明目录是否可用，不返回后端路径或凭据 |

接口要求登录 cookie、有效成员关系及创建者归属。无权限资源返回 404，过期版本返回 409，缺失更新版本返回 428；每次修改递增版本。配置持久存储于 PostgreSQL，服务重新启动后保留。请求大小限制 64 KiB，拒绝未知字段，并校验时间、时区、星期和间隔。

对话配置保存时按当前权限验证绑定：无项目的 model ID 必须来自直接模型 Catalog；有项目的 projectId 必须来自当前租户的共享项目存储，target.agentId 必须来自共享执行目录且该 Agent 能运行所选 model ID。新配置不再写 executorId；旧配置仍可按冻结的 executorId 读取和执行。`agent` 只是展示名，不参与执行身份。公共目录未就绪或选择失效时拒绝写入，不猜测默认 Agent/模型/项目。兼容未绑定执行的文本配置：无项目、空模型、空 Agent 可先保存，运行时仍不能通过 model_required 门禁。

资源接口复用 `Options.Catalog` 和共享 `ListProjects`/`GetProject`，没有另一份项目/Agent/模型目录。响应的 available 区分目录不可用与可用但为空，先校验当前用户/租户/成员，再返回数据；只投影名称和稳定ID，不公开镜像目录、provider binding或凭据。项目/Agent/模型在每次保存时重检，真正执行时仍由公共服务再次鉴权。

配置响应中的 `runs` 保留兼容空列表。前端另消费执行操作和历史领域的独立候选契约 `schedule-actions.openapi.json` / `schedule-history.openapi.json`；调度 Host、操作入口和只读历史后端已在主干装配，页面通过这些契约读取实际运行事实，不生成模拟结果。

专用 HTTP 集成测试按此候选 OpenAPI 验证响应，并覆盖创建编辑、暂停恢复、服务替换、归属隔离及错误输入；数据库测试覆盖连接池关闭重开和并发版本冲突。

### 定时任务职责与旧引用兼容

定时任务只负责计划、触发身份、防重叠、调用提供方的执行接口，以及关联和展示外部运行事实。工作流的定义、发布快照、参数模式/语义校验、节点调度和执行由工作流模块拥有；任务目录、描述、项目和执行绑定由任务模块拥有。定时模块不要求这些提供方实现自己预设的解析协议。

写入契约接受 chat、工作流和本人协作任务目标；缺少可执行绑定的旧 task 引用仅供读取，没有 ScheduleTargetResolver、参数字符串化或可由替身开启的引用写入通道。

**工作流目标** 在配置的 `projectId`（必填）里运行一个工作流。默认或 `versionPolicy: "fixed"` 保存 `{kind: "workflow", workflowId, snapshotId, input}`，校验项目属于当前用户、`snapshotId` 是这个工作流在本租户的非草稿版本；`schedule-resources` 列出已发布工作流及当前生效快照，固定模式保存此快照。`versionPolicy: "latest"` 不带 `snapshotId`，保存时只校验存在生效发布版本，每次触发在创建运行的事务内解析当前发布快照。两种模式的运行都保留实际使用的快照；发布不改写配置或历史。启动变量用快照里的默认值，`input` 作为开始节点的初始输入。进程没有执行桥时（`Options.WorkflowRuns` 为空）不列出工作流，写入返回 `503 schedule_target_unavailable`。旧的、没有这些字段的 workflow 引用照旧只读，按它写入返回 `400 invalid_target`。

执行走页面同一个运行入口：`scheduler.WorkflowAdapter` 用任务创建者的 scope 创建运行（冻结快照、项目、输入，名称取任务名）并经执行桥启动，occurrence 的 `executionRef` 记 `{"workflowRunId"}`。运行的 `trigger_kind = 'schedule'`、`trigger_ref = <occurrence ID>`，唯一索引 `v2_workflow_runs_schedule_trigger` 保证一个触发只对应一个运行，重复派发和恢复都按这个身份找回原运行，不创建替代运行。执行桥拒绝启动（图里有还不能执行的节点、输入不满足开始节点）时记 `skipped / workflow_run_not_startable` 并取消那个未开始的运行。协调器每次 Tick 核对未释放的记录：运行结束后成功记 `succeeded`、失败记 `failed / workflow_run_failed`（重启恢复中失败的记 `interrupted`）、取消记 `cancelled`，随即释放占位；运行结束后、结算之前被用户删除的，记 `failed / workflow_run_deleted` 并释放；节点会话由执行桥自己结束，定时侧没有会话要 End。还是 pending 的运行说明启动没有提交（进程重启过），取消它并记 `execution_not_started`。工作流 occurrence 的结果就是它的运行，`…/runs/{oid}/result` 返回 `404 execution_result_not_found`，页面按 `workflowRunId` 读运行详情。

之前已保存的引用仍按原 JSON 读取，可暂停/恢复计划；只读候选类型 `ScheduleLegacyTarget` 保留未知字段，不解释、改写或校验其中的提供方参数。没有删除数据库数据或迁移其字段，前端也不提供引用参数编辑/执行入口。

### 定时执行操作

独立候选契约为 [`schedule-actions.openapi.json`](schedule-actions.openapi.json)，不修改正式 Cloud 契约或配置生成客户端。

| 路由 | 请求与行为 |
|---|---|
| `POST /api/v2/tenants/{tid}/schedule-configs/{id}/run` | `{"requestId":"稳定请求键"}`；同键重试找回同一次手动运行，显式重跑用新键。暂停任务可手动运行，同任务防重叠仍生效 |
| `POST /api/v2/tenants/{tid}/schedule-configs/{id}/runs/{oid}/cancel` | `{}`；只取消当前用户创建、属于路径中任务的运行。取消未确认返回 `503 stop_unconfirmed`，不伪造终态或释放占位 |

先检查当前登录、成员/用户/租户有效性和创建者归属，再检查执行可用性；隐藏资源统一 404。正文不能指定用户、触发时间、状态或执行引用。成功响应是运行回执（ID、状态、原因、占位、版本、计划时间），不带 prompt/配置快照/公共 Ref；HTTP 200 只表示操作完成，不表示运行成功。并发操作返回 `409 operation_in_progress`，可以用相同请求键或同一个取消 URL 重试。请求超时等返回 `503 operation_incomplete`；已保存记录的错误响应带 `params.occurrenceId`，客户端不能因此换键自动再跑。

main 创建一个共用协调器/Host，用一秒 ticker 发现持久配置的当前有效创建者，不需要浏览器保持打开。首次扫描/恢复只安排未来时刻，暂停配置仍参与已接收运行的收尾。每个 Scope 先经公共 Catalog 可用性检查，再做一次协调器恢复；未配置执行时不恢复/写入新 occurrence，操作返回 `503 schedule_execution_unavailable`。Catalog 只是可用性门禁，真正的资源选择和授权由公共 Service 在 Start 时检查。

公共 Service 必须先完成启动恢复，再启动 Host。扫描器、立即运行和取消共用同一个 `Options.Schedules`；main 将公共 `executionruntime.Service` 注入 `Options.Execution`/`Catalog`，完成启动恢复后沿用同一接线启动 Host，不另造 provider。退出时停止 ticker、取消并等待扫描和已进入的 HTTP 操作，之后才关闭公共执行及数据库；退出不伪造成功，未完成运行下次由公共恢复和原身份核对处理。工作流不走对话适配器。

### 定时触发历史

定时触发历史提供只读 `GET /api/v2/tenants/{tid}/schedule-configs/{id}/runs`、`GET /api/v2/tenants/{tid}/schedule-configs/{id}/runs/{oid}` 及 `GET /api/v2/tenants/{tid}/schedule-configs/{id}/runs/{oid}/result`。候选契约、权限、分页和结果边界见 [运行历史 HTTP](schedule-history.md)。结果读取经统一 `Options.Execution` 注入，校验当前身份、服务端 Caller 和已存 Ref；不启动执行或推进状态。配置响应中的 `runs` 仍为空，公共事件订阅未在历史 HTTP 暴露；未注入执行服务时结果接口返回 503。

小队协作使用独立候选契约 [`squads.openapi.json`](squads.openapi.json)。正式 Cloud 尚无小队接口（P1 真实编组由 circus#750 承接），本批不修改 `api/openapi.json`；#750 合入后按正式契约收口。

| 路由 | 行为 |
|---|---|
| `GET /api/v2/tenants/{tid}/squads` | 列出未归档小队及实时人类/Agent/维护者计数 |
| `POST /api/v2/tenants/{tid}/squads` | 创建小队，并在同一事务加入创建者为人类维护者 |
| `GET /api/v2/tenants/{tid}/squads/{sid}` | 小队详情，包含已结束的编组历史 |
| `PUT /api/v2/tenants/{tid}/squads/{sid}` | 编辑名称、简介、协作说明与 leader，携带 version |
| `POST /api/v2/tenants/{tid}/squads/{sid}/archive` | 归档，结束全部有效编组并清除 leader |
| `POST /api/v2/tenants/{tid}/squads/{sid}/members` | 加入人类或 Agent 成员，携带 version |
| `PUT /api/v2/tenants/{tid}/squads/{sid}/members/{mid}` | 修改职责文本与维护者标记，携带 version |
| `DELETE /api/v2/tenants/{tid}/squads/{sid}/members/{mid}?version=N` | 结束编组并保留历史 |

成员是显式类型化引用：人类引用 user 身份，Agent 引用 Space Agent 身份，不使用裸 memberId。人类必须是当前有效的租户成员；Agent 必须是同工作区活动、观测为已安装且由系统预装的可执行 Space Agent。市场 Agent 的安装标记不进入小队和任务候选。当前工作区成员可读取小队与成员；编辑、增员、移除成员与归档只限工作区 owner（v2 只有 owner/member，没有 admin）或本队有效人类维护者。有效人类成员可以自己退出所在小队：被移除的是调用者本人时跳过维护者检查，即使他是最后一名维护者也成功退出，退出保留编组历史；不设"最后维护者"保护，退出后允许零维护者，之后只有工作区 owner 能恢复维护者。本队有效人类维护者可增删其他维护者的标记；Agent 不能成为维护者。leader 必须引用本队所属空间的活动 Space Agent，本队维护者或工作区 owner 可设置或清除。写操作按小队 version 做乐观校验：过期返回 409 `version_conflict`，缺 version 返回 428，归档后返回 409 `squad_archived`。归档结束全部有效编组、保留历史且不提供恢复；移除现任 leader 会在同一事务清除 leader 配置。

Agent 成员只引用 `v2_space_agents` 里由系统预装、可执行且观测为已安装的插件。Plugins 页的市场 Agent 选择不改变这个小队/任务候选集合，也不使用虚构 Agent。

小队与成员关系不授予私人模型、Git 凭据或运行时权限，也不触发 Agent 执行、leader 路由或自动委派。

### 任务

任务使用独立候选契约 [`tasks.openapi.json`](tasks.openapi.json)。正式 Cloud 的任务挂在 issue 与
运行之下，没有这样一条独立任务记录，本批不修改 `api/openapi.json`；正式契约收敛时替换这一适配。

| 路由 | 行为 |
|---|---|
| `GET /api/v2/tenants/{tid}/tasks` | 列出工作区全部任务，最近变更在前 |
| `POST /api/v2/tenants/{tid}/tasks` | 创建任务，返回 201，初始状态 `pending`、version 为 1；不接受调用方给 version |
| `GET /api/v2/tenants/{tid}/tasks/{taskid}` | 任务详情 |
| `PUT /api/v2/tenants/{tid}/tasks/{taskid}` | 携带 version 修改标题、描述与所属项目 |
| `POST /api/v2/tenants/{tid}/tasks/{taskid}/status` | 携带 version 按生命周期推进状态；确认完成和取消只限任务创建人和工作区 owner，其他人 `403 forbidden` |
| `PUT /api/v2/tenants/{tid}/tasks/{taskid}/assignment` | 携带 version 指派或清除指派人，显式 `null` 表示清除 |
| `GET /api/v2/tenants/{tid}/tasks/{taskid}/timeline` | 任务的运行与评论，各按时间先后 |
| `GET /api/v2/tenants/{tid}/tasks/{taskid}/executors` | 能运行这个任务的执行器：指派给 Agent 时是该 Agent 的执行器（执行目录里 `agentId` 等于该 Agent 插件标识的条目）；指派给人时，只有负责人本人能读，返回他能用的全部执行器，别人是 409 `not_assignee`；指派给小队或未指派是 409 `not_agent_task` |
| `POST /api/v2/tenants/{tid}/tasks/{taskid}/runs` | 必须带 `Idempotency-Key`；`{executorId?, note?}` 用调用者身份开一次新运行，返回 201。见下文「任务运行」 |
| `POST /api/v2/tenants/{tid}/tasks/{taskid}/runs/{rid}/stop` | 结束一次活着的运行：正在执行的一轮先取消，空闲的会话直接结束；任何成员都可以停 |
| `GET /api/v2/tenants/{tid}/tasks/{taskid}/runs/{rid}/events` | 运行会话的 SSE，形状与对话事件流相同；工作区任何成员都能读 |
| `POST /api/v2/tenants/{tid}/tasks/{taskid}/comments` | 必须带 `Idempotency-Key`；`{body, mentions?, toAgent?, executorId?}` 记一条评论，`toAgent` 同时发给 Agent |
| `GET /api/v2/tenants/{tid}/tasks/{taskid}/decompositions` | 任务的拆分记录，最新在前；运行已结束但还没结算的先结算再返回 |
| `POST /api/v2/tenants/{tid}/tasks/{taskid}/decompositions` | 必须带 `Idempotency-Key`；`{workflowId}` 用一个已发布的工作流拆分任务，返回 201。见下文「任务拆分」 |
| `GET /api/v2/tenants/{tid}/task-mentions` | 调用者还没回复的 @：每个未结束任务一条，取别人最近一次 @ 调用者、且调用者此后没在该任务评论过的那条 |

任务归属于一个工作区项目，`projectId` 必须在同一工作区内，否则 400 `invalid_project`。指派人显式类型化，
与小队成员一致：`human` 引用当前有效的租户成员，`agent` 引用同工作区活动且可执行的预装 Space Agent，
`squad` 引用未归档小队；名字与 Agent 的 `namespace/identifier` 由实时 join 读取，不在任务行上复制。
`squad` 只表示该小队负责这件事，不派发给某个成员。指派接口里缺 `assignee` 字段是 400
`invalid_assignee`，只有显式 `null` 才清除，避免客户端缺陷悄悄解除指派。

状态为 `pending → running → review → done`，`cancelled` 可从任一未终结状态到达，`done` 与 `cancelled`
终结且不能重开；跳过验收是 400 `invalid_transition`，不是版本冲突。同一函数
[`store.CanTransitionTask`](internal/store/tasks.go) 供人工推进和执行服务共用，执行服务经
`TransitionTaskStatus(ctx, tenant, id, from, to)` 在运行开始与结束时移动任务，`from` 防止过期运行覆盖人工修改。
运行按 [`store.CanRunTransitionTask`](internal/store/tasks.go) 移动任务：开始或追问进入 `running`（从 `pending`
或 `review`），一轮结束（成功或失败）进入 `review`，被停止或中断回到 `pending`；后两种人不能手动做。
Agent 正在执行一轮时，人工推进返回 409 `run_active`。

当前工作区任意成员都可读写、指派与推进任务：v2 没有任务级归属，谁来改由版本号防止互相覆盖。
过期 version 返回 409 `version_conflict`，缺 version 返回 428 `version_required`；跨租户的任务与项目
一律按不存在处理（404 或 400 `invalid_project`）。请求大小限制 64 KiB，拒绝未知字段与多余的 JSON 值。
附件不提供。

#### 任务运行

任务运行（[`internal/taskrun`](internal/taskrun/taskrun.go)，表 `v2_task_runs`）是任务所指派 Agent（派给人的任务是负责人选的 Agent）的一次执行会话，
经公共执行服务以调用方类型 `task` 运行，Caller ID 是运行 ID。和对话不同，它属于团队：

- **身份归发起人**：会话在点「开始处理」的人的 scope 下运行。工作区任何成员都能读运行和它的事件流
  （服务端校验读者是成员后，用发起人的 scope 读），但只有发起人能发下一轮：别人代发，等于用发起人的身份（以后是他的模型凭据）跑。
  其他成员发给 Agent 是 409 `run_owned`，他们可以重新执行，用自己的身份开一次新运行。
- **一个任务最多一个活着的运行**：重新执行会先结束空闲的旧会话（`endReason = replaced`）；正在执行一轮时是 409 `run_active`，要先停。
  页面不排队，追问在一轮执行中同样是 409 `run_active`。
- **停止即结束这次运行**：固定 Node 上取消一轮会结束整个会话，之后只能重新执行。任务完成或取消时结束空闲会话（`closed`）。
- **重启**：进程启动前把上一个进程留下的活运行记为 `interrupted`，正在执行的任务回到 `pending`；不重放、不恢复。
- **派给人的任务**：负责人本人可以用自己选的 Agent 处理，执行器就决定了 Agent。只有负责人能开运行（包括重新执行和 `toAgent` 评论开的新运行），
  别人是 409 `not_assignee`；别人仍能看过程、停止。跑完、停止对任务状态的推进与 Agent 任务相同。
- **执行器**：`executorId` 必须是上面 `executors` 列出的执行器，否则 400 `invalid_executor`；不填时选目录中的第一项，目录为空时不启动执行。
- **列表**：任务带 `activeRun`（活着的运行的发起人、执行器与 `running`/`idle`），列表不用逐个读时间线就能显示谁在干活。

评论存在 `v2_task_comments`，全团队可见。`mentions` 只接受从 @ 菜单选出的类型化对象（`user` 为有效成员、`agent` 为预装且已安装的
Space Agent），写入时解析名字；正文里手打的「@名字」不路由。`toAgent` 把评论作为一轮发给 Agent：调用者自己的活运行就追加到同一会话，
没有活运行就用调用者身份开新运行。v2 没有通知渠道，@ 靠 `task-mentions` 送达：被 @ 的人在任务里评论一次就算回复，
自己 @ 自己和已完成、已取消任务上的 @ 不算。

#### 任务拆分

任务拆分（[`internal/taskdecomp`](internal/taskdecomp/taskdecomp.go)，表 `v2_task_decompositions`）是 Tech Lead 在协作页点「拆分」：
用一个已发布的工作流（演示里是「需求拆分」）把大需求拆成子任务。

- **一次拆分 = 一次工作流运行**：用点「拆分」的人的身份运行工作流的已发布版本，输入是任务标题和描述，项目是任务的项目。
  运行和普通运行一样出现在工作流的运行历史里。同一任务同时只有一次进行中的拆分（409 `decomposition_active`）；
  已结束的任务（409 `task_closed`）和子任务（409 `subtask_not_decomposable`）不能拆；工作流不存在或没有发布版本是 400 `invalid_workflow`。
- **子任务**：运行成功后，输出的 `tasks` 数组（每项 `title`、可选的 `description`，也接受整段数组的 JSON 字符串）变成任务的子任务：
  `v2_tasks.parent_id` 指向大需求，项目同大需求，创建人是发起人，不指派，状态 `pending`，按输出顺序排在列表里。只有一层，子任务不再拆。
  标题和描述超长的部分截断；一次最多 20 个。
- **幂等**：结束拆分和写子任务在同一个事务里，以拆分仍是 `running` 为条件，所以同一次运行无论被看到结束几次（后台观察、页面读取、重启恢复），子任务只写一次。
- **失败可见**：运行失败或被取消、输出里没有 `tasks` 数组、数组为空或某项缺标题、执行桥拒绝启动，拆分都记为 `failed` 并写明原因（`failure`），可以重新拆分。
- **重启**：拆分不跨进程。启动时先由工作流执行桥中断上一个进程的运行，再结算留下的拆分：运行已成功的照常建子任务，其余记为失败。

HTTP 集成测试按此候选 OpenAPI 校验每一次响应，并覆盖创建、编辑、合法与非法状态迁移、三种指派、
版本冲突和越权读取，以及开始、停止、评论、@、时间线和事件流；数据库测试另覆盖跨租户隔离与执行服务的推进；
`internal/taskrun` 用内存执行端口和真实 PostgreSQL 覆盖发起人身份、追问权限、停止、重新执行、关闭任务与重启中断。

### 协作 @ 目录

`GET /api/v1/tenants/{tid}/collaboration/targets` 按正式契约实现子集：`user`（工作区有效成员，交互 `mention`）与
`agent`（预装且已安装的 Space Agent，交互 `task`，`description` 是插件标识）。正式契约里的 `team` 与 `workflow` 不返回：
v2 不向小队自动派发，工作流在自己的页面运行。

### 项目仓库

项目使用独立同步候选契约 [`projects.openapi.json`](internal/projectrepos/projects.openapi.json)：
`GET/POST /api/v2/tenants/{tid}/projects` 与 `GET /api/v2/tenants/{tid}/projects/{pid}`。
创建只接受匿名 HTTPS 仓库 URL 与分支，完成一次 mirror clone、验证分支并固定 snapshot 后才写入
已有的 PostgreSQL 项目记录；clone 或分支检查失败不创建项目。之后不 fetch，也不向上游 commit/push。
列表按 ID 升序分页，读取要求当前租户成员关系；创建者来自登录身份。响应不暴露 mirror 路径、凭据或 snapshot ref。

[`projectrepos.New`](internal/projectrepos/README.md) 通过 `server.Options.Projects` 注入。
`main` 装配该依赖，普通启动为开发登录的演示团队创建或复用真实 `fixture://demo` 项目，
带本地 Git mirror 和固定 snapshot；清单读取同一 PostgreSQL 记录，重启不重复创建。
内部 `SeedDemo` 不接收浏览器路径，构造服务和 HTTP 请求不会自行调用它，HTTP 创建仍禁止 fixture/file scheme。
演示环境信任租户成员，创建项目会让服务器访问成员给出的任意 HTTPS 地址，包括私网与 loopback；
完整目标地址信任模型见 [`projectrepos/README.md`](internal/projectrepos/README.md)。
本接口不伪造正式 v1 创建契约中的 Space、Workspace 或异步 Operation，也不创建执行目录。

### 执行目录

[`catalog.openapi.json`](internal/server/catalog.openapi.json) 定义
`GET /api/v2/tenants/{tid}/execution/models` 和 `GET /api/v2/tenants/{tid}/execution/executors`。
两者要求登录和当前成员关系，响应为 `{ "items": [...] }`，不返回 provider URL、凭据或磁盘路径。
目录只包含部署配置的真实 provider，不再默认提供 `fixture`。完整 OpenAI 兼容 provider 配置提供
`configured` 模型和 `opencode:configured` 执行器；完整 Anthropic 兼容 provider 配置提供
`claude:configured` 执行器。没有配置模型时两个目录都为空，服务仍可启动并返回可理解的空状态；
无 Node 资源时执行器清单也为空。fixture 只供内部测试使用：Playwright 启动 v2-server 时显式传
`-test-fixtures`，`-fixture-check` 也只在自身进程内合入 fixture 目录。
每个 Agent 只用自己协议的绑定：OpenCode 走 OpenAI chat completions，Claude Code 走 Anthropic Messages；
Messages 绑定只给 Agent，不出现在模型清单里，纯模型对话不能选它。清单里 OpenCode 排在前面，默认选择不变。

### 工作流定义

工作流定义按 desktop 的编辑模型提供，使用独立候选契约 [`workflows.openapi.json`](workflows.openapi.json)，不修改正式 Cloud 的 workflow 路由（其 snapshot/publish 语义与 desktop 不同，等 #827 收口后再谈收敛）。每个定义恰好有一个可变的草稿快照（`version` 为保留字 `draft`），发布时把草稿冻结成不可变版本并把它设为活跃版本；回滚只把历史图灌回草稿，激活才移动活跃指针。时间戳按 desktop 契约用 Unix 毫秒，`graph` 按编辑器的原始字符串存取，不重新序列化。

| 路由 | 行为 |
|---|---|
| `GET …/workflows` | 租户内未删除定义，最新创建在前；只带发布版本号，不带图 |
| `POST …/workflows` | 创建定义与草稿，返回 201；名字 trim 后非空且同租户不重名（不区分 ASCII 大小写） |
| `POST …/workflows/analyze` | 分析编辑器提交的图：未参与执行的节点与无法识别的节点类型，不保存 |
| `GET …/workflows/{wid}` | 定义、草稿与当前活跃版本（未发布为 `null`） |
| `PUT …/workflows/{wid}` | 改名，保留身份与快照 |
| `DELETE …/workflows/{wid}` | 软删定义及其所有版本，之后名字可复用 |
| `GET`/`PUT …/workflows/{wid}/draft` | 读取或整份替换草稿；保存不校验，未完成的画布也能留 |
| `POST …/workflows/{wid}/publish` | `version` 为 `null` 时自动生成 `v{毫秒}`（冲突时 `v{毫秒}-{n}`）；用户版本不得是 `draft`、不超过 128 字节且可作为单个路径段 |
| `GET …/workflows/{wid}/versions` | 已发布版本（不含草稿），最新在前 |
| `GET`/`DELETE …/workflows/{wid}/versions/{version}` | 读取一个版本（`draft` 也可读）或软删；活跃版本与草稿拒绝删除，已删版本的版本名可重新发布 |
| `POST …/workflows/{wid}/activate` | 把历史版本设为活跃版本，并同步其图到草稿；返回草稿 |
| `POST …/workflows/{wid}/rollback` | 把历史版本的图灌回草稿，不动活跃指针；返回草稿 |
| `GET …/workflows/{wid}/snapshots/{sid}` | 按快照身份读取，供运行历史引用 |

写操作按定义行加锁串行：发布在同一事务里读草稿、校验并冻结，避免校验过的图和冻结的图不是同一份。请求体限制 6 MiB、拒绝未知字段；响应错误沿用 Cloud 的 `{code, params, requestId}`，领域错误码与 desktop 一致（如 `workflow_name_conflict`、`workflow_version_already_exists`、`workflow_cannot_delete_active_version`、`workflow_run_graph_parse`）。`workflow_name_conflict` 只用于手动创建或重命名工作流；工作流插件导入遇到同名定义会自动改名，不返回该错误。

图规则不属于 HTTP 层：`server.Options.AnalyzeWorkflow` 提供草稿分析，`Options.ValidateWorkflow` 提供发布前的可执行性校验，两者由工作流领域注入；未注入时定义读写照常，分析和发布返回 `503 workflow_domain_unavailable`，不会把未校验的文档伪装成可运行版本。

与 desktop 的明确差异：v2 以租户代替 desktop 的单一 `local` 命名空间，`namespace` 恒为 `local`；重名改为由数据库唯一索引拒绝并映射为 409（desktop 并发重名可能返回 500）；发布校验放在事务内（desktop 存在校验与冻结之间的 TOCTOU）；软删记录 `deleted_at`（desktop 丢弃快照删除时间）；版本列表在同一毫秒内用 id 兜底排序；名称唯一性用 PostgreSQL `lower()`，比 desktop 的 ASCII `NOCASE` 范围更宽。

### 工作流运行历史

运行记录同样在 [`workflows.openapi.json`](workflows.openapi.json) 里：创建时冻结一个已发布版本、项目、输入与触发身份，图不复制，历史读取始终回到冻结快照。状态存 `pending`/`running`/`succeeded`/`failed`/`cancelled`；`awaitingInput` 是「running 且有 pending 节点」的派生值，不落库。

| 路由 | 行为 |
|---|---|
| `POST …/workflows/{wid}/runs` | 冻结并创建 `pending` 运行；`snapshotId` 缺省取当前活跃版本，草稿快照拒绝；`projectId` 必填且必须是本租户项目 |
| `GET …/workflows/{wid}/runs` | 该定义的全部运行（最新创建在后，与 desktop 的列表顺序一致），带冻结版本号 |
| `GET …/workflow-runs?projectId=` | 按项目列运行；不传项目则列出本租户全部运行 |
| `GET …/workflow-runs/{rid}` | 运行、节点（每个身份只返回最新一次尝试）、Loop 轮次 scope，以及照 desktop 投影的 `variables`（根变量池）和 `failedAttempts`（被替换的失败尝试） |
| `GET …/workflow-runs/{rid}/snapshot` | 运行冻结的快照图；定义发布新版本后历史仍按原图渲染 |
| `DELETE …/workflow-runs/{rid}` | 软删已结束的运行及其节点；running 或还有 pending/running 节点时拒绝 |
| `POST …/workflow-runs/{rid}/start` | 交给执行桥启动运行 |
| `POST …/workflow-runs/{rid}/cancel` | 取消运行；停止未确认时返回 `503 workflow_run_stop_unconfirmed` |
| `PATCH …/workflow-runs/{rid}/input` | 更新启动输入与变量；执行桥判定不可编辑时返回 `409 workflow_run_not_editable`（desktop 允许未开始和已结束的运行修改，用于准备下一次执行） |
| `POST …/workflow-runs/{rid}/nodes/{nodeId}/complete` | 交互节点完成（`force`、`requester: human`）；v2 不执行交互式节点，执行桥校验归属后固定返回 `400 workflow_node_not_awaiting_input` |
| `GET …/workflow-runs/{rid}/nodes` | 只要节点行 |
| `GET …/workflow-runs/{rid}/events` | SSE，只发 `workflow_run_invalidated`（data `{"runId"}`，不带状态，同 desktop 的同名事件）：连上先发一条，之后每次提交的变化一条，未读的合并；页面收到后重新读取运行。未注入运行事件端口时返回 `503 workflow_run_events_unavailable` |
| `GET …/workflow-runs/{rid}/nodes/{nodeRunId}/events?after=` | 一次节点尝试的会话事件，帧格式、游标和 `end`/`failure` 与对话的事件流相同；尝试不属于该运行返回 `404 workflow_node_run_not_found`，还没派发（`sessionId` 为空）或会话不属于当前用户返回 `404 workflow_node_session_not_found` |

- **冻结与身份**：`triggerKind`/`triggerRef` 记录手动或定时触发的稳定身份，定时侧只创建与跟踪，不复制图校验或引擎；运行与节点身份稳定，Loop 轮次是 `v2_workflow_scopes` 的一行（同一 Loop 同时最多一个活动轮），Iteration 轮次是节点行的 `iteration`（0 基）。
- **attempt 就是软删行**：失败尝试把节点行软删，再插入下一次尝试；同一 `(scope, node, 迭代轮)` 只允许一行未删记录，数据库唯一索引兜住并发派发。
- **引用保护**：运行冻结的版本不能被删除（`400 workflow_snapshot_in_use`），还有未删运行的定义也不能删（`400 workflow_active_runs`）；把已结束的唯一运行删掉（`DELETE …/workflow-runs/{rid}`）后，版本和定义才重新可删。运行中或还有未完成节点的运行拒删（`400 workflow_run_active`），避免删掉执行桥仍在写的会话行。
- **执行桥接缝**：`server.Options.WorkflowRuns`（`server.WorkflowRunHost`）由执行桥实现、在 `main` 注入；未注入时 start/cancel/input/complete 返回 `503 workflow_run_host_unavailable`，定义与历史读取照常。HTTP 只做登录/成员校验、严格解码和错误码映射，派发、停止确认、会话与对话历史都留在执行桥；拒绝用 server 包的哨兵错误表达（`ErrWorkflowRunNotStartable`、`ErrWorkflowRunNotEditable`、`ErrWorkflowNodeNotAwaitingInput`、`ErrWorkflowNodeNotFound`、`ErrWorkflowRunStopUnconfirmed`、`WorkflowRunInputInvalid`）。
- **进程内存储端口**：执行桥直接调用 store 上的状态转移，不经 HTTP——`StartWorkflowRun`、`CreateWorkflowNodeRun`、`BindWorkflowNodeSession`、`CompleteWorkflowNodeRun`、`FailWorkflowNodeRun`（失败 attempt 号在同一事务里分配，payload 由领域构造）、`RetryWorkflowNodeRun`（失败行软删 + 插入等待运行的下一 attempt，编号连续）、`WakeWorkflowNodeRun`（唤醒等待的重试，重复唤醒 no-op）、`FinishWorkflowRun`、`CancelWorkflowRun`（同一事务里收尾活动 Loop 轮次并去掉等待中重试的 `retry_wait`）、`StartWorkflowLoopRound`（同一 Loop 只允许一个活动轮）、`SettleWorkflowLoopRound`（重复结算同状态为 no-op）、`DeleteWorkflowRun`。节点完成对已终态尝试是 no-op，取消对已取消运行幂等。取消也接受 `pending` 运行（desktop 只接受 `running`，其余返回 `NotActive`）：v2 的取消是用户可重试的操作，执行桥确认停止前重复调用必须返回同一个已取消运行，排队中的运行也要能直接从页面撤掉。
- **事件流**：运行事件流订阅 `server.Options.WorkflowRunEvents`，`main` 注入执行桥的 `workflowhost.Hub`。节点会话事件流以节点尝试为键（重试是新的尝试和新的会话），按当前用户的 scope 读公共执行服务：会话属于启动运行的人（定时触发时是任务的创建者），同租户其他成员读到 `404 workflow_node_session_not_found`，页面退回尝试记下的任务和回答。不跨用户读会话，所以也不需要持久化发起者。
- **分支决策投影**：根 Condition 决策在 `conditionDecisions`，Iteration 决策在 `iterationConditionDecisions`（`nodeId#round`），Loop 决策留在每轮 `scope.state`。
- **变量与失败尝试投影**：运行 payload 的其余部分不公开；除了 Condition 的 `conditionDecisions`，详情再投影 desktop `GetWorkflowRunResponse` 里的两项。`variables` 读 `variablePool` 的 catalog（`<节点>.<名字>`，按键排序），`sourceNodeId` 取 `writer`，没赋值的不带 `value`，赋了 `null` 的带 `null`；跳过旧的 `selected_branch_id` 路由项，键不合法的项跳过而不让整个详情失败（desktop 在这里报 payload 损坏）。运行开始前没有变量池，读出空列表。`failedAttempts` 是被软删的 `failed` 节点行（desktop 的 `list_failed_attempts`），取各行 `payload.error_detail`，没有的跳过；只有重试、续跑和整次重跑会软删失败行，v2 三者都没有，所以目前总是空的，当前失败的尝试就是节点自己的行。
- **能力边界**：整次运行 restart/resume 不在演示范围；顶栏“再跑一次”创建新运行。重启中断由执行桥提供，见下文“工作流执行”。

运行页按选中的 Loop scope 或 Iteration 下标投影节点状态，并以该次尝试的 `nodeRunId` 订阅会话事件。该轮未执行的成员没有尝试身份，不继承前一轮的会话或执行元数据。启动输入和根变量只覆盖根 Start，不覆盖 Loop 的本轮入口。`failedAttempts` 的兼容展示仍只映射根作用域；演示版不替换失败尝试，当前轮内失败直接显示在该轮的节点状态中。

### 对话

对话页使用独立候选契约 [`chat.openapi.json`](chat.openapi.json)。正式契约里的对话挂在 issue 下，没有独立的对话列表。前端以独立 Orval 配置生成客户端。领域逻辑在 [`internal/chat`](internal/chat)，只经 [`internal/execution`](internal/execution/README.md) 的公共接口运行 Agent。

| 路由 | 行为 |
|---|---|
| `GET …/chat/executors` | 可选的 Agent 与模型绑定，来自公共执行目录；包含 `agentId` / `modelId`，供工作流选择器保存真实执行身份 |
| `GET …/chat/conversations` | 本人在该租户的对话，按创建时间排序，各带自己的执行 session |
| `POST …/chat/conversations` | 以第一条消息创建对话并 `Start`，返回 201 和该轮的 session/turn |
| `PATCH …/chat/conversations/{cid}` | 改名 |
| `DELETE …/chat/conversations/{cid}` | 先 `End` 活 session，确认后再删除对话 |
| `POST …/chat/conversations/{cid}/messages` | 在对话的 session 上 `Append` 下一条消息 |
| `POST …/chat/conversations/{cid}/stop` | `Cancel` 最近一轮 |
| `GET …/chat/conversations/{cid}/events` | 对话 session 的事件，Server-Sent Events |
| `GET`/`PUT …/chat/project-order` | 本人在左栏的项目顺序 |

`…` 是 `/api/v2/tenants/{tid}`。所有路由要求登录 cookie 和成员关系；他人的对话按 404 处理。执行服务和目录取自统一注入点 `server.Options.Execution` / `Catalog`（见下一节）；它们还是未配置的 Stub 时，对话列表照常读取，执行器清单、创建对话和发消息等需要执行的调用返回 503 `execution_unavailable`。

- **一个对话、一个 session**：创建对话时只选项目，执行服务为这个对话新建目录，对话之间、对话与定时任务和工作流之间都不争抢目录。session 在两轮之间保持，直到下列情况之一，并记下 `endReason`：
  - `stopped`：停止。固定 Node 取消进行中的一轮会结束整个 session。
  - `deleted`：删除对话。
  - `interrupted`：在对话之外结束，例如服务重启后 `Append` 返回 `ErrSessionEnded`。

  session 结束后对话只读：再发消息返回 409 `conversation_ended`，页面提示新开对话。不会在同一对话里新开 session，也不重放上下文。
- **幂等**：创建对话和发消息必须带 `Idempotency-Key`，它就是该轮的 attempt ID。用同一个 key 重试，返回原对话和原 Ref，不会重复执行；同一个 key 换了参数，返回 409 `idempotency_conflict`。结果未知时返回 503 `outcome_unknown`，要用同一个 key 重试。第一条消息被明确拒绝时不留下空对话。
- **上一轮未结束**：返回 409 `turn_running`，由页面排队，上一轮结束后再发。
- **事件流**：每条消息的 `id` 是 session 内序号，`Last-Event-ID`（或 `after`）从其后续上。`session_ended` 之后发 `end` 事件；读取失败发 `failure`，不会冒充正常结束。快照 `history` 每次整份替换，`records[].data` 是固定 Node 的 HistoryLine。关闭事件流只停止观察，不停止 Agent。
- **简化**：同一对话的操作用进程内互斥串行，依赖 v2-server 是单进程；首版只接文本消息，必须选项目。

装配：`server.New` 用传入的 store 和注入的 `Execution` / `Catalog` 建一个 `chat.Service`，chat 不改 `main.go` 或启动入口。chat 只调用公共 `execution.Service`，不直接写执行存储的事件、终态或 End；chat 自己的表只记录对话、session 归属和结束原因。

HTTP 集成测试按 `chat.openapi.json` 验证 JSON 响应，向注入点传入 `executiontest.Stub`，覆盖对话生命周期、停止后只读、事件流续传、项目顺序和执行不可用；`internal/chat` 的测试用真实 PostgreSQL 和执行端口替身，覆盖幂等重试、结果未知、上一轮未结束、停止与重启后只读和删除顺序。

### Agent 工作区查看

对话页和工作流运行页的右侧面板只读查看 Agent 的工作副本，使用独立候选契约 [`workspace.openapi.json`](workspace.openapi.json)。正式 Cloud 中 Node 运行在沙盒里，服务端读不到工作副本，届时要改为经 Node 读取；这里因为 v2-server 与 Node 同机，直接读本机目录。读取逻辑在 [`internal/workspacefs`](internal/workspacefs)。

| 路由 | 行为 |
|---|---|
| `GET …/chat/conversations/{cid}/workspace/entries?path=` | 对话工作副本的一层目录，目录在前；`path` 省略为根 |
| `GET …/chat/conversations/{cid}/workspace/file?path=` | 一个文本文件的内容 |
| `GET …/chat/conversations/{cid}/workspace/changes` | 相对克隆时 commit 的变更文件，含未跟踪且未忽略的文件，带增删行数 |
| `GET …/chat/conversations/{cid}/workspace/diff?path=` | 一个文件相对克隆时 commit 的 unified diff；未变更时为空 |
| `GET …/workflow-runs/{rid}/workspace/{entries,file,changes,diff}` | 同上，读取该运行各 Agent 节点共用的工作副本 |

`…` 是 `/api/v2/tenants/{tid}`。对话只能读本人的（他人的按 404 `not_found`），运行与运行详情一样对租户成员可见。

- **位置落库**：Agent 运行时在工作副本克隆并物化技能后、Agent 启动前，把 `WorkspaceID → 目录、克隆时 commit` 写进 `v2_workspaces`，所以会话结束、服务重启后仍能查看。还没克隆好时返回 404 `workspace_not_ready`；目录已被 `-cleanup` 删除时返回 410 `workspace_removed`。
- **路径**：只接受相对路径，解析符号链接后必须仍在工作副本内，`.git` 不可见；越界返回 400 `invalid_path`。目录列表跳过指向工作副本外的符号链接。
- **上限**：文件 2 MiB、diff 输出 4 MiB（413 `too_large`），含 NUL 或非 UTF-8 的文件返回 422 `binary_file`；目录最多 5000 项、变更最多 2000 个文件，超出时 `truncated`。
- **不改 Agent 的 Git 状态**：变更和 diff 在 index 的临时副本里把未跟踪文件标为 intent-to-add 后计算，Agent 的 index 不变。git 调用关闭 hooks、fsmonitor、外部 diff 和 textconv。v2 的 Agent 本来就以同一用户在本机执行命令，这些读取不增加它的权限。
- **简化**：不检测重命名（显示为删除加新增）；不做文件监听，页面在工具调用完成和一轮结束时刷新；工作流只到运行级，不区分节点各自改了哪些文件。Ora 物化进工作副本的技能不算变更，见「用户技能」。

## 进程内 Agent 执行接口

[`internal/execution`](internal/execution/README.md) 的公共 Go 接口由
`server.Options.Execution`（`execution.Service`）与 `server.Options.Catalog`（`execution.Catalog`）
统一注入，页面 handler 通过保存的 Options 使用同一个执行后端。页面服务测试可注入显式 callback Stub，
不必各自创建执行实现或修改启动入口。

`server.New` 将未配置的 Execution/Catalog 字段默认设为同一个未配置 Stub；显式传入的依赖保留不变。
这两个字段分别配置：即使 Execution 同时实现 Catalog，省略 Catalog 仍表示该清单不可用。

`main` 将 [`internal/executionruntime`](internal/executionruntime/README.md) 的同一个 Service 注入这两个字段。
Session、Turn、连续事件、完整结果和 Caller attempt 保存在 PostgreSQL；worker 不依赖 HTTP 观察者。
有项目的调用经过每项目 Node 与独立 checkout，无项目 `StartModel` 直接使用
[`internal/modelturn`](internal/modelturn/README.md)，不创建目录。同一 Caller attempt 返回原 Ref；
同一对话或 workflow run 还在执行时拒绝新轮次。

有项目 Cancel 会结束整个物理会话，确认停止后后续 Append 返回 `ErrSessionEnded`；
纯模型 Cancel 只停止当前轮，之后可继续。取消已经结束的旧轮只返回原结果，不停止后来的轮次。
End 确认停止后持久化会话结束，历史仍可读。启动先恢复并停止旧 Node，再把未完成轮记为 interrupted、
将旧会话全部结束；不重放 prompt 或恢复 Agent 上下文。页面领域继续通过同一执行接口接入。

fixture 只替代模型，Git、Node、OpenCode / Claude Code 与 shell 工具都实际执行：

```sh
# 在仓库根目录准备资源，随后到 v2-server；资源和数据目录均使用 Linux 原生磁盘。
task v2:node:prepare
V2_NODE_ASSETS_DIR=/absolute/path/to/assets go run . -fixture-check
# 公共 Service 的真实工具写入、End 和 PostgreSQL 重启读取
V2_NODE_ASSETS_DIR=/absolute/path/to/assets TEST_DATABASE_URL='postgres://ora:ora-local@127.0.0.1:55432/ora?sslmode=disable' go test -race -count=1 -run TestReal -v ./internal/executionruntime
```

每个项目的 Node 在某个插件第一次被用到时才安装它。Claude Code 包约 190 MB，解压后约 400 MB，
首次安装要解压和校验，明显慢于之后的启动；安装结果留在 `V2_DATA_DIR` 的项目 Node 目录里，
之后重启服务再用只需约一秒。演示前先在每个演示项目里跑一轮 Claude Code，可避开这次等待。

End 和重启不自动删除目录。停止服务后 `go run . -cleanup` 只删除确认停止后的登记 Node 与对话目录，
保留项目 mirror 和数据库历史；命令拒绝与持有同一数据目录的服务并行运行。
外部 provider 的显式验收入口与配置见执行服务包 README；默认 skip 不代表外部 provider 验收通过。

## 与正式 Cloud 的差异

### 调度编排与对话消费适配

[`internal/scheduler`](internal/scheduler/README.md) 提供显式注入记录、执行接口和时钟的协调器。Recover 完成持久恢复后才允许 Tick/Manual，首次发现、版本变化和暂停恢复从未来时刻安排；单进程迟到扫描只处理最近到期点，不回补积压。手动请求用固定键找回原时刻和记录，尚未 begin 的记录可继续首次接收，已接收或未知结果仅按原身份核对。

ConversationAdapter 按冻结配置分流：无项目文本对话用公共 StartModel 和明确模型 ID，有项目文本对话用公共 Start 和明确的 projectId、target.agentId、target.model；旧任务仍可传冻结的 target.executorId。每次触发新建会话，有项目时由公共服务创建独立目录，两路不相互降级。适配层共用 ReadAttempt/Cancel/End，不直接调用 provider 或 Node，也不另存 Session/Turn。成功要求 AnswerComplete；结果终态和 End 确认分开，End 失败不释放任务占位。缺失 Agent/model、工作流目标明确拒绝，不从展示名称猜测可执行绑定。

协调器本身不创建 goroutine；main 的 Host 接入周期扫描和上述 HTTP 操作，前端页面已接入运行与取消等操作。main 注入公共 `executionruntime.Service` 驱动实际派发；普通测试通过公共 Stub 和实际 PostgreSQL 验证编排、HTTP 和生命周期，opt-in 测试另组合真实公共 Service。

协作任务目标保存原任务 ID、执行器和可选补充说明；项目继承自任务，创建和触发时均校验归属和状态。调度器以计划创建者身份通过协作运行入口启动，使用到期记录的稳定身份核对原始执行，避免重复派发。历史只保存任务和运行引用，不复制原任务的过程或回答。仅一次规则按配置时区的指定日期触发，重启不补跑。候选契约见 `schedules.openapi.json`、`tasks.openapi.json`。

`server.NewScheduleCoordinator(records, options, now)` 使用页面统一的 `Options.Execution`，不另建执行服务；宿主在公共启动恢复完成后调用 Recover，再驱动 Tick/Manual。Start 与同记录的核对/取消不会并行。启动错误或本地引用未保存时只按原 Caller 读取；无引用且确定没有进行中的 Start，查询未命中可记 skipped/execution_not_started。读取错误或已有引用但缺失记录时保留占位，不重放 prompt。Agent Cancel 结束会话，model-only Cancel 只停当前轮；定时对话两路都随后确认 End，保留历史与目录。详细状态、原因及 released 含义见 [状态说明](internal/store/occurrence-states.md)。

### 定时工作流版本策略

`ScheduleWorkflowTarget.versionPolicy` 为 `fixed` 或 `latest`，省略仍按固定版本处理。固定版本必须有已发布的 `snapshotId`；跟随最新版本禁止传 `snapshotId`，保存时要求存在生效发布版本。每次手动或定时触发在 `CreateWorkflowRun` 的工作流行锁事务内解析当前发布指针并冻结实际快照；已有运行及同请求键的重试、恢复保持原快照。没有发布版本、快照删除或工作流不可用时按现有 `workflow_unavailable` 路径拒绝，不回退草稿。仅使用 v2 专属 schedules 契约，无 Cloud 契约变化。发布不会修改任何任务；前端发布弹窗只检查当前用户在当前租户的可见配置，因此不公开其他用户的计划。

### 工作流执行

[`internal/workflowhost`](internal/workflowhost) 实现 `server.WorkflowRunHost`，在本进程里执行运行；调度由 [`internal/workflow`](internal/workflow) 的无状态引擎完成，每一波都从数据库重新计算。行为、图模型和执行语义以 desktop（`crates/application/src/workflow_run/engine/`、`crates/backend/src/workflow/run/`）为准，存储沿用运行/scope/节点行模型，引擎的状态转移是 store 的 `*WorkflowEngine*` 事务（每个一次事务，完成节点时同时折叠运行 payload、维护 `state.current_nodes`）。

演示范围（#827 的结论）：

- **只做核心执行**：启动、取消、历史和刷新；普通节点失败使运行失败，Iteration 内失败由其 `errorStrategy` 决定停止或继续。不做自动重试、续跑、快照接管、checkpoint/回滚、AI 诊断和交互式节点。节点上的 retry、interactive 配置照常保存，执行时不生效。
- **节点**：执行 Start、Agent、Output、Condition、Aggregator、Loop、LoopExit、Iteration。历史 `prompt` / `tool` 节点仍可解析，但启动返回 `400 workflow_run_start_failed`。
- **Loop**：轮次从 1 开始、最多 100 轮，每轮重新建独立变量池，只导入上游、全局与显式携带值。反馈值从同一完成快照读取，随后检查 `until`；最后一轮满足条件仍成功，未满足时按 `maxIterationsBehavior` 失败或导出。父节点行保存 JSON 结果，变量池只发布配置过的命名输出，不隐式赋值 `{loop}.output`；`stop_reason` 区分 `loop_succeeded`、`loop_max_iterations`。轮次关闭与下一轮入口同事务提交。
- **LoopExit**：同一 ready wave 优先退出，先冻结导出结果、将同轮未完成子节点取消，再由 host 停止活动 turn 并确认 session End。确认前父 Loop 保持运行；停止未确认时失败，不启动下游。成功原因为 `loop_exit`，不读取下一轮反馈。取消后的回调不能改写变量池或冻结输出；进程重启直接中断，不重放。
- **Iteration**：串行遍历数组，节点 `iteration` 为 0 基，默认 `maxIterations=50`，可显式设置更大值。空数组直接成功，超限在首轮前失败。每轮必须有 collect 节点成功记录，未执行 collect 不能借用上一轮的值。`fail` 停在失败轮；`continue` 保留失败并继续。父节点输出 `output`（成功值）、`entries`（每项成功或失败）和 `failed_count`；ledger 与下一轮或父节点终态原子提交。成员始终留在原 scope，不复用 Loop scope 作为数组下标。
- **Condition**：按 desktop 的 `condition.rs` 依次判断各个 case，第一个成立的 case 胜出，都不成立走 `else`（没有 `sourceHandle` 的出边就是 `else`）；还没写规则的 case 直接跳过。16 个比较运算符同 desktop；只有 `exists`/`not_exists`/`empty`/`not_empty` 容忍未赋值，其余读到未赋值、未声明或类型不符的变量时节点以 `condition_evaluation` 失败，不猜分支。比较值只写一个 `{{#…#}}` 时保留变量的原类型，混排时按字符串渲染。选中的分支写进运行 payload 的 `conditionDecisions`，不写节点输出，也不进变量池；启动时拒绝重复的 case id（`workflow_run_duplicate_condition_case`）和指向不存在分支的出边（`workflow_run_unknown_condition_branch`）。没走的分支上的节点不建节点行（desktop 同样不落库分支激活），运行详情返回 `conditionDecisions`，由客户端投影为“未激活分支”。
- **Aggregator**：按 desktop 的 V1 契约，按声明顺序取第一个**已赋值**的候选原样传出（键存在即算，`null`、`false`、`0`、`""`、`[]`、`{}` 都命中），写入 `{node}.output`；全部未赋值时以 `aggregator_no_match` 失败，读到未声明的候选直接失败。它不读分支决策，只看变量池。
- **Agent 结构化输出**：`outputContract.type` 为 `structured` 的 Agent，prompt 末尾追加 desktop 的输出约定（示例和 Schema）；回答按 desktop 的顺序提取 JSON 对象（整段 → 代码块 → 文中第一个完整对象），再按 Schema 子集（`type`、`properties`、`required`、`additionalProperties`、`items`）校验。通过时原回答仍是 `{node}.output`，对象写入 `{node}.structured_output`；不通过时节点以 `structured_output` 失败并保留原回答。
- **节点 Skill**：启用的个人 Skill 按启动运行的用户读取，在节点开始时冻结文档；插件 Skill 使用 `namespace/identifier`，必须有目标项目当前安装版本的成功回执。启动 Agent 前，仅将所选导入放到运行目录的 `.opencode/skills`、`.claude/skills`，并在 prompt 中要求读取。插件选择包含该包内全部 Skill；下一节点替换上一个节点的投影，未选择的导入不会自动继承。项目自带的技能保留，同名冲突、已修改的投影文档、缺失包或失效回执会让节点失败，不覆盖或静默略过。节点 payload 的 `skills` 记录所选标识，执行会话保留冻结的文档和插件版本。
- **MCP 尚不支持**：当前固定 Node 的 `AgentSessionSpec` 不接收 MCP 服务配置，v2 没有凭据交付、服务生命周期和工具调用回执链路。Agent 可以选择并启用 MCP，运行时忽略 MCP 绑定照常执行，并在节点结果 `payload.unapplied` 中记录 `mcp`；禁用的绑定不记为未应用，不会声称成功调用工具。
- **角色、重试与交互模式不应用**：节点 payload 的 `unapplied` 列出被忽略的配置（`role`、`retry`、`interactive`）。历史运行保存的 `skill`、`mcp` 标记仍按原样展示。
- **执行器映射**：节点的 `executor.agentCli` 匹配执行目录里执行器的 `AgentID`（`official/ora-space.opencode`、`official/ora-space.claude`），找不到时节点以 `missing_agent_ref` 失败；`modelId` 匹配该 Agent 执行器的模型 ID 或名称，找不到时退回该 Agent 的第一个（默认）执行器。成功节点的 payload 写入 `stop_reason`、实际使用的 `executor`（`id`、`agentId`、`name`、`pluginVersion`）、`model`（`id`、`name`、`requested`、`fallback`），以及按变量池渲染后的任务要求 `task`（节点尝试的 `input` 保留模板原文）。
- **重启**：启动时先把上个进程留下的所有非终态节点以 `interrupted_by_restart` 失败，运行随之失败，然后才开始服务；不重放 Agent。

容器的普通业务失败（Loop 上限、反馈/结束判断、LoopExit 结算失败、Iteration 的 `fail` 策略）只写错误消息，沿用 desktop 的轮次失败语义；初始化、计划或持久状态无效才标记 `invalid_run_payload`。Loop 子节点的 `error_detail` 归属于子节点，父节点只继承错误消息并保留自己的 payload；同轮活动兄弟节点取消时保留 `sibling_failed` 原因。

#### 八节点行为与验收入口

对照基线为 desktop [`df694c8836fc70b1c789cc7e8e523d4d5b1b6c66`](https://github.com/ora-space/desktop/tree/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66)。下表描述可执行语义；所有节点共用下文的串行派发、取消和重启边界。

| 节点 | desktop 来源 | v2 行为 | 自动化入口 |
| --- | --- | --- | --- |
| Start | [control.rs][desktop-control]、[variable_pool.rs][desktop-pool] | 按声明校验并写入运行输入、初始变量与全局值；无效输入在启动边界拒绝 | [engine_test.go](internal/workflow/engine_test.go) 的输入与启动拒绝用例；[host_test.go](internal/workflowhost/host_test.go) 的双 Agent 链 |
| Agent | [executor.rs][desktop-executor]、[structured_output.rs][desktop-structured] | 使用公共执行服务；按变量池渲染任务，传递上游结果；结构化契约验证成功才写 `structured_output`，失败保留原回答 | [host_test.go](internal/workflowhost/host_test.go) 的结果映射、结构化分流、取消与重启；[workflow-runs.spec.ts](../frontend-v2/e2e/workflow-runs.spec.ts) |
| Output | [control.rs][desktop-control] | 从当前变量池解析命名选择器，按 JSON 对象输出；缺少所需值时失败 | [engine_test.go](internal/workflow/engine_test.go) 的完整链路；[workflow-runs.spec.ts](../frontend-v2/e2e/workflow-runs.spec.ts) 的结果页与刷新 |
| Condition | [condition.rs][desktop-condition] | 首个成立的 case 胜出，否则走 else；未激活分支不建行；决定按根、Loop scope 或 Iteration 下标隔离 | [condition_test.go](internal/workflow/condition_test.go)、[branch_test.go](internal/workflow/branch_test.go)、[server-run-adapter.test.ts](../frontend-v2/src/features/chat/workflow-run/server-run-adapter.test.ts) |
| Aggregator | [aggregator.rs][desktop-aggregator] | 取声明顺序中首个已赋值候选，保留 null 与 falsy 值；无候选或选择器无效时失败 | [branch_test.go](internal/workflow/branch_test.go) 的优先级与 falsy 表；[workflow-runs.spec.ts](../frontend-v2/e2e/workflow-runs.spec.ts) 的分支汇合 |
| Loop | [loop_config.rs][desktop-loop-config]、[loop_round.rs][desktop-loop-round] | 1 基 round、每轮新池、同快照反馈、until/上限和显式导出；轮次转换原子提交，命名输出之外不隐式写变量 | [loop_runtime_test.go](internal/workflow/loop_runtime_test.go)、[containers_test.go](internal/workflowhost/containers_test.go)、[workflow-containers.spec.ts](../frontend-v2/e2e/workflow-containers.spec.ts) |
| LoopExit | [loop_exit.rs][desktop-loop-exit] | 同波次优先，不创建其他待派发兄弟行；冻结结果、取消活动兄弟并等待 session End，未确认停止不推进 | [containers_test.go](internal/workflowhost/containers_test.go) 的同波次、活动会话与迟到回调；[workflow-containers.spec.ts](../frontend-v2/e2e/workflow-containers.spec.ts) 的退出原因与结果 |
| Iteration | [node_runtime/iteration.rs][desktop-iteration] | 0 基数组下标、串行 collect、空集合、默认 50 上限、fail/continue；账本与后继原子提交，未执行 collect 不复用旧值 | [containers_test.go](internal/workflowhost/containers_test.go) 的集合边界、子节点失败与缺失 collect；[workflow-containers.spec.ts](../frontend-v2/e2e/workflow-containers.spec.ts) 的逐轮会话 |

[desktop-control]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/node_runtime/control.rs
[desktop-pool]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/variable_pool.rs
[desktop-executor]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/backend/src/workflow/run/executor.rs
[desktop-structured]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/structured_output.rs
[desktop-condition]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/condition.rs
[desktop-aggregator]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/aggregator.rs
[desktop-loop-config]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/loop_config.rs
[desktop-loop-round]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/db/src/repository/workflow_run_engine/loop_round.rs
[desktop-loop-exit]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/backend/src/workflow/run/executor/loop_exit.rs
[desktop-iteration]: https://github.com/ora-space/desktop/blob/df694c8836fc70b1c789cc7e8e523d4d5b1b6c66/crates/application/src/workflow_run/engine/node_runtime/iteration.rs

领域测试验证纯规则；`workflowhost` 用真实 PostgreSQL 与可控执行替身验证事务、取消和回调次序。
浏览器验收运行真实前后端；Playwright 启动 v2-server 时传 `-test-fixtures`。设置
`V2_NODE_ASSETS_DIR` 并准备 Node 资产后，以下组合通过真实 Node + fixture 执行全部八类节点，
并检查轮次选择、会话归属和失败提示：

```sh
cd frontend-v2
npm run e2e -- e2e/workflow-runs.spec.ts e2e/workflow-containers.spec.ts e2e/schedule-workflows.spec.ts
```

命令从仓库根目录运行；Node 数据目录用独立的 `V2_DATA_DIR`，并与测试数据库配对。没有 Node 资产时，真实 Agent 容器用例按条件跳过，分支用例只验收缺少执行器的失败路径，不能据此认定 Agent 和 Aggregator 的成功链路已经验证。fixture 的回答是确定性的，外部模型服务的输出稳定性不在这些测试的证据范围内。

`schedule-workflows.spec.ts` 还覆盖定时任务的“立即运行”入口：固定发布版本与初始输入，等待 occurrence 结算，在任务历史读取结果，再从对话页项目下打开同一运行，刷新后核对根变量、Loop 反馈、Iteration 逐项任务及各次尝试的会话流。这里验证的是入口合流，不代替真实时钟到点触发、进程重启或调度故障的消费侧验收。

与 desktop 的差异：

- **同一运行的 Agent 串行执行**：公共执行服务让一个运行的所有会话共用一个目录，并以 `ErrWorkspaceBusy` 拒绝并发 turn，所以执行桥按派发顺序逐个执行同一运行的 Agent；上一个 turn 收尾期间短暂的 busy 会在有限时间内重试。排在后面的 Agent 开始前先确认运行仍在执行：前面的节点已让运行失败时，它还没有启动任何东西，直接收为 `cancelled`，不再发起注定被丢弃的 turn（desktop 的兄弟节点本来就在并行执行，迟到结果照常记录；v2 串行，排队的兄弟还没开始）。
- **prompt**：按 desktop 的 `assemble_workflow_prompt` 组装 `workspace_root`、`current_workflow_step`、`workflow_context`，按运行冻结的 locale 选文案；选择 Skill 时附加 `required_skills`，不带角色和上次失败注入。节点 prompt 的 `{{#…#}}` 先按变量池渲染，渲染失败的节点以 `prompt_template` 失败，不启动 Agent。公共执行服务在接受 prompt 之后才在 Node 里克隆运行目录，也不暴露它的路径，所以 `workspace_root` 写 `.`（Agent 进程的工作目录就是运行目录），不写 desktop 的绝对路径。
- **会话绑定时机**：`Start` 返回 turn 引用即视为 prompt 已被接受，随后把 session 绑定到节点尝试（desktop 同样在 prompt 被接受后才发布绑定）；绑定被拒（尝试已不在运行）时结束该会话。turn 结束后执行桥结束会话，对话历史保留。
- **结果映射**：只有 `completed` 且答案完整（`AnswerComplete`）才可能成功，再按 desktop 的停止原因映射：`end_turn`、`max_tokens`、`max_turn_requests` 成功；`refusal` 为 `agent_refusal`；缺少停止原因为 `session_ended_without_stop_reason`；其他为 `unknown_stop_reason`。turn 失败、取消、中断或答案不完整一律以 `session` 失败，失败节点保留已有的回答。
- **取消**：先用发起运行的用户身份取消活动 turn 并等待确认，再关闭运行；Start 正在进行时先等它返回。停止未确认时返回 `503 workflow_run_stop_unconfirmed`，运行保持打开但不再推进，turn 结束后由执行桥自行关闭为已取消。
- **运行发起者持久化**：启动门禁内保存 started_by，表单默认确认人为实际发起者。会话队列仍在进程内；普通 Agent 执行重启后中断，冻结表单及提交后的确定性任务步骤可以恢复。
- **失效事件**：`workflowhost.Hub` 在每次提交的状态转移、会话绑定和取消后按运行发布一个不带数据的失效通知，供运行事件流使用；读者收到后重新读取运行，未消费的通知会合并。
- **失败后的操作**：顶栏“再跑一次”创建新的运行，再从 Start 启动；不会续跑原失败节点或恢复原运行。失败提示指向这个现有入口。
- **根作用域的并行 swift 行**：同波次一个 swift 节点失败后，另一个节点行可能仍保留 `running`，desktop 基线也有这一表现。运行本身已经失败，历史展示应以运行终态判断能否继续，不能将该行解释为仍有执行活动。Loop scope 的兄弟节点取消不受这一边界影响。
- **同轮兄弟取消的错误展示**：`sibling_failed` 以 `{"reason":"sibling_failed"}` 写入节点错误，详情会显示这段 JSON；与 desktop 相同，尚未转成面向用户的说明。
- **失败节点的执行元数据**：`executor`、`model` 和渲染后的 `task` 随成功结果写入；包括结构化契约失败在内的失败结果不承诺这些字段。原回答与错误仍保留，界面不能用配置值冒充这次实际使用的执行元数据。

### 定时触发记录基础

`internal/schedule.Next` 提供服务端时间计算；`Store.RecordOccurrence` 在事务内锁定配置、检查创建者与当前成员关系，并写入 `v2_schedule_occurrences`。记录层自身不调用执行模块；扫描和操作入口由 Host/协调器承担。

- 自动触发身份为配置 ID + scheduled + UTC 计划时刻，服务端从时刻生成键；同一时刻不因配置版本变化重复生成。
- 手动触发使用配置 ID + manual + 稳定请求键；同键同版本同请求时刻返回原记录，变更参数返回冲突；显式重跑使用新键。暂停配置允许明确的手动触发；记录层不直接执行，实际派发由协调器承担。
- 每次记录冻结配置全文和版本、计划时刻与记录时间。初始 `recorded` 只表示触发已记录，不表示已执行；已有同任务占位时直接记为 skipped。执行状态与稳定执行引用由公共执行适配层通过内部证据接口推进。
- 同一身份的重试先找已存在记录，因此后续编辑/暂停不会阻断合法重试，也不会改写历史。新自动触发要求版本仍匹配、配置启用、时间已到且符合规则；未来时刻、创建前时刻和非规则时刻被拒绝。
- 配置行锁串行化创建触发与编辑，数据库 UNIQUE 约束兜底防重复。跨租户/用户读写不可用。`Occurrences` 是内部有界分页接口（1–100条），按 `recorded_at DESC, id DESC` 时间倒序排列，游标携带上一页末项的 `(recorded_at, id)`。
- 时间统一为 PostgreSQL 支持的微秒精度；固定间隔沿创建时间锚点，日历规则跳过 DST 空缺，同一本地时刻回拨时仅记录第一次。

这一层接受显式计划时刻，不替调用方选择停机期间哪些时刻应记录。Host 保留同任务占位与重启不补跑，真实执行取决于注入的公共服务。公共 Busy 仅表示同会话/运行的上一轮仍活动，定时消费保留明确拒绝的 skipped/execution_busy，不做跨任务目录竞争或等待。结果终态与任务占位释放分开，未确认 End 前继续阻止重叠。记录防重复不等于外部执行恰好一次，公共 Session/Turn/事件仍由公共执行模块保存。

真实 PostgreSQL 测试覆盖八个并发请求返回同一个触发、不同触发各自存在、编辑后的快照不变、暂停/版本/时刻拒绝、手动重试身份、按时间倒序与同时间戳并列时的复合游标分页隔离，以及关闭数据库连接后重新读取。

- 登录：没有外部 provider，也没有 attempt 和 PKCE；dev 登录固定为一个演示用户。
- 会话存在同一个库里，只存 token 的 SHA-256；没有 Gateway 现签的内部 JWT。
- 对话与插件市场写请求检查 `Idempotency-Key`；插件市场同时保存成功响应以重放同一选择。其余写请求不检查该头，也没有执行代次隔离。定时任务配置与小队更新使用乐观版本检查，对话的创建和发消息把 `Idempotency-Key` 用作执行的 attempt ID。
- 小队权限把 workspace `owner` 角色当作工作区管理员；成员撤销不会自动关闭其小队编组（由后续接入撤销事务的运行承接）。
- 空间与插件：每个租户固定一个「演示空间」，开发登录时自动创建；里面登记两个真实安装、不可从设置页移除的 Agent 插件——`official/ora-space.opencode@0.6.11` 和 `official/ora-space.claude@0.4.5`，即 [`scripts/prepare-node.sh`](scripts/prepare-node.sh) 校验 SHA 后准备、chat、工作流与定时任务真正加载的那两个。目录来自配置的 marketplace Git 仓库，不读取仓库内硬编码条目；解析 `orax.toml`、README 和 logo，校验后事务替换 PostgreSQL 快照，同步失败或没有可见条目时保留上一版。Plugins 页对市场 Agent、Hook、MCP、合集等其他类型只浏览，不提供安装或移除（服务端拒绝新建这些选择，返回 `plugin_kind_not_installable`）；系统预装的 Agent 也只读展示「运行时预装」。Skill 就是空间选择本身，写入即可用、删除即移除，项目 Node 只按选择接收安装包，不参与状态确认。工作流插件由 v2-server 下载并校验 `.orax`，在安装事务里导入 `assets/workflows/*.json`、发布 `v1` 并记录来源幂等表；租户已有同名工作流时给新导入的定义加「（插件）」或序号，不改动已有定义；移除只清除选择，不删除工作流、快照或运行历史。安装写入口要求 owner、`Idempotency-Key` 和当前 version。
- 成员列表：`memberships` 没有成员 id、版本和加入来源，所以 `id` 直接用 user id、`version` 恒为 1、`status` 取用户状态，`joinMethod` / `joinedAt` / `actorDisplayName` 恒为空；分页参数被忽略，一页返回全部。切到正式 Cloud 的成员接口时替换。
- 启动时直接建表，没有迁移。
- 本地 Node 的传输、监督和配套服务位于 [`internal/node`](internal/node/README.md) 与
  [`internal/nodeservices`](internal/nodeservices/README.md)，通过项目 Agent driver 接入服务入口。
  配套服务只支持演示仓库的只读 Git、固定 OpenCode / Claude Code 包、各协议的 fixture，以及配置的 OpenAI / Anthropic 兼容 provider；
  Claude Code 的冻结配置没有个人 Settings（`settings_json` 为 `{}`、revision 为 0）；
  本地证书随实例创建、有效期 10 年，连续运行不会因证书到期而失效；关闭后撤销凭据，无正式 Cloud 的身份、Git 交付或证书轮换机制。
- [`internal/nodehistory`](internal/nodehistory/README.md) 将固定 Node 的历史转换为替换快照，
  只读其本地 JSONL 恢复完整结果；历史缺失、损坏或超限明确失败。提供真实 Node + PostgreSQL
  的超长回答验证；公共执行服务在 PostgreSQL 保存历史快照与终态后才 ACK Node。

定时运行的内部状态与只读核对查询见 [状态说明](internal/store/occurrence-states.md)。采用同步接收后的原身份核对：reconciling 不重派，execution_busy 不表示跨任务争抢目录，只有 End 确认后释放同任务占位。schema 只接受当前状态枚举；本层不启动执行或定时器。

### 空间插件市场

设置 → 插件保留共享官方市场，允许 owner 添加空间私有的公共 HTTPS Git 仓库。来源管理接口见 `market-sources.openapi.json`；目录和安装选择继续使用原 Cloud 客户端。自定义来源按仓库分配命名空间。同仓库的不同 URL 写法共享身份；改到另一仓库会更换命名空间并清空旧目录，改到已配置的仓库返回冲突。官方市场在后台启动首次同步，手动同步每分钟最多触发一次（超出返回 429）。每次同步只提交该来源的完整快照，失败保留上次成功内容。停用或移除来源不会删除空间选择。

自定义来源的 Git 连接和 Skill 包下载只允许访问本次解析并固定的公网地址；禁止二次请求连接其他主机、私网、保留地址和 Git 重定向。本地透明代理常用 `198.18.0.0/15` 作为 fake-IP 应答，此时只对 DNS 域名固定该代理地址，字面量同一网段地址仍拒绝。来源启用代理时，可选 `V2_MARKET_SOCKS_PROXY` 为部署信任的 SOCKS5 代理；客户端先解析并校验公网 IP，再把数字地址交给代理，避免代理重新解析到其他端点。空间不能指定代理地址。S3 凭据以 AES-256-GCM 加密，S3 来源需要部署持久提供 `V2_MARKET_CREDENTIAL_KEY`（Base64 格式的 32 字节随机密钥），备份数据库时单独保管密钥。凭据绑定到空间、来源、端点和桶，不通过读取接口返回；删除来源时会在同一事务中清空对应安装计划保存的加密凭据。自定义来源还支持 HTTPS Git 认证（用户名加令牌或密码），同样加密存库、绑定到空间和来源、读取接口只返回是否已配置（`gitConfigured`）而不返回凭据。来源的命名空间由仓库地址决定，凭据绑定在命名空间上，所以更改已保存 Git 认证的来源的仓库地址时，必须同时填写新凭据或清除旧凭据，否则返回 `market_credentials_unavailable`。同步时凭据以 `http.extraHeader` 的形式通过 git 环境注入（经 `GIT_CONFIG_COUNT` 环境变量配置），不进入仓库地址、命令行参数、日志或工作目录的 git 配置；认证失败会与网络失败区分，在来源上显示"同步失败：仓库认证失败，请检查 Git 用户名和令牌。"。

### 项目 Skill 安装

空间选择冻结 Skill 的来源、版本、目标平台和 SHA-256，已上线的项目 Node 通过 `install_plugins` / `remove_plugins` 接收并应用。状态不经过 Node：选择写入即为已安装，删除选择行即为移除，所以没有绑定项目、Node 离线或项目还没应用时，设置页和工作流节点的技能候选照常反映选择结果。历史项目绑定到同一租户的默认演示空间；创建项目可传 `spaceId`，省略则沿用默认演示空间。目录升级不会改变现有选择。成员可读项目回执；项目回执只记录交付情况，不再决定空间的已安装状态。

下载限制为公网 HTTPS、归属来源的 S3 SigV4 或直接 HTTPS；DNS 域名经本地透明代理的 fake-IP（`198.18.0.0/15`）应答时仍固定该地址，字面量地址不放宽。校验摘要和归档中的 Skill 标识、版本后，才通过节点已有的包服务交付。网络、临时 HTTP 状态、Node 中途退出等可恢复错误会按 5 秒起步、最长 5 分钟的指数退避自动重试；摘要不符、包校验失败等确定错误立即失败，并把可定位的安全摘要写入项目回执和服务端日志，不影响空间选择本身。技能在项目工作副本的 `.opencode/skills`、`.claude/skills` 中发现；已有项目文件不被覆盖。同名时市场优先：仅由 Ora 物化出来的旧用户技能目录（登记在服务自己的 exclude 标题段下）被市场链接替换，项目自带的技能保留并向服务端返回带技能名的冲突。Agent 的固定运行时版本保持独立；市场 Agent、Hook、MCP 和其他未验证类型仅供浏览，不提供安装。

与 Desktop 的差异：

- Desktop 从 Agent 插件声明中发现 Skill 目录，复制到工作区并写 ownership marker；v2 固定使用 `.opencode/skills`、`.claude/skills`，以 symlink 指向该项目的 Node 内部安装目录，因此依赖当前 Node 的目录布局。
- Desktop 会先让 Agent 停下，再在会话进行中应用变化；v2 只在项目 Node 已在线且项目空闲时安装或移除。新选择要等该项目有一个会话结束后才生效，服务启动后的第一个会话也拿不到尚未应用的 Skill。

测试真实 Node 时设置 `V2_NODE_ASSETS_DIR`、`V2_TEST_SKILL_ARCHIVE`（官方 Matt Pocock Skills 1.3.1）和可选的 `V2_TEST_SKILL_UPDATE_ARCHIVE`（1.3.2），在 Linux 原生、路径足够短的用户目录下运行 `go test -run TestRealMarketSkillNode ./internal/agentruntime`。该测试用真实 OpenCode 读取插件 Skill 和工作流所选个人 Skill，并验证下一节点清除两者；模型响应仍为 fixture，不验证真实模型的指令遵循能力。

同时提供 `TEST_DATABASE_URL` 后，`go test -race -run TestRealWorkflowSelectedSkills ./internal/workflowhost` 覆盖发布后的完整两节点工作流：真实插件安装回执、节点选择、执行会话的数据库快照、Agent 读取产物与下一节点清理。模型请求仍由 fixture 提供，MCP 不在该测试范围内。

## 动态表单与巡检提单

`form` 负责冻结证据并等待确认，`createTasks` 根据确认结果创建或关联任务；二者使用 `workflows.openapi.json` 中的 v2 契约。表单的 GET/PUT/POST `/api/v2/tenants/{tid}/workflow-runs/{rid}/form` 与 POST `…/form/retry` 属于正式 Cloud 尚未提供的候选接口。行为、权限、幂等、去重与恢复边界见 [动态表单说明](internal/workflowforms/README.md)。等待确认的轮次不占用下一晚的自动执行资格，但仍保留未完成状态和终态跟踪。DTS 只有前端演示回执，不代表外部工单已提交。

任务时间轴中的 `TaskRun.demoSeed` 明确区分未执行的预置历史样例。它依据 seed 专用会话身份与启动键的一致关系投影，既有样例也会标记，不需要数据迁移；实际运行即使使用 fixture 模型也为 false。团队概览排除这类样例的运行数和 Agent 产出，会话分析仍保留样例以供检查。
