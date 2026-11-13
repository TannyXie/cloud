# 固定 Node 执行适配

`Driver` 接收已入库的 `execution.Session` / `Turn`，连接 desktop `dcff8afe418c19184f1c7dca45192911aa22d232` 的真实 Node。权限、接收与目录分配、事件序号、SQL 历史及页面接口由调用方负责；本包不创建内存版业务 store，也不重放重启前的 prompt。

```go
driver, err := agentruntime.New(agentruntime.Options{
    Root: nodeRoot, AssetsDirectory: assets, GitBackend: gitBackend,
    Bindings: bindings, ResolveProject: resolveAuthorizedProject,
})
result, err := driver.Run(ctx, scope, session, turn, emit)
err = driver.End(ctx, session.ID)
err = driver.Close(ctx)
```

`ResolveProject` 返回可信镜像路径、已固定 commit 和 snapshot ref，且检查当前 Scope 的访问权。固定执行器是 `official/ora-space.opencode@0.6.11` 和 `official/ora-space.claude@0.4.5`，`Executor.Model.ID` 对应 `Bindings` 的 key，binding 的协议必须是该插件的协议（OpenCode 用 OpenAI chat completions，Claude Code 用 Anthropic Messages），否则 Run 返回 Unsupported。AssetsDirectory 必须是部署已校验的原生 Linux（x86_64 或 aarch64）Node、reaper、Deno 和固定插件包目录，架构与当前进程一致；复制可执行文件时再次校验读取的摘要，插件包按当前架构的固定 SHA-256（`nodeservices.HostOpenCodePackage` / `HostClaudePackage`）验证。

插件在项目 Node 上第一次被会话用到时才安装，安装与 checkout 并行，同一 Node 的会话共用一次安装；失败的安装可由下一个会话重试，超时则按 control 规则淘汰整个 Node 实例。Claude Code 是带声明的插件：安装时附带声明摘要，会话启动时附带冻结的 agent 配置（插件、目标、包摘要、声明指纹、协议和模型），由 Node 在发放模型授权前重新核对；v2 没有个人 Settings，配置为空、revision 为 0。

## 项目与会话

每项目一个 Node、一组 Git/插件/模型服务和一个 IPC Receive dispatcher。不同 `WorkspaceID` 对应不同 clone 执行和 checkout；同 workflow run 由上层给相同 WorkspaceID。Node 可并发接收 clone，实际 Git 步骤串行；不同 checkout 的 Agent session 可以同时运行。相同 checkout 的前一 session 必须 End 后才可交给下一 session，不能把两者同时派发到同一目录。

启动服务后仅对内置 Demo 快照提前准备一份未使用的 checkout。直接对话核对快照后独占领取，再加载用户技能；成功回复后后台补一份。预备尚未完成时要等剩余时间；并发领取时没有空余副本的对话仍单独创建。Git 操作总数不减少。重启不重用旧副本，沿用现有目录清理策略。

每个逻辑 session 只有一个物理 Agent execution。首次 Run 安装一次项目插件、准备 checkout 后 Start；正常 Append 使用 `submit_user_turn`，保留原 Agent 上下文。Agent 失败或结束后不会自动创建新 execution。共享 Node 健康时，单会话 End 不终止同项目其他会话；Node 已不可用时，End 会请求 supervisor 停止整个旧 incarnation。

项目初始化或 checkout 准备失败不永久缓存；尚未派发 Start 的失败 session 会撤销目录占用并从准备缓存移除，同一逻辑 session 可以重新准备。控制命令（包括插件安装与 clone）各自最多等待两分钟，单帧发送另有十秒上限；一次准备等待最多三分钟，失败后的停止确认另受清理调用的 context 约束。每次尝试使用新的控制 execution ID，迟到回复不会被后一次尝试接收。已收到明确失败的 clone 可重试；超时或传输断开属于执行结果不确定，整个 Node incarnation 会变为不可用，不能把它当作目录忙或只重发 clone。

后续请求在重建项目 Node 前，必须先由原 supervisor 确认旧进程树停止，并关闭旧接缝；停止未确认时保留原项目条目，返回 `ErrUnavailable`，不派发新 incarnation。确认停止后才从缓存移除原项目并按需重建，保留已有 checkout 和文件。已派发过的 Agent 不自动重放或恢复上下文；新会话可以使用重建后的 Node。正常结束的 session/Agent 与成功 checkout 条目当前保留到 Driver 关闭或进程重启，仍用于 End 幂等和 checkout 复用。

固定 Node 没有逐轮取消命令：本包的 Run context 取消会发送 EndSession，确认物理会话结束后返回；此后不能继续该物理会话。公共层调用方须据此结束有项目 session；无项目模型调用的逐轮取消属于 `modelturn`。自然完成与取消竞争时保留已经确认的实际轮次结果。

## 输出和停止确认

