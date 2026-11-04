# 后续开发模块分工（2026-11-02 整理）

## 背景与现状

SRS 路线图（§4）的 M3/M4/M5 核心功能已提前实现并合并进 main：

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M3 MVP v1 手动记录 | 讨论输入、决策、承诺、依赖、状态更新、影响检测、审计 | ✅ 已实现（#4–#6） |
| M4 MVP v2 AI 辅助 | LLM 提取候选 + 确认/编辑/拒绝工作流 | ✅ 已实现（#7，DeepSeek + 规则回退） |
| M5 MVP v3 图视图 | 拓扑排序、成环检测、变更/冲突场景 | ✅ 已实现（#6/#8/#9，含 CycleDialog、Consistency 视图） |

**下一课程节点：M2 设计文档（Part II）约 2026-11-15**（以 Canvas 实际日期为准）。

剩余工作分两类：**补功能缺口**（搜索、文件导入、测试）和**课程交付/评估**（设计文档、提取精度评估、可用性测试）。

---

## 模块总览

| 模块 | 内容 | 工作量 | 类型 | 依赖 |
|---|---|---|---|---|
| A | M2 设计文档（Part II 交付物） | 中 | 文档/建模 | 无 |
| B | 全文搜索（UC08） | 中 | 全栈 | 无 |
| C | 讨论文件导入（UC01 扩展） | 小 | 前端为主 | 无 |
| D | 自动化测试 | 中 | 测试 | 无 |
| E | AI 提取评估与优化 | 中 | 分析 | 无 |
| F | 可用性测试与试运行 | 小 | 沟通 | 建议在 B/C 之后 |

---

## 模块 A：M2 设计文档（Part II 交付物）⚠️ 最近截止

**目标**：把现有实现整理成课程要求的 Part II 设计文档（架构、数据模型、API、UI 设计 + 评审）。

**任务清单**：
1. 读代码整理**架构设计**：三层结构（React 前端 / FastAPI 后端 / SQLite），组件图 + 部署图（Mermaid，风格与 SRS 一致）
2. 从 `backend/app/models/` 逆向整理**数据模型**：实体关系图（Discussion/Decision/Commitment/Dependency/Candidate/历史表）
3. 整理 **API 规格**：现有 23 个端点（`backend/app/routes/` 六个 router），路径/方法/参数/响应/错误码
4. **UI 设计说明**：7 个视图（views.js 的 VIEW_GROUPS）各一段说明 + 现有截图
5. 对照 SRS §5 的用例模型做一致性评审，写出设计决策记录（为什么这么设计）

**验收标准**：文档能在团队内部评审通过；图表能直接从代码对应到文件。

**涉及文件**：新建 `docs/design/` 目录（架构图、ER 图、API 规格、UI 说明）。

---

## 模块 B：全文搜索（UC08，完全未实现）

**目标**：搜索决策历史与来源上下文。目前后端没有任何搜索端点，前端没有搜索视图。

**任务清单**：
1. 后端：新增 `backend/app/routes/search.py` → `GET /search?q=...&project_id=...`，跨 decisions（标题/理由）、commitments（描述/负责人）、discussions（标题/正文）、history（变更原因）搜索，SQLite LIKE 即可（数据量小，不必上 FTS5）
2. 结果带**来源上下文**：命中 decision 时附上理由和它来自哪条 discussion；命中 commitment 时附上所属 decision 和下游影响提示（复用 `services/graph.py`）
3. 响应用现有分页格式（`schemas/page.py` 的 `page_response`）
4. 前端：`frontend/src/views.js` 的 TRACE 组注册 `search` 视图，新建 `components/SearchPanel.jsx`（输入框 + 分组结果列表，样式参考现有卡片）
5. main.py 注册 router

**验收标准**：搜 "PostgreSQL" 能看到决策+理由+来源讨论+相关承诺；搜不存在的词返回空页不报错；结果支持分页。

**涉及文件**：`backend/app/routes/search.py`（新）、`backend/app/main.py`、`frontend/src/components/SearchPanel.jsx`（新）、`frontend/src/views.js`。

---

## 模块 C：讨论文件导入（UC01 扩展）

**目标**：现在讨论只能手动粘贴（DiscussionsPanel 的 textarea）。增加上传 .txt/.md 会议记录文件。

**任务清单**：
1. 前端：在 `DiscussionsPanel.jsx` 的 "Import a discussion" 表单加文件选择（`<input type="file" accept=".txt,.md">`），选中后读内容填入 title（用文件名）和 textarea，仍可编辑后再保存
2. 后端：`discussions.py` 的 POST 已有 title+content，可不动；若想直接上传，加 `POST /discussions/import`（multipart，限制 200KB，UTF-8 解码，坏编码给 400 和明确错误信息）
3. 保存后照常触发提取（复用现有流程）

