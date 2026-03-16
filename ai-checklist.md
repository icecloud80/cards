# AI 执行清单

目标：先把中级 AI 的短前瞻做完整，再把“非透视的隐藏信息判断”接进高级 belief。

术语沿用 [ai-roadmap.md](ai-roadmap.md)。

## 设计红线

- AI 不得直接读取对手暗手来决定候选生成、候选过滤、评分或 rollout。
- 规则层可以用真实手牌裁定“这手实际会不会甩牌失败”，但 AI 决策层不得复用这类全知接口直接做选择。
- 中级 AI 的甩牌判断只能使用：
  - 已出牌
  - 已暴露断门
  - 当前桌面牌型
  - 已公开身份/亮友信息
  - 中级档位允许记住的高张信息
- 高级 AI 在 `beliefState` 上线前，也只能做“完整记牌 + 公开行为推断”，不能透视。

## 里程碑 0. 合法性与日志一致性兜底

- 状态：`已完成`
- 目标：先修掉“会选到失败甩牌”“AI 用全知信息过滤甩牌”和“debug 标签把合法候选记成 invalid”这类会污染搜索结果的基础问题。
- 背景：
  - 2026-03-15 的五人找朋友复盘里，打家残局出现了“甩牌失败后被强制改单张并倒扣 10 分”的情况。
  - 同一局的第 9 轮跟牌记录中，多个候选写着 `来源 legal`，却带有 `invalid / clubs`、`invalid / spades` 标签，说明候选分类和 debug 命名至少有一处没有对齐。
- 交付：
  - 在候选生成阶段增加“甩牌前严格合法性验证”，但不得通过读取对手暗手来直接判断候选成败。
  - 将当前 AI 层对 `getThrowFailure(...)` 一类全知接口的直接依赖替换为“基于公开信息的甩牌风险评估 / 置信过滤”。
  - 在 rollout 前增加一次防御式断言，保证 `chooseIntermediatePlay` 不会把非法候选送进模拟链路。
  - 统一候选 `source / tags / flags` 的命名规则，区分“合法但不成型”“合法但不压”“真正非法”。
  - 在 debug bundle 中显式记录“候选被过滤原因”，避免日志里出现 `legal + invalid` 混搭。
  - 在 debug bundle 中显式记录“甩牌过滤依据来自公开信息还是规则裁定层”，避免再次混入透视逻辑。
- 当前结果：
  - 已新增 `assessThrowCandidateForState(...)`，甩牌候选改为公开信息风险评估。
  - 候选层不再用 `failed_throw` 透视过滤首发甩牌。
  - debug 已记录 `filteredCandidateCount / filteredReasonCounts`，并对甩牌候选暴露 `throw_safe / throw_guarded / throw_risky`。
- 验收：
  - 不再出现“AI 主动选择甩牌失败方案”的对局日志。
  - AI 决策路径中不再直接调用基于对手暗手的甩牌成败判断。
  - `state.lastAiDecision.candidateEntries` 中，所有进入评分排序的候选都能通过合法性复验。
  - 调试日志中不再出现 `来源 legal` 同时携带 `invalid` 标签的记录。
- 主要文件：
  - `src/shared/ai-candidates.js`
  - `src/shared/ai-intermediate.js`
  - `src/shared/ai-simulate.js`
  - `tests/unit/check-throw-patterns.js`
  - `tests/unit/check-ai-intermediate-foundation.js`

## 里程碑 1. 双层前瞻

- 状态：`已完成`
- 目标：让中级 AI 在关键局面下，不只看到“当前轮结束”，还能看到“自己下一次行动前”的局面。
- 交付：
  - 新增 `simulateUntilNextOwnTurn(simState, playerId, chooser)`
  - 在中级 rollout 中按局面决定是否启用扩展前瞻
  - 将 rollout depth / future delta 写入 debug bundle
  - 把“残局抢回先手后，下一拍是否能安全起手”纳入扩展前瞻触发条件
  - 把“本轮赢了但下一拍高概率送回牌权”的场景显式记成 `turn_access_risk`，对应文档术语 `牌权续控风险`
- 验收：
  - 模拟不污染真实 `state`
  - 能在未明朋友、末局保底、高主集中、结构牌较多时触发
  - 能在残局抢分 / 护底场景中区分“抢这一轮有利”和“抢完反而送底”
  - `npm test` 通过
- 当前结果：
  - `simulateUntilNextOwnTurn(...)` 已落地并通过回归。
  - rollout 已能在关键局面触发 depth-2 前瞻，并记录 `endgame_safe_lead_check / no_safe_next_lead / turn_access_risk / turn_access_hold`。
  - `turnAccessRiskCount` 已进入 debugStats，残局 `牌权续控` 判断已经能在 debug 里直接看到。
- 主要文件：
  - `src/shared/ai-simulate.js`
  - `src/shared/ai-intermediate.js`
  - `tests/unit/check-ai-intermediate-search.js`

## 里程碑 2. 候选与状态解耦

- 状态：`已完成主体`
- 目标：去掉候选生成对全局 `state` 的硬绑定，为后续 belief / sampled worlds 铺路。
- 交付：
  - 让候选生成可接收 `simState`
  - 将依赖 live state 的 helper 缩到适配层
  - 梳理哪些函数还偷偷读取全局状态
  - 把“甩牌合法性检查”“结构匹配检查”“跟牌分类标签”都改为基于传入 `sourceState` 计算
- 当前结果：
  - `getLegalSelectionsForState`、`getBeginnerLegalHintForState`、`getIntermediateLegalHintForState` 已落地。
  - 候选层、提示层、模拟层都已经能在 `sourceState` 下工作。
  - 仍有少量 legacy helper 通过适配层借用 live state，这是后续 pure-state 化收尾，不再阻塞中级主线。
