# 项目仓库文件夹

`projectrepos.New(store, Options{Root: absolutePath})` 创建仓库服务，交给 `server.Options.Projects`。
Root 是后端配置，不接浏览器目录。`Create(ctx, scope, Input)`（租户授权由 HTTP 路由完成）同步执行一次
`git clone --mirror`，验证指定分支，创建固定 snapshot ref，最后写入 Project。
`SnapshotRef(projectID, commit)` 与固定 Node 的 clone 协议匹配；镜像路径、snapshot ref 和 commit
供执行装配读取，本模块不创建 Node 或对话目录。`main` 将本服务注入 Projects；显式未配置时 HTTP 返回
503 `projects_unavailable`。

内部 `SeedDemo(ctx, scope)` 为可信调用方准备本地演示仓库：在 Root 下生成私有临时源，
git init、提交 README、clone --mirror，按同一流程固定 snapshot 并保存 `fixture://demo` 项目。
同租户重复调用复用已有项目，不接受调用者指定的源路径；普通启动为开发登录的演示团队调用一次，
构造服务和 HTTP 请求不会自行 seed，HTTP 仍禁止 fixture/file scheme。

默认只接受无 userinfo、query、fragment 的 HTTPS 仓库地址，不接受 SSH、本地路径或凭据引用。
v2 的信任模型是本机或可信网络中的演示环境，租户成员可信。创建项目会让服务器访问成员给出的
任意 HTTPS 地址；HTTPS 不限制 host，包括私网与 loopback，DNS 也可能解析到这些地址。
当前没有连接层的目标地址隔离，不能将此服务作为面向不可信成员的仓库抓取代理。
Git 不继承用户配置、HOME、代理、SSH、askpass 或凭据 helper；不执行 hooks，不跟随 HTTP 重定向。
命令有两分钟期限、有限输出、不经 shell；错误不返回 Git stderr。测试可显式启用 AllowLoopbackHTTP，
仅允许数字 loopback HTTP 地址，生产不能启用。

创建后删除 mirror 的 origin 配置。`Sync(ctx, scope, id)` 手动把绑定的分支取进镜像：每次拉取成功写入新的
snapshot ref（只新建、不改写），再把项目的当前快照推进到新提交；每个项目同时最多一次，进行中再点共享同一次
结果。失败（分支删除、不可达、认证失败、超时）不改动当前快照，原因写入项目的 `SyncError` 供项目页显示，
不自动重试。外部分支被强推时照常跟随并标注 `SyncForcePushed`，旧快照保留。启动时 `store.ClearStaleSyncs`
把上次进程遗留的进行中同步标为中断。

私有仓库令牌（`SetRepositoryToken`/`ClearRepositoryToken`）用部署配置的密钥（`Options.CredentialKey`，来自
`V2_MARKET_CREDENTIAL_KEY`）以 AES-256-GCM 加密后随项目记录存在 PostgreSQL，附加数据绑定租户、项目和仓库
地址；明文只在执行一条外部 Git 命令时经 `http.extraHeader` 交给子进程，不进命令行、URL、镜像配置或日志。
密钥缺失时令牌操作返回错误，需要令牌的拉取失败并写明原因。

clone/分支失败不写项目并清理准备目录。数据库返回错误后保留已准备的镜像，避免连接中断时删除可能已被记录引用的目录；
这些镜像保留供管理员核对。本模块不提供删除、执行目录清理或 Agent 改动回写；重新构造服务不删除仓库。
启动入口的 `-cleanup` 只删除确认停止后的登记 Node/对话目录，保留这里的仓库 mirror。

## 契约之外

临时接口在本目录 `projects.openapi.json` 定义，并由真实 Git、PostgreSQL 与 HTTP 测试校验：

- `POST /api/v2/tenants/{tid}/projects`：name、repositoryUrl、defaultBranch、可选 repositoryToken；同步成功返回 201 和 Project。
- `GET /api/v2/tenants/{tid}/projects`：按 ID 升序分页，limit 为 1–100，after 为前页最后一个 ID。
- `GET /api/v2/tenants/{tid}/projects/{pid}`：按当前成员归属读取项目。
- `POST /api/v2/tenants/{tid}/projects/{pid}/sync`：手动同步；成功 200 返回推进后的 Project，失败 400 且快照不变。
- `PUT`/`DELETE /api/v2/tenants/{tid}/projects/{pid}/repository-token`：owner 或项目创建者更换/清除令牌。

公开 Project 只有 id、tenantId、ownerUserId、name、repositoryUrl、defaultBranch、commitId、createdAt，加上
是否配置令牌、令牌最后更换时间、上次同步时间、同步错误、强推标注和进行中标志；不公开镜像本地路径、snapshot ref
或令牌（密文与明文都不返回）。创建者由登录身份记录，同租户成员读取时不会变成读取者。

正式 `api/openapi.json` 的 v1 创建接口返回 202 + Project/Operation/main Workspace，并要求 Project.spaceId。
临时后端只有同步创建的仓库记录，且执行目录在 Start 时才建，因此不能伪造 Workspace、Space 或 Operation 来凑正式形状。
本模块不注册该 v1 创建、列表或读取接口；前端需要显式使用以上候选接口。没有修改正式 OpenAPI。
