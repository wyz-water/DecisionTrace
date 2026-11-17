# DecisionTrace 教师演示脚本(全功能版)

> 总时长约 10 分钟;文末附 5 分钟精简版。每场标注了操作、预期结果和要说的话。
> 所有演示文本都已在抽取引擎上验证过 —— 每一步的触发是**确定性**的。

## 开场(30 秒)

> 「DecisionTrace 是一个 **AI 决策分析师**。它不是记事本:你贴进一段会议讨论,
> 系统自动抽取出决策、承诺、依赖和论点,人在唯一的门槛上确认或纠正。
> 所有洞察 —— 什么被卡住、什么会被影响、这条决策为什么翻车 —— 都是从
> 一张**依赖图**上实时算出来的,不是存出来的。」

三个关键词:**抽取先行、图即真相、分析师主动说话**。

## 准备

1. 启动后端(`backend/.venv/Scripts/python -m uvicorn app.main:app --port 8000`)
   和前端(`npm run dev`,浏览器打开 `http://localhost:5173`)。
2. **数据复位**(每次演示前执行,30 秒恢复纯净 demo 数据):

```bash
cp backend/decisiontrace.pristine.db backend/decisiontrace.db
```

3. 语言建议:默认英文界面演示,最后一场展示中英切换。

---

## 场景 1 · 输入即数据(40 秒)

**操作:** 侧边栏 → *Intake & review* → 标题填 `Sprint 12 sync` → 粘贴:

```
We decided to use Redis because it scales well. The ops cost is a real risk though. Dora will set up the cache by 2026-12-15. Eve will write the runbook by 2026-12-20. Eve depends on Dora. Dora depends on Eve for the data model.
```

→ *Save discussion* → *Extract candidates*。

**预期:** 6 条候选:1 决策、2 承诺(带截止日期)、2 依赖(注意:这两条互相矛盾,后面有用)、0 论点 —— 「The ops cost is a real risk」这句担忧**故意**没有被抽成论点。

**要说:** 「没有任何表单要填。讨论文本就是输入,图自己长出来。注意那句担忧 —— 抽取器没有把它变成论点,因为它不是反对意见;它是**没人回应的隐患**。分析师稍后会把它捡起来。」

## 场景 2 · 魔鬼代言人(60 秒)

**操作:** 审核队列每页 4 条、最新的在前 —— 点队列底部的 *Next* 翻到第 2 页,找到 `Redis` 决策候选,点 *Confirm*。

**预期:** 不落地,弹出 **DEVIL'S ADVOCATE** 面板:*Unaddressed concern — "The ops cost is a real risk though"*,必须填理由才能继续。

**操作:** 理由填 `mitigated: ops budget approved` → *Confirm with resolutions*。

**预期:** 决策落地;打开 *Decisions* 视图,决策卡片的审议区已有 1 条**已解决**的反对意见,写着处理理由。

**要说:** 「确认不是点一下按钮。分析师先起草没人正面回应过的问题 —— 来自讨论文本、待处理反对、被推翻的先例、缺失的目标 —— 每条必须给出处理理由,理由永久留在决策的审议记录里。批量确认依然是一键的,但**深思熟虑的确认走的是这道门**。」

## 场景 3 · 候选审核与前置检查(60 秒)

**操作(回 Intake,点队列底部 *Prev* 翻回第 1 页):**
1. 指给老师看 `Dora` 承诺卡片的 **Linked decision** 已经自动填了 `Redis` —— 抽取器会**就近关联**:紧跟在决策句后面的承诺自动挂到该决策上(人仍可改)。这为场景 7 埋线。
2. 不先确认承诺 —— 直接确认依赖 `Eve depends on Dora`。

**预期:** 确认失败,自动展开**前置审查面板**:两个承诺都还是 PENDING,面板里直接逐条确认。

**操作:** 在面板里确认 Dora、Eve → 再确认该依赖 → 成功。

