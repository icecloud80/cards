# AI 下一阶段执行清单

目标：先把中级 AI 的短前瞻做完整，再考虑高级 belief。

## 里程碑 1. 双层前瞻

- 状态：`进行中`
- 目标：让中级 AI 在关键局面下，不只看到“当前墩结束”，还能看到“自己下一次行动前”的局面。
- 交付：
  - 新增 `simulateUntilNextOwnTurn(simState, playerId, chooser)`
  - 在中级 rollout 中按局面决定是否启用扩展前瞻
  - 将 rollout depth / future delta 写入 debug bundle
- 验收：
  - 模拟不污染真实 `state`
  - 能在未明朋友、末局保底、高主集中、结构牌较多时触发
  - `npm test` 通过
- 主要文件：
  - `src/shared/ai-simulate.js`
  - `src/shared/ai-intermediate.js`
  - `tests/unit/check-ai-intermediate-search.js`

## 里程碑 2. 候选与状态解耦

- 状态：`待开始`
- 目标：去掉候选生成对全局 `state` 的硬绑定，为后续 belief / sampled worlds 铺路。
- 交付：
  - 让候选生成可接收 `simState`
  - 将依赖 live state 的 helper 缩到适配层
  - 梳理哪些函数还偷偷读取全局状态
- 验收：
  - 候选生成可在模拟态运行
  - 中级现有回归不回退

## 里程碑 3. 评估函数第二版

- 状态：`待开始`
- 目标：把“回手能力 / 牌权流向 / 末局保底 / 误打 1 打 4 风险”纳入统一评估。
- 交付：
  - 新增 `tempo` / `turnAccess` 类评分项
  - 新增 `friendRisk` / `bottomRisk` 修正项
  - 将更多 legacy 特判下沉为评分修正
- 验收：
  - `evaluateState` 输出可解释 breakdown
  - 新增针对单项评分的回归

## 里程碑 4. 调试与性能保护

- 状态：`待开始`
- 目标：让调参与回归可视、可控。
- 交付：
  - 记录候选来源、rollout depth、future delta、触发原因
  - 增加候选数和扩展深度的上限
  - 增加关键搜索场景的专项回归
- 验收：
  - 可从 debug 数据看出 AI 为什么选这手
  - 复杂局面没有明显卡顿