每个 Node execution 的 `nodehistory.Projection` 只由 dispatcher 更新。历史输出为替换式 `history_snapshot`；Hello 协商 `thread_previews` 后，Node 的 `thread_preview` 变为只含 pending 记录的 `history_preview`：不 ACK，每会话最多每 250ms 保留一条（只留最新一份，停顿前的最后一份仍会写出），内容不变时不写，写失败只丢弃这一份；定型快照照常立即写出并取代排队中的 preview。从完整本地 JSONL 验证指定 turnEnded 后才产生 `TurnEnded` / `Result`。缺失、损坏、超限或未知停止原因明确失败，preview、截断 visible_text、thought/tool 输出都不能冒充最终答案。Node 路径不提供 usage，保持 nil。

所有带 sequence 的原始 envelope 先写入项目内 `node-events.jsonl` 并 fsync；Agent 历史和轮次终态还必须等 `emit` 成功才 ACK。`emit(TurnEnded)` 须在一个事务中保留结果和终态。回调失败后不 ACK 该 session 的后续消息，并请求停止它；错误正文不外泄。日志只是原始证据，业务真相仍在 PostgreSQL。

End 等待当前 Node incarnation 的有效 `agent_session_ended`；缺字段、未知原因、错 Node / incarnation 或传输断开不能当成停止确认。项目已 dead/fatal 时，End 使用调用方 context 走 supervisor 清理；确认旧进程树停止并完成关闭后移除原项目条目，不需要另一个 Run 触发回收。停止失败或超时返回 `ErrStopUnconfirmed`，保留原项目，供后续 End 重试；上层不能释放目录或派发后继。Close 最后通过已有 Node supervisor 确认所有自有进程退出；失败可重试。目录和工具写入在正常 End/Close 后保留。

## 被切断后的重发

Agent 把被切断的模型请求当成网络失败原样重发（OpenCode 0.6.11 最多 5 次，Claude Code 0.4.5 十次以上），每次都把半截回答再流一遍。每个模型请求都套上所在轮的守卫：总上限切断后，这一轮之后的请求都在响应头前用 `RefuseCall` 拒绝；空闲超时切断后放行 1 次重发，再被空闲超时切断就同样拒绝。响应头之前和之后到时的限值一样计。同时在跑、一起被切断的请求（例如标题请求）只算一次；切断之后开始、上游 2xx 且没被切断的请求清零，其它失败（上游拒绝、连不上）不改变计数，Agent 对它们的重发归它自己的策略。Node 把失败的轮次记成 `cancelled`、不带错误文字，所以这一轮最后的请求是被限值切断的时候，结果改为失败，`FailureCode` 就是切断原因，供页面显示。

## 首次输出前的等待

会话第一轮到首个可见输出之前的等待按五段计时：`runtime`（启动项目 Node）、`workspace`（准备工作目录和技能，用上预热副本时标 `reused`）、`plugin`（等插件安装剩余部分，安装与 clone 并行，这里只算 clone 之后还要等的时间）、`agent`（从发出 `start_agent_session` 到 Node 记录会话）、`response`（从会话记录到首个思考、回答或工具调用）。每段接着上一段开始，加起来就是这段等待。

每次变化发布一条替换式 `preparation` 事件，页面实时显示并在重放时恢复。计时只用于诊断，发布失败不影响这一轮。后续轮次复用已有 Agent，不产生这类事件。

## 恢复与清理

项目目录使用稳定 ID 摘要，并在启动 Node 前 fsync `project-runtime.json` 登记。`New` 返回前调用 `Recover`，通过 `node.RecoverRuntime` 获取既有 runtime 锁、清理已识别的自有进程并确认没有未知残留；它不删 checkout、JSONL 或 Node SQLite。调用方须先完成此步骤，再把旧 SQL session 标为 ended/interrupted，之后才开放服务。未知目录、symlink、登记不一致或停止未确认都使启动失败。

`Cleanup(ctx, root)` 和 `Driver.Cleanup(ctx)` 只在所有登记目录均确认停止后删除这些目录；未知条目会使整个操作失败且不删除。调用方必须持有整个数据目录的单进程锁。镜像仓库和 PostgreSQL 历史必须位于 Root 之外。Node socket 对路径长度有限制，Root 应放在原生 Linux 短路径中；New 会在创建目录或进程前检查包含项目目录的 Node 控制 socket 完整路径，超限时提示缩短 `V2_DATA_DIR`。

## 验证

包级 `go vet` / `go test -race` 验证登记恢复、拒绝未知路径和 symlink、保留工作文件、runtime 锁及无效终态不能确认停止。

fake IPC 测试通过同一个 Receive dispatcher 覆盖控制回复、Start/Append、事件持久化与 ACK、End 终态、传输断开及准备失败重试；它不启动真实 Node 进程，不能替代下述组合验收。

本包提供 Driver 与项目解析接缝，不装配公共 Service、PostgreSQL 写入或 HTTP 入口。真实工具调用、
End 与重启后的 SQL 读回、同项目双 checkout 并发、结束一个会话后另一会话继续 Append 等组合验收，
由后续公共执行服务装配承接；本包的单元测试不代表这些完整路径已经接通。