**要说:** 「依赖确认时系统会检查两端承诺是否存在,不存在就当场把前置项排出来,原地确认。顺带一提:每个候选都带抽取置信度徽章,批量栏可以一键选中高置信候选 —— 但最终确认永远是人点的。批量确认和重复检测(重复的候选带徽章且默认跳过)都是同一个思路:**把人的操作压缩到只做判断**。」

## 场景 4 · 环检测(30 秒)

**操作:** 确认另一条依赖候选 `Dora depends on Eve for the data model`。

**预期:** 红色守卫错误:*(Eve → Dora) would create a circular plan...* —— 拒绝入库。顺手 *Reject* 这条候选(理由填 `cycle rejected`)。

**要说:** 「这两条互相矛盾的依赖是演示文本里故意埋的。图有环就没法做拓扑排序、没法算影响 —— 所以系统**在入库前就拒绝**,而不是事后报错。这是图即真相的第一层。」

**可选加分(有时间再演):** 去 *Dependencies* 视图手动创建同一条边 —— 那里会弹出**可视化环对话框**,把环逐跳画出来并推荐断哪条边。

## 场景 5 · 图、滑坡与严重度级联(90 秒)

**操作:** 侧边栏 → *Plan & commitments*。

1. 指给老师看:**拓扑顺序**列表(1,2,3 编号 = 可以开工的顺序)、图视图。
2. 点列表里的 `Dora` → 状态改为 **DELAYED** → 看 *Eve* 被影响(影响面板/高亮)。

**预期:** Eve 显示为受 Dora 延迟影响。

3. 影响面板 → 切换 *Blocked* → *Preview impact*。

**预期:** 分层对比:**Now 0 blocked / 1 delayed → If Blocked 1 blocked / 0 delayed**,「1 escalated」;Eve 卡片带深红 BLOCKED 徽章。

4. **(加分项,15 秒)** 点 `Carol` → Preview impact → **0 个受影响**。解释:Carol 已延期,但下游 Bob 是 COMPLETED —— **完成的工作把风险隔离了**,这是严重度传播的语义,不是 bug。

**要说:** 「what-if 从来不动数据,只算。以前它给一张『受影响列表』;现在它给**级联**:BLOCKED 盖过 DELAYED,沿着依赖边传播,完成的节点隔离下游。一个延期和一次停摆对下游的意义完全不同 —— 分析师要区分这两件事。」

## 场景 6 · 审议层:争议与解决(60 秒)

**操作(回 Intake):** 新建讨论 `Design review` → 粘贴:

```
Bob disagrees with using Redis because the ops cost is too high. We are concerned about the migration window.
```

→ Save → Extract → 确认两条 ARGUMENT 候选。

**预期:**
- `Redis` 决策变 **contested**(决策卡徽章、决策选择器 ⚠、总览「需要关注」)。
- 审议视图(*Deliberation*)里两条论点:一条指向 Redis,一条是**自由漂浮的担忧**(没链接到任何决策,但不会丢)。

**操作:** 在决策卡上对 `Bob` 的反对点 *Resolve* → 理由 `migration window extended, cost reviewed`。

**预期:** contested 徽章消失。

**要说:** 「论点是一等公民:谁反对了什么、基于哪句话,都带引用。有未解决的反对,决策就是 contested —— 这个状态是**算出来的**,没人能手动改。反对不能被悄悄删掉,只能带着理由解决。注意那条『迁移窗口』的担忧还开着 —— 它没有链接到任何决策,但在审议视图里不会丢,任何人的声音都有地方待着。」

## 场景 7 · 翻案追溯(60 秒)

**操作:**
1. *Decisions* 视图 → *New decision* → Title `Use Memcached`,Rationale `simpler cache, no ops burden` → Create。
2. 选择器切回 `Redis` → Edit → 状态 **Superseded** → 「Superseded by」选 `#3 Use Memcached` → 理由 `ops cost materialized` → Save。