**验收标准**：上传 README 里那三句会议记录（PostgreSQL/Carol/Bob）的 txt 文件 → 生成 discussion → 提取出候选，全流程无报错。

**涉及文件**：`frontend/src/components/DiscussionsPanel.jsx`、`backend/app/routes/discussions.py`（可选）。

---

## 模块 D：自动化测试（目前仓库零测试）

**目标**：给后端全部端点建 pytest 测试，前端建 Playwright 冒烟测试。

**任务清单**：
1. 后端 `backend/tests/`：pytest + fastapi TestClient + 临时 SQLite（内存库，不碰 `decisiontrace.db`）
   - 每个 router 一两个文件：CRUD、404、参数校验
   - 重点场景：成环校验（dependencies POST 拒绝成环）、冲突检测（consistency）、分页参数、决策/承诺历史、impact 传递闭包、候选确认工作流（提取→确认→生成正式记录）
2. 前端：Playwright 冒烟脚本（**用 `backend/.venv/Scripts/python`，系统 Python 没有 Playwright**）：7 个视图逐个打开无 console error、无页面异常
3. 输出：`backend/README` 或根 README 加一段 "如何跑测试"

**验收标准**：`pytest` 全绿；冒烟脚本全绿；测试不污染演示库（跑完 `decisiontrace.db` 内容不变）。

**涉及文件**：`backend/tests/`（新）、根 README。

---

## 模块 E：AI 提取评估与优化（M4 收尾 + Phase 5 评估）

**目标**：量化提取质量，对比规则版与 DeepSeek 版，为 Phase 5 评估报告提供数据。

**任务清单**：
1. 建评估集：写 10–20 条真实风格的会议记录片段（中英混合更好，可参考团队真实开会记录），人工标注 ground truth（应提取的决策/承诺/依赖）
2. 写评估脚本：对每条跑规则提取和 LLM 提取（`services/extractor.py` 两种后端），算 precision / recall / F1
3. 测延迟与成本：LLM 每条的平均耗时、token 消耗、估算费用（SRS §11 已有 DeepSeek 价格参考）
4. 输出：`docs/evaluation/extraction-eval.md` 报告（表格 + 结论 + 至少 3 条失败样例分析）
5. 若能改进：调整 `extractor.py` 的 prompt/规则，重新跑评估证明有提升

**验收标准**：报告有数据支撑；LLM 版比规则版在评估集上 F1 更高，或解释清楚为什么没有。

**涉及文件**：`docs/evaluation/`（新）、`backend/app/services/extractor.py`（可能小改）。

---

## 模块 F：可用性测试与试运行（Phase 5 / SWOT 的 SO 策略）

**目标**：SRS §2 承诺过可量化的可用性目标，找同学实测。

**任务清单**：
1. 按 SRS 的可用性目标设计 3–4 个测试任务（如：粘贴一段会议记录并确认一个候选 → 2 分钟内完成；找出 Bob 为什么被卡住 → 1 分钟内定位到 Consistency 视图）
2. 找 3–5 名同学（优先其他课程小组——SRS SWOT 里写的 pilot 用户策略）试运行，记录成功率、用时、卡点
3. 输出：`docs/evaluation/usability-test.md`（任务卡 + 结果表 + 改进清单）；改进项转成小 issue 或直接排进下个 sprint

**验收标准**：有真实测试记录；改进清单至少 3 条可执行项。

**涉及文件**：`docs/evaluation/`（新）。

---

## 开发规范（给队员）

1. **一个模块一个分支**：`feature/<模块名>`（如 `feature/search`），完成后提 PR 到 main（main 受保护，只能 PR 合并，squash 方式）
2. **演示库保持干净**：`backend/decisiontrace.db` 是 README 演示场景的数据，本地测试用临时库；误写后要恢复
3. **后端风格**：models/schemas/routes 按实体分文件，纯函数放 `app/services/`；前端组件放 `src/components/`
4. **跑前端**：`cd frontend && npm run dev`（:5173）；**跑后端**：`cd backend && .venv/Scripts/python -m uvicorn app.main:app --port 8000`
5. **前端验证**用 `backend/.venv/Scripts/python` 跑 Playwright（系统 Python 没有装）
6. 提交信息写清楚模块名，如 `search: add full-text search across records`

## 建议分工（供组长参考，4 人）

- 组长（王耀增）：统筹 + 模块 A（或模块 B 的后端部分）+ 代码评审
- 队友 1：模块 B（全栈搜索）
- 队友 2：模块 C + 模块 D
- 队友 3：模块 E + 模块 F

按兴趣可互换；A（11-15 截止）和 D（测试，写一个模块就能跑）优先级最高。
