// Pure translation data: safe to compose without importing feature implementation.
export const workflowRunTranslations = {
  "zh-CN": {
    "workflowRun.loopExit.completed": "通过退出节点结束循环",
    "workflowRun.loopView.result": "循环结果",
    "workflowRun.loopView.overview": "本轮概览",
    "workflowRun.loopView.progress": "已开始 {{count}} 轮 / 最大 {{max}} 轮",
    "workflowRun.loopView.empty": "等待第一轮开始",
    "workflowRun.loopView.running": "运行中",
    "workflowRun.loopView.waiting": "等待人工输入",
    "workflowRun.loopView.finishing": "正在结束循环",
    "workflowRun.loopView.continue": "已完成 · 继续循环",
    "workflowRun.loopView.exit": "已完成 · 通过退出节点结束",
    "workflowRun.loopView.condition": "已完成 · 满足结束条件",
    "workflowRun.loopView.maxIterations": "达到最大轮次，继续工作流",
    "workflowRun.loopView.completed": "已完成",
    "workflowRun.loopView.failed": "失败",
    "workflowRun.loopView.cancelled": "已取消",
    "workflowRun.loopView.outputPending":
      "尚未产生最终输出，可通过对话查看执行过程。",
    "workflowRun.loopView.resultPending": "尚未生成循环导出结果",
    "workflowRun.conditionView.conditions": "分支条件",
    "workflowRun.conditionView.matched": "本轮命中",
    "workflowRun.conditionView.selected": "本轮选择：{{branch}}",
    "workflowRun.conditionView.result": "判断结果",
    "workflowRun.conditionView.else": "以上条件均不满足时进入默认分支",
    "workflowRun.conditionView.unavailable":
      "条件判断已完成；当前运行记录未提供命中的分支。",
    "workflowRun.conditionView.pending": "等待条件判断完成",
    "workflowRun.conditionView.failed": "条件判断失败",
    "workflowRun.conditionView.cancelled": "条件判断已取消",
    "workflowRun.loopView.recordedNodes": "本轮执行节点",
    "workflowRun.loopView.unexecutedNodes": "本轮未执行（{{count}}）",
    "errors.workflow_no_published_snapshot": "该工作流没有已发布的快照。",
    "errors.workflow_run_cannot_use_draft_snapshot":
      "工作流运行不能使用草稿快照。",
    "errors.workflow_run_not_found": "未找到该工作流运行。",
    "errors.workflow_run_active": "该工作流运行仍处于活动状态。",
    "errors.workflow_run_graph_parse": "工作流图解析失败。",
    "errors.workflow_run_validation": "工作流运行校验失败。",
    "errors.workflow_run_input_invalid":
      "启动变量 {{variable}} 的输入无效：{{reason}}",
    "errors.workflow_skill_not_found": "该工作流需要的技能不可用。",
    "errors.workflow_role_not_found":
      "工作流引用的角色在工作区角色目录里不存在，请先在设置的角色页新建同名角色再启动。",
    "errors.workflow_run_start_failed": "启动工作流运行失败。",
    "errors.workflow_run_not_restartable": "该工作流运行无法重新启动。",
    "errors.workflow_run_not_resumable": "该工作流运行当前无法从失败处继续。",
    "errors.workflow_snapshot_incompatible_with_resume":
      "新版本与本次运行不兼容，无法换版本续跑：{{reason}}",
    "errors.workflow_run_not_editable": "该工作流运行当前不可编辑。",
    "errors.workflow_node_not_found": "未找到该工作流节点。",
    "errors.workflow_node_not_awaiting_input":
      "该节点当前不在等待人工输入，无法完成。",
    "errors.run_owned": "只有发起这次运行的人可以操作这个节点。",
    "errors.workflow_node_session_ended": "这个节点的会话已经结束，不能继续对话。",
    "errors.workflow_node_turn_not_running": "这个节点现在没有正在执行的一轮。",
    "errors.workflow_node_incomplete":
      "本轮尚未完成，不能直接完成当前节点；请继续当前步骤或显式强制完成。",
    "errors.workflow_node_turn_changed":
      "本轮对话已变化，请刷新运行后重新确认。",
    "errors.workflow_node_output_changed":
      "本轮产出已变化，请刷新运行后重新确认。",
    "errors.workflow_node_not_diagnosable":
      "只有失败的智能体节点才能做 AI 分析。",
    "workflowRun.loading": "正在加载运行…",
    "workflowRun.unrecognizedNodes":
      "有 {{count}} 个节点的类型无法识别（{{kinds}}）。它们不是有意保留的备用节点，不会出现在执行路径里。",
    "workflowRun.placeholderTitle": "工作流运行台",
    "workflowRun.placeholderSubtitle": "运行工作区",
    "workflowRun.placeholderBody":
      "在舞台跟进当前节点，或在全图俯瞰整条执行路径。",
    "workflowRun.field.status": "状态",
    "workflowRun.field.nodes": "节点数",
    "workflowRun.field.progress": "进度",
    "workflowRun.field.currentNode": "当前节点",
    "workflowRun.field.startedAt": "开始",
    "workflowRun.field.finishedAt": "结束",
    "workflowRun.field.fileChanges": "文件改动",
    "workflowRun.progressValue": "{{done}} / {{total}}",
    "workflowRun.currentNodeIdle": "等待开始",
    "workflowRun.currentNodeDone": "已全部完成",
    "workflowRun.currentNodeCancelled": "已取消",
    "workflowRun.cancelAction": "取消运行",
    "workflowRun.startAction": "启动",
    "workflowRun.runAgainAction": "从头重新运行",
    "workflowRun.resumeFromFailure": "从失败处继续",
    "workflowRun.resume.title": "从失败处继续",
    "workflowRun.resume.description":
      "已成功的节点不会重跑。先决定失败节点改过的文件怎么处理：",
    "workflowRun.resume.keep": "保留现状（默认）",
    "workflowRun.resume.nodeFiles": "只回滚失败节点改过的文件",
    "workflowRun.resume.checkpoint": "整体回滚到检查点",
    "workflowRun.resume.nodeSummary":
      "节点 {{nodeId}}：节点记录改动 {{nodeFiles}} 个文件；自检查点以来共 {{total}} 个变化，其中 {{extra}} 个不在节点记录里（可能是失败后手工改的）",
    "workflowRun.resume.reason.no_checkpoint": "该节点没有记录检查点",
    "workflowRun.resume.reason.siblings_ran_after_checkpoint":
      "检查点之后有其他节点跑过，整体回滚会抹掉它们的成果",
    "workflowRun.resume.reason.not_resumable": "当前运行不能续跑",
    "workflowRun.resume.rollbackUnavailable.composite_region":
      "失败发生在迭代节点内部，只能保留现状或整体回滚到迭代开始前的检查点",
    "workflowRun.resume.rollbackUnavailable.no_file_changes":
      "失败节点没有记录可回滚的文件改动",
    "workflowRun.resume.compositeRestart":
      "迭代节点「{{name}}」将从第一轮重新开始",
    "workflowRun.resume.safetyNote": "回滚前会自动再存一个检查点，可以反悔。",
    "workflowRun.resume.loadingPreview": "正在读取改动…",
    "workflowRun.resume.previewFailed": "无法读取改动。",
    "workflowRun.resume.confirm": "从失败处继续",
    "workflowRun.resume.v2Description":
      "已成功的节点保留结果，不会重跑；下面的节点在同一次运行里重新执行。",
    "workflowRun.resume.startsFrom": "从这些节点继续",
    "workflowRun.resume.nodeStatus.failed": "失败",
    "workflowRun.resume.nodeStatus.cancelled": "已取消",
    "workflowRun.resume.insideContainer": "位于「{{name}}」内",
    "workflowRun.resume.restartsContainer": "「{{name}}」将从第一轮重新开始",
    "workflowRun.resume.alsoReruns": "随后重新执行",
    "workflowRun.resume.keepFiles":
      "工作区文件保持现状，不会回滚；重跑的节点在当前文件上继续工作。",
    "workflowRun.resume.loadingNodes": "正在计算要重跑的节点…",
    "workflowRun.resume.previewUnavailable": "无法读取续跑预览。",
    "workflowRun.resume.refused.run_not_ended":
      "只有失败或已取消的运行才能从失败处继续。",
    "workflowRun.resume.refused.node_running":
      "还有节点在运行：{{nodes}}。等它们结束后再继续。",
    "workflowRun.resume.refused.no_failed_node":
      "这次运行没有失败或取消的节点，可以用「再跑一次」重新运行。",
    "workflowRun.resume.refused.node_stuck":
      "节点 {{nodes}} 停在运行中，不会再结束，这次运行无法从失败处继续；请用「再跑一次」重新运行。",
    "workflowRun.resume.refused.review_form":
      "这次运行停在确认表单上，表单还没有提交，不能从失败处继续；请用「再跑一次」重新运行。",
    "workflowRun.resume.refused.run_settling":
      "上一次执行还在收尾（例如刚停止的节点还没完全结束），请稍后再试。",
    "workflowRun.resume.refused.starter_unavailable":
      "这次运行的发起人已不在团队中或账号已停用，智能体都以发起人的身份执行，无法从失败处继续；请用「再跑一次」以你的身份重新运行。",
    "workflowRun.resume.refused.review_form_retry":
      "要重跑的节点包含已经提交的确认表单，不能从失败处继续；任务创建失败了，请在确认页点击「重试任务创建」重新创建任务。",
    "workflowRun.resume.refused.review_form_submitted":
      "要重跑的节点包含已经提交的确认表单，表单不能重新填写，不能从失败处继续；请用「再跑一次」重新运行。",
    "workflowRun.resume.refused.task_handling":
      "这次运行是任务的处理运行，任务已按它的结果结算，不能从失败处继续；请回到任务页重新开始处理。",
    "workflowRun.resume.refused.task_decomposition":
      "这次运行是任务的拆分运行，拆分已按它的结果结算，不能从失败处继续；请回到任务页重新拆分。",
    "workflowRun.resume.resuming": "正在继续…",
    "workflowRun.resume.switchPublished":
      "改用当前发布版本 {{version}} 续跑（当前运行用的是 {{current}}）",
    "workflowRun.resume.snapshotReason.node_missing": "新版本删掉了节点 {{id}}",
    "workflowRun.resume.snapshotReason.node_type_changed":
      "节点 {{id}} 的类型变了",
    "workflowRun.resume.snapshotReason.start_node_changed": "开始节点变了",
    "workflowRun.resume.snapshotReason.start_variables_changed":
      "开始节点的输入变量变了",
    "workflowRun.resume.snapshotReason.variable_type_changed":
      "变量 {{id}} 的类型变了",
    "workflowRun.resume.snapshotReason.variable_missing":
      "新版本没有变量 {{id}}",
    "workflowRun.stopAction": "终止",
    "workflowRun.stopTitle": "终止此次运行？",
    "workflowRun.stopDescription":
      "将立即停止“{{name}}”的执行。已完成的节点会保留，未完成的进度无法继续。",
    "workflowRun.stopConfirmAction": "确认终止",
    "workflowRun.stopping": "终止中…",
    "workflowRun.missing": "找不到此次运行。",
    "workflowRun.viewMode.label": "运行视图",
    "workflowRun.viewMode.theater": "舞台",
    "workflowRun.viewMode.overview": "全图",
    "workflowRun.theater.path": "执行路径",
    "workflowRun.theater.topLevelPath": "顶层执行路径",
    "workflowRun.theater.iterationChipSummary":
      "{{members}} 成员 · {{rounds}} 轮",
    "workflowRun.theater.iterationSummary":
      "{{members}} 个成员 · {{rounds}} 轮",
    "workflowRun.theater.iterationMembers": "{{members}} 个成员",
    "workflowRun.theater.iterationRoundProgress": "{{done}}/{{total}} 完成",
    "workflowRun.theater.iterationNavigatorLabel":
      "{{name}}，第 {{round}}/{{total}} 轮",
    "workflowRun.theater.roundPosition": "第 {{round}}/{{total}} 轮",
    "workflowRun.theater.previousRound": "上一轮",
    "workflowRun.theater.nextRound": "下一轮",
    "workflowRun.theater.selectRound": "选择迭代轮次",
    "workflowRun.theater.roundOption": "第 {{round}} 轮",
    "workflowRun.theater.parallelGroup": "并行 {{count}}",
    "workflowRun.theater.conditionalGroup": "条件分支 {{count}}",
    "workflowRun.theater.sequentialGroup": "串行阶段",
    "workflowRun.theater.notRunThisRound": "本轮未执行",
    "workflowRun.theater.executionContext": "节点执行上下文",
    "workflowRun.theater.contextParallel": "并行 {{index}}/{{count}}",
    "workflowRun.theater.contextConditional": "条件分支 {{index}}/{{count}}",
    "workflowRun.theater.contextSequential": "串行阶段",
    "workflowRun.theater.instruction": "指令",
    "workflowRun.theater.empty": "此运行没有可展示的节点。",
    "workflowRun.theater.parallelHint":
      "{{count}} 个节点并行 · 当前 {{index}}/{{count}}，可拖拽或点选切换",
    "workflowRun.theater.parallelSwitch": "切换并行节点",
    "workflowRun.theater.parallelPrev": "上一个并行节点",
    "workflowRun.theater.parallelNext": "下一个并行节点",
    "workflowRun.theater.parallelCount": "{{count}} 并行",
    "workflowRun.theater.focusAct": "聚焦到 {{name}}",
    "workflowRun.theater.parallelDragHint": "左右拖拽切换",
    "workflowRun.theater.returnOverviewHint": "按 Esc 返回全图",
    "workflowRun.theater.inspectorHint": "点击卡片右上角按钮查看阶段详情",
    "workflowRun.theater.hitlHint": "点击卡片右上角按钮查看阶段详情",
    "workflowRun.theater.openInspector": "打开节点详情",
    "workflowRun.conversation.label": "节点会话",
    "workflowRun.conversation.open": "查看节点会话",
    "workflowRun.conversation.backToAct": "返回阶段摘要",
    "workflowRun.conversation.sessionMode": "节点会话",
    "workflowRun.conversation.nodeInput": "节点输入",
    "workflowRun.conversation.agentReply": "Agent",
    "workflowRun.conversation.inputPending":
      "节点开始运行后，输入会显示在这里。",
    "workflowRun.conversation.idle": "Agent 尚未启动",
    "workflowRun.conversation.waiting": "Agent 正在处理",
    "workflowRun.theater.outputPending": "等待输出结果",
    "workflowRun.conversation.empty": "尚无消息",
    "workflowRun.conversation.hiddenActivity": "已隐藏 {{count}} 条过程消息",
    "workflowRun.conversation.userAnchorLabel": "用户消息 {{index}}",
    "workflowRun.conversation.agentAnchorLabel": "Agent 消息 {{index}}",
    "workflowRun.result.title.succeeded": "运行完成",
    "workflowRun.result.title.failed": "运行失败",
    "workflowRun.result.title.cancelled": "已取消",
    "workflowRun.result.body.succeeded":
      "本轮工作流已成功结束。可在路径中回顾各步骤。",
    "workflowRun.result.body.failed":
      "运行在某个步骤失败后结束。打开路径查看失败节点与详情。",
    "workflowRun.result.body.cancelled":
      "运行已停止。已执行的步骤仍可在路径中回顾。",
    "workflowRun.result.showOverview": "查看全图",
    "workflowRun.result.openArtifacts": "打开最近成果",
    "workflowRun.result.pathHint":
      "点路径上的「结果」或步骤可切换回顾。",
    "workflowRun.result.pathChip": "结果",
    "workflowRun.result.finishedToastTitle": "运行已结束",
    "workflowRun.result.finishedToastDescription": "可切到舞台查看结果摘要。",
    "workflowRun.result.finishedToastAction": "查看结果",
    "workflowRun.inspector.label": "阶段详情",
    "workflowRun.inspector.title": "阶段详情",
    "workflowRun.inspector.nodeSuffix": "{{type}} · 只读",
    "workflowRun.inspector.config": "配置",
    "workflowRun.inspector.execution": "执行",
    "workflowRun.inspector.input": "输入",
    "workflowRun.inspector.output": "输出",
    "workflowRun.inspector.ioEmpty": "此步骤尚无运行时输入/输出",
    "workflowRun.inspector.ioExpand": "展开",
    "workflowRun.inspector.ioCollapse": "收起",
    "workflowRun.inspector.selectHint": "与舞台当前步骤同步",
    "workflowRun.inspector.empty": "尚未聚焦步骤",
    "workflowRun.inspector.emptyHint":
      "从上方路径选择一个节点，即可查看其设置与成果。",
    "workflowRun.inspector.collapse": "关闭阶段详情",
    "workflowRun.inspector.expand": "展开阶段详情",
    "workflowRun.inspector.resize":
      "拖拽调整阶段详情宽度；双击恢复默认；拖窄可关闭",
    "workflowRun.inspector.skillOpen": "查看 Skill「{{name}}」简介",
    "workflowRun.inspector.roleOpen": "查看角色「{{name}}」简介",
    "workflowRun.inspector.mcpOpen": "查看 MCP「{{name}}」简介",
    "workflowRun.inspector.textOpen": "查看完整{{field}}",
    "workflowRun.inspector.catalogNoDescription": "暂无简介",
    "workflowRun.inspector.retryDefault_one":
      "默认：最多重试 {{count}} 次，首次等待 {{seconds}} 秒",
    "workflowRun.inspector.retryDefault_other":
      "默认：最多重试 {{count}} 次，首次等待 {{seconds}} 秒",
    "workflowRun.inspector.retryConfigured_one":
      "最多重试 {{count}} 次，首次等待 {{seconds}} 秒",
    "workflowRun.inspector.retryConfigured_other":
      "最多重试 {{count}} 次，首次等待 {{seconds}} 秒",
    "workflowRun.inspector.retryDisabled": "已关闭",
    "workflowRun.inspector.promptInactivityTimeout": "按默认超时规则处理",
    "workflowRun.inspector.promptInactivityWait":
      "持续等待，直到完成或手动停止",
    "workflowRun.inspector.retryNone": "不重试（最多重试次数为 0）",
    "workflowRun.inspector.retryInteractive": "不重试（交互模式节点）",
    "workflowRun.inspector.saveDraft": "保存",
    "workflowRun.inspector.savingDraft": "保存中…",
    "workflowRun.inspector.discardDraft": "放弃",
    "workflowRun.loopRounds.title": "循环轮次",
    "workflowRun.loopRounds.round": "第 {{round}} 轮",
    "workflowRun.loopRounds.empty": "循环开始后会在这里显示每轮节点状态。",
    "workflowRun.artifacts.title": "成果",
    "workflowRun.artifacts.countBadge": "{{count}} 个成果",
    "workflowRun.artifacts.empty": "该步骤产出后会显示在这里。",
    "workflowRun.artifacts.kind.text": "文本",
    "workflowRun.artifacts.kind.markdown": "Markdown",
    "workflowRun.artifacts.kind.file": "文件",
    "workflowRun.artifacts.kind.diff": "Diff",
    "workflowRun.overview.label": "工作流全图俯瞰",
    "workflowRun.overview.roundBadge": "第 {{round}} 轮",
    "workflowRun.overview.regionSummary": "循环体节点：{{total}} 个",
    "workflowRun.overview.internalStart": "迭代内部开始",
    "workflowRun.overview.zoomControls": "运行画布视图控制",
    "workflowRun.overview.zoomOut": "缩小运行画布",
    "workflowRun.overview.zoomIn": "放大运行画布",
    "workflowRun.overview.fitView": "显示完整运行图",
    "workflowRun.inspector.rounds": "迭代轮次",
    "workflowRun.overview.hint": "点击节点回到舞台并聚焦该步骤",
    "workflowRun.nodeStatus.idle": "未执行",
    "workflowRun.nodeStatus.inactive": "未激活分支",
    "workflowRun.status.pending": "未运行",
    "workflowRun.status.running": "运行中",
    "workflowRun.status.awaiting_input": "等待处理",
    "workflowRun.status.retry_waiting": "等待重试",
    "workflowRun.status.session_waiting": "等待会话名额",
    "workflowRun.sessionSlotWaitHint": "运行里已有 {{limit}} 个会话未结束，其中一个结束后自动开始",
    "workflowRun.completeNode.action": "完成当前节点",
    "workflowRun.completeNode.disabledHint":
      "请等待节点回复完成后再完成当前节点。",
    "workflowRun.completeNode.blockedHint":
      "本轮没有正常结束，请在步骤卡片里继续当前步骤或仍然完成。",
    "workflowRun.stepCard.title": "当前步骤",
    "workflowRun.stepCard.readyHint": "本轮已正常结束，可以完成当前步骤。",
    "workflowRun.stepCard.readyAction": "完成并进入下一步：{{next}}",
    "workflowRun.stepCard.readyLastAction": "完成当前步骤",
    "workflowRun.stepCard.continueChat": "继续对话",
    "workflowRun.stepCard.blockedTitle": "本轮未完成",
    "workflowRun.stepCard.blockedHint":
      "需要继续当前步骤，或显式采用当前产出。",
    "workflowRun.stepCard.continueStep": "继续当前步骤",
    "workflowRun.stepCard.forceAction": "仍然完成（采用当前产出）",
    "workflowRun.stepCard.forceTitle": "仍然完成当前步骤？",
    "workflowRun.stepCard.forceDescription":
      "本轮没有正常结束，当前产出可能不完整。完成后工作流会进入下一步，并记录这次强制完成。",
    "workflowRun.stepCard.forceConfirm": "仍然完成",
    "workflowRun.stepCard.pausedBadge": "已暂停",
    "workflowRun.stepCard.waitingBadge": "等待处理",
    "workflowRun.stepCard.provisional":
      "本轮仍在收尾；点完成时会按本轮重新校验，未结束会给出原因。",
    "workflowRun.stepCard.warning.empty_output":
      "本轮没有文本输出；该节点未声明输出契约，仍可完成。",
    "workflowRun.stepCard.warning.history_integrity_gap":
      "会话历史存在缺口，本轮结果可能不完整。",
    "workflowRun.stepCard.warning.history_unavailable":
      "无法读取会话历史，本轮结果未知。",
    "workflowRun.stepCard.warning.turn_not_settled":
      "本轮还没有在等待窗口内收敛；节点可能仍在收尾，稍后刷新会重新判定。",
    "workflowRun.stepCard.nextSeparator": "、",
    "workflowRun.stepCard.continuePrompt":
      "请继续当前步骤。上一轮没有正常结束——{{reason}}\n只完成本步骤，不要执行后续节点；完成后请告诉我结果，我会在工作流界面确认完成。",
    "workflowRun.stepCard.continueReadyPrompt":
      "请继续对话，暂时不要结束当前步骤。我需要补充信息后，再在工作流界面完成这一步。",
    "workflowRun.stepCard.legacyTitle": "本步骤还没有完成快照",
    "workflowRun.stepCard.legacyHint":
      "升级前停靠的节点没有记录本轮状态。完成后端会先读取会话历史再判定：本轮未正常结束时返回原因，需要继续或显式强制完成。",
    "workflowRun.stepCard.legacyAction": "完成当前步骤",
    "workflowRun.stepCard.blocker.turn_stopped": "已停止：本轮生成被中断。",
    "workflowRun.stepCard.blocker.turn_truncated": "被截断：本轮达到输出上限。",
    "workflowRun.stepCard.blocker.turn_refused":
      "拒答：智能体没有完成本轮请求。",
    "workflowRun.stepCard.blocker.turn_unknown":
      "回合未知：没有找到本轮正常结束的记录。",
    "workflowRun.stepCard.blocker.structured_invalid":
      "结构化输出不符合：本轮输出未通过声明的结构校验。",
    "workflowRun.stepCard.blocker.output_missing":
      "没有输出：本轮没有产生声明的输出。",
    "workflowRun.hitl.panelLabel": "需要你的参与",
    "workflowRun.hitl.title": "确认本步理解",
    "workflowRun.hitl.hint": "填写后提交，工作流才会继续。",
    "workflowRun.hitl.submit": "提交并继续",
    "workflowRun.hitl.submitting": "提交中…",
    "workflowRun.hitl.required": "请填写此项",
    "workflowRun.hitl.selectPlaceholder": "请选择",
    "workflowRun.hitl.waitingNode": "当前等待：{{name}}",
    "workflowRun.hitl.multiWaiting": "{{count}} 个节点需要你的参与",
    "workflowRun.hitl.multiWaitingHint": "可任选一个节点完成确认",
    "workflowRun.hitl.gatesLabel": "待你处理的节点",
    "workflowRun.hitl.reopenTitle": "需要你的参与",
    "workflowRun.hitl.reopenAction": "打开",
    "workflowRun.hitl.collapseAction": "收起",
    "workflowRun.hitl.chooseHint": "选择一项以继续",
    "workflowRun.hitl.chooseRequired": "请选择「{{label}}」",
    "workflowRun.hitl.composerPlaceholder": "补充说明，Enter 发送…",
    "workflowRun.hitl.choiceOnlyPlaceholder": "在下方选择一项以继续",
    "workflowRun.hitl.toastTitle": "需要你参与",
    "workflowRun.hitl.toastDescription":
      "有节点在等待确认。可在全图找到暖色节点，或切到舞台处理。",
    "workflowRun.hitl.toastClarifyDescription":
      "模型在提问。可在全图找到暖色节点，或切到舞台回答。",
    "workflowRun.hitl.toastAction": "去处理",
    "workflowRun.hitl.sidebarBadge": "待参与",
    "workflowRun.hitl.kind.approval": "审批",
    "workflowRun.hitl.kind.feedback": "反馈",
    "workflowRun.hitl.kind.clarify": "提问",
    "workflowRun.hitl.modelQuestion": "模型提问",
    "workflowRun.hitl.timeoutAt": "截止 {{at}}",
    "workflowRun.status.succeeded": "成功",
    "workflowRun.status.failed": "失败",
    "workflowRun.status.cancelled": "已取消",
    "workflowRun.runPickWorkflow": "请先选择一个工作流。",
    "workflowRun.runName": "运行名称",
    "workflowRun.runNamePlaceholder": "输入运行名称",
    "workflowRun.runNamePlaceholderWithDefault": "默认：{{name}}",
    "workflowRun.runKickoffInput": "本次任务文本",
    "workflowRun.runKickoffInputPlaceholder": "输入本次运行的任务文本",
    "workflowRun.runKickoffInputHint": "留空则使用 Start 节点的默认任务文本。",
    "workflowRun.runInWorkspaceDescription":
      "将在当前工作区中创建“{{name}}”的工作流运行。",
    "workflowRun.createRun": "创建运行",
    "workflowRun.runRequiredName": "请填写运行名称。",
    "workflowRun.injectLastFailure": "节点重跑时把上次失败原因告诉智能体",
    "workflowRun.kickoffInput": "启动输入（可选）",
    "workflowRun.kickoffPlaceholder": "例如：审查当前分支的未提交改动",
    "workflowRun.startConfirm": "启动",
    "workflowRun.starting": "启动中…",
    "workflowRun.startFailed": "启动失败。",
    "workflowRun.startInputsDescription":
      "填写 Start 节点声明的变量，然后开始本次运行。",
    "workflowRun.startInputsEmpty": "此工作流没有需要填写的启动变量。",
    "workflowRun.unsupportedNodes.checking": "正在检查执行路径…",
    "workflowRun.unsupportedNodes.failed": "暂时无法检查执行路径，启动时将由服务端校验。",
    "workflowRun.unsupportedNodes.title": "有节点暂不支持运行",
    "workflowRun.unsupportedNodes.description":
      "下列节点在执行路径上，但当前版本不执行这类节点（desktop 同样不执行），启动会被拒绝。请删除或断开这些节点后发布新版本。",
    "workflowRun.unsupportedNodes.item": "「{{title}}」（{{kind}}节点）",
    "workflowRun.unsupportedNodes.kind.prompt": "提示词",
    "workflowRun.unsupportedNodes.kind.tool": "工具",
    "workflowRun.inputOptional": "可选",
    "workflowRun.inputRequired": "必填",
    "workflowRun.inputRequiredError": "请填写此项。",
    "workflowRun.selectPlaceholder": "请选择",
    "workflowRun.cancelFailed": "停止运行失败。",
    "workflowRun.rerunFailed": "重新运行失败。",
    "workflowRun.resumeFailed": "从失败处继续失败。",
    "workflowRun.errorKind.missing_agent_ref": "节点未指定智能体",
    "workflowRun.errorHint.missing_agent_ref":
      "在工作流里给该节点选择一个智能体后发布新版本",
    "workflowRun.errorKind.workflow_role_not_found": "角色不存在",
    "workflowRun.errorHint.workflow_role_not_found":
      "在工作区设置的角色页新建这个角色后，可直接从失败处继续",
    "workflowRun.errorKind.workflow_model_not_found": "模型不可用",
    "workflowRun.errorHint.workflow_model_not_found":
      "智能体当前不提供该模型，检查智能体配置或稍后重试",
    "workflowRun.errorKind.missing_agent_config": "智能体配置缺失",
    "workflowRun.errorHint.missing_agent_config":
      "检查该智能体是否仍然存在并已配置",
    "workflowRun.errorKind.invalid_run_payload": "运行的冻结数据无效",
    "workflowRun.errorHint.invalid_run_payload":
      "该运行的快照已损坏，请从头重新运行",
    "workflowRun.errorKind.prompt_template": "提示词模板无法渲染",
    "workflowRun.errorHint.prompt_template": "修正模板中引用的变量后发布新版本",
    "workflowRun.errorKind.structured_output": "结构化输出不合格",
    "workflowRun.errorHint.structured_output":
      "智能体的回复不符合输出结构；可直接续跑让它带着失败信息重试，或调整提示词/输出结构后发布新版本",
    "workflowRun.errorHintWithoutInjection.structured_output":
      "智能体的回复不符合输出结构；可直接续跑让它按原提示词重试，或调整提示词/输出结构后发布新版本",
    "workflowRun.errorKind.missing_skill_materialization": "技能未就绪",
    "workflowRun.errorHint.missing_skill_materialization":
      "重新发布工作流以重新生成技能文件",
    "workflowRun.errorKind.session_ended_without_stop_reason": "会话异常结束",
    "workflowRun.errorHint.session_ended_without_stop_reason":
      "通常是临时故障，可直接续跑",
    "workflowRun.errorKind.session_binding_rejected": "会话未能建立",
    "workflowRun.errorHint.session_binding_rejected":
      "通常是临时故障，可直接续跑",
    "workflowRun.errorKind.baseline_persist": "工作区基线保存失败",
    "workflowRun.errorHint.baseline_persist": "检查磁盘空间与权限后续跑",
    "workflowRun.errorKind.repository": "数据库操作失败",
    "workflowRun.errorHint.repository": "通常是临时故障，可直接续跑",
    "workflowRun.errorKind.session": "智能体会话失败",
    "workflowRun.errorHint.session": "检查智能体进程与网络后续跑",
    "workflowRun.errorKind.interactive_session": "交互会话未能建立",
    "workflowRun.errorHint.interactive_session":
      "交互节点不会自动重试；可在顶部点击「从失败处继续」重跑这个节点，或点击「再跑一次」创建新运行",
    "workflowRun.errorKind.interactive_session.checkout_unknown":
      "Node 已不认识本运行的 checkout",
    "workflowRun.errorHint.interactive_session.checkout_unknown":
      "本运行重启后，Node 丢失了这次 checkout 的 clone 记录，交互节点的会话没有开始过；从失败处继续会在新的 clone 上开始，之前节点已完成的改动仍保留",
    "workflowRun.errorKind.interactive_session.workspace_gone": "工作区已不存在",
    "workflowRun.errorHint.interactive_session.workspace_gone":
      "交互节点的工作区已丢失，会话无法继续；从失败处继续会在新的 clone 上重新开始，之前的改动不会保留",
    "workflowRun.errorKind.interactive_session.setup_refused": "交互会话未能建立",
    "workflowRun.errorHint.interactive_session.setup_refused":
      "智能体拒绝了本次会话（通常是模型配置、智能体进程或网络问题），交互节点不会自动重试；修复后从失败处继续",
    "workflowRun.errorServerDetail": "服务端原因",
    "workflowRun.errorServerDetailHint":
      "以下为服务端返回的原始原因，通常用于排查，不一定需要理解。",
    "workflowRun.errorKind.starter_unavailable": "运行的发起人已不可用",
    "workflowRun.errorHint.starter_unavailable":
      "发起人已不在团队中或账号已停用，智能体以发起人的身份执行，不会自动重试；请用「再跑一次」重新运行",
    "workflowRun.errorKind.agent_refusal": "智能体拒绝了请求",
    "workflowRun.errorHint.agent_refusal":
      "智能体拒绝了请求；可直接续跑让它带着失败信息重试，或调整提示词后发布新版本",
    "workflowRun.errorHintWithoutInjection.agent_refusal":
      "智能体拒绝了请求；可直接续跑让它按原提示词重试，或调整提示词后发布新版本",
    "workflowRun.errorKind.unknown_stop_reason": "未知的停止原因",
    "workflowRun.errorHint.unknown_stop_reason":
      "智能体以本版本 Ora 不认识的方式停止，请升级 Ora 或更换智能体",
    "workflowRun.errorKind.interrupted_by_restart": "被应用重启打断",
    "workflowRun.errorHint.interrupted_by_restart":
      "应用重启时该节点仍在运行，可直接续跑",
    "workflowRun.errorKind.multiple_outputs": "多个输出节点同时完成",
    "workflowRun.errorHint.multiple_outputs":
      "工作流结构有误，修正分支后发布新版本",
    "workflowRun.errorKind.condition_evaluation": "条件无法判断",
    "workflowRun.errorHint.condition_evaluation":
      "条件引用的变量缺失或无效，修正后发布新版本",
    "workflowRun.errorAttempt": "第 {{count}} 次尝试",
    "workflowRun.errorNotResumableHint":
      "这类失败通常源于工作流本身，直接续跑很可能再次失败；建议修改工作流后重新运行。",
    "workflowRun.errorInjectedResumeHint":
      "同版本续跑时，Ora 会把这次失败的类型、原因和上次输出告诉智能体让它重试；若仍失败，再修改工作流并发布新版本。",
    "workflowRun.errorResumeWithoutInjectionHint":
      "本次运行关闭了失败信息注入：同版本续跑时，智能体不会得知这次失败的原因；若仍失败，再修改工作流并发布新版本。",
    "workflowRun.injectedFailure.title": "本次尝试注入的上次失败信息",
    "workflowRun.resumeFromTopHint":
      "可在顶部点击「从失败处继续」重跑这个节点，或点击「再跑一次」创建新运行。",
    "workflowRun.nodeFromOlderSnapshotHint":
      "此节点的结果来自本运行之前使用的版本（续跑时已切换版本）",
    "workflowRun.aiDiagnosis.run": "让 AI 分析",
    "workflowRun.aiDiagnosis.running": "AI 正在分析…",
    "workflowRun.aiDiagnosis.rerun": "重新分析",
    "workflowRun.aiDiagnosis.title": "AI 推测（{{model}}）",
    "workflowRun.aiDiagnosis.disclaimer":
      "这是模型的推测，不参与任何自动判断。",
    "workflowRun.retryWait.label":
      "等待重试（第 {{attempt}}/{{max}} 次），{{seconds}} 秒后开始",
    "workflowRun.retryWait.labelStarting":
      "等待重试（第 {{attempt}}/{{max}} 次），即将开始",
    "workflowRun.retryWait.attempt": "等待重试（第 {{attempt}}/{{max}} 次）",
    "workflowRun.retryWait.countdown": "{{seconds}} 秒后开始",
    "workflowRun.retryWait.starting": "即将开始",
    "workflowRun.retryWait.sessionPending":
      "上一次尝试失败，Ora 会自动重新运行这个节点；新一次尝试开始后，这里会显示它的会话。",
    "workflowRun.failedAttempts.title": "之前失败的尝试",
    "workflowRun.failedAttempts.replacedByRetry": "已自动重试",
    "workflowRun.failedAttempts.replacedByScheduledRetry":
      "已安排自动重试（未开始）",
    "workflowRun.failedAttempts.replacedByResume": "已手动续跑",
    "workflowRun.failedAttempts.beforeRestart": "从头重新运行前",
    "workflowRun.failedAttempts.rootCause": "底层原因",
    "workflowRun.failedAttempts.chain": "完整错误链（{{levels}} 层）",
    "workflowRun.failedAttempts.viewSession": "查看会话 · {{sessionId}}",
    "workflowRun.retry.exhausted_one": "已自动重试 {{count}} 次，仍然失败",
    "workflowRun.retry.exhausted_other": "已自动重试 {{count}} 次，仍然失败",
    "workflowRun.retry.abandoned": "运行在等待自动重试时结束，这次重试没有开始",
    "workflowRun.retry.notStarted": "这次自动重试已安排，但没有开始",
    "workflowRun.retry.kindNotRetried": "这类失败不会自动重试",
    "workflowRun.v2.executedOn": "实际执行",
    "workflowRun.v2.pluginVersion": "插件版本 {{version}}",
    "workflowRun.v2.modelDefault": "节点没有指定模型，使用了 Agent 的默认模型",
    "workflowRun.v2.modelFallback": "没有找到配置的模型「{{model}}」，使用了 Agent 的默认模型",
    "workflowRun.v2.unappliedLabel": "v2 未应用的设置",
    "workflowRun.v2.unapplied": "v2 未应用：{{settings}}",
    "workflowRun.v2.unappliedHint": "这些设置保存在工作流里，v2 执行时不生效，节点照常运行。",
    "workflowRun.v2.listSeparator": "、",
    "workflowRun.v2.setting.role": "角色",
    "workflowRun.v2.setting.skill": "Skill",
    "workflowRun.v2.setting.mcp": "MCP",
    "workflowRun.v2.setting.retry": "自动重试",
    "workflowRun.v2.setting.interactive": "交互模式",
    "workflowRun.v2.interactive.awaitingBadge": "等待输入",
    "workflowRun.v2.interactive.openHint": "等待输入：打开会话继续对话，或完成这一步",
    "workflowRun.v2.interactive.partialNote":
      "Agent 完成信号暂未支持，由发起人确认完成。停止本轮会结束这个节点的会话，停止后不能继续对话。",
    "workflowRun.v2.interactive.readOnly":
      "只有发起这次运行的人可以继续对话、停止或完成这一步，你可以查看。",
    "workflowRun.v2.interactive.composerLabel": "回复 Agent",
    "workflowRun.v2.interactive.composerPlaceholder": "继续告诉 Agent 要怎么改，Enter 发送，Shift+Enter 换行",
    "workflowRun.v2.interactive.send": "发送",
    "workflowRun.v2.interactive.stop": "停止本轮",
    "workflowRun.v2.interactive.complete": "完成",
    "workflowRun.v2.interactive.undelivered": "上一条消息未送达，请重发。",
    "workflowRun.v2.interactive.undeliveredEnded": "上一条消息未送达，会话已结束，不能重发。",
    "workflowRun.v2.interactive.restoreDraft": "重新填入",
    "workflowRun.v2.interactive.sessionEnded":
      "会话已结束（停止了本轮或 Agent 断开），不能继续对话。",
    "workflowRun.v2.interactive.confirmComplete": "确认并完成",
    "workflowRun.v2.interactive.confirmHint":
      "这是工作流发起的首轮：Agent 的回答可能是在提问。确认回答就是这一步要的结果后再完成，否则继续对话。",
    "workflowRun.v2.interactive.completeAnyway": "仍然完成",
    "workflowRun.v2.interactive.forceTitle": "仍然完成这一步？",
    "workflowRun.v2.interactive.forceBody":
      "这一步还有没满足的条件：{{blockers}}。仍然完成会采用当前产出（{{source}}）并启动后继节点，同时记录这次强制完成。",
    "workflowRun.v2.interactive.forceSource.turn_window": "这一轮的回答",
    "workflowRun.v2.interactive.forceSource.last_completed_turn": "最后一次正常结束的回答",
    "workflowRun.v2.interactive.forceSource.none": "没有回答，产出为空",
    "workflowRun.v2.interactive.forceConfirm": "仍然完成",
    "workflowRun.v2.interactive.forceCancel": "取消",
    "workflowRun.v2.interactive.blocker.turn_unconfirmed": "首轮回答待你确认。",
    "workflowRun.v2.interactive.blocker.turn_stopped": "本轮被停止，没有正常结束。",
    "workflowRun.v2.interactive.blocker.turn_truncated": "本轮被截断：达到了输出上限。",
    "workflowRun.v2.interactive.blocker.turn_refused": "Agent 拒绝了本轮请求。",
    "workflowRun.v2.interactive.blocker.turn_unknown": "本轮没有正常结束，结果未知。",
    "workflowRun.v2.interactive.blocker.structured_invalid": "回答不符合这个节点要求的结构化输出。",
    "workflowRun.v2.interactive.blocker.output_missing": "本轮没有产生输出。",
    "workflowRun.v2.interactive.blocker.file_missing": "缺少交付文件：{{path}}",
    "workflowRun.v2.interactive.blocker.file_unchanged": "交付文件没有变更：{{path}}",
    "workflowRun.v2.interactive.blockedHint": "可以继续对话让 Agent 补齐，或者「仍然完成」。",
    "workflowRun.v2.interactive.blockedEndedHint": "会话已结束，只能「仍然完成」或停止整个运行。",
    "workflowRun.v2.interactive.filesHint": "补齐或修改文件后可以再次完成。",
    "workflowRun.v2.setting.completionSignal": "智能体显式上报完成",
    "workflowRun.v2.setting.autoAcceptAgentCompletion": "自动接受智能体完成",
    "workflowRun.v2.sessionWaiting": "正在等待 Agent 的会话…",
    "workflowRun.v2.sessionRefused":
      "无法读取这个节点的实时会话；节点完成后会显示任务和回答。",
  },
  "en-US": {
    "workflowRun.loopExit.completed": "Loop ended through an exit node",
    "workflowRun.loopView.result": "Loop results",
    "workflowRun.loopView.overview": "Round overview",
    "workflowRun.loopView.progress":
      "{{count}} rounds started / maximum {{max}}",
    "workflowRun.loopView.empty": "Waiting for the first round",
    "workflowRun.loopView.running": "Running",
    "workflowRun.loopView.waiting": "Awaiting input",
    "workflowRun.loopView.finishing": "Finishing loop",
    "workflowRun.loopView.continue": "Completed · continuing",
    "workflowRun.loopView.exit": "Completed · exit node reached",
    "workflowRun.loopView.condition": "Completed · end condition met",
    "workflowRun.loopView.maxIterations":
      "Maximum rounds reached; continuing workflow",
    "workflowRun.loopView.completed": "Completed",
    "workflowRun.loopView.failed": "Failed",
    "workflowRun.loopView.cancelled": "Cancelled",
    "workflowRun.loopView.outputPending":
      "No final output yet. Open the conversation to view execution.",
    "workflowRun.loopView.resultPending": "Loop results are not available yet",
    "workflowRun.conditionView.conditions": "Branch conditions",
    "workflowRun.conditionView.matched": "Selected this round",
    "workflowRun.conditionView.selected": "Selected branch: {{branch}}",
    "workflowRun.conditionView.result": "Decision result",
    "workflowRun.conditionView.else":
      "Take the default branch when none of the conditions match",
    "workflowRun.conditionView.unavailable":
      "Evaluation completed; this run record does not expose the selected branch.",
    "workflowRun.conditionView.pending": "Waiting for condition evaluation",
    "workflowRun.conditionView.failed": "Condition evaluation failed",
    "workflowRun.conditionView.cancelled": "Condition evaluation cancelled",
    "workflowRun.loopView.recordedNodes": "Nodes executed this round",
    "workflowRun.loopView.unexecutedNodes":
      "Not executed this round ({{count}})",
    "errors.workflow_no_published_snapshot":
      "The workflow has no published snapshot.",
    "errors.workflow_run_cannot_use_draft_snapshot":
      "Workflow runs cannot use a draft snapshot.",
    "errors.workflow_run_not_found": "Workflow run not found.",
    "errors.workflow_run_active": "The workflow run is still active.",
    "errors.workflow_run_graph_parse": "Failed to parse the workflow graph.",
    "errors.workflow_run_validation": "Workflow run validation failed.",
    "errors.workflow_run_input_invalid":
      "Invalid input for start variable '{{variable}}': {{reason}}",
    "errors.workflow_skill_not_found":
      "A skill required by this workflow is unavailable.",
    "errors.workflow_role_not_found":
      "The role this workflow references is missing from the workspace's role catalog. Create it on the Roles settings page, then start the run again.",
    "errors.workflow_run_start_failed": "Failed to start the workflow run.",
    "errors.workflow_run_not_restartable":
      "The workflow run cannot be restarted.",
    "errors.workflow_run_not_resumable":
      "The workflow run cannot be resumed from failure right now.",
    "errors.workflow_snapshot_incompatible_with_resume":
      "The new version is incompatible with this run and cannot be used to resume: {{reason}}",
    "errors.workflow_run_not_editable":
      "The workflow run is not editable right now.",
    "errors.workflow_node_not_found": "Workflow node not found.",
    "errors.workflow_node_not_awaiting_input":
      "This node is not awaiting input and cannot be completed.",
    "errors.run_owned": "Only the person who started this run can act on this node.",
    "errors.workflow_node_session_ended": "This node's session has ended; the conversation cannot continue.",
    "errors.workflow_node_turn_not_running": "This node is not running a turn right now.",
    "errors.workflow_node_incomplete":
      "This turn is incomplete. Continue it or complete it with an explicit force.",
    "errors.workflow_node_turn_changed":
      "The current turn changed. Refresh the run and try again.",
    "errors.workflow_node_output_changed":
      "This turn's output changed. Refresh the run and try again.",
    "errors.workflow_node_not_diagnosable":
      "AI analysis is only available for a failed agent node.",
    "workflowRun.loading": "Loading run…",
    "workflowRun.unrecognizedNodes":
      "{{count}} nodes use an unrecognized type ({{kinds}}). They are not spare nodes kept on purpose and are left off the execution path.",
    "workflowRun.placeholderTitle": "Workflow run workspace",
    "workflowRun.placeholderSubtitle": "Run workspace",
    "workflowRun.placeholderBody":
      "Follow the focused act on Theater, or survey the full path on Overview.",
    "workflowRun.field.status": "Status",
    "workflowRun.field.nodes": "Nodes",
    "workflowRun.field.progress": "Progress",
    "workflowRun.field.currentNode": "Current node",
    "workflowRun.field.startedAt": "Started",
    "workflowRun.field.finishedAt": "Finished",
    "workflowRun.field.fileChanges": "File changes",
    "workflowRun.progressValue": "{{done}} / {{total}}",
    "workflowRun.currentNodeIdle": "Waiting to start",
    "workflowRun.currentNodeDone": "All nodes finished",
    "workflowRun.currentNodeCancelled": "Cancelled",
    "workflowRun.cancelAction": "Cancel run",
    "workflowRun.startAction": "Start",
    "workflowRun.runAgainAction": "Run again from start",
    "workflowRun.resumeFromFailure": "Resume from failure",
    "workflowRun.resume.title": "Resume from failure",
    "workflowRun.resume.description":
      "Succeeded nodes will not run again. First decide what to do with the files the failed nodes changed:",
    "workflowRun.resume.keep": "Keep the worktree as it is (default)",
    "workflowRun.resume.nodeFiles":
      "Roll back only the files the failed nodes changed",
    "workflowRun.resume.checkpoint": "Roll back everything to the checkpoint",
    "workflowRun.resume.nodeSummary":
      "Node {{nodeId}}: the node recorded {{nodeFiles}} files; {{total}} changes since the checkpoint, {{extra}} of which are not in the node record (possibly edited by hand after the failure)",
    "workflowRun.resume.reason.no_checkpoint":
      "No checkpoint was recorded for this node",
    "workflowRun.resume.reason.siblings_ran_after_checkpoint":
      "Other nodes ran after the checkpoint; a full rollback would erase their work",
    "workflowRun.resume.reason.not_resumable": "This run cannot be resumed",
    "workflowRun.resume.rollbackUnavailable.composite_region":
      "The failure is inside an iteration; keep the worktree or roll back to the checkpoint taken before the iteration started",
    "workflowRun.resume.rollbackUnavailable.no_file_changes":
      "The failed node did not record file changes that can be rolled back",
    "workflowRun.resume.compositeRestart":
      'Iteration node "{{name}}" will restart from its first round',
    "workflowRun.resume.safetyNote":
      "A checkpoint is saved automatically before rollback, so you can undo.",
    "workflowRun.resume.loadingPreview": "Reading changes…",
    "workflowRun.resume.previewFailed": "Could not read the changes.",
    "workflowRun.resume.confirm": "Resume from failure",
    "workflowRun.resume.v2Description":
      "Succeeded nodes keep their results and do not run again; the nodes below run again in the same run.",
    "workflowRun.resume.startsFrom": "Resumes from",
    "workflowRun.resume.nodeStatus.failed": "Failed",
    "workflowRun.resume.nodeStatus.cancelled": "Cancelled",
    "workflowRun.resume.insideContainer": "inside “{{name}}”",
    "workflowRun.resume.restartsContainer": "“{{name}}” restarts from round 1",
    "workflowRun.resume.alsoReruns": "Then runs again",
    "workflowRun.resume.keepFiles":
      "Workspace files stay as they are and are not rolled back; the rerun nodes continue on the current files.",
    "workflowRun.resume.loadingNodes": "Working out which nodes run again…",
    "workflowRun.resume.previewUnavailable": "Could not read the resume preview.",
    "workflowRun.resume.refused.run_not_ended":
      "Only a failed or cancelled run can resume from failure.",
    "workflowRun.resume.refused.node_running":
      "Nodes are still running: {{nodes}}. Resume once they finish.",
    "workflowRun.resume.refused.no_failed_node":
      "This run has no failed or cancelled node; use “Run again” to run it anew.",
    "workflowRun.resume.refused.node_stuck":
      "Node {{nodes}} was left running and will never finish, so this run cannot resume; use “Run again” to run it anew.",
    "workflowRun.resume.refused.review_form":
      "This run stopped at a review form that was never submitted, so it cannot resume; use “Run again” to run it anew.",
    "workflowRun.resume.refused.run_settling":
      "The previous execution is still winding down (a stopped node has not finished ending); try again shortly.",
    "workflowRun.resume.refused.starter_unavailable":
      "The member who started this run has left the workspace or their account was disabled. Its agents run as that member, so it cannot resume; use “Run again” to run it as yourself.",
    "workflowRun.resume.refused.review_form_retry":
      "The nodes to rerun include a submitted review form, so this run cannot resume; its task creation failed, so use “Retry task creation” on the review page to create the tasks again.",
    "workflowRun.resume.refused.review_form_submitted":
      "The nodes to rerun include a submitted review form that cannot be filled again, so this run cannot resume; use “Run again” to run it anew.",
    "workflowRun.resume.refused.task_handling":
      "This is a task's handling run and the task has already settled on its outcome, so it cannot resume; start handling again from the task.",
    "workflowRun.resume.refused.task_decomposition":
      "This is a task's decomposition run and the decomposition has already settled on its outcome, so it cannot resume; decompose the task again from the task page.",
    "workflowRun.resume.resuming": "Resuming…",
    "workflowRun.resume.switchPublished":
      "Resume with the currently published version {{version}} (this run uses {{current}})",
    "workflowRun.resume.snapshotReason.node_missing":
      "The new version removed node {{id}}",
    "workflowRun.resume.snapshotReason.node_type_changed":
      "Node {{id}} changed type",
    "workflowRun.resume.snapshotReason.start_node_changed":
      "The start node changed",
    "workflowRun.resume.snapshotReason.start_variables_changed":
      "The start node's input variables changed",
    "workflowRun.resume.snapshotReason.variable_type_changed":
      "Variable {{id}} changed type",
    "workflowRun.resume.snapshotReason.variable_missing":
      "Variable {{id}} no longer exists",
    "workflowRun.stopAction": "Stop",
    "workflowRun.stopTitle": "Stop this run?",
    "workflowRun.stopDescription":
      "This immediately stops “{{name}}”. Finished nodes stay; unfinished work cannot continue.",
    "workflowRun.stopConfirmAction": "Stop run",
    "workflowRun.stopping": "Stopping…",
    "workflowRun.missing": "This run could not be found.",
    "workflowRun.viewMode.label": "Run view",
    "workflowRun.viewMode.theater": "Theater",
    "workflowRun.viewMode.overview": "Overview",
    "workflowRun.theater.path": "Execution path",
    "workflowRun.theater.topLevelPath": "Top-level execution path",
    "workflowRun.theater.iterationChipSummary":
      "{{members}} members · {{rounds}} rounds",
    "workflowRun.theater.iterationSummary":
      "{{members}} members · {{rounds}} rounds",
    "workflowRun.theater.iterationMembers": "{{members}} members",
    "workflowRun.theater.iterationRoundProgress": "{{done}}/{{total}} complete",
    "workflowRun.theater.iterationNavigatorLabel":
      "{{name}}, round {{round}} of {{total}}",
    "workflowRun.theater.roundPosition": "Round {{round}}/{{total}}",
    "workflowRun.theater.previousRound": "Previous round",
    "workflowRun.theater.nextRound": "Next round",
    "workflowRun.theater.selectRound": "Select iteration round",
    "workflowRun.theater.roundOption": "Round {{round}}",
    "workflowRun.theater.parallelGroup": "{{count}} parallel",
    "workflowRun.theater.conditionalGroup": "{{count}} conditional branches",
    "workflowRun.theater.sequentialGroup": "Sequential stage",
    "workflowRun.theater.notRunThisRound": "Not run this round",
    "workflowRun.theater.executionContext": "Node execution context",
    "workflowRun.theater.contextParallel": "Parallel {{index}}/{{count}}",
    "workflowRun.theater.contextConditional":
      "Conditional branch {{index}}/{{count}}",
    "workflowRun.theater.contextSequential": "Sequential stage",
    "workflowRun.theater.instruction": "Instruction",
    "workflowRun.theater.empty": "This run has no nodes to show.",
    "workflowRun.theater.parallelHint":
      "{{count}} in parallel · {{index}}/{{count}} — drag or pick to switch",
    "workflowRun.theater.parallelSwitch": "Switch parallel nodes",
    "workflowRun.theater.parallelPrev": "Previous parallel node",
    "workflowRun.theater.parallelNext": "Next parallel node",
    "workflowRun.theater.parallelCount": "{{count}} parallel",
    "workflowRun.theater.focusAct": "Focus {{name}}",
    "workflowRun.theater.parallelDragHint": "Drag sideways to switch",
    "workflowRun.theater.returnOverviewHint": "Press Esc for Overview",
    "workflowRun.theater.inspectorHint":
      "Use the button in the card's top-right corner to open act details",
    "workflowRun.theater.hitlHint":
      "Use the button in the card's top-right corner to open act details",
    "workflowRun.theater.openInspector": "Open node details",
    "workflowRun.conversation.label": "Node conversation",
    "workflowRun.conversation.open": "View node conversation",
    "workflowRun.conversation.backToAct": "Return to the act summary",
    "workflowRun.conversation.sessionMode": "Node conversation",
    "workflowRun.conversation.nodeInput": "Node input",
    "workflowRun.conversation.agentReply": "Agent",
    "workflowRun.conversation.inputPending":
      "Input appears here after this node starts.",
    "workflowRun.conversation.idle": "Agent has not started",
    "workflowRun.conversation.waiting": "Agent is working",
    "workflowRun.theater.outputPending": "Waiting for output",
    "workflowRun.conversation.empty": "No messages yet",
    "workflowRun.conversation.hiddenActivity":
      "{{count}} process messages hidden",
    "workflowRun.conversation.userAnchorLabel": "User message {{index}}",
    "workflowRun.conversation.agentAnchorLabel": "Agent message {{index}}",
    "workflowRun.result.title.succeeded": "Run complete",
    "workflowRun.result.title.failed": "Run failed",
    "workflowRun.result.title.cancelled": "Cancelled",
    "workflowRun.result.body.succeeded":
      "This workflow run finished successfully. Review acts on the path, or use Run again in the header.",
    "workflowRun.result.body.failed":
      "The run ended after a step failed. Open the path for the failing node and details.",
    "workflowRun.result.body.cancelled":
      "The run was stopped. Completed steps remain available on the path.",
    "workflowRun.result.showOverview": "Show Overview",
    "workflowRun.result.openArtifacts": "Open recent outcomes",
    "workflowRun.result.pathHint":
      "Use Result or a path chip to switch review; Run again stays in the header.",
    "workflowRun.result.pathChip": "Result",
    "workflowRun.result.finishedToastTitle": "Run finished",
    "workflowRun.result.finishedToastDescription":
      "Open Theater to see the result summary.",
    "workflowRun.result.finishedToastAction": "View result",
    "workflowRun.inspector.label": "Act details",
    "workflowRun.inspector.title": "Act details",
    "workflowRun.inspector.nodeSuffix": "{{type}} · read-only",
    "workflowRun.inspector.config": "Configuration",
    "workflowRun.inspector.execution": "Execution",
    "workflowRun.inspector.input": "Input",
    "workflowRun.inspector.output": "Output",
    "workflowRun.inspector.ioEmpty":
      "No runtime input/output for this step yet",
    "workflowRun.inspector.ioExpand": "Expand",
    "workflowRun.inspector.ioCollapse": "Collapse",
    "workflowRun.inspector.selectHint": "Synced with the focused stage act",
    "workflowRun.inspector.empty": "No act focused",
    "workflowRun.inspector.emptyHint":
      "Pick a step from the path above to see its settings and outcomes.",
    "workflowRun.inspector.collapse": "Close act details",
    "workflowRun.inspector.expand": "Expand act details",
    "workflowRun.inspector.resize":
      "Drag to resize act details; double-click to reset; drag narrow to close",
    "workflowRun.inspector.skillOpen": "View brief for skill “{{name}}”",
    "workflowRun.inspector.roleOpen": "View brief for role “{{name}}”",
    "workflowRun.inspector.mcpOpen": "View brief for MCP “{{name}}”",
    "workflowRun.inspector.textOpen": "View full {{field}}",
    "workflowRun.inspector.catalogNoDescription": "No description available",
    "workflowRun.inspector.retryDefault_one":
      "Default: up to {{count}} retry, first wait {{seconds}} s",
    "workflowRun.inspector.retryDefault_other":
      "Default: up to {{count}} retries, first wait {{seconds}} s",
    "workflowRun.inspector.retryConfigured_one":
      "Up to {{count}} retry, first wait {{seconds}} s",
    "workflowRun.inspector.retryConfigured_other":
      "Up to {{count}} retries, first wait {{seconds}} s",
    "workflowRun.inspector.retryDisabled": "Off",
    "workflowRun.inspector.promptInactivityTimeout":
      "Use default timeout handling",
    "workflowRun.inspector.promptInactivityWait":
      "Keep waiting until completion or manual stop",
    "workflowRun.inspector.retryNone": "Not retried (max retries is 0)",
    "workflowRun.inspector.retryInteractive": "Not retried (interactive node)",
    "workflowRun.inspector.saveDraft": "Save",
    "workflowRun.inspector.savingDraft": "Saving…",
    "workflowRun.inspector.discardDraft": "Discard",
    "workflowRun.loopRounds.title": "Loop rounds",
    "workflowRun.loopRounds.round": "Round {{round}}",
    "workflowRun.loopRounds.empty":
      "Per-round node states will appear here after the Loop starts.",
    "workflowRun.artifacts.title": "Outcomes",
    "workflowRun.artifacts.countBadge": "{{count}} outcomes",
    "workflowRun.artifacts.empty":
      "Outputs will appear here when this step produces them.",
    "workflowRun.artifacts.kind.text": "Text",
    "workflowRun.artifacts.kind.markdown": "Markdown",
    "workflowRun.artifacts.kind.file": "File",
    "workflowRun.artifacts.kind.diff": "Diff",
    "workflowRun.overview.label": "Workflow run overview",
    "workflowRun.overview.roundBadge": "Round {{round}}",
    "workflowRun.overview.regionSummary": "Region nodes: {{total}}",
    "workflowRun.overview.internalStart": "Iteration internal start",
    "workflowRun.overview.zoomControls": "Run canvas view controls",
    "workflowRun.overview.zoomOut": "Zoom out run canvas",
    "workflowRun.overview.zoomIn": "Zoom in run canvas",
    "workflowRun.overview.fitView": "Fit complete run graph",
    "workflowRun.inspector.rounds": "Iteration rounds",
    "workflowRun.overview.hint":
      "Click a node to return to Theater focused on that step",
    "workflowRun.nodeStatus.idle": "Idle",
    "workflowRun.nodeStatus.inactive": "Inactive branch",
    "workflowRun.status.pending": "Pending",
    "workflowRun.status.running": "Running",
    "workflowRun.status.awaiting_input": "Awaiting input",
    "workflowRun.status.retry_waiting": "Waiting to retry",
    "workflowRun.status.session_waiting": "Waiting for a session slot",
    "workflowRun.sessionSlotWaitHint": "The run already has {{limit}} open sessions; this node starts once one of them ends",
    "workflowRun.completeNode.action": "Complete current node",
    "workflowRun.completeNode.disabledHint":
      "Wait for the node to finish replying before completing it.",
    "workflowRun.completeNode.blockedHint":
      "This turn did not end normally. Continue it or complete it anyway from the step card.",
    "workflowRun.stepCard.title": "Current step",
    "workflowRun.stepCard.readyHint":
      "This turn ended normally. You can complete it.",
    "workflowRun.stepCard.readyAction": "Complete and continue to: {{next}}",
    "workflowRun.stepCard.readyLastAction": "Complete current step",
    "workflowRun.stepCard.continueChat": "Continue chatting",
    "workflowRun.stepCard.blockedTitle": "This turn is not complete",
    "workflowRun.stepCard.blockedHint":
      "Continue this step, or explicitly accept the current output.",
    "workflowRun.stepCard.continueStep": "Continue this step",
    "workflowRun.stepCard.forceAction": "Complete anyway (use current output)",
    "workflowRun.stepCard.forceTitle": "Complete this step anyway?",
    "workflowRun.stepCard.forceDescription":
      "This turn did not end normally and its output may be incomplete. Completing it advances the workflow and records the forced completion.",
    "workflowRun.stepCard.forceConfirm": "Complete anyway",
    "workflowRun.stepCard.pausedBadge": "Paused",
    "workflowRun.stepCard.waitingBadge": "Awaiting input",
    "workflowRun.stepCard.provisional":
      "This turn is still settling; completing re-checks it and reports a reason if it has not finished.",
    "workflowRun.stepCard.warning.empty_output":
      "This turn had no text output; the node declares no output contract, so it can still complete.",
    "workflowRun.stepCard.warning.history_integrity_gap":
      "The session history has a gap; this turn's result may be incomplete.",
    "workflowRun.stepCard.warning.history_unavailable":
      "The session history could not be read; this turn's result is unknown.",
    "workflowRun.stepCard.warning.turn_not_settled":
      "This turn has not settled inside the wait window; the node may still be finishing and the card rechecks on refresh.",
    "workflowRun.stepCard.nextSeparator": ", ",
    "workflowRun.stepCard.continuePrompt":
      "Please continue the current step. The previous turn did not end normally — {{reason}}\nOnly complete this step, do not run the next nodes; tell me the result and I will confirm completion in the workflow view.",
    "workflowRun.stepCard.continueReadyPrompt":
      "Please continue the conversation for now and do not finish this step. I will confirm completion in the workflow view after adding what is needed.",
    "workflowRun.stepCard.legacyTitle": "This step has no completion snapshot",
    "workflowRun.stepCard.legacyHint":
      "A node parked before snapshots existed recorded nothing about its turn. Completing reads the session history and applies the same gate: an unfinished turn comes back with its reason unless you force the completion.",
    "workflowRun.stepCard.legacyAction": "Complete current step",
    "workflowRun.stepCard.blocker.turn_stopped":
      "Stopped: generation was interrupted.",
    "workflowRun.stepCard.blocker.turn_truncated":
      "Truncated: the turn hit its output limit.",
    "workflowRun.stepCard.blocker.turn_refused":
      "Refused: the agent declined the requested work.",
    "workflowRun.stepCard.blocker.turn_unknown":
      "Turn unknown: no normally ended turn was found.",
    "workflowRun.stepCard.blocker.structured_invalid":
      "Structured output invalid: this turn did not match the declared schema.",
    "workflowRun.stepCard.blocker.output_missing":
      "No output: this turn produced none of the declared output.",
    "workflowRun.hitl.panelLabel": "Your input is required",
    "workflowRun.hitl.title": "Confirm this step",
    "workflowRun.hitl.hint": "Submit to continue the workflow.",
    "workflowRun.hitl.submit": "Submit and continue",
    "workflowRun.hitl.submitting": "Submitting…",
    "workflowRun.hitl.required": "This field is required",
    "workflowRun.hitl.selectPlaceholder": "Select…",
    "workflowRun.hitl.waitingNode": "Waiting on: {{name}}",
    "workflowRun.hitl.multiWaiting": "{{count}} nodes need your input",
    "workflowRun.hitl.multiWaitingHint": "You can answer any waiting node",
    "workflowRun.hitl.gatesLabel": "Waiting nodes",
    "workflowRun.hitl.reopenTitle": "Your input is required",
    "workflowRun.hitl.reopenAction": "Open",
    "workflowRun.hitl.collapseAction": "Collapse",
    "workflowRun.hitl.chooseHint": "Pick an option to continue",
    "workflowRun.hitl.chooseRequired": "Choose “{{label}}”",
    "workflowRun.hitl.composerPlaceholder": "Add a note, Enter to send…",
    "workflowRun.hitl.choiceOnlyPlaceholder":
      "Pick an option below to continue",
    "workflowRun.hitl.toastTitle": "Input needed",
    "workflowRun.hitl.toastDescription":
      "A node is waiting. Find the amber node on Overview, or switch to Theater when ready.",
    "workflowRun.hitl.toastClarifyDescription":
      "The model is asking a question. Find the amber node on Overview, or answer on Theater.",
    "workflowRun.hitl.toastAction": "Review",
    "workflowRun.hitl.sidebarBadge": "Needs you",
    "workflowRun.hitl.kind.approval": "Approval",
    "workflowRun.hitl.kind.feedback": "Feedback",
    "workflowRun.hitl.kind.clarify": "Question",
    "workflowRun.hitl.modelQuestion": "Model question",
    "workflowRun.hitl.timeoutAt": "Due {{at}}",
    "workflowRun.status.succeeded": "Succeeded",
    "workflowRun.status.failed": "Failed",
    "workflowRun.status.cancelled": "Cancelled",
    "workflowRun.runPickWorkflow": "Select a workflow first.",
    "workflowRun.runName": "Run name",
    "workflowRun.runNamePlaceholder": "Enter a run name",
    "workflowRun.runNamePlaceholderWithDefault": "Default: {{name}}",
    "workflowRun.runKickoffInput": "Task text for this run",
    "workflowRun.runKickoffInputPlaceholder":
      "Enter the task text for this run",
    "workflowRun.runKickoffInputHint":
      "Leave empty to use the Start node's default instruction.",
    "workflowRun.runInWorkspaceDescription":
      "Creates a run of “{{name}}” in the current workspace.",
    "workflowRun.createRun": "Create run",
    "workflowRun.runRequiredName": "Enter a run name.",
    "workflowRun.injectLastFailure":
      "Tell the agent why the previous attempt failed when a step runs again",
    "workflowRun.kickoffInput": "Kickoff input (optional)",
    "workflowRun.kickoffPlaceholder":
      "e.g. Review uncommitted changes on this branch",
    "workflowRun.startConfirm": "Start",
    "workflowRun.starting": "Starting…",
    "workflowRun.startFailed": "Failed to start.",
    "workflowRun.startInputsDescription":
      "Fill in the variables declared by the Start node, then begin this run.",
    "workflowRun.startInputsEmpty":
      "This workflow has no Start variables to fill in.",
    "workflowRun.unsupportedNodes.checking": "Checking the execution path…",
    "workflowRun.unsupportedNodes.failed": "The execution path could not be checked. The server will validate it when starting.",
    "workflowRun.unsupportedNodes.title": "Some nodes cannot run yet",
    "workflowRun.unsupportedNodes.description":
      "These nodes are on the execution path, but this version does not execute their kind (desktop does not either), so starting will be refused. Remove or disconnect them and publish a new version.",
    "workflowRun.unsupportedNodes.item": "“{{title}}” ({{kind}} node)",
    "workflowRun.unsupportedNodes.kind.prompt": "Prompt",
    "workflowRun.unsupportedNodes.kind.tool": "Tool",
    "workflowRun.inputOptional": "Optional",
    "workflowRun.inputRequired": "Required",
    "workflowRun.inputRequiredError": "This field is required.",
    "workflowRun.selectPlaceholder": "Select an option",
    "workflowRun.cancelFailed": "Failed to stop the run.",
    "workflowRun.rerunFailed": "Failed to run again.",
    "workflowRun.resumeFailed": "Failed to resume from failure.",
    "workflowRun.errorKind.missing_agent_ref": "Node names no agent",
    "workflowRun.errorHint.missing_agent_ref":
      "Pick an agent for this node and publish a new version",
    "workflowRun.errorKind.workflow_role_not_found": "Role not found",
    "workflowRun.errorHint.workflow_role_not_found":
      "Create this role on the workspace's Roles settings page, then resume from the failed step",
    "workflowRun.errorKind.workflow_model_not_found": "Model not available",
    "workflowRun.errorHint.workflow_model_not_found":
      "The agent does not advertise this model; check the agent config or retry later",
    "workflowRun.errorKind.missing_agent_config": "Agent configuration missing",
    "workflowRun.errorHint.missing_agent_config":
      "Check that the agent still exists and is configured",
    "workflowRun.errorKind.invalid_run_payload": "Frozen run data invalid",
    "workflowRun.errorHint.invalid_run_payload":
      "The run snapshot is corrupt; run again from start",
    "workflowRun.errorKind.prompt_template": "Prompt template cannot render",
    "workflowRun.errorHint.prompt_template":
      "Fix the variables referenced by the template and publish a new version",
    "workflowRun.errorKind.structured_output": "Structured output invalid",
    "workflowRun.errorHint.structured_output":
      "The agent's reply did not match the output schema; resume to let it retry with the failure context, or adjust the prompt/schema and publish a new version",
    "workflowRun.errorHintWithoutInjection.structured_output":
      "The agent's reply did not match the output schema; resume to let it retry with the same prompt, or adjust the prompt/schema and publish a new version",
    "workflowRun.errorKind.missing_skill_materialization":
      "Skill not materialized",
    "workflowRun.errorHint.missing_skill_materialization":
      "Republish the workflow to regenerate the skill files",
    "workflowRun.errorKind.session_ended_without_stop_reason":
      "Session ended unexpectedly",
    "workflowRun.errorHint.session_ended_without_stop_reason":
      "Usually transient; resume directly",
    "workflowRun.errorKind.session_binding_rejected": "Session could not start",
    "workflowRun.errorHint.session_binding_rejected":
      "Usually transient; resume directly",
    "workflowRun.errorKind.baseline_persist":
      "Worktree baseline could not be saved",
    "workflowRun.errorHint.baseline_persist":
      "Check disk space and permissions, then resume",
    "workflowRun.errorKind.repository": "Database operation failed",
    "workflowRun.errorHint.repository": "Usually transient; resume directly",
    "workflowRun.errorKind.session": "Agent session failed",
    "workflowRun.errorHint.session":
      "Check the agent process and network, then resume",
    "workflowRun.errorKind.interactive_session":
      "Interactive session could not start",
    "workflowRun.errorHint.interactive_session":
      "Interactive nodes never retry automatically; resume this node from the failure, or run the workflow again",
    "workflowRun.errorKind.interactive_session.checkout_unknown":
      "Node no longer knows this run's checkout",
    "workflowRun.errorHint.interactive_session.checkout_unknown":
      "After a restart, Node lost the clone record for this checkout, and the interactive node's session never started; resuming from the failure starts the node on a fresh clone. Work earlier nodes completed is kept",
    "workflowRun.errorKind.interactive_session.workspace_gone":
      "The workspace no longer exists",
    "workflowRun.errorHint.interactive_session.workspace_gone":
      "The interactive node's workspace is gone, so its session cannot continue; resuming from the failure starts over on a fresh clone, and previous changes are not kept",
    "workflowRun.errorKind.interactive_session.setup_refused":
      "Interactive session could not start",
    "workflowRun.errorHint.interactive_session.setup_refused":
      "The agent refused this session (usually a model configuration, agent process or network issue); interactive nodes never retry automatically. Fix it, then resume from the failure",
    "workflowRun.errorServerDetail": "Server reason",
    "workflowRun.errorServerDetailHint":
      "This is the raw reason the server returned, usually for debugging; it does not need to be understood.",
    "workflowRun.errorKind.starter_unavailable":
      "Run starter unavailable",
    "workflowRun.errorHint.starter_unavailable":
      "The member who started this run left the workspace or their account was disabled; agents run as that member, so this never retries automatically. Use “Run again” to run it anew",
    "workflowRun.errorKind.agent_refusal": "Agent refused the request",
    "workflowRun.errorHint.agent_refusal":
      "The agent refused; resume to let it retry with the failure context, or adjust the prompt and publish a new version",
    "workflowRun.errorHintWithoutInjection.agent_refusal":
      "The agent refused; resume to let it retry with the same prompt, or adjust the prompt and publish a new version",
    "workflowRun.errorKind.unknown_stop_reason": "Unknown stop reason",
    "workflowRun.errorHint.unknown_stop_reason":
      "The agent stopped in a way this Ora version cannot interpret; upgrade Ora or change the agent",
    "workflowRun.errorKind.interrupted_by_restart":
      "Interrupted by app restart",
    "workflowRun.errorHint.interrupted_by_restart":
      "The node was running when the app restarted; resume directly",
    "workflowRun.errorKind.multiple_outputs": "Multiple output nodes completed",
    "workflowRun.errorHint.multiple_outputs":
      "The workflow graph is wrong; fix the branches and publish a new version",
    "workflowRun.errorKind.condition_evaluation":
      "Condition could not be evaluated",
    "workflowRun.errorHint.condition_evaluation":
      "A variable used by the condition is missing or invalid; fix it and publish a new version",
    "workflowRun.errorAttempt": "Attempt {{count}}",
    "workflowRun.errorNotResumableHint":
      "This kind of failure usually comes from the workflow itself; resuming as-is will likely fail again. Edit the workflow and run it again.",
    "workflowRun.errorInjectedResumeHint":
      "Resuming on the same version tells the agent this failure's kind, reason and previous output so it can retry; if it still fails, revise the workflow and publish a new version.",
    "workflowRun.errorResumeWithoutInjectionHint":
      "This run does not pass failures to the agent: resuming on the same version will not tell it why this attempt failed; if it still fails, revise the workflow and publish a new version.",
    "workflowRun.injectedFailure.title":
      "Previous-failure context injected into this attempt",
    "workflowRun.resumeFromTopHint":
      "Use “Resume from failure” at the top to rerun this node, or “Run again” to create a new run.",
    "workflowRun.nodeFromOlderSnapshotHint":
      "This node's result comes from the version this run used before switching",
    "workflowRun.aiDiagnosis.run": "Ask AI to analyze",
    "workflowRun.aiDiagnosis.running": "AI is analyzing…",
    "workflowRun.aiDiagnosis.rerun": "Analyze again",
    "workflowRun.aiDiagnosis.title": "AI guess ({{model}})",
    "workflowRun.aiDiagnosis.disclaimer":
      "This is a model's guess and drives no automatic decision.",
    "workflowRun.retryWait.label":
      "Waiting to retry (attempt {{attempt}}/{{max}}), starts in {{seconds}}s",
    "workflowRun.retryWait.labelStarting":
      "Waiting to retry (attempt {{attempt}}/{{max}}), starting…",
    "workflowRun.retryWait.attempt":
      "Waiting to retry (attempt {{attempt}}/{{max}})",
    "workflowRun.retryWait.countdown": "starts in {{seconds}}s",
    "workflowRun.retryWait.starting": "Starting…",
    "workflowRun.retryWait.sessionPending":
      "The last attempt failed and Ora will run this node again by itself; the new attempt's session appears here once it starts.",
    "workflowRun.failedAttempts.title": "Earlier failed attempts",
    "workflowRun.failedAttempts.replacedByRetry": "Retried automatically",
    "workflowRun.failedAttempts.replacedByScheduledRetry":
      "Automatic retry scheduled (not started)",
    "workflowRun.failedAttempts.replacedByResume": "Resumed manually",
    "workflowRun.failedAttempts.beforeRestart": "Before “Run again from start”",
    "workflowRun.failedAttempts.rootCause": "Underlying error",
    "workflowRun.failedAttempts.chain": "Full error chain ({{levels}} levels)",
    "workflowRun.failedAttempts.viewSession": "View session · {{sessionId}}",
    "workflowRun.retry.exhausted_one":
      "Retried automatically {{count}} time, still failed",
    "workflowRun.retry.exhausted_other":
      "Retried automatically {{count}} times, still failed",
    "workflowRun.retry.abandoned":
      "The run ended while this node was waiting to retry, so the retry never started",
    "workflowRun.retry.notStarted":
      "This automatic retry was scheduled but never started",
    "workflowRun.retry.kindNotRetried":
      "This kind of failure is not retried automatically",
    "workflowRun.v2.executedOn": "Ran on",
    "workflowRun.v2.pluginVersion": "Plugin version {{version}}",
    "workflowRun.v2.modelDefault":
      "The node names no model, so the Agent's default model ran",
    "workflowRun.v2.modelFallback":
      "The configured model “{{model}}” was not found, so the Agent's default model ran",
    "workflowRun.v2.unappliedLabel": "Settings v2 does not apply",
    "workflowRun.v2.unapplied": "Not applied in v2: {{settings}}",
    "workflowRun.v2.unappliedHint":
      "These settings stay in the workflow; v2 runs the node without them.",
    "workflowRun.v2.listSeparator": ", ",
    "workflowRun.v2.setting.role": "Role",
    "workflowRun.v2.setting.skill": "Skill",
    "workflowRun.v2.setting.mcp": "MCP",
    "workflowRun.v2.setting.retry": "Automatic retry",
    "workflowRun.v2.setting.interactive": "Interactive mode",
    "workflowRun.v2.interactive.awaitingBadge": "Awaiting input",
    "workflowRun.v2.interactive.openHint": "Awaiting input: open the session to reply or complete this step",
    "workflowRun.v2.interactive.partialNote":
      "The agent completion signal is not supported yet, so the starter confirms completion. Stopping a turn ends this node's session, so the conversation cannot continue afterwards.",
    "workflowRun.v2.interactive.readOnly":
      "Only the person who started this run can continue, stop or complete this step; you can read it.",
    "workflowRun.v2.interactive.composerLabel": "Reply to the agent",
    "workflowRun.v2.interactive.composerPlaceholder": "Tell the agent what to change. Enter sends, Shift+Enter adds a line",
    "workflowRun.v2.interactive.send": "Send",
    "workflowRun.v2.interactive.stop": "Stop this turn",
    "workflowRun.v2.interactive.complete": "Complete",
    "workflowRun.v2.interactive.undelivered": "Your last message was not delivered. Send it again.",
    "workflowRun.v2.interactive.undeliveredEnded": "Your last message was not delivered, and the session has ended, so it cannot be sent again.",
    "workflowRun.v2.interactive.restoreDraft": "Put it back",
    "workflowRun.v2.interactive.sessionEnded":
      "The session has ended (the turn was stopped or the agent disconnected), so the conversation cannot continue.",
    "workflowRun.v2.interactive.confirmComplete": "Confirm and complete",
    "workflowRun.v2.interactive.confirmHint":
      "This is the workflow's own first turn: the agent may have ended it with a question. Complete once the answer is what this step needs, or keep talking.",
    "workflowRun.v2.interactive.completeAnyway": "Complete anyway",
    "workflowRun.v2.interactive.forceTitle": "Complete this step anyway?",
    "workflowRun.v2.interactive.forceBody":
      "This step still has unmet conditions: {{blockers}}. Completing anyway takes the current output ({{source}}), starts the next nodes and records the forced completion.",
    "workflowRun.v2.interactive.forceSource.turn_window": "this turn's answer",
    "workflowRun.v2.interactive.forceSource.last_completed_turn": "the last answer that ended normally",
    "workflowRun.v2.interactive.forceSource.none": "no answer, an empty output",
    "workflowRun.v2.interactive.forceConfirm": "Complete anyway",
    "workflowRun.v2.interactive.forceCancel": "Cancel",
    "workflowRun.v2.interactive.blocker.turn_unconfirmed": "The first turn's answer awaits your confirmation.",
    "workflowRun.v2.interactive.blocker.turn_stopped": "The turn was stopped before it ended normally.",
    "workflowRun.v2.interactive.blocker.turn_truncated": "The turn was cut at its output limit.",
    "workflowRun.v2.interactive.blocker.turn_refused": "The agent refused this turn.",
    "workflowRun.v2.interactive.blocker.turn_unknown": "The turn did not end normally; its result is unknown.",
    "workflowRun.v2.interactive.blocker.structured_invalid": "The answer does not match this node's structured output.",
    "workflowRun.v2.interactive.blocker.output_missing": "The turn produced no output.",
    "workflowRun.v2.interactive.blocker.file_missing": "Missing deliverable: {{path}}",
    "workflowRun.v2.interactive.blocker.file_unchanged": "Deliverable not changed: {{path}}",
    "workflowRun.v2.interactive.blockedHint": "Keep talking so the agent can fix it, or complete anyway.",
    "workflowRun.v2.interactive.blockedEndedHint": "The session has ended: complete anyway, or stop the whole run.",
    "workflowRun.v2.interactive.filesHint": "Add or change the files, then complete again.",
    "workflowRun.v2.setting.completionSignal": "Agent reports completion",
    "workflowRun.v2.setting.autoAcceptAgentCompletion": "Auto-accept agent completion",
    "workflowRun.v2.sessionWaiting": "Waiting for the Agent's session…",
    "workflowRun.v2.sessionRefused":
      "Could not follow this node's live session; the task and answer show once the node finishes.",
  },
} as const;
