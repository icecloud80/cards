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
- 对局节奏现已和 AI 难度拆开：`慢 / 中 / 快 / 瞬` 只控制 AI 行动等待与过渡速度，不改变三档 AI 的决策强度和信息利用边界。
- 跟牌候选枚举已补上“直接匹配首家牌型优先 + 中小规模组合空间完整扫描”的保护，不再把真实存在的合法主拖拉机误判成“无合法跟牌”并卡住回合。

换句话说，当前项目最准确的判断不是“高级不够强”，而是“中级搜索框架已经起骨架，但还没完全收口；高级暂时还不该往 hidden belief 硬冲”。

## 最近 Bug Fix

- 修复了一个会让 AI 在跟主拖拉机时卡回合的合法候选遗漏问题：
  当同门牌很多、合法结构组合在 `n 选 k` 顺序里排得比较靠后时，旧实现可能因为固定组合上限过早截断，导致 AI 误判自己“没有合法牌可出”。
- 当前实现会先优先注入与首家牌型完全匹配的结构候选，再按组合规模动态放宽枚举预算；对应回归见 [tests/unit/check-ai-follow-candidate-limit.js](../tests/unit/check-ai-follow-candidate-limit.js)。

## 本轮规则复核结论

这轮针对“改过规则后，中级是否真的明显强于初级、以及是否已经覆盖规则要求”的复核，结论可以先说在前面：

- `中级已经明显强于初级`，但这种“更强”目前主要体现在 `牌权续控 / 风险识别 / 朋友已站队后的目标切换`，而不是已经进入完整读牌或稳定碾压级别。
- `中级已覆盖大部分当前规则要求`，尤其是找朋友、延迟站队、无主打家强主先行、末局保底转向这些核心方向。
- `仍有 4 个关键缺口` 没闭环：`朋友概率态`、`甩牌风险正式评分化`、`保扣底时的主牌释放策略显式化`、`剩余 legacy 特判下沉`。

### “显著强于初级”是否成立

当前判断：`成立，但证据更偏“能力差异显著”，不等于已经有完整胜率证明`

依据：

- 在 `mid-ai-compare` 的 headless 批量回归里，`beginner` 连续 3 局都没有出现任何 `turnAccessRisk / pointRunRisk / revealedFriendControlShift` 决策信号；`intermediate` 同样 3 局里分别命中了 `16 / 6 / 284` 次，见 [artifacts/headless-regression/mid-ai-compare/analysis.md](../artifacts/headless-regression/mid-ai-compare/analysis.md)。
- 回归中 `intermediate` 已稳定触发 `朋友已站队后切 keep_control / clear_trump / pressure_void` 的目标切换，而 `beginner` 完全没有这层行为，见 [tests/unit/check-ai-intermediate-foundation.js](../tests/unit/check-ai-intermediate-foundation.js) 与 [tests/unit/check-ai-intermediate-search.js](../tests/unit/check-ai-intermediate-search.js)。
- `intermediate` 已经能基于公开信息识别 `turn_access_risk / point_run_risk / dangerous_point_lead`，并把这些信号接进候选排序；`beginner` 仍主要停留在固定启发式，见 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js) 与 [src/shared/ai-beginner.js](../src/shared/ai-beginner.js)。

保留判断：

- 这说明“中级显著强于初级”在策略能力层面已经成立。
- 现在已经补上了“每局随机 `2-3 个中级 + 2-3 个初级` 的混编 headless runner”，可以用来观察中级 AI 在混桌环境下的行为缺陷和胜负体感。
- 但它仍然不是 fixed-seat mirror 对战，也不是跨难度 Elo 系统，因此依旧不能把当前结果表述成“中级胜率已经被严格统计学证明显著高于初级”。

### 中级对规则要求的满足度

已经满足或基本满足的部分：