**预期:** 决策卡出现 **REVERSAL TRACE** 时间线:推翻行(时间+理由)→ 继任者(Memcached + 其目标)→ 两条反对意见(含处理理由)→ **滑坡承诺**:Dora 的 `set up the cache` 是 DELAYED(场景 3 埋的线)。

**要说:** 「大多数系统只记决策的结果。我们记的是**决策怎么死的**:被谁取代、反对意见如何累积、关联的承诺何时滑坡 —— 每一条都指向痕迹里真实存在的那一行,不编造。」

## 场景 8 · 复盘、全景与双语(60 秒)

**操作:** 依次快速展示:

1. **总览 Overview**:决策健康卡实时变化(推翻率、平均寿命、修订率、争议率、反对解决率);「需要关注」条目。
2. **搜索**:搜 `Redis` → 决策、论点、承诺全命中,论点结果点进去直达审议面板。
3. **一致性**:冲突记录(Bob 已完成但前置 Carol 已延期)。
4. **快照**:任选讨论 → *Save snapshot* → 快照对比视图。
5. **审计**:决策/承诺的 append-only 变更历史。
6. **语言**:右上角切 `中文` → 界面全量切换,数据不变。

**要说:** 「决策健康指标是每次读的时候从历史表和论点实时算的 —— 会议纪要能记录话语,记录不了**决策过程的健康度**。」

## 收尾(30 秒)

> 「这就是 Part II 的设计实现。接下来 Part III 会用 agentic 开发做原型验证:
> 自然语言提问视图(规则先答、LLM 只负责措辞)、主动预警、把人工修正回流成训练信号。
> 设计文档里 ADR、变更日志、评估协议都是全的 —— 每一个『为什么』都可追溯。」

---

## 5 分钟精简版

1. 开场定位(30 秒)
2. 场景 1+2 合并:粘贴 → 抽取 → 魔鬼代言人 → 带理由确认(90 秒)
3. 场景 4 环检测(20 秒)
4. 场景 5 严重度级联(60 秒)
5. 场景 6 争议 → 解决(40 秒)
6. 场景 7 翻案追溯(40 秒)
7. 收尾 + 总览健康卡(20 秒)

(前置面板、搜索、快照、双语改为口头带过)

## 功能覆盖清单

| 功能 | 场景 |
|---|---|
| 讨论导入(.txt/.md/.docx/.pdf、GBK 回退) | 1(口头提及) |
| 规则/LLM 双引擎抽取(EN+ZH)+ 候选审核 | 1, 3 |
| 魔鬼代言人确认门(A14) | 2 |
| 决议目标(rationale)+ 已解决论点的审议记录 | 2, 7 |
| 批量确认 / 重复检测 | 3(口头提及) |
| 依赖前置审查面板 | 3 |
| 环检测拒绝(带可视化) | 4 |
| 拓扑排序 / 图视图 | 5 |
| 严重度加权 what-if 级联(A16)+ 完成隔离 | 5 |
| 论点实体 / contested 计算状态(A13)/ 解决需理由 | 6 |
| 自由漂浮论点不丢失 | 6 |
| 手动创建表单 | 7 |
| 翻案追溯(A15)+ 继任者链接 | 7 |
| 决策健康指标(复盘) | 8 |
| 全文搜索(UC08) | 8 |
| 一致性冲突 | 8 |
| 快照 + 对比 | 8 |
| 审计轨迹(append-only) | 8 |
| 中英双语 i18n | 8 |

## 数据复位

演示会写数据。每次演示前:

```bash
cp backend/decisiontrace.pristine.db backend/decisiontrace.db
```

(`decisiontrace.pristine.db` 是纯净演示数据备份,已被 .gitignore 覆盖;
另有备份在 `%LOCALAPPDATA%\Temp\dt_verify\decisiontrace.pristine.db`。)
