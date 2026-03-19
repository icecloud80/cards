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
  - 已公开身份/站队信息
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

- 状态：`已完成`
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
  - 新增“朋友已站队后的策略切换”评分修正：朋友已站队后，降低继续为找朋友服务的权重，提升清主、牌权续控、保底与队友协同的权重。
  - 新增 `Friend Belief Lite`：未站队阶段持续维护“谁更像朋友”的轻量概率分，用于替代当前纯门槛式身份判断。
  - 新增“保扣底时的王张释放 / 高主释放”评分项，避免这类决策只停留在垫牌 heuristic。
- 当前结果：
  - `throwRisk` 已正式进入 `evaluateState(...)`：
    评估器现在会按当前玩家自己的手牌与公开信息，识别“当前是否存在公开可解释的健康甩牌窗口”，并把 safe / guarded / risky 甩牌折成正式 breakdown。
  - `turnAccess / controlRisk / pointRunRisk / safeLead / controlExit / probeRisk / bottomRelease / friendBelief` 都已进入统一 breakdown 与 objective 权重；
    这一里程碑要求的“牌权续控 / 失先手代价 / 残局保底 / 找朋友轻量概率态 / 甩牌安全度”骨架现已全部落地。
  - `朋友已站队后的控制型切换` 已不再只停留在入口短路或局部 heuristic：
    `controlExit`、`resolvedFriendControlCoolingPenalty` 与危险带分领牌二次 veto 已形成成套评分链。
  - 当前工作区已补 `controlExit` breakdown：
    朋友已站队后，评估器会额外区分“当前控牌是否还能安全续控 / 是否适合顺势把牌权交给同侧”，并把这项分值接入 `clear_trump / keep_control` 的目标权重与危险带分领牌 veto。
  - 当前工作区已补 `probeRisk` breakdown：
    朋友未站队时，评估器会额外区分“这份找朋友试探是否已经过热”，并把“高张 / 高主 / 王 / 带分资源的消耗，是否换来了更好的回手保障或更强 friendBelief”沉到统一评分。
  - `Friend Belief Lite` 第一版已落地，并已补基础回归验证“持有目标牌的自己更像朋友”“公开断门的座位更像闲家”。
  - `dangerous_point_lead` 现已从“heuristic 扣分”补到“rollout 后二次否决”：在 `clear_trump / keep_control / pressure_void / protect_bottom / grade_bottom` 这类控制目标下，若 `5 / 10 / K` 这类分牌首发继续暴露 `turn_access_risk / point_run_risk` 且未来收益不足，会被再次显著降权。
  - `dangerous_point_lead` 的二次否决现在还会额外读取未来评估里的 `controlExit`：
    如果 rollout 已经说明“这手控牌既不安全，也不利于同侧顺势接手”，否决会继续加重；反过来，若未来局面已转成健康续控，则会适度减轻惩罚。
  - 当前工作区也已补 `unresolvedProbeVetoPenalty`：
    lead 侧会对“未站队且无回手保障的高成本试探”做更硬 veto；
    follow 侧只做中等降权，避免把必要接手和合法亮友路线误杀。
  - 2026-03-18 又继续补了“连续试探历史”：
    `probeRisk` 与 `unresolvedProbeVetoPenalty` 现在会额外读取当前玩家已经公开打掉过多少 `A / 王 / 高主 / 带分牌`；
    朋友仍未站队时，连续高成本 probe 会比“第一次试探”吃到更重的统一惩罚。
  - 使用这套新口径补跑的 `20` 局 mixed（seed=`mid-ai-next-step`）结果为：
    `20/20` 完局、`friend failed = 0`、平均 AI 决策耗时 `237.46 ms`；
    当时未站队阶段仍有 `turn_access_risk = 15`、`point_run_risk = 9`，且 `dangerous_point_lead = 3` 尚未归零，
    说明那一轮更偏“观测与 veto 骨架已立住”；当前 M3 虽已收口，但后续行为调权重与 fixed-seed 守门仍继续放在 `里程碑 3.5`。
  - 同时新增“高张定门再递牌”保护：朋友已站队、全桌公开仍在跟某门、且自己同时握有该门 `A` 与后续小牌时，中级会把这手 `A` 视作正向协同候选，而不是和危险带分领牌混写。
  - `叫朋友` 阶段这次也补上了专项收口：
    中级 / 高级已把“短门第一张 `A` 更容易找朋友、也更容易回手”显式接进候选评分；
    同时结果日志里的 AI 决策记录已继续补到 `扣底 / 叫朋友` 两个阶段，方便把问题局完整导出。
  - beginner 的叫朋友 fixed-seed 门禁这次也补齐了一条独立回归：
    `check-beginner-friend-target-window.js` 会固定验证 `ZSO1hGI883r` 里的 `game-01 / game-04 / game-12` 三条种子，
    确保“纯短门 A、多候选但不模拟”的策略不会再退回旧版单线叫友。
  - `bottomRelease` 现已正式进入 `evaluateState(...)`：
    它会在残局同侧控牌时，评估“当前玩家是否已经把王张 / 高主这类可让给同侧的资源让出来”，
    并被 `protect_bottom / grade_bottom` 明确加权；`controlExit` 也会继续参考这项压力，避免 resolved-friend 阶段继续高张硬控。
  - `朋友已站队后的控牌降温` 这次也正式进入候选级排序：
    lead / follow 新增 `resolvedFriendControlCoolingPenalty`，
    若 rollout 已经说明“继续自己攥高资源控牌”会让 `controlExit / turnAccess / pointRunRisk / safeLead` 转差，
    就会直接把继续烧 `王 / 高主 / 高张` 的候选往下压。
    同时保留“高张定门再递牌”和 `public-info-only` 回牌的窄例外，避免把已有协同窗口误杀成 hidden-void 推断。
  - 最新 headless smoke `3 / 3` 完局、`0` 告警，`dangerous_point_lead` 已降到 `1`；
    mixed `2 / 2` 完局、`0` 告警，`turn_access_risk = 2`、`point_run_risk = 2`、`dangerous_point_lead = 2`。
    同时 `dangerous_point_lead` 的 headless 汇总已改成“heuristic 命中 + rollout / veto 确认”后才计数，当前剩余样本更接近真实残留风险，后续继续放到 `里程碑 3.5` 收口。