- `找朋友不再局限于最短副牌 A`：中级叫朋友已经会比较高张、回手路线、自己是否持有前置张数、是否更适合叫第二张/第三张，见 [src/shared/game.js](../src/shared/game.js) 和 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- `延迟站队与叫死协同`：规则里关于“打家先出次高牌时朋友可延迟站队”“第三张叫死时提前按朋友思路协同”都已有专项回归，见 [src/shared/ai-shared.js](../src/shared/ai-shared.js) 与 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- `无主打家强主先行`：无主打家会先清自己可用的大主和高张，再转入找朋友，见 [src/shared/ai-shared.js](../src/shared/ai-shared.js) 与 [src/shared/ai-beginner.js](../src/shared/ai-beginner.js)。
- `后程保扣底转向`：当前已经有 `protect_bottom / bottomRisk / chooseAiBottomPrepDiscard`，说明“后程转守底”和“同侧领先时优先腾出可扣底资源”已有第一版实现，见 [src/shared/ai-objectives.js](../src/shared/ai-objectives.js)、[src/shared/ai-evaluate.js](../src/shared/ai-evaluate.js) 与 [src/shared/ai-shared.js](../src/shared/ai-shared.js)。
- `不透视甩牌`：甩牌风险已经改成公开信息评估，不再直接读对手暗手，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js) 与 [tests/unit/check-ai-intermediate-foundation.js](../tests/unit/check-ai-intermediate-foundation.js)。

仍未完全满足的部分：

- `朋友未站队时的简单概率态` 还没有落地。
  现在更像“持有朋友牌 / 确定成友 / 暂定闲家”的离散门槛，而不是对“谁更像朋友”持续打分，这和路线图目标仍有差距。
- `甩牌风险` 还没有进入 `evaluateState` 的正式 breakdown。
  目前它主要停留在候选标签和首发评分修正里，导致 rollout 能看到风险，但统一评分器还没把它当作一等公民。
- `保扣底时尽量提前甩掉王，给同伴保留有效扣底空间` 还没有完全正式化。
  现在有 `chooseAiBottomPrepDiscard` 这类启发式，但还没有被拆成显式的“王张释放 / 扣底窗口让渡 / 末局主牌保留”评分项。
- `朋友已站队后的策略切换` 已经存在，但仍部分依赖短路规则。
  headless 数据已经证明它会切，但实现里仍留有 `forced reveal / support-before-reveal` 这类直接返回逻辑，说明还没彻底下沉为评分器行为。
- `非打家的级牌扣底潜力预判` 还没有落地。
  目标中的轻量版本应该在开局先看“级牌 / 主长度 / 倒数第二手上手的大主”是否同时具备，再决定是否把级牌扣底当成局内副目标；如果后续被叫到朋友但不是叫死，还应允许短暂保留犹豫，不急着立刻强站队。

### 这轮复核后新增的开发主线

第一优先级：`Friend Belief Lite`

- 为未站队阶段增加轻量 `friendLikelihood`，持续记录谁更像朋友。
- 输入只允许使用：朋友牌已见张数、是否持有目标牌、延迟站队行为、是否持续给打家回牌、公开断门与跟牌风格。
- 目标不是高级 belief，而是替代当前“只有几条硬门槛”的身份判断。

第二优先级：`把甩牌风险与保底路线正式接进 evaluateState`

- 将 `throw_safe / throw_guarded / throw_risky` 从候选标签推进成正式 breakdown。
- 增加“保扣底时王张释放是否合理”的评分项，避免它只停留在启发式垫牌。
- 让 `protect_bottom` 不只管“当前谁控牌”，还管“为了让同侧扣到底，我该不该提前卸掉哪些高主 / 王”。

第三优先级：`把朋友已站队后的控制型打法彻底评分化`

- 把 `support-before-reveal / forced reveal / early friend tempo` 这类 legacy 规则继续下沉成可解释加权项。
- 让“已站队后优先清主 / 回牌 / 续控 / 跑分”的行为尽量由 objective + breakdown 驱动，而不是散落在入口前后的直接 return。

第四优先级：`把规则复盘场景补成专项回归`

- 新增“未站队阶段误判朋友方向”的固定样本。
- 新增“保扣底阶段是否及时卸王”的固定样本。
- 新增“甩牌风险进入 evaluateState 后，权重调整不回退”的单项回归。

第五优先级：`补初级的级牌扣底预判与延迟站队`

- 非打家在开局基于自手做一次“我是否值得走级牌扣底”的轻量判定。
- 若未被叫到朋友，则适度提高“吊主 + 保大主 + 保级牌结构”的目标权重。
- 若被叫到朋友但不是叫死，则允许短暂延迟强站队，优先保住末手级牌扣底窗口。

## 现状评估

### 初级 AI

当前判断：`已完成当前档位目标，成熟度高`

依据：

