# AI 出牌搜索专项计划

这份文档把“中级 AI 从启发式升级到短前瞻搜索”拆成可执行的工程任务。

当前说明：

- 这份文档主要保留“架构拆解”和任务拆分，不再重复维护最细的里程碑状态。
- 里程碑状态以 [ai-checklist.md](ai-checklist.md) 为准。
- 术语沿用 [ai-roadmap.md](ai-roadmap.md)。
- 截至当前代码状态，可粗略视为：
  - `M1` 已完成
  - `M2` 已完成
  - `M3` 已完成
  - `M4` 进行中

目标范围：

- 保持当前 `初级 / 中级 / 高级` 产品档位不变
- 将“中级”的内部实现升级为：
  - 候选生成
  - 短视模拟
  - 局面评估
  - 特殊规则修正
- `高级` 暂时复用中级搜索框架，但保留更强记牌能力

不在本阶段做的内容：

- hidden information sampling
- beliefState
- 多世界模拟
- 可训练评估器
- MCTS / beam search / alpha-beta

## 1. 目标结果

中级阶段完成后，应满足：

- 首家出牌不再主要依赖固定优先级，而是比较候选动作的后续收益。
- 跟牌不再只看当前一压，而是能估计本轮结束后的 `牌权续控` 形势。
- 当前零散的启发式规则被收编成评分项或修正器。
- 性能在本地浏览器内仍然流畅，不出现明显回合卡顿。

## 2. 建议交付结构

建议新增以下模块：

- `src/shared/ai-candidates.js`
- `src/shared/ai-simulate.js`
- `src/shared/ai-evaluate.js`
- `src/shared/ai-objectives.js`

如果你想控制文件数量，也可以先不拆文件，先在 `src/shared/ai-intermediate.js` 内部分区实现，再在第二轮抽模块。

## 3. 任务分解

### A1. 统一中级决策入口

目标：

- 把当前中级首发、跟牌逻辑收敛到统一框架。

任务：

- 新建 `chooseIntermediatePlay(playerId, context)` 统一入口。
- 区分 `lead` 和 `follow` 两种上下文，但共用同一套候选评估流程。
- 将当前 `chooseIntermediateLeadPlay` / `chooseIntermediateFollowPlay` 改成入口包装器。

建议输出接口：

```js
function chooseIntermediatePlay(playerId, mode) {}
```

验收标准：

- 现有中级行为不回退。
- 现有回归测试继续通过。

### A2. 建立候选生成层

目标：

- 明确“有哪些可考虑动作”，与“如何打分”解耦。

任务：

- 新建 `generateLeadCandidates(state, playerId)`。
- 新建 `generateFollowCandidates(state, playerId)`。
- 保留当前结构牌、低牌、高牌、特殊启发式候选。
- 为每个候选加上来源标签，方便后续调试。

建议候选结构：

```js
{
  cards,
  source,
  tags,
}
```

最低候选来源：

- 初级默认选项
- 最强结构牌
- 最弱结构牌
- 各花色最低单张
- 各花色最高单张
- 当前特殊策略候选

验收标准：

- 候选数受控，常规情况下单次不超过 12 到 20 个。
- 候选中至少包含当前中级和初级已有关键动作。

### A3. 建立轻量状态复制

目标：

- 为模拟做准备，避免直接污染真实 `state`。

任务：

- 新建 `cloneSimulationState(state)`。
- 明确哪些字段必须复制，哪些字段可忽略。
- 只保留模拟需要的最小字段，不复制 UI 状态和日志。

最低保留字段：

- `players.hand`
- `players.played`
- `bankerId`
- `hiddenFriendId`
- `friendTarget`
- `trumpSuit`
- `levelRank`
- `currentTrick`
- `leadSpec`
- `currentTurnId`
- `leaderId`
- `trickNumber`
- `defenderPoints`
- `playHistory`
- `exposedSuitVoid`
- `exposedTrumpVoid`
- `bottomCards`

验收标准：

- 模拟过程不改动真实状态。
- 克隆耗时可控。

### A4. 建立模拟执行层

目标：

- 让候选动作可以在副本状态中被执行。

任务：

- 新建 `simulatePlay(simState, playerId, cards)`。
- 新建 `simulateTrickToEnd(simState, chooser)`。
- 允许传入“后续玩家策略”，先用简化版 AI 或初级 AI 兜底。
- 让模拟支持：
  - 出牌
  - 跟牌合法性
  - 牌权结算
  - 分数变动
  - 断门信息更新

第一阶段简化建议：

- 本轮内其他玩家先使用当前 `getLegalHintForPlayer` 的简化版。
- 不在模拟中记录 UI 日志和中心提示。

验收标准：

- 能稳定模拟到本轮结束。
- 结果与真实结算规则一致。

### A5. 建立“己方下一次行动”扩展模拟

目标：

- 在本轮结束后，必要时多向前看一步。

任务：

- 新建 `simulateUntilNextOwnTurn(simState, playerId, chooser)`。
- 当本轮结束后，如果下一次仍可能轮到自己或己方关键位，再多模拟一轮。
- 加入深度开关：
  - 默认 1 轮
  - 关键局面可到 2 轮

建议触发条件：

- 末局扣底敏感
- 朋友未揭晓
- 高主资源集中
- 结构牌较多

验收标准：

- 深度控制明确，避免无限模拟。
- 常规回合时间仍在可接受范围内。

### A6. 建立局面目标层

目标：

- 不再让策略目标散落在多个 if 中。

任务：

