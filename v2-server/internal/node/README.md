# Node 本地运行时与 IPC

此包实现真实 Node v1 的 Controller 侧传输：Unix socket、四字节大端长度、`0x01` 标签、
16 MiB 帧上限、Hello 身份/版本/能力校验、串行写入、双向 heartbeat、显式事件 ACK 和关闭。
协议依据 `scripts/prepare-node.sh` 固定的 desktop 提交（`source_commit`）的 `crates/node-protocol`。

`Dial` 成功后由调用方持有 Client，始终有一个 Receive owner；Send/Ack/Close 可并发。
每帧读写有截止时间；传输过程中取消或出错会关闭连接，禁止复用半帧。Close 等 heartbeat goroutine 退出。
`Options` 来自后端部署配置，socket 位于该 Workspace 的私有目录，不能从页面请求指定。

Receive 保留 payload、operation/execution/sequence 与 ACP 扩展信息。**不会自动 ACK**：
运行时先处理并持久化事件，再 Ack 原始坐标；发送成功不等于 Node 已接收业务命令或执行完成。
`Options.ThreadPreviews` 在 Hello 里请求实时 `thread_preview`；Node 只在同时具备 `agent_session` 时同意，
`Client.ThreadPreviews` 报告协商结果。未协商时 Receive 丢弃 Node 发来的 preview；Node 未经请求就同意则握手失败。
Node 执行流序号与页面的 session 事件序号是两种坐标，后续持久化适配负责对应。

## 验证

在 Linux/WSL（x86_64 或 aarch64）的原生文件系统中准备固定资产（需要 Rust 1.95.0、本机架构的 Deno 2.9.5、Python 3.11+、curl）：

```sh
DESKTOP_REPOSITORY=/path/to/desktop task v2:node:prepare
V2_NODE_TEST_BIN_DIR="$HOME/.cache/ora-v2-node/bin" task v2:node:test
```

准备命令从固定 commit 导出源码，不改原 checkout，预构建 `ora-node` 和 `ora-reaper`，并按本机架构下载、校验固定 OpenCode 0.6.11 包摘要。资源目录只对准备它的架构有效。
`V2_NODE_ASSETS_DIR` 可指定缓存；`V2_NODE_PROFILE` 选择构建方式，默认 `release`，设为 `debug` 时首次编译更快但运行更慢；`V2_DENO_PATH` 可指定可信的本机 Deno 安装。
assets.json 记录来源版本、构建方式（`profile`）和所有产物摘要；本地编译结果和 Deno 的摘要是本机生成，不能当作官方发布签名。
运行热路径没有编译或下载；`RuntimeOptions` 的 Asset 均要求路径和预期 SHA-256。

`go test -race ./internal/node` 包含真实 Unix socket fixture：延后 ACK、心跳、身份拒绝、
帧损坏/截断、短写、取消半帧、Close 解除阻塞和重复关闭。

真实二进制测试需另设 `V2_NODE_TEST_BIN_DIR`，目录内有未修改的 `ora-node`、
`ora-reaper`，从上述固定源码以 Rust 1.95.0 构建：

```sh
cargo build --locked -p ora-node -p ora-reaper
V2_NODE_TEST_BIN_DIR=/absolute/desktop/target/debug go test -race -run TestRealNodeHandshake -v ./internal/node
```

测试在原生 Linux/WSL home 下建立短的私有临时目录，结束后删除它。home 应位于
ext4/xfs/btrfs 等原生文件系统，路径要短：Node 控制 socket 的完整路径必须短于 108 字节。
容器可编译测试二进制，然后在 WSL 原生执行；未设置二进制目录时该测试明确 skip，不能算真实验证通过。

## 边界

`StartRuntime` 为每个 Workspace 接收一个短、绝对、私有的 Root。独占文件锁跨监督进程生效；
已有非运行时目录拒绝接管。启动前确认残留进程退出，保留 Node DB 和 checkout，再启动 Node。
Root 的唯一长度限制是 Node 控制 socket（`<Root>/n/control.sock`）短于 108 字节。
Node 自己执行 Git，启动时拉起同目录的 reaper（运行目录里名为 `rb`，配置里用 `reaper_program` 指明），拉不起来就不启动；
v2-server 不再启动 process host 和 guardian。升级前准备的 Root 里还有旧 host 的状态目录 `h`：
配置继续写 `host_directory`，Node 在旧 host 停掉之后删除它。
二进制复制到 Workspace 专属路径并重新校验摘要；Node 退出或 IPC 连接失效都使 Done 关闭（连接不重拨，需 Stop 后重新启动），由业务层记录 interrupted，
不自动重放 prompt。调用方正常结束时先发 EndSession 收齐终态，再 Stop。

Stop 先停 Node，再按可执行文件路径清理残留：Node 被强杀后 reaper 还会存活片刻（终止登记的进程组后自己退出），
清理把它算作本 Root 的进程；升级前的 Root 里可能还有旧的 host、guardian 进程，名单里同样保留它们。残留清理用 Linux pidfd，避免 PID 重用误杀；
只信号本 Root 专属可执行文件，归属不明、cwd 仍在 Root 内的进程先等一个宽限期让它自己退出（Node 可能先于正在停止的 Agent 退出），仍在则失败并保持不可用，不按 cwd 或全局名字杀进程。
确认进程退出后只删除 Node/旧 host 目录下的 socket，数据库和仓库内容保留；清理失败可重试，成功后才释放独占锁。
依赖 `golang.org/x/sys/unix` 的 pidfd；不支持 pidfd 的系统不能假称完成残留回收。

`RecoverRuntime(ctx, root, grace)` 使用同一独占锁和进程归属检查，在不启动新 Node 的情况下确认旧进程
退出；保留 checkout、历史和数据库，完成后释放锁。上层必须先完成此恢复，再对外发布重启后的业务状态。
活动 runtime 持有锁时恢复会拒绝，不接管其他服务的运行目录。

真实测试覆盖双 Workspace 独立运行、重复监督拒绝、停止一个不影响另一个、正常重启保留文件，
杀死监督进程后由新监督进程清理残留 Node/reaper 再恢复，以及升级前的 Root 启动后旧 host 目录被删除、只有一个 reaper。
尚未装配到 v2-server；clone/插件/Agent 编排、Git/模型服务、数据库 ACK 顺序和 M4 适配继续由后续实现承接。
这些用例还不是 Agent 工具执行后的进程清理验收，低层连接取消不能直接绑定到页面观察请求。