- 验收：
  - `evaluateState` 输出可解释 breakdown
  - 至少能解释这 3 类局面：
    - 为什么不该用高主硬抢一个会立刻丢回去的 20 分轮
    - 为什么在对手长套明显时，要更重地惩罚失去先手
    - 为什么残局首发时要优先避免失败甩牌和危险单吊
  - 能解释“为什么 `AAKK` 敢甩、但 `AAKK+99` 在未见更大对子前不敢继续扩”
  - 能解释“为什么末局同侧准备扣底时，这手该先卸王而不是继续把王攥在自己手里”
  - 能解释“为什么朋友未站队时，AI 认为 A 玩家比 B 玩家更像朋友”
  - 新增针对单项评分的回归
- 主要文件：
  - `src/shared/ai-evaluate.js`
  - `src/shared/ai-objectives.js`
  - `src/shared/ai-intermediate.js`
  - `tests/unit/check-ai-intermediate-search.js`
  - `tests/unit/check-headless-full-game.js`

## 里程碑 3.5. 对局复盘专项场景回归

- 状态：`已完成`
- 目标：把这类“看起来赢了但 AI 决策有明显漏洞”的日志复盘，沉淀成可重复跑的专项样本。
- 交付：
  - 新增“残局甩牌失败保护”专项用例。
  - 新增“AI 不得透视甩牌成败”专项用例。
  - 新增“中级按已出高张保守判断甩牌扩展边界”专项用例。
  - 新增“失先手导致对手连续跑分”专项用例。
  - 新增“合法候选标签一致性”专项用例。
  - 新增“未站队阶段朋友方向误判”专项用例。
  - 新增“后程保扣底时是否及时卸王 / 卸高主”专项用例。
  - 让 headless full game 支持从固定 seed 生成可复盘日志，并能抽取异常候选摘要。
- 当前结果：
  - `check-ai-intermediate-foundation.js` 已覆盖“AI 不得透视甩牌成败”和“公开信息下的甩牌安全边界”。
  - `Friend Belief Lite` 的基础场景已补进 `check-ai-intermediate-foundation.js`。
  - `check-ai-intermediate-search.js` 已新增“控制型目标下危险带分领牌会被 rollout 二次否决”的专项回归。
  - `check-ai-intermediate-search.js` 现也已新增：
  - 未站队高张试探被 `unresolvedProbeVetoPenalty` 压住；
  - 未站队重复高张试探会因历史公开消耗而继续加重 veto；
  - 朋友已站队后继续用高资源 hard-control，会被 `resolvedFriendControlCoolingPenalty` 压住；
  - 直接亮友与 `turn_access_hold` 明确成立时，不会被 probe veto 误杀；
  - `grade_bottom` 显式优先时，试探约束不会压掉保级牌扣底路线；
  - `probeRisk` breakdown 能区分“保留资源的健康试探”和“已过热的未站队试探”。
  - `bottomRelease / controlExit` 能识别“残局同侧控牌时，高主已释放”和“仍攥着王张硬控”的差异。
  - `check-headless-full-game.js` 现已额外校验：
    `dangerousPointLead` 样本必须带有 `selectedRiskyPointLeadVetoPenalty` 或 rollout 风险 flags，
    不再允许只有 heuristic 提醒、但未被确认的样本混进摘要。
  - `check-headless-full-game.js` 这轮又补了两条 `3.5` 收口门禁：
    `pointRunRisk` 样本必须稳定保留 `point_run_risk` 风险标记；
    `summary / analysis / events / topSignalGames / samples` 里的 seed 口径必须都能回溯到固定 `baseSeed`，确保异常样本可直接复跑。
  - 目前 `残局甩牌失败保护 / 不透视甩牌成败 / 甩牌扩展边界 / 失先手连续跑分 / 未站队方向误判 / 后程卸王卸高主 / 固定 seed 异常样本复盘` 都已至少落到一条单测或 headless 回归门禁。
