/**
 * 简体中文文案。与 en.js 保持同一组 key；`tp()` 在中文下会回退到
 * `.other`，但两套复数 key 都保留，便于 key 对齐检查。
 */
export default {

  "app.brand": "DecisionTrace",
  "app.tagline": "决策智能与追溯",
  "app.loading": "正在加载 DecisionTrace…",
  "app.error": "错误：{message}",

  "app.noProjects": "还没有项目。请从右上角的项目切换器创建一个。",

  "nav.sections": "页面导航",

  "nav.group.decide": "决策",
  "nav.group.execute": "执行",

  "nav.decisions": "决策",

  "nav.intake": "收集与审核",

  "language.label": "语言",

  "common.save": "保存",
  "common.saving": "保存中…",
  "common.cancel": "取消",
  "common.edit": "编辑",
  "common.delete": "删除",
  "common.deleting": "删除中…",
  "common.confirm": "确认",
  "common.confirmReject": "确认拒绝",
  "common.reject": "拒绝",

  "common.back": "返回",

  "common.loading": "加载中…",
  "common.working": "处理中…",
  "common.updating": "更新中…",

  "common.create": "创建",
  "common.creating": "创建中…",

  "common.noReason": "未填写原因。",
  "common.newestFirst": "最新在前",

  "common.title": "标题",
  "common.rationale": "理由",

  "common.optional": "可选",

  "recordForm.openDecision": "新建决策",

  "recordForm.decisionTitle": "创建决策",

  "recordForm.manualDecisionHint": "手动记录团队的决定和理由，保存后状态为已确认。",

  "recordForm.sourceDiscussion": "来源讨论编号",
  "recordForm.sourceDiscussionHint": "可在本项目的收集与审核页查看讨论编号。",

  "recordForm.titleRequired": "请填写决策标题。",
  "recordForm.rationaleRequired": "请填写决策目标（理由）。",
  "recordForm.goalNote": "决策目标，必填",

  "recordForm.invalidDiscussion": "讨论编号必须为正整数。",
  "recordForm.chooseProject": "请先选择项目，再创建记录。",
  "recordForm.decisionFailed": "创建决策失败，已保留填写内容。",

  "recordForm.decisionCreated": "决策 #{id} 已创建，可以继续添加决策。",

  "status.DONE": "已完成",
  "status.READY": "无阻塞",

  "status.CYCLIC": "处于循环依赖中",

  "project.select": "选择项目",
  "project.find": "查找项目…",
  "project.noMatch": "没有匹配“{query}”的项目。",
  "project.deleteConfirm": "删除“{name}”？",
  "project.deleteWarning": "该项目的所有记录都会被删除。",
  "project.deleteAria": "删除项目 {name}",
  "project.new": "+ 新建项目…",
  "project.newTitle": "新建项目",
  "project.name": "项目名称",
  "project.description": "描述（可选）",
  "project.create": "创建项目",
  "project.couldNotDelete": "无法删除项目。",
  "project.couldNotCreate": "无法创建项目。",

  "pagination.range": "第 {first}–{last} 条，共 {total} 条",
  "pagination.prev": "上一页",
  "pagination.next": "下一页",
  "pagination.prevAria": "上一页",
  "pagination.nextAria": "下一页",
  "pagination.pageAria": "第 {page} 页",
  "pagination.label": "{label}分页",

  "decisions.eyebrow": "决策",
  "decisions.title": "决策",
  "decisions.subtitle": "承诺必须遵守的推理，以及改变它会让什么陷入风险。",
  "decisions.unapprovedTable": "未被导师确认的决策",
  "decisions.noChain": "未建链",
  "decisions.noUnapproved": "没有未确认的决策 —— 它们都已移入执行组。",
  "decisions.cardEyebrow": "决策",
  "decisions.none": "暂无决策",
  "decisions.edit": "编辑",
  "decisions.titlePlaceholder": "标题",
  "decisions.rationalePlaceholder": "理由",
  "decisions.statusConfirmed": "已确认",
  "decisions.statusSuperseded": "已取代",
  "decisions.statusRevoked": "已撤销",
  "decisions.reasonPlaceholder": "本次变更的原因",
  "decisions.save": "保存",
  "decisions.saving": "保存中…",
  "decisions.rationale": "理由",
  "decisions.noRationale": "尚未记录理由。",
  "decisions.sourceDiscussion": "来源讨论 #{id}",

  "decisions.historyEyebrow": "变更历史",
  "decisions.historyLabel": "决策变更历史",
  "decisions.noHistory": "尚未记录变更。",
  "decisions.titleRequired": "标题不能为空",
  "decisions.rationaleRequired": "决策目标（理由）不能为空。",
  "decisions.noChanges": "没有需要保存的变更",
  "decisions.failedUpdate": "更新决策失败",

  "decisions.decidedBy": "决策人:{name}",
  "decisions.decidedByTeam": "团队决策",
  "decisions.decidedByPlaceholder": "决策人(可选)",

  "nav.chains": "决策链",
  "nav.group.execute": "执行",

  "execute.sectionDecisions": "决策列表",
  "execute.sectionTasks": "划分任务承诺",
  "execute.sectionGraph": "拓扑排序图",
  "execute.sectionProblems": "问题",

  "execute.eyebrow": "执行",
  "execute.title": "执行",
  "execute.subtitle": "已认可的链及其任务,按执行顺序排列 —— AI 检查成环、阻塞与顺序错误。",
  "execute.none": "还没有被认可的链 —— 导师先认可,任务才会出现在这里。",

  "execute.pickDecision": "选择决策",
  "execute.noDecisions": "还没有被认可的决策 —— 导师认可其链后,它们会移到这里。",
  "execute.chainOf": "链 #{id}",
  "nav.group.teacher": "导师",

  "teacher.eyebrow": "导师",
  "teacher.title": "导师看板",
  "teacher.subtitle": "各组的已提交决策链 —— 阅读、批注、做出决定。",
  "teacher.loadFailed": "加载导师看板失败",

  "teacher.noGroups": "还没有小组。",

  "teacher.awaiting": "待确认的决策",
  "teacher.noAwaiting": "没有待确认的决策。",
  "teacher.inProgress": "进行中的决策",
  "teacher.noInProgress": "还没有已认可的链。",
  "teacher.annotations": "导师批注",
  "teacher.notePlaceholder": "批注(可选,可独立于决定)",
  "teacher.annotateOnly": "只批注",
  "teacher.approve": "认可",
  "teacher.hold": "待定",
  "teacher.reject": "否定",

  "execution.taskCount": "{count} 个任务",
  "execution.none": "还没有任务 —— 导师认可后进入执行阶段。",
  "execution.loadFailed": "加载执行看板失败",
  "execution.check.cycle": "成环",
  "execution.check.blocked": "被阻塞",
  "execution.check.out_of_order": "顺序错误",

  "execution.ownerPlaceholder": "谁来做",
  "execution.descriptionPlaceholder": "做什么",
  "execution.add": "添加任务",
  "execution.noProblems": "没有问题 —— 执行顺序成立。",

  "candidates.reviewMine": "只看我的:",

  "chains.eyebrow": "决策",
  "chains.title": "决策链",
  "chains.subtitle": "一个主题一条链:决策、围绕它的讨论、以及后续决策。讨论成熟后提交给导师。",
  "chains.pickDecision": "选择一条决策开始建链",
  "chains.new": "新建链",
  "chains.none": "还没有链 —— 先确认一条决策,再从这里为它建链。",
  "chains.loadFailed": "加载决策链失败",
  "chains.back": "返回",
  "chains.submit": "提交导师",
  "chains.statusDraft": "讨论中",
  "chains.statusPending": "已提交",
  "chains.status.APPROVED": "已认可",
  "chains.status.REJECTED": "被否定",
  "chains.status.HELD": "待定",
  "chains.nodeIndex": "第 {index} 个决策",
  "chains.nodeCount": "{count} 个决策",
  "chains.commentCount": "{count} 条讨论",
  "chains.submittedAt": "提交于 {date}",
  "chains.commentAuthor": "你的名字",
  "chains.commentPlaceholder": "在这里讨论 —— 疑问和反对都是讨论",
  "chains.send": "发送",
  "chains.appendNode": "下一个决策",
  "chains.nodeTitlePlaceholder": "新决策(跟进或推翻)",
  "chains.nodeRationalePlaceholder": "为什么",
  "chains.nodeMakerPlaceholder": "决策人(可选)",
  "chains.append": "追加节点",
  "chains.approvedNoAppend": "导师已认可此链 —— 不能再追加决策。",

  "plan.waitingOn": "等待 {names}",
  "plan.blockedBy": "被 {names} 阻塞",

  "plan.selectStatus": "选择状态",
  "plan.changeStatus": "变更状态",
  "plan.updateStatus": "更新状态",
  "plan.statusOpen": "待开始",
  "plan.statusInProgress": "进行中",
  "plan.statusDelayed": "已延期",
  "plan.statusBlocked": "受阻",
  "plan.statusCompleted": "已完成",

  "dependencies.graphAria": "依赖关系图",

  "intake.eyebrow": "决策",
  "intake.title": "收集与审核",
  "intake.subtitle": "AI 从会议记录中提出候选；由你决定什么成为正式记录。",
  "intake.discussionsEyebrow": "讨论",
  "intake.importTitle": "导入讨论",
  "intake.titlePlaceholder": "讨论标题（例如 第 2 周同步）",
  "intake.contentPlaceholder": "在这里粘贴会议记录，或把文件拖到卡片上……",
  "intake.importFile": "导入文件",
  "intake.importing": "导入中…",
  "intake.formats": ".txt / .md / .docx / .pdf——导入的文件会保存并立即抽取",
  "intake.saveDiscussion": "保存讨论",
  "intake.noDiscussions": "尚未记录讨论。",
  "intake.discussion": "讨论 #{id}",
  "intake.extract": "抽取候选",
  "intake.extracting": "抽取中…",

  "intake.importError": "请导入 .txt、.md、.docx 或 .pdf 文件。",
  "intake.fileTooLarge": "文件超过 5 MB；请拆分后重试。",
  "intake.importFailed": "无法导入 {name}。",
  "intake.failedCreate": "创建讨论失败",
  "intake.imported": "已导入 {name}（{encoding}）——正在抽取…",

  "intake.importedOnly": "已导入 {name}（{encoding}）。",
  "intake.alreadyExisted": " · {count} 个已存在",
  "intake.extractionFailed": "抽取失败",

  "intake.nothingNewOne": "没有新候选——讨论 #{id} 的该候选已存在",
  "intake.nothingNewMany": "没有新候选——讨论 #{id} 的 {count} 个候选都已存在",
  "intake.noCandidates": "未找到候选。抽取需要类似“Bob 将在 2026-11-20 前交付 API。”的句子。",
  "intake.discussionsLabel": "讨论",

  "candidates.eyebrow": "AI 候选",
  "candidates.title": "人工审核",
  "candidates.pending": "待审核（{count}）",
  "candidates.reviewed": "已审核（{count}）",
  "candidates.pendingLabel": "待审核候选",
  "candidates.reviewedLabel": "已审核候选",
  "candidates.none": "尚无候选。请在上方保存讨论并运行抽取。",

  "candidates.duplicateBadge": "疑似重复：{ref}",
  "candidates.fromDiscussion": "来自讨论 #{id}",
  "candidates.reviewNote": "审核备注：{note}",

  "candidates.failedSave": "保存候选失败",
  "candidates.failedConfirm": "确认候选失败",

  "candidates.failedReject": "拒绝候选失败",

  "candidates.whyReject": "拒绝原因？",

  "candidates.type.DECISION": "决策",
  "candidates.type.COMMITMENT": "承诺",
  "candidates.type.DEPENDENCY": "依赖",
  "candidates.type.ARGUMENT": "论点",

};