- 路线图把初级定义为“规则合法 + 固定启发式 + 只用公开断门与公开分数信息”，见 [ai-roadmap.md](ai-roadmap.md#L22)。
- 当前决策入口把 `beginner` 单独路由到 `getBeginnerLegalHintForPlayer`，而非走中级搜索链路，见 [src/shared/ai.js](../src/shared/ai.js)。
- 回归里也专门验证了初级不记额外出牌信息，只保留公开断门与公开分数门控，见 [tests/unit/check-ai-memory-strategy.js](../tests/unit/check-ai-memory-strategy.js#L171)。

和路线图对比：

- 对“当前产品定义”的初级来说，基本对齐。
- 对“长期 4 档目标”里的初级而言，还可以继续补一点身份协同和自然度，但这不是当前性价比最高的方向。

结论：

- 初级现在更像“稳定基线”和“回归兜底档”。
- 不建议把精力继续砸在初级加规则上。

### 中级 AI

当前判断：`已进入路线图中的“中级前瞻”阶段，但仍处于中后期，而非完全收官`

已经做到的部分：

- 已经有统一决策入口 `chooseIntermediatePlay`，首发和跟牌都走统一框架，见 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L811)。
- 已经拆出了候选层 `generateCandidatePlays`，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js#L77)。
- 已经有轻量模拟态复制 `cloneSimulationState`，并且明确避免污染 live state，见 [src/shared/ai-simulate.js](../src/shared/ai-simulate.js#L38)。
- 已经支持“模拟到本轮结束”和“模拟到自己下一次行动前”，见 [src/shared/ai-simulate.js](../src/shared/ai-simulate.js#L244) 与 [src/shared/ai-simulate.js](../src/shared/ai-simulate.js#L278)。
- 已经有统一局面评估 `evaluateState`，并且有 `structure / control / points / friend / bottom / voidPressure / tempo / friendRisk / bottomRisk` 等评分项，见 [src/shared/ai-evaluate.js](../src/shared/ai-evaluate.js#L191)。
- 已经有目标层 `getIntermediateObjective`，把 `find_friend / run_points / protect_bottom / keep_control / pressure_void` 变成统一权重，而不是全靠即时 if，见 [src/shared/ai-objectives.js](../src/shared/ai-objectives.js)。
- 已经把 rollout 深度、future delta、触发原因和 debug bundle 打出来，见 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L631) 和 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L827)。
- 候选层、提示层和模拟层已经基本统一到 `sourceState` 口径；`getLegalSelectionsForState`、`getBeginnerLegalHintForState`、`getIntermediateLegalHintForState` 都已经落地，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js) 与 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L1238)。
- 里程碑 0 的候选清洗已经完成：非法候选不会进入评分链，debug 里能看见过滤原因和数量，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js#L834) 与 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L563)。
- 甩牌判断已经从“全知真值过滤”改成“公开信息风险评估”。AI 现在会基于已出牌、断门和当前难度允许的记牌范围给甩牌打 `throw_safe / throw_guarded / throw_risky` 标签，并把风险惩罚接进首发评分，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js#L501) 与 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L319)。
- `Friend Belief Lite` 第一版已经落地：未站队阶段会结合“自己是否持有目标牌”“公开断门是否已经排除”“是否公开打出前置副本”来粗略判断自己更像朋友还是更像闲家，并据此提前切换一部分 objective，见 [src/shared/ai-evaluate.js](../src/shared/ai-evaluate.js) 与 [src/shared/ai-objectives.js](../src/shared/ai-objectives.js)。
- 专项测试已经覆盖“模拟隔离”“双层前瞻触发”“debug 数据落地”，见 [tests/unit/check-ai-intermediate-search.js](../tests/unit/check-ai-intermediate-search.js#L148)。
- 回归已经覆盖“AI 不得透视甩牌成败”“中级按公开信息判断甩牌风险边界”，见 [tests/unit/check-ai-intermediate-foundation.js](../tests/unit/check-ai-intermediate-foundation.js#L218)。

还没完全做到的部分：

- 候选与状态解耦的主体已经做完，但还没有彻底纯函数化；当前候选生成虽然能接收 `simState`，仍有一部分 legacy helper 通过 `withSimulationState(...)` 借用全局 `state`，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js#L58)。
- 当前候选生成和部分 legacy 逻辑依然依赖 `chooseAiLeadPlay`、`getLegalSelectionsForPlayer`、`state.leadSpec` 这些 live-style 接口，说明“可在 sampled worlds 中纯函数运行”这一步还没真正完成，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js#L31)。
- 路线图要求“现有零散 if 规则逐步退化成评分修正器”，但当前 `chooseIntermediatePlay` 前后仍保留不少直接短路规则，例如强制站队、support-before-reveal 等，这说明框架虽已成型，legacy 规则还没彻底下沉，见 [ai-roadmap.md](ai-roadmap.md#L86) 和 [src/shared/ai-intermediate.js](../src/shared/ai-intermediate.js#L816)。
- `Friend Belief Lite` 目前还是第一版，只能处理“明显更像朋友 / 明显更像闲家”的局面，还没有真正形成跨座位的连续概率分布。
- 调试信息已经有了，但性能保护还没形成明确的上限控制和专项性能回归；清单里这一项仍是 `待开始`，见 [ai-checklist.md](ai-checklist.md#L146)。
- 甩牌风险评估的第一版已经接进首发候选和评分，但它还不等于完整的“评估函数第二版”；像 `turnAccess`、失去先手后的连续跑分潜力、残局安全起手值这些更核心的 `牌权续控` 项还没接完。

和路线图对比：

- 对“当前已实现的产品中级”来说，已经明显超出原来的纯启发式阶段。
- 对“目标中的中级”来说，已经完成了大半骨架，尤其是候选、模拟、评估、双层前瞻、debug 这些高价值部分。
- 但如果按工程完成度来打分，我会把当前中级放在 `80% - 88%` 区间，而不是已 fully done。

结论：

- 中级是当前最健康的一档，也是最值得继续投入的一档。
- 现在最重要的不是再加更多中级规则，而是把 `friend belief lite`、`甩牌/保底正式评分化` 和剩余性能保护一起收口。

### 高级 AI

当前判断：`仍是“记牌增强版中级”，不等于路线图里的高级`

已经做到的部分：

- 路线图明确说当前产品里的高级只是“完整记牌版的中级”，见 [ai-roadmap.md](ai-roadmap.md#L34)。
- 代码层面也确实如此：`advanced` 直接记住全部 `playHistory`，而 `intermediate` 只记与自己结构相关的高牌，见 [src/shared/ai-shared.js](../src/shared/ai-shared.js#L498)。
- 回归也验证了高级会记住所有已出牌，并且行为路由仍继承中级决策链，见 [tests/unit/check-ai-memory-strategy.js](../tests/unit/check-ai-memory-strategy.js#L182)。

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
- 候选与状态彻底解耦仍是重要架构缺口，但当前最直接影响实战体感的问题，已经转为残局 `牌权续控`、失先手代价和朋友已站队后的策略切换是否足够完整。

## 下一步最值得做的提升

### 第一优先级：继续做“评估函数第二版”

这是现在最该继续推进的一步。

原因：

- 当前中级已经能看到“本轮结束”和“下次自己行动前”，里程碑 1 的残局 `牌权续控` 触发已经补齐。
- 现在更直接影响实战体感的，不再是“看不看得到两步”，而是“看到了之后会不会把失先手代价、朋友已站队后的策略切换和危险带分领牌惩罚算进去”。

建议的具体目标：

- 现在中级已经有 rollout，没有更好的评分器，前瞻价值就会被打折。
- 当前 `tempo / friendRisk / bottomRisk` 已经有第一版，`throw risk` 也已经开始接入，这说明第二版不是从零开始，而是可以顺着现有 breakdown 往前推。

建议重点：

- 明确补 `turnAccess / 回手能力 / 牌权续控`。
- 补“危险带分领牌”惩罚，尤其是高分牌或高分主对试探性争轮但一旦失手会同时送分和失先手的场景。
- 补“朋友已站队后的策略切换”，把目标从找朋友推进切到队友协同、清主、牌权续控和保底安全。
- 补“朋友未站队时谁更像朋友”的轻量概率态，替代纯硬门槛身份判断。
- 把更多“先判断再直接 return”的 legacy 规则改成评分修正项。
- 继续把甩牌风险从候选层标签推进成 `evaluateState` 可解释 breakdown 的正式组成部分。
- 把“保扣底时是否该提前卸王 / 卸高主”从启发式垫牌推进成正式评分项。
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
- `找朋友 / 站队协同`
  这块和“朋友未站队 / 已站队”的策略切换直接绑定，继续混在主搜索里维护会越来越不清晰。

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