- 验收：
  - 复盘过的问题都能被至少一条单测或回归覆盖。
  - 回归失败时能直接看到是哪类问题回退，而不是只有“本局输了”。
- 主要文件：
  - `tests/unit/check-ai-intermediate-search.js`
  - `tests/unit/check-throw-patterns.js`
  - `tests/unit/check-headless-full-game.js`
  - `tests/support/headless-full-game-runner.js`

## 里程碑 4. 调试与性能保护

- 状态：`已完成基线`
- 目标：让调参与回归可视、可控。
- 交付：
  - 记录候选来源、rollout depth、future delta、触发原因
  - 增加候选数和扩展深度的上限
  - 增加关键搜索场景的专项回归
  - 记录“候选被过滤数量”和“过滤原因分布”
  - 记录“赢轮后下一拍是否仍有出牌权优势”的摘要指标
  - 记录 `turn_access_risk / point_run_risk` 在 `friend=unrevealed` 阶段的拆分计数，以及 `unresolved_probe_risk` 命中样本
  - 为残局模式单独设置扩展深度和候选上限，避免普通局面也被高成本搜索拖慢
  - 为大改动提交流程补一条真实浏览器 UI smoke，确认 PC / mobile 在 `瞬` 档托管下都能完整结算，避免共享层改动只过了 headless 却卡在真实页面流程
- 当前结果：
  - 调试快照已稳定记录：候选来源、`rolloutDepth`、`futureDelta`、触发 flags、过滤数量和过滤原因分布。
  - 跟牌热路径已补上正式预算保护：
    最重的 `5` 张复杂跟牌样本会直接退回 heuristic shortlist，不再继续 rollout；
    对应 `check-ai-follow-rollout-budget.js` 已长期守门。
  - 首发热路径也已补上正式预算保护：
    当复杂首发出现 `10+` 候选时，会先缩成 heuristic shortlist，再只让少量代表候选进入 rollout；
    对应 `check-ai-lead-rollout-budget.js` 已固定住“`12` 手候选压到 `6` 手 shortlist、只跑 `3` 手 rollout”的样本。
  - headless 摘要现已同时记录：
    `turn_access_risk / point_run_risk / turn_access_hold / dangerous_point_lead / unresolved_probe_risk / revealed_friend_control_shift`，
    并保留 `friend=unrevealed` 下的拆分计数、候选过滤统计和 fixed-seed 样本。
  - headless 现在也会正式输出第二阶段性能看板：
    包括 `P50 / P90 / P95`、`slowestGames`、`slowestDecisions` 与 `lead / follow` 分模式耗时分布。
  - `turn_access_hold` 现已成为正式摘要指标：
    最新无 UI 回归为 `selected turn_access_hold = 19`，mixed 验证为 `turn_access_hold = 7`，
    可以直接复盘“赢轮后下一拍仍有牌权优势”的正向样本。
  - 最新无 UI 全游戏回归 `P95` 已降到 `1222.68 ms`；
    mixed 验证当前为平均 AI 决策耗时 `787.78 ms`、`P95 = 1533.91 ms`，
    说明首发预算保护已经把上一轮几十秒级的复杂首发尖峰明显压下来了。
  - 真实浏览器 UI smoke 已在 PC / mobile 两端通过：
    都能在 `瞬` 档开启托管后完整打到结算，不再只停留在 headless 守门。
  - dedicated mixed 长门禁脚本也已补齐：
    `npm run test:headless:mixed-gate` 现可直接产出 `20` 局 mixed summary / analysis；
    当前已用 `2` 局 smoke 校验通过，正式 `20` 局建议单独执行，不塞进日常快速回归。
- 验收：
  - 可从 debug 数据看出 AI 为什么选这手
  - 可从 debug 数据看出 AI 为什么没有选某类看似激进的候选
  - 复杂局面没有明显卡顿

## 推荐执行顺序

1. 用 `npm run test:headless:mixed-gate` 持续执行 mixed `20` 局长门禁，先把大样本风险线固定下来。
2. 再按长门禁暴露出的 `slowestGames / slowestDecisions` 热点，继续做克隆/评估缓存这类第二阶段性能收口。
3. 之后再考虑是否需要新增更细的 fixed-seed AI 数据集抽样，而不是先扩张新的 heuristic 面。

## 后续专项维护建议

- `拿底 / 埋底 / 保底`
  建议在里程碑 3 稳住后单独拆出专项计划，围绕“拿底后手牌重构”“埋底代价”“末局保底”维护回归和调参。
- `找朋友 / 站队协同`
  建议与“朋友已站队后的策略切换”共用一套专项样本，单独维护朋友未站队、站队、协同回手和误打 `1 打 4` 规避。