- 新建 `getIntermediateObjective(state, playerId)`。
- 输出当前回合的主目标和次目标。

建议目标集合：

- `find_friend`
- `run_points`
- `protect_bottom`
- `clear_trump`
- `keep_control`
- `pressure_void`

建议输出结构：

```js
{
  primary,
  secondary,
  weights,
}
```

验收标准：

- 当前局面的目标可解释。
- 可以在 debug 中打印。

### A7. 建立局面评估函数

目标：

- 用统一函数给模拟后的局面打分。

任务：

- 新建 `evaluateState(simState, playerId, objective)`。
- 把现有启发式逐步收编为评估项。

第一版评估项：

- 手牌结构分
- 主控能力分
- 当前分数收益分
- 朋友推进分
- 扣底威胁 / 潜力分
- 断门施压分
- 手牌回手能力分

建议实现方式：

- 每个评估项独立成小函数
- 汇总时输出明细，方便调参

建议输出结构：

```js
{
  total,
  breakdown,
}
```

验收标准：

- 可解释
- 可打印
- 可单测

### A8. 把特殊规则改成修正器

目标：

- 现有大量直接 `return` 的中级规则，改成“强制动作”或“评分修正”。

任务：

- 梳理当前所有中级特判。
- 分成 3 类：
  - 必须强制执行
  - 可作为评分修正
  - 可删除并交给搜索吸收

建议保留强制规则：

- 朋友牌必亮
- 明确的误打 1 打 4 规避
- 规则级合法性兜底

建议改成评分项的规则：

- 清主倾向
- 回牌给庄
- 防将吃
- 保底准备
- 结构保留

验收标准：

- 中级主流程从“if 决策树”变成“候选 + 模拟 + 评分”。

### A9. 接入中级主决策

目标：

- 真正让中级 AI 使用新框架。

任务：

- `chooseIntermediateLeadPlay` 改为：
  - 生成候选
  - 执行模拟
  - 评估排序
  - 选最佳动作
- `chooseIntermediateFollowPlay` 做同样改造。
- `advanced` 暂时复用同一主流程，但使用更强记牌输入。

验收标准：

- 行为稳定。
- 高级仍比中级信息更多。

### A10. 性能保护

目标：

- 保证浏览器内可用。

任务：

- 增加候选上限。
- 增加模拟深度上限。
- 增加耗时统计。
- 在高复杂度局面时降级：
  - 只模拟到本轮结束
  - 减少候选数
  - 跳过部分非核心评分项

建议指标：

- 单回合中级决策时间目标 `< 20ms`
- 复杂局面峰值目标 `< 60ms`

验收标准：

- 无明显卡顿。
- 手机端仍可接受。

### A11. Debug 能力补齐

目标：

- 让后续调参可见、可解释。

任务：

- 为每个候选动作输出：
  - 候选来源
  - 模拟深度
  - 总分
  - breakdown
- 在 debug 面板或 console 中提供可选输出。

验收标准：

- 能看出 AI 为什么选这手。
- 能快速定位评分失衡问题。

### A12. 测试补齐

目标：

- 为新框架加保护网。

任务：

- 新增 `check-ai-intermediate-search.js`
- 增加 4 类测试：
  - 候选覆盖测试
  - 模拟一致性测试
  - 评估函数单项测试
  - 回归行为测试

建议优先覆盖场景：

- 不拆结构
- 回手优先
- 延后亮友
- 避免误打 1 打 4
- 末局保底
- 清主与留主权衡

验收标准：

- 新框架核心模块有专门回归。
- 现有回归继续全绿。

## 4. 推荐开发顺序

建议按 4 个小里程碑推进：

### M1. 框架落地

- 完成 A1 A2 A3
- 不改变现有中级决策结果，只打通骨架

### M2. 单轮搜索

- 完成 A4 A6 A7
- 让中级先做到“模拟到本轮结束”

### M3. 双层前瞻

- 完成 A5 A8 A9
- 关键局面支持看到己方下一次行动

### M4. 稳定与调参

- 完成 A10 A11 A12
- 以回归和性能为主

## 5. 文件改动建议

第一轮最低改动文件：

- `src/shared/ai-intermediate.js`
- `src/shared/ai-shared.js`
- `src/shared/ai.js`
- `tests/unit/check-ai-friend-strategy.js`
- `tests/unit/test-suites.js`

第二轮再考虑新增：

- `src/shared/ai-candidates.js`
- `src/shared/ai-simulate.js`
- `src/shared/ai-evaluate.js`
- `src/shared/ai-objectives.js`
- `tests/unit/check-ai-intermediate-search.js`

## 6. 每项任务的完成定义

每个任务完成时至少满足：

- 有明确入口函数
- 有至少 1 个对应测试
- 不引入透视
- 不破坏现有难度分层
- `npm test` 通过

## 7. 建议先开工的第一批任务

如果现在就开始做，建议第一批只开这 5 项：

1. A1 统一中级决策入口
2. A2 候选生成层
3. A3 轻量状态复制
4. A6 局面目标层
5. A7 局面评估函数第一版

原因：

- 这 5 项能先把骨架搭起来。
- 还不用碰太深的模拟细节。
- 最容易边做边保留现有行为。

## 8. 第一批任务的验收问题

第一批做完后，可以用这几个问题判断是否合格：

- 中级是否已经有统一入口，而不是继续散落在多个 if 中？
- 候选动作是否已经和评分逻辑解耦？
- 评估函数是否已经能输出 breakdown？
- 当前规则是否已经开始从“直接 return”迁移到“评分修正”？
- 现有回归是否仍然全绿？
