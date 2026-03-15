# AI 当前状态评估

这份文档基于当前仓库实现、路线图和回归测试，回答 3 个问题：

1. `初级 / 中级 / 高级` AI 现在分别做到什么程度了。
2. 它们和 [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md) 的目标相比还差什么。
3. 下一步最值得优先做的提升是什么。

## 一句话结论

- `初级`：已经稳定，基本符合当前产品定义，短期不是主战场。
- `中级`：已经从“纯启发式”进入“启发式 + 短前瞻搜索”的第一阶段，属于当前最关键、也最接近收益兑现的位置。
- `高级`：目前仍然是“完整记牌版的中级”，还没有进入路线图里定义的 belief / 多世界模拟阶段。
- 但有一条新的红线需要立刻补入评估结论：AI 决策层绝不能透视对手暗手来判断甩牌成败，当前甩牌过滤实现与这条原则不一致，必须尽快修正。

换句话说，当前项目最准确的判断不是“高级不够强”，而是“中级搜索框架已经起骨架，但还没完全收口；高级暂时还不该往 hidden belief 硬冲”。

## 现状评估

### 初级 AI

当前判断：`已完成当前档位目标，成熟度高`

依据：

- 路线图把初级定义为“规则合法 + 固定启发式 + 只用公开断门信息”，见 [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md#L15)。
- 当前决策入口把 `beginner` 单独路由到 `getBeginnerLegalHintForPlayer`，而非走中级搜索链路，见 [src/shared/ai.js](/Users/mo.li/Documents/cards/src/shared/ai.js)。
- 回归里也专门验证了初级不记额外出牌信息，只保留公开信息门控，见 [tests/unit/check-ai-memory-strategy.js](/Users/mo.li/Documents/cards/tests/unit/check-ai-memory-strategy.js#L171)。

和路线图对比：

- 对“当前产品定义”的初级来说，基本对齐。
- 对“长期 4 档目标”里的初级而言，还可以继续补一点身份协同和自然度，但这不是当前性价比最高的方向。

结论：

- 初级现在更像“稳定基线”和“回归兜底档”。
- 不建议把精力继续砸在初级加规则上。

### 中级 AI

当前判断：`已进入路线图中的“中级前瞻”阶段，但仍处于中后期，而非完全收官`

已经做到的部分：

- 已经有统一决策入口 `chooseIntermediatePlay`，首发和跟牌都走统一框架，见 [src/shared/ai-intermediate.js](/Users/mo.li/Documents/cards/src/shared/ai-intermediate.js#L811)。
- 已经拆出了候选层 `generateCandidatePlays`，见 [src/shared/ai-candidates.js](/Users/mo.li/Documents/cards/src/shared/ai-candidates.js#L77)。
- 已经有轻量模拟态复制 `cloneSimulationState`，并且明确避免污染 live state，见 [src/shared/ai-simulate.js](/Users/mo.li/Documents/cards/src/shared/ai-simulate.js#L38)。
- 已经支持“模拟到本墩结束”和“模拟到自己下一次行动前”，见 [src/shared/ai-simulate.js](/Users/mo.li/Documents/cards/src/shared/ai-simulate.js#L244) 与 [src/shared/ai-simulate.js](/Users/mo.li/Documents/cards/src/shared/ai-simulate.js#L278)。
- 已经有统一局面评估 `evaluateState`，并且有 `structure / control / points / friend / bottom / voidPressure / tempo / friendRisk / bottomRisk` 等评分项，见 [src/shared/ai-evaluate.js](/Users/mo.li/Documents/cards/src/shared/ai-evaluate.js#L191)。
- 已经有目标层 `getIntermediateObjective`，把 `find_friend / run_points / protect_bottom / keep_control / pressure_void` 变成统一权重，而不是全靠即时 if，见 [src/shared/ai-objectives.js](/Users/mo.li/Documents/cards/src/shared/ai-objectives.js)。
- 已经把 rollout 深度、future delta、触发原因和 debug bundle 打出来，见 [src/shared/ai-intermediate.js](/Users/mo.li/Documents/cards/src/shared/ai-intermediate.js#L631) 和 [src/shared/ai-intermediate.js](/Users/mo.li/Documents/cards/src/shared/ai-intermediate.js#L827)。
- 专项测试已经覆盖“模拟隔离”“双层前瞻触发”“debug 数据落地”，见 [tests/unit/check-ai-intermediate-search.js](/Users/mo.li/Documents/cards/tests/unit/check-ai-intermediate-search.js#L148)。

还没完全做到的部分：

- 下一阶段清单里“候选与状态解耦”仍标为 `待开始`，而当前候选生成虽然能接收 `simState`，但本质上仍通过 `withSimulationState(...)` 借用全局 `state` 上的旧 helper，见 [ai-next-implementation-checklist.md](/Users/mo.li/Documents/cards/ai-next-implementation-checklist.md#L22) 和 [src/shared/ai-candidates.js](/Users/mo.li/Documents/cards/src/shared/ai-candidates.js#L23)。
- 当前候选生成和部分 legacy 逻辑依然依赖 `chooseAiLeadPlay`、`getLegalSelectionsForPlayer`、`state.leadSpec` 这些 live-style 接口，说明“可在 sampled worlds 中纯函数运行”这一步还没真正完成，见 [src/shared/ai-candidates.js](/Users/mo.li/Documents/cards/src/shared/ai-candidates.js#L31)。
- 路线图要求“现有零散 if 规则逐步退化成评分修正器”，但当前 `chooseIntermediatePlay` 前后仍保留不少直接短路规则，例如强制亮友、support-before-reveal 等，这说明框架虽已成型，legacy 规则还没彻底下沉，见 [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md#L79) 和 [src/shared/ai-intermediate.js](/Users/mo.li/Documents/cards/src/shared/ai-intermediate.js#L816)。
- 路线图里提到“朋友未明时，持续维护谁更像朋友的简单概率分”，当前还没有显式概率状态，更接近“目标权重 + 若干身份特判”，尚未形成真正的 lightweight belief。
- 调试信息已经有了，但性能保护还没形成明确的上限控制和专项性能回归；清单里这一项仍是 `待开始`，见 [ai-next-implementation-checklist.md](/Users/mo.li/Documents/cards/ai-next-implementation-checklist.md#L46)。
- 当前“失败甩牌过滤”虽然解决了脏候选问题，但它直接复用了规则层的 `getThrowFailure(...)`。该函数会检查其他玩家真实手牌，所以它适合作为规则裁定，不适合作为 AI 决策依据。这意味着当前中级在甩牌点上仍然存在“局部透视”问题，必须回退到“基于已出牌和记牌能力的风险判断”。

和路线图对比：

- 对“当前已实现的产品中级”来说，已经明显超出原来的纯启发式阶段。
- 对“目标中的中级”来说，已经完成了大半骨架，尤其是候选、模拟、评估、双层前瞻、debug 这些高价值部分。
- 但如果按工程完成度来打分，我会把当前中级放在 `70% - 80%` 区间，而不是已 fully done。

结论：

- 中级是当前最健康的一档，也是最值得继续投入的一档。
- 现在最重要的不是再加更多中级规则，而是先修掉“甩牌透视”这条红线，再继续把搜索框架彻底“去全局状态化 + 去 legacy 直返化”。

### 高级 AI

当前判断：`仍是“记牌增强版中级”，不等于路线图里的高级`

已经做到的部分：

- 路线图明确说当前产品里的高级只是“完整记牌版的中级”，见 [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md#L27)。
- 代码层面也确实如此：`advanced` 直接记住全部 `playHistory`，而 `intermediate` 只记与自己结构相关的高牌，见 [src/shared/ai-shared.js](/Users/mo.li/Documents/cards/src/shared/ai-shared.js#L498)。
- 回归也验证了高级会记住所有已出牌，并且行为路由仍继承中级决策链，见 [tests/unit/check-ai-memory-strategy.js](/Users/mo.li/Documents/cards/tests/unit/check-ai-memory-strategy.js#L182)。

还没做到的部分：

- 没有 `beliefState`。
- 没有 `buildBeliefState / sampleWorldsFromBelief / evaluatePlayAcrossWorlds` 这些路线图里明确列出的接口。
- 没有隐藏信息采样。
- 没有多世界模拟。
- 没有基于不确定性做风险控制。

这些能力都只存在于路线图目标里，还没有体现在当前实现中，见 [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md#L115)。

结论：

- 当前“高级”更准确的产品描述应当是：`完整记牌 + 复用中级搜索框架`。
- 如果按长期路线图命名，它其实更像“中高级过渡档”，还不是“开始会读牌”的高级。

## 和路线图对齐后的总体判断

### 已经达标的部分

- 三档产品分层已经存在，且用户可见档位稳定。
- 初级和高级的“信息利用差异”已经体现出来。
- 中级搜索框架核心骨架已经落地，不再只是规划文档。
- 全量回归测试通过，说明目前实现具备继续演进的工程基础。

### 仍然缺口最大的部分

- 中级的“候选与状态彻底解耦”。
- 中级的“评估函数第二版”和更多 legacy 规则下沉。
- 搜索的性能上限、触发边界和 debug 可视化收口。
- 高级的 belief / sampled worlds 还完全没有开始。

## 下一步最值得做的提升

### 第一优先级：完成“候选与状态解耦”

这是我认为最该先做的一步。

原因：

- 这是从“现在能跑”走向“后面能持续升级”的关键分水岭。
- 不把候选和 helper 从 live `state` 里拆出来，后面的 `beliefState`、sampled worlds、多世界评估都会很别扭，甚至会逼着你继续在全局态上打补丁。
- 这一步完成后，中级搜索会更稳定，高级 belief 才有真正的承载层。

建议的具体目标：

- 让候选生成和合法性判断优先吃 `simState`，而不是借 `withSimulationState(...)` 套用 live helper。
- 给 `chooseAiLeadPlay` / `getLegalSelectionsForPlayer` 这类旧接口补一层 state adapter，逐步把核心逻辑改造成显式传参。
- 梳理仍直接读 `state` 的候选、比较、分类、提示函数，列出清单后逐个迁移。

### 额外的红线优先级：移除“透视式甩牌判断”

这件事需要插队到里程碑靠前位置。

原因：

- 它不是普通策略优劣问题，而是“AI 是否作弊”的边界问题。
- 当前 `getThrowFailure(...)` 的使用方式，会让 AI 在甩牌候选上知道“别人手里到底有没有更大的同类组件”，这和路线图里“不透视”的原则冲突。
- 这类问题如果不先收掉，后面继续调中级评估函数，得到的很多结论都会被污染。

建议目标：

- 将“规则裁定层的甩牌失败判断”和“AI 决策层的甩牌安全评估”彻底拆开。
- 中级只允许使用：
  - 已出高张
  - 已暴露断门
  - 当前桌面牌型
  - 与自己结构相关的高张记忆
- 高级在 `beliefState` 之前，只能把范围扩展到“完整已出牌记忆”，仍不能读取暗手。
- 把 “`AAKK` 可以尝试甩、`AAKK+99` 是否继续扩” 变成风险问题，而不是全知真值判断。

### 第二优先级：做“评估函数第二版”

原因：

- 现在中级已经有 rollout，没有更好的评分器，前瞻价值就会被打折。
- 当前 `tempo / friendRisk / bottomRisk` 已经有第一版，这说明第二版不是从零开始，而是可以顺着现有 breakdown 往前推。

建议重点：

- 明确补 `turnAccess / 回手能力 / 牌权流向`。
- 把更多“先判断再直接 return”的 legacy 规则改成评分修正项。
- 针对每个评分项增加单项回归，避免调权重时黑盒化。

### 第三优先级：补性能与调试保护

原因：

- 中级前瞻已经从 1 层走到 2 层，下一步如果不做上限控制，后面一加 sampled worlds 很容易炸。
- 现在 debug bundle 已经有了，是继续往“可解释 + 可调参”推进的好时机。

建议重点：

- 给候选数、扩展前瞻深度、触发条件加硬上限。
- 增加关键搜索场景的性能基线。
- 在 UI 或日志里更直观看到 “为什么扩展”“为什么选这手”。

## 明确不建议现在优先做的事

- 不建议现在直接做高级 `beliefState`。
- 不建议现在直接上多世界模拟。
- 不建议现在继续大量堆中级特判 if。

原因很简单：

- 路线图已经明确写了，在中级搜索框架落稳前，不建议过早引入复杂 hidden sampling，见 [ai-strategy-roadmap.md](/Users/mo.li/Documents/cards/ai-strategy-roadmap.md#L222)。
- 当前代码也证明，最值钱的基础设施已经有了，但承载高级推断所需的“去全局状态化”还没完成。

## 最终判断

如果把当前三档 AI 放到路线图上定位：

- `初级`：已稳定，可视为完成态。
- `中级`：已从启发式迈入短前瞻时代，但仍有最后一段工程收口要做。
- `高级`：仍处于“记牌增强版中级”，尚未进入真正的高级阶段。

因此，下一步最正确的主线不是“让高级更像高级”，而是：

1. 先把中级搜索框架彻底做实。
2. 再在这个框架上长出高级 belief。
3. 最后才谈更深搜索或训练式评估。