- 验收：
  - 候选生成可在模拟态运行
  - 合法性判断、候选标签、rollout 评分在 live state 与 simState 下结果一致
  - 中级现有回归不回退

## 里程碑 3. 评估函数第二版

- 状态：`进行中`
- 目标：把“回手能力 / 牌权续控 / 末局保底 / 误打 1 打 4 风险”纳入统一评估。
- 交付：
  - 新增 `tempo` / `turnAccess` 类评分项，对应文档术语 `牌权续控`
  - 新增 `friendRisk` / `bottomRisk` 修正项
  - 将更多 legacy 特判下沉为评分修正
  - 新增“失去先手后对手连续跑分潜力”评分项，优先覆盖打家方被反跑的场景
  - 新增“残局安全起手值”评分项，评估抢回先手后是否还有可持续控牌动作
  - 让“清门 / 送缺门 / 送将军门”不再只由即时 if 决定，而是由统一权重调节
  - 新增“甩牌安全度 / 甩牌暴露风险”评分项，且输入只能来自已出牌高张、未见关键张、断门和当前难度允许的记牌信息
  - 新增“危险带分领牌”惩罚项：当首发高分牌或高分主对只是试探性争轮、且失手后会同时送分和失先手时，应显著降权。
  - 新增“朋友已揭晓后的策略切换”评分修正：朋友已揭晓后，降低继续为找朋友服务的权重，提升清主、牌权续控、保底与队友协同的权重。
- 当前结果：
  - `throw risk` 已经开始接入首发评分，但还没有沉到 `evaluateState` 的正式 breakdown。
  - `turnAccess / 失先手代价 / 残局安全起手值` 仍是这一里程碑的主要未完成部分，也就是文档里的 `牌权续控 / 失先手代价 / 残局安全起手值`。
- 验收：
  - `evaluateState` 输出可解释 breakdown
  - 至少能解释这 3 类局面：
    - 为什么不该用高主硬抢一个会立刻丢回去的 20 分轮
    - 为什么在对手长套明显时，要更重地惩罚失去先手
    - 为什么残局首发时要优先避免失败甩牌和危险单吊
  - 能解释“为什么 `AAKK` 敢甩、但 `AAKK+99` 在未见更大对子前不敢继续扩”
  - 新增针对单项评分的回归
- 主要文件：
  - `src/shared/ai-evaluate.js`
  - `src/shared/ai-objectives.js`
  - `src/shared/ai-intermediate.js`
  - `tests/unit/check-ai-intermediate-search.js`
  - `tests/unit/check-headless-full-game.js`

## 里程碑 3.5. 对局复盘专项场景回归

- 状态：`进行中`
- 目标：把这类“看起来赢了但 AI 决策有明显漏洞”的日志复盘，沉淀成可重复跑的专项样本。
- 交付：
  - 新增“残局甩牌失败保护”专项用例。
  - 新增“AI 不得透视甩牌成败”专项用例。
  - 新增“中级按已出高张保守判断甩牌扩展边界”专项用例。
  - 新增“失先手导致对手连续跑分”专项用例。
  - 新增“合法候选标签一致性”专项用例。
  - 让 headless full game 支持从固定 seed 生成可复盘日志，并能抽取异常候选摘要。
- 当前结果：
  - `check-ai-intermediate-foundation.js` 已覆盖“AI 不得透视甩牌成败”和“公开信息下的甩牌安全边界”。
  - 失先手连续跑分、固定 seed 异常候选摘要仍待补到更专项的搜索/整局回归里。
- 验收：
  - 复盘过的问题都能被至少一条单测或回归覆盖。
  - 回归失败时能直接看到是哪类问题回退，而不是只有“本局输了”。
- 主要文件：
  - `tests/unit/check-ai-intermediate-search.js`
  - `tests/unit/check-throw-patterns.js`
  - `tests/unit/check-headless-full-game.js`
  - `tests/support/headless-full-game-runner.js`

## 里程碑 4. 调试与性能保护

- 状态：`待开始`
- 目标：让调参与回归可视、可控。
- 交付：
  - 记录候选来源、rollout depth、future delta、触发原因
  - 增加候选数和扩展深度的上限
  - 增加关键搜索场景的专项回归
  - 记录“候选被过滤数量”和“过滤原因分布”
  - 记录“赢轮后下一拍是否仍有出牌权优势”的摘要指标
  - 为残局模式单独设置扩展深度和候选上限，避免普通局面也被高成本搜索拖慢
  - 为大改动提交流程补一条真实浏览器 UI smoke，确认 PC / mobile 在 `瞬` 档托管下都能完整结算，避免共享层改动只过了 headless 却卡在真实页面流程
- 验收：
  - 可从 debug 数据看出 AI 为什么选这手
  - 可从 debug 数据看出 AI 为什么没有选某类看似激进的候选
  - 复杂局面没有明显卡顿

## 推荐执行顺序

1. 继续推进 `里程碑 3`，把“失先手代价”“残局安全起手”“turnAccess”真正沉到统一评估里。
2. 同步扩展 `里程碑 3.5`，把甩牌风险、牌权续控和朋友已揭晓后的策略切换都补成专项回归，而不只停留在基础回归里。
3. 最后做 `里程碑 4` 的性能和调试保护，给后续继续调权重留足空间。

## 后续专项维护建议

- `拿底 / 埋底 / 保底`
  建议在里程碑 3 稳住后单独拆出专项计划，围绕“拿底后手牌重构”“埋底代价”“末局保底”维护回归和调参。
- `找朋友 / 亮友协同`
  建议与“朋友已揭晓后的策略切换”共用一套专项样本，单独维护朋友未揭晓、亮友、协同回手和误打 `1 打 4` 规避。
