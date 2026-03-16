# AI 当前状态

这份文档基于当前仓库实现、路线图和回归测试，回答 3 个问题：

1. `初级 / 中级 / 高级` AI 现在分别做到什么程度了。
2. 它们和 [ai-roadmap.md](ai-roadmap.md) 的目标相比还差什么。
3. 下一步最值得优先做的提升是什么。

## 一句话结论

- `初级`：已经稳定，基本符合当前产品定义，短期不是主战场。
- `中级`：已经从“纯启发式”进入“启发式 + 短前瞻搜索”的第一阶段，属于当前最关键、也最接近收益兑现的位置。
- `高级`：目前仍然是“完整记牌版的中级”，还没有进入路线图里定义的 belief / 多世界模拟阶段。
- 之前暴露出来的“甩牌透视”红线已经修正：AI 决策层不再直接读取对手暗手判断甩牌成败，而是改成基于公开信息和记牌能力做风险评估。

换句话说，当前项目最准确的判断不是“高级不够强”，而是“中级搜索框架已经起骨架，但还没完全收口；高级暂时还不该往 hidden belief 硬冲”。

## 现状评估

### 初级 AI

当前判断：`已完成当前档位目标，成熟度高`

依据：

- 路线图把初级定义为“规则合法 + 固定启发式 + 只用公开断门信息”，见 [ai-roadmap.md](ai-roadmap.md#L22)。
- 当前决策入口把 `beginner` 单独路由到 `getBeginnerLegalHintForPlayer`，而非走中级搜索链路，见 [src/shared/ai.js](src/shared/ai.js)。
- 回归里也专门验证了初级不记额外出牌信息，只保留公开信息门控，见 [tests/unit/check-ai-memory-strategy.js](tests/unit/check-ai-memory-strategy.js#L171)。

和路线图对比：

- 对“当前产品定义”的初级来说，基本对齐。
- 对“长期 4 档目标”里的初级而言，还可以继续补一点身份协同和自然度，但这不是当前性价比最高的方向。

结论：

- 初级现在更像“稳定基线”和“回归兜底档”。
- 不建议把精力继续砸在初级加规则上。

### 中级 AI

当前判断：`已进入路线图中的“中级前瞻”阶段，但仍处于中后期，而非完全收官`

已经做到的部分：

- 已经有统一决策入口 `chooseIntermediatePlay`，首发和跟牌都走统一框架，见 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L811)。
- 已经拆出了候选层 `generateCandidatePlays`，见 [src/shared/ai-candidates.js](src/shared/ai-candidates.js#L77)。
- 已经有轻量模拟态复制 `cloneSimulationState`，并且明确避免污染 live state，见 [src/shared/ai-simulate.js](src/shared/ai-simulate.js#L38)。
- 已经支持“模拟到本墩结束”和“模拟到自己下一次行动前”，见 [src/shared/ai-simulate.js](src/shared/ai-simulate.js#L244) 与 [src/shared/ai-simulate.js](src/shared/ai-simulate.js#L278)。
- 已经有统一局面评估 `evaluateState`，并且有 `structure / control / points / friend / bottom / voidPressure / tempo / friendRisk / bottomRisk` 等评分项，见 [src/shared/ai-evaluate.js](src/shared/ai-evaluate.js#L191)。
- 已经有目标层 `getIntermediateObjective`，把 `find_friend / run_points / protect_bottom / keep_control / pressure_void` 变成统一权重，而不是全靠即时 if，见 [src/shared/ai-objectives.js](src/shared/ai-objectives.js)。
- 已经把 rollout 深度、future delta、触发原因和 debug bundle 打出来，见 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L631) 和 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L827)。
- 候选层、提示层和模拟层已经基本统一到 `sourceState` 口径；`getLegalSelectionsForState`、`getBeginnerLegalHintForState`、`getIntermediateLegalHintForState` 都已经落地，见 [src/shared/ai-candidates.js](src/shared/ai-candidates.js) 与 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L1238)。
- 里程碑 0 的候选清洗已经完成：非法候选不会进入评分链，debug 里能看见过滤原因和数量，见 [src/shared/ai-candidates.js](src/shared/ai-candidates.js#L834) 与 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L563)。
- 甩牌判断已经从“全知真值过滤”改成“公开信息风险评估”。AI 现在会基于已出牌、断门和当前难度允许的记牌范围给甩牌打 `throw_safe / throw_guarded / throw_risky` 标签，并把风险惩罚接进首发评分，见 [src/shared/ai-candidates.js](src/shared/ai-candidates.js#L501) 与 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L319)。
- 专项测试已经覆盖“模拟隔离”“双层前瞻触发”“debug 数据落地”，见 [tests/unit/check-ai-intermediate-search.js](tests/unit/check-ai-intermediate-search.js#L148)。
- 回归已经覆盖“AI 不得透视甩牌成败”“中级按公开信息判断甩牌风险边界”，见 [tests/unit/check-ai-intermediate-foundation.js](tests/unit/check-ai-intermediate-foundation.js#L218)。

还没完全做到的部分：

- 候选与状态解耦的主体已经做完，但还没有彻底纯函数化；当前候选生成虽然能接收 `simState`，仍有一部分 legacy helper 通过 `withSimulationState(...)` 借用全局 `state`，见 [src/shared/ai-candidates.js](src/shared/ai-candidates.js#L58)。
- 当前候选生成和部分 legacy 逻辑依然依赖 `chooseAiLeadPlay`、`getLegalSelectionsForPlayer`、`state.leadSpec` 这些 live-style 接口，说明“可在 sampled worlds 中纯函数运行”这一步还没真正完成，见 [src/shared/ai-candidates.js](src/shared/ai-candidates.js#L31)。
- 路线图要求“现有零散 if 规则逐步退化成评分修正器”，但当前 `chooseIntermediatePlay` 前后仍保留不少直接短路规则，例如强制亮友、support-before-reveal 等，这说明框架虽已成型，legacy 规则还没彻底下沉，见 [ai-roadmap.md](ai-roadmap.md#L86) 和 [src/shared/ai-intermediate.js](src/shared/ai-intermediate.js#L816)。
- 路线图里提到“朋友未揭晓时，持续维护谁更像朋友的简单概率分”，当前还没有显式概率状态，更接近“目标权重 + 若干身份特判”，尚未形成真正的 lightweight belief。
- 调试信息已经有了，但性能保护还没形成明确的上限控制和专项性能回归；清单里这一项仍是 `待开始`，见 [ai-checklist.md](ai-checklist.md#L146)。
- 甩牌风险评估的第一版已经接进首发候选和评分，但它还不等于完整的“评估函数第二版”；像 `turnAccess`、失去先手后的连续跑分潜力、残局安全起手值这些更核心的 `牌权续控` 项还没接完。

和路线图对比：

- 对“当前已实现的产品中级”来说，已经明显超出原来的纯启发式阶段。
- 对“目标中的中级”来说，已经完成了大半骨架，尤其是候选、模拟、评估、双层前瞻、debug 这些高价值部分。
- 但如果按工程完成度来打分，我会把当前中级放在 `80% - 88%` 区间，而不是已 fully done。

结论：

- 中级是当前最健康的一档，也是最值得继续投入的一档。
- 现在最重要的不是再加更多中级规则，而是把剩余的双层前瞻触发、评估函数第二版和性能保护收口。

### 高级 AI

当前判断：`仍是“记牌增强版中级”，不等于路线图里的高级`

已经做到的部分：

- 路线图明确说当前产品里的高级只是“完整记牌版的中级”，见 [ai-roadmap.md](ai-roadmap.md#L34)。
- 代码层面也确实如此：`advanced` 直接记住全部 `playHistory`，而 `intermediate` 只记与自己结构相关的高牌，见 [src/shared/ai-shared.js](src/shared/ai-shared.js#L498)。
- 回归也验证了高级会记住所有已出牌，并且行为路由仍继承中级决策链，见 [tests/unit/check-ai-memory-strategy.js](tests/unit/check-ai-memory-strategy.js#L182)。

还没做到的部分：

- 没有 `beliefState`。
- 没有 `buildBeliefState / sampleWorldsFromBelief / evaluatePlayAcrossWorlds` 这些路线图里明确列出的接口。
- 没有隐藏信息采样。
- 没有多世界模拟。
- 没有基于不确定性做风险控制。

这些能力都只存在于路线图目标里，还没有体现在当前实现中，见 [ai-roadmap.md](ai-roadmap.md#L120)。

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
- 候选与状态彻底解耦仍是重要架构缺口，但当前最直接影响实战体感的问题，已经转为残局 `牌权续控`、失先手代价和朋友已揭晓后的策略切换是否足够完整。

## 下一步最值得做的提升

### 第一优先级：继续做“评估函数第二版”

这是现在最该继续推进的一步。

原因：

- 当前中级已经能看到“本墩结束”和“下次自己行动前”，里程碑 1 的残局 `牌权续控` 触发已经补齐。
- 现在更直接影响实战体感的，不再是“看不看得到两步”，而是“看到了之后会不会把失先手代价、朋友已揭晓后的策略切换和危险带分领牌惩罚算进去”。

建议的具体目标：

- 现在中级已经有 rollout，没有更好的评分器，前瞻价值就会被打折。
- 当前 `tempo / friendRisk / bottomRisk` 已经有第一版，`throw risk` 也已经开始接入，这说明第二版不是从零开始，而是可以顺着现有 breakdown 往前推。

建议重点：

- 明确补 `turnAccess / 回手能力 / 牌权续控`。
- 补“危险带分领牌”惩罚，尤其是高分牌或高分主对试探性争墩但一旦失手会同时送分和失先手的场景。
- 补“朋友已揭晓后的策略切换”，把目标从找朋友推进切到队友协同、清主、牌权续控和保底安全。
- 把更多“先判断再直接 return”的 legacy 规则改成评分修正项。
- 继续把甩牌风险从候选层标签推进成 `evaluateState` 可解释 breakdown 的正式组成部分。
- 针对每个评分项增加单项回归，避免调权重时黑盒化。

### 第二优先级：继续收尾“候选与状态彻底解耦”

原因：

- 它仍然是后续 belief / sampled worlds 的重要承载层。
- 只是和当前实战体感相比，它已经不再是第一优先级。

建议重点：

- 继续压缩 `withSimulationState(...)` 适配层的使用范围。
- 把仍偷读 live `state` 的 legacy helper 逐步改成显式 `sourceState` 版本。

### 第三优先级：补性能与调试保护

原因：

- 中级前瞻已经从 1 层走到 2 层，下一步如果不做上限控制，后面一加 sampled worlds 很容易炸。
- 现在 debug bundle 已经有了，是继续往“可解释 + 可调参”推进的好时机。

建议重点：

- 给候选数、扩展前瞻深度、触发条件加硬上限。
- 增加关键搜索场景的性能基线。
- 在 UI 或日志里更直观看到 “为什么扩展”“为什么选这手”。

## 建议专项维护的模块

当前已经拆对的专项：

- `出牌搜索 / 局面评估`
- `亮主 / 反主`

下一批最值得像上面两类一样单独维护的专项：

- `拿底 / 埋底 / 保底`
  这块的决策时机和评分口径都很独立，而且直接影响“做庄是否舒服”和“末局是否守得住”。
- `找朋友 / 亮友协同`
  这块和“朋友未揭晓 / 已揭晓”的策略切换直接绑定，继续混在主搜索里维护会越来越不清晰。

更适合继续作为横切能力维护，而不是立刻拆独立文档的专项：

- `记牌 / 信息利用`
  它会同时服务甩牌风险、亮主读牌、队友协同和高级 belief，更像基础设施层。

## 明确不建议现在优先做的事

- 不建议现在直接做高级 `beliefState`。
- 不建议现在直接上多世界模拟。
- 不建议现在继续大量堆中级特判 if。

原因很简单：

- 路线图已经明确写了，在中级搜索框架落稳前，不建议过早引入复杂 hidden sampling，见 [ai-roadmap.md](ai-roadmap.md#L239)。
- 当前代码也证明，最值钱的基础设施已经有了，但承载高级推断所需的“去全局状态化”还没完成。
- 当前代码也证明，中级的基础设施已经足够支撑继续打磨，真正的短板已经从“框架缺失”转成“收口和调优不够完整”。

## 最终判断

如果把当前三档 AI 放到路线图上定位：

- `初级`：已稳定，可视为完成态。
- `中级`：已从启发式迈入短前瞻时代，红线问题也已修掉，但仍有最后一段工程收口要做。
- `高级`：仍处于“记牌增强版中级”，尚未进入真正的高级阶段。

因此，下一步最正确的主线不是“让高级更像高级”，而是：

1. 先把中级搜索框架彻底做实。
2. 再在这个框架上长出高级 belief。
3. 最后才谈更深搜索或训练式评估。
