# AI 当前状态

这份文档基于当前仓库实现、路线图和回归测试，回答 3 个问题：

1. `初级 / 中级 / 高级` AI 现在分别做到什么程度了。
2. 它们和 [ai-roadmap.md](ai-roadmap.md) 的目标相比还差什么。
3. 下一步最值得优先做的提升是什么。

如果需要从设计视角理解“中级 AI 具体怎么想、各个 objective 分别是什么意思、像 `chooseAiVoidPressureLead` 这样的策略 helper 为什么存在”，可配合阅读 [intermediate-ai-design.md](intermediate-ai-design.md)。

术语补充：

- `危险带分领牌` 不是泛指“任何带分首发”，而是特指那种“主动把 `5 / 10 / K` 这类分牌，或 `A / 高主 / 王` 这类高价值高张领出来试探争轮，但这手并不能稳定续控，反而可能同时送分、送先手，或白白交掉关键控制资源”的高风险首发。
- `高张定门再递牌` 指“朋友已站队后，先用某门 `A` 拿一手稳定控制并向同伴传递高张信号，再把同门小牌留作下一拍递牌口”的协同线；它不是危险带分领牌的同义词。

## 2026-03-17 最新复核

这次复核额外补跑了当前工作区里的快速单测与 headless 全游戏回归，目的是把“路线图判断”重新对齐到现时代码，而不是只复述前一轮文档结论。

最新结论：

- `中级仍然是当前最值得投入的一档`，因为它已经具备完整的候选、模拟、评估和 objective 骨架，但仍有明显的残局续控收口空间。
- `高级` 依旧不是路线图定义里的“会读牌”阶段，而是“完整记牌 + 复用中级搜索框架”的过渡档。
- `危险带分领牌` 的 headless 统计口径这轮也收紧了：现在只统计“heuristic 命中后又被 rollout / veto 确认”的样本。按这条新口径，最新全桌 smoke 里 `dangerous_point_lead = 1`、`point_run_risk = 3`，mixed 小样本里 `dangerous_point_lead = 2`、`point_run_risk = 2`，说明剩下的更像真实残留风险，而不是统计误报。
- 当前最准确的工程判断已经变成：
  `里程碑 3 / 3.5 / 4 的基线都已完成`，
  下一步该转去更大样本 mixed 守门与第二阶段性能收口，而不是继续补骨架。
- 这轮又补上了一条新的性能止血线：
  复杂 `lead` 现在也和 `follow` 一样，会先做 heuristic shortlist，再按预算决定 rollout；
  对应固定样本已从旧版 `12` 手候选全量 depth-2 rollout，收口到 `6` 手 shortlist、`3` 手 rollout。
- 当前工作区已补一条新的收口线：`evaluateState(...)` 现已新增 `controlExit` breakdown，并接入 `resolved friend + clear_trump / keep_control` 的 objective 权重与危险带分领牌 veto，用来专门处理“朋友已站队后控牌过热”的问题。
- 当前工作区也已补上“未站队阶段高张试探预算”的统一入口：
  `evaluateState(...)` 新增 `probeRisk` breakdown，
  `buildScoredIntermediateLeadEntries(...)` / `buildScoredIntermediateFollowEntries(...)` 新增 `unresolvedProbeVetoPenalty`，
  用来收紧“为了找朋友而过早花掉 `A / 高主 / 王 / 带分牌`，却没有明确回手保障”的候选。
- headless 批量复盘现在除了总量外，还会额外记录：
  `selectedRolloutTriggerFlags` 里的 `unresolved_probe_risk`，
  以及 `turn_access_risk / point_run_risk` 在 `friend=unrevealed` 阶段各自命中了多少次。
- 最新一轮 `20` 局 mixed 批跑（seed=`mid-ai-next-step`）已经完成：
  `20/20` 完局、`friend failed = 0`、平均 AI 决策耗时 `237.46 ms`；
  当时仍有 `dangerous_point_lead = 3`、未站队阶段 `turn_access_risk = 15`、未站队阶段 `point_run_risk = 9`，
  说明那一轮实现已经把“未站队风险”变成可观测、可专项压的正式口径；当前 smoke 已继续下降，但长期门禁仍要靠 `里程碑 3.5` 去固化。

2026-03-18 的当前工作区追加收口：

- `发牌结束时的托管补亮收口` 现在也回到了共享状态机里：
  当玩家1已经切成托管而不是人类时，若最后一拍后仍存在补亮方案，共享层会直接按托管逻辑补亮或继续翻底，
  不会再把状态留在 `dealing + awaitingHumanDeclaration` 这种只适合真实人类点击的窗口。
  对应历史失败样本 `ZSO1hGI883r:beginner:game-11` 已新增 `check-managed-final-declaration.js` 专项回归。
- `朋友未站队阶段的连续高张试探` 现在又加了一层“历史公开消耗”约束：
  `probeRisk` 与 `unresolvedProbeVetoPenalty` 不再只看这一手本身，还会读取当前玩家已经公开打掉过多少 `A / 王 / 高主 / 带分牌`；
  朋友仍未站队时，连续重复这类高成本试探会被更重地下压。
- `朋友已站队后的控牌过热` 现在会额外识别“手里是否仍攥着过多王张 / 高主”：
  `controlExit` 除了 `safeLead / pointRunRisk / controlRisk`，也会继续参考这份“高主释放压力”，避免 AI 在适合交给同侧接手时还继续自己硬控。
- 这条“已站队后控牌降温”现在也正式下沉到了候选级排序：
  lead / follow 新增 `resolvedFriendControlCoolingPenalty`，
  当 rollout 已经提示 `controlExit / turnAccess / pointRunRisk / safeLead` 变差时，
  会直接下压继续烧 `王 / 高主 / 高张` 的候选，而不是只等统一评估在总分里慢慢体现。
  同时也保住了“高张定门再递牌”和 `public-info-only` 回牌窗口，不会因为新 penalty 去误推断暗断门。
- `保扣底时的王张释放 / 高主释放` 已正式进入统一评估：
  `evaluateState(...)` 新增 `bottomRelease` breakdown，
  `protect_bottom / grade_bottom` 目标也已同步对它加权，不再只靠 `chooseAiBottomPrepDiscard(...)` 这类局部 heuristic。
- `甩牌安全度 / 暴露风险` 也已正式进入统一评估：
  `evaluateState(...)` 新增 `throwRisk` breakdown，
  只按当前玩家自己的手牌与公开信息评估“当前局面下是否存在健康甩牌窗口”，
  `getIntermediateObjective(...)` 也已同步给 `lead / pressure_void / keep_control / protect_bottom / grade_bottom` 这些目标加了基础权重。
- `延迟站队时的同门结构保护` 也已补进共享跟牌链：
  当打家首轮先出朋友牌、朋友选择先压住不站队时，
  `chooseAiSupportBeforeReveal(...)`、共享跟单张排序和搜索兜底都会显式比较“是否拆掉同门对子 / 拖拉机 / 火车”，避免再出现 `8899 + 5` 却去跟 `8` 的走法。
- `固定 opening replay` 驱动的 beginner 首发补强也已落地：
  针对 `ZSO1hGI883r + QX27...Np4rS` 这类“打家明明握有 `AA + 跟手牌` 却先拆单张试探，亮友后又立刻切回低主清控”的样本，
  共享首发层现在已补上 `强结构促亮友` 和 `副牌控制链延续` 两条窄窗口 heuristic。
  对应专项回归已经固定在 `check-ai-beginner-opening-replay.js`，当前至少能把这条样本从旧版的闲家 `230` 分压到 `170` 分以内。
- beginner 的“叫朋友”这轮也已继续收口，但仍坚持纯 heuristic：
  `短门 A` 不再只走“持有第一张就叫第二张 / 持有前两张就叫第三张”的单线规则，
  而是会把同门 `第一张 / 第二张 / 第三张 A` 以及“无自持 A 的短门第一张”一起纳入比较，
  只根据同门长度、零分 / 小牌支撑、回手口和已知埋底做排序，不做任何开局模拟。
- beginner 的王张找友边界这轮也重新收紧了：
  当前不会再因为“副牌过脏”就把 `大王 / 小王` 混进常规叫朋友候选；
  这条能力重新只保留给更高难度，避免 fixed-seed 样本退回到 `第三张大王` 这类晚亮友、甚至直接找友失败的路线。
- 对应固定 seed 回归也已补齐：
  `check-beginner-friend-target-window.js` 现在会锁住 `ZSO1hGI883r` 里的 `game-01 / game-04 / game-12` 三条历史样本，
  当前分别要求继续命中 `第二张黑桃 A / 第一张黑桃 A / 第一张红桃 A`，确保 beginner 不会再回退到王张找友。
- 对应单测已补齐：
  `check-ai-intermediate-foundation.js` 现在会检查 `bottomRelease`，
  `check-ai-intermediate-search.js` 现在会检查“重复 probe 历史加重 veto”“已站队后高资源 hard-control 会吃 cooling penalty”和“释放高主后 `controlExit` / `bottomRelease` 变好”。

这次额外复核使用的现时证据：

- 快速单测 `52 / 52` 通过，说明目前共享层、声明阶段托管收口与 AI 专项回归处于稳定状态。
- 最新无 UI 全游戏回归 `3 / 3` 完局、`0` 告警，且 `selected turn_access_risk = 10`、`selected point_run_risk = 3`、`dangerous_point_lead = 1`，见 [artifacts/headless-regression/latest/analysis.md](../artifacts/headless-regression/latest/analysis.md)。
- 最新 mixed 验证 `2 / 2` 完局、`0` 告警，当前样本里 `turn_access_risk = 2`、`point_run_risk = 2`、`dangerous_point_lead = 2`、`unresolved_probe_risk = 0`，见 [artifacts/headless-regression/latest/mixed-validation/analysis.md](../artifacts/headless-regression/latest/mixed-validation/analysis.md)。
- 最新 headless 性能看板也已写进产物：
  无 UI 全游戏当前平均 AI 决策耗时 `276.16 ms`、`P95 = 1222.68 ms`；
  mixed 验证当前平均 AI 决策耗时 `787.78 ms`、`P95 = 1533.91 ms`，
  并会同步记录 `slowestGames / slowestDecisions` 供 fixed-seed 复跑。
- `3.5` 这轮最后补上的门禁也已经通过：
  `pointRunRisk` 样本必须带 `point_run_risk` 风险标记，
  固定 seed 产物里的 `summary / analysis / events / topSignalGames / samples` 也必须都能回溯到同一条 `baseSeed`，避免异常样本只能“看见”却无法复跑。
- `4` 这轮也补齐了最后一条摘要指标：
  headless 现在会正式统计 `turn_access_hold`，也就是“赢轮后下一拍仍有牌权优势”的正向样本；
  最新无 UI 回归里该指标为 `19`，mixed 验证里为 `7`。
- 大样本 mixed 长门禁脚本也已补齐：
  [tests/unit/check-headless-mixed-gate.js](../tests/unit/check-headless-mixed-gate.js) 与 `npm run test:headless:mixed-gate`
  现已作为 dedicated 长门禁入口存在，并已用 `2` 局 smoke 验证通过。
- 真实浏览器 UI smoke 也已经实际跑通：
  PC / mobile 两端都能在 `瞬` 档开启托管后完整结算，不再只是保留脚本入口但没人验证。
- 针对用户给出的固定种子 `ZSO1hGI883r`，当前初级全托管批跑已能稳定 `20 / 20` 完局，不再出现旧版 `game-11` 的 `发牌阶段未推进`；在此基础上，最新这版纯“短门 A 多候选”又把打家胜率从旧汇总的 `4 / 20` 提升到 `6 / 20`，对应产物见 [artifacts/headless-regression/zso1hgi883r-beginner-20-short-suit-a-v2/summary.json](../artifacts/headless-regression/zso1hgi883r-beginner-20-short-suit-a-v2/summary.json)。
- 这次 `6 / 20` 的净提升主要来自 `game-01`、`game-04` 两局由负转胜，以及 `game-02 / 06 / 13 / 14 / 15 / 16` 这几局闲家分显著下降；
  但 `game-03`、`game-10` 仍有局部回退，说明 beginner 叫朋友的纯 heuristic 还有继续细化的空间。
- 另一个会话一度把 beginner 放宽到王张找友后，同种子批跑退回到打家 `4 / 20`，且 `friend failed` 从 `1` 局升到 `3` 局；
  当前已把 beginner 重新收紧回“副牌高张优先”，最新产物 [artifacts/headless-regression/zso1hgi883r-beginner-20-tighten-joker-fallback/summary.json](../artifacts/headless-regression/zso1hgi883r-beginner-20-tighten-joker-fallback/summary.json) 为打家 `5 / 20`、`friend failed = 1`，说明这次收口至少把最明显的王张回退压回去了。

需要明确保留的边界：

- 这轮 mixed 样本只有 `2` 局，只能用来确认“当前代码没有明显回退”，不能替代路线图里那类 `20` 局混编门槛。
- 因此，路线图里的优先级不变：仍然先修高风险领牌，再修未站队阶段高张试探，再给 `clear_trump / keep_control` 降温，最后才固化长期门禁。

## 一句话结论

- `初级`：已经稳定，基本符合当前产品定义，短期不是主战场。
- 但这不代表初级不再需要 fixed replay 级别的补洞；像这次 `ZSO1hGI883r` 这种“先拆强结构、再过早低主清控”的样本，仍然适合用非常窄的 replay 驱动 heuristic 去修，而不是放任它长期保留成体验型输法。
- `中级`：已经从“纯启发式”进入“启发式 + 短前瞻搜索”的第一阶段，属于当前最关键、也最接近收益兑现的位置。
- `高级`：目前仍然是“完整记牌版的中级”，还没有进入路线图里定义的 belief / 多世界模拟阶段。
- 之前暴露出来的“甩牌透视”红线已经修正：AI 决策层不再直接读取对手暗手判断甩牌成败，而是改成基于公开信息和记牌能力做风险评估。
- 对局节奏现已和 AI 难度拆开：`慢 / 中 / 快 / 瞬` 只控制 AI 行动等待与过渡速度，不改变三档 AI 的决策强度和信息利用边界。
- mobile 顶部托管现已对齐 `关闭 / 本局托管 / 跨局托管` 三态；这只改变玩家 1 是否交给 AI 接管，以及是否跨局保留，不改变 AI 的难度层级、信息边界和启发式强度。
- PC 与 mobile 顶部新增的 `重置本局` 图标同样只属于局内流程控制：它只会保留当前级别并重新洗牌发牌，不会改变 AI 难度、策略边界或信息利用能力。
- mobile 设置菜单现已移除重复的 `重置本局` 按钮；这次只是把同一能力收口到顶部高频入口，不涉及任何 AI 策略、评分或 heuristic 调整。
- App 默认入口切到 `index-app.html`、并把牌桌改成“顶部固定 / 中部自适应 / 底部固定”，同样只属于原生壳布局修复；它不会改变 AI 难度定位、评分逻辑或任何策略边界。
- App 原生壳现在会额外把“最近一局复盘输入”里的 `回放种子 / 开局码` 保存到原生存储，方便 QA 和异常复盘；当前这两项已经统一压成 `11` 位 / `169` 位字母数字混合短码，但这同样只属于调试基础设施整理，不会给 AI 增加任何额外信息，也不提供中途续局能力。
- `上一轮回看` 改成“左摘要 + 右牌列”的紧凑横排，同样只属于 UI 密度优化；它不会改变 AI 的策略、启发式、搜索边界或公开信息定义。
- 跟牌候选枚举已补上“直接匹配首家牌型优先 + 中小规模组合空间完整扫描”的保护，不再把真实存在的合法主拖拉机误判成“无合法跟牌”并卡住回合。

换句话说，当前项目最准确的判断不是“高级不够强”，而是“中级搜索框架已经起骨架，但还没完全收口；高级暂时还不该往 hidden belief 硬冲”。

## 最近 Bug Fix

- 修复了一个会让高级 AI 在中盘复杂多张跟牌里严重卡顿的搜索预算问题：
  当 `follow` 局面同时满足“单手跟牌张数很大 + 合法候选很多”时，旧实现会把 shortlist 里的每个候选都送去 rollout，导致单个玩家一次跟牌就卡到数秒以上。
- 当前实现已改成：
  先按 heuristic 保留少量高价值跟牌，再按复杂度决定 rollout 预算；最重的 `5` 张复杂跟牌样本直接退回纯 heuristic shortlist，不再继续 rollout。
- 对应回归已补到 [tests/unit/check-ai-follow-rollout-budget.js](../tests/unit/check-ai-follow-rollout-budget.js)。
- 修复了一个会让 `保大对先贴牌` 过早吞掉安全毙牌的共享跟牌短路：
  当 AI 已经缺首门、当前又是闲家正在拿分的单张窗口时，旧逻辑只要看到“某些可毙单张会拆高对”，就会直接退回贴小牌；
  现在只有在“所有可毙单张都会拆掉受保护高对”时才保留这条短路，若仍存在不拆高对的安全主牌，beginner 与 intermediate 都会继续评估这些毙牌。
- 对应回归已补到 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- 修复了一个会让 `延迟站队` 支持跟牌拆掉同门拖拉机的共享排序缺口：
  当打家先出朋友牌、朋友决定先压住不亮身份时，旧逻辑会只按“先丢零分牌”挑支持牌，导致像 `8899 + 5` 这种手牌错误跟出 `8`；
  当前实现已改成先比较同门结构损耗，再看分值与牌力，beginner / intermediate / advanced 都会优先保住同门现成结构。
- 对应回归同样补到 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- `级牌扣底` 路线现在已经从“beginner 专属 heuristic”扩成 `beginner + intermediate` 共用能力：
  `beginner` 继续保留轻量画像、吊主和延迟站队；
  `intermediate` 则新增了 `grade_bottom` objective，并把“保王 / 保级牌结构 / 特殊级升权”正式接进评分器与 rollout 扩展。
- 对应回归已补到 [tests/unit/check-ai-grade-bottom-strategy.js](../tests/unit/check-ai-grade-bottom-strategy.js)。
- 修复了一个会让 AI 在跟主拖拉机时卡回合的合法候选遗漏问题：
  当同门牌很多、合法结构组合在 `n 选 k` 顺序里排得比较靠后时，旧实现可能因为固定组合上限过早截断，导致 AI 误判自己“没有合法牌可出”。
- 当前实现会先优先注入与首家牌型完全匹配的结构候选，再按组合规模动态放宽枚举预算；对应回归见 [tests/unit/check-ai-follow-candidate-limit.js](../tests/unit/check-ai-follow-candidate-limit.js)。
- `递牌` 现在有了正式实现口径：
  `beginner` 会在公开绝门已经明确、且自己没有明显主控手时，把小牌递给同伴接手；
  `intermediate` 则额外支持“公开高张已经被敌方花掉后的软递牌”“接同伴递牌时用更大的主/王稳接”，以及“朋友未站队时，中位把前位闲家递出的高副牌当成接手窗口、主动用同门控张抢回牌权”。
- 对应回归已补到 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- 修复了一个中级 AI 在未站队阶段的接手误判：
  当上一手闲家前位打出 `10 / J / Q / K` 这类公开上已经不再稳控的副牌、且打家仍在后位时，旧实现会把中位继续压回 `tentative_defender_hold`，导致本该用同门 `A / K` 抢回主动的窗口被错过。
- 当前实现已补上“未站队递门接手”识别，并改成按当前墩真实顺位判断后位是否还有打家；对应回归已补到 [tests/unit/check-ai-intermediate-foundation.js](../tests/unit/check-ai-intermediate-foundation.js)。
- `beginner` 的闲家首发又补了一条更靠前的“先出大牌保控制” heuristic：
  当同伴已知、这门还没人公开绝、自己手里又有 `A` 且后面还能留小牌时，当前实现会先把这门 `A` 或以 `A` 为顶张的大结构牌兑现，再把后续小牌留给下一拍递同伴，而不是一上来就机械先递小牌。
- 对应回归同样补到 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- `高张定门再递牌` 现在已从“闲家侧 heuristic”扩到“朋友已站队后的通用协同”：
  打家若已经没有明显主控资源，也会先考虑用副牌 `A` 定门，再把同门小牌留给后续递牌；但只要同伴已经公开绝这门，就会立刻回退成直接递牌，而不是继续打信号。
- 对应回归同样补到 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- 修复了一个初级和中级共用的“贴大对留 5”跟牌误判：
  当 AI 已经缺首门、面对单张跟牌，而手里同时有 `10+ / 级牌 / 王` 的大对和 `5` 之类低分散牌时，当前实现会显式优先贴低分散牌，保住大对继续作为后续控轮资源。
- 对应回归已补到 [tests/unit/check-ai-intermediate-foundation.js](../tests/unit/check-ai-intermediate-foundation.js)。
- `危险带分领牌` 现在新增了一层 rollout 后的“控制型硬否决”：
  当 objective 已经切到 `clear_trump / keep_control / pressure_void / protect_bottom / grade_bottom` 一类控制目标，且候选本身已经被识别为高风险带分领牌，同时 rollout 又继续暴露 `turn_access_risk / point_run_risk`、下一拍不安全或未来收益不足时，这类候选会被二次明显降权，而不再只吃一层 heuristic 惩罚。
- 对应回归已补到 [tests/unit/check-ai-intermediate-search.js](../tests/unit/check-ai-intermediate-search.js)。
- `朋友未站队阶段的高张试探预算` 现在也有了正式评分口径：
  `probeRisk` 会在未站队阶段评估“高张 / 主控 / 带分资源的消耗是否值得”，
  `unresolvedProbeVetoPenalty` 则会在首发与跟牌排序里，对没有 `turn_access_hold / 正向 futureDelta / 更强 friendBelief` 兜底的高成本试探追加 veto 或降权。
- 这条线在 2026-03-18 又继续补了一层“连续试探历史”：
  若当前玩家在朋友仍未站队时，已经公开打掉过较多 `A / 王 / 高主 / 带分牌`，后续再拿高成本牌试探会被视作“重复过热 probe”进一步加重 veto，而不再只按单手成本处理。
- 同一条专项回归同样补到 [tests/unit/check-ai-intermediate-search.js](../tests/unit/check-ai-intermediate-search.js)。
- `朋友已站队后的控牌降温` 现在又往前推进了一步：
  统一评估器新增 `controlExit` 分项，专门判断“当前控牌是否还能安全续控，或是否应该顺势交给同侧接手”；
  目标层也已给 `resolved friend + clear_trump / keep_control` 增加 `controlExit` 权重，并对打家侧过热的 `control / tempo` 做了小幅降温。
- 2026-03-18 又补上了“高主释放压力”：
  `controlExit` 现在会额外识别“我方已适合同侧接手，但当前玩家手里仍攥着过多王张 / 高主”的状态；
  同时 `evaluateState(...)` 新增了 `bottomRelease`，把“保扣底时是否已经卸出可让给同侧的高主资源”提升成正式 breakdown。
- 同一条专项回归也已补到 [tests/unit/check-ai-intermediate-search.js](../tests/unit/check-ai-intermediate-search.js)。
- 修复了一个初级和中级共用的跟牌误判：
  当 AI 已经缺首门、又没有成型主可毙时，旧排序会把“另一门正好成对”误当成更顺手的贴牌，导致把副牌对子白白贴掉。
- 当前实现已改成：缺门贴副时不再奖励“别门同型”，并显式优先保留副牌对子、连对等后续资源；对应回归同样写入 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- 仓库仍保留 `m_cards_sprite.png` 的生成链路，并已把它正式接成 `现代整图` 主题；当前运行态默认整图牌面仍保持为 `poker.png`。这只改渲染资源入口，不改变 AI 的规则边界、难度差异和评分逻辑。
- `modern-sprite` 现已恢复为真实可选主题键值；这依然只是表现层配置变化，不改变 AI 输入、评分或 heuristic。
- 手游手牌区的花色标签现已去掉张数计数，只保留花色文字；这属于移动端信息密度调整，不改变 AI 的难度档位、信息边界或任何 heuristic。
- 手游顶部 `主 / 朋` 状态牌现已统一复用当前牌面主题，并给小卡位单独使用铺满式 sprite；这仍属于 UI 渲染修复，不改变 AI 读取的信息边界与任何 heuristic。
- PC 与 mobile 顶栏现已补回 `重置本局` 图标入口，并明确限定为“保级重洗当前局”；这次变更只影响共享状态机与 UI 入口，不改变任何 AI 评估和 heuristic。

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
- `短门叫朋友` 现在也被显式接进中级 / 高级叫朋友评分：当长门第二张 `A` 与短门 `K + 小牌` 的找友路线对冲时，中级 / 高级会额外奖励“短门更容易找朋友、也更容易回手”的路线，而不再只因为长门同门牌多就偏向长门 `A`，见 [src/shared/game.js](../src/shared/game.js) 与 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- `延迟站队与叫死协同`：规则里关于“打家先出次高牌时朋友可延迟站队”“第三张叫死时提前按朋友思路协同”都已有专项回归，见 [src/shared/ai-shared.js](../src/shared/ai-shared.js) 与 [tests/unit/check-ai-friend-strategy.js](../tests/unit/check-ai-friend-strategy.js)。
- `无主打家强主先行`：无主打家会先清自己可用的大主和高张，再转入找朋友，见 [src/shared/ai-shared.js](../src/shared/ai-shared.js) 与 [src/shared/ai-beginner.js](../src/shared/ai-beginner.js)。
- `后程保扣底转向`：当前已经有 `protect_bottom / bottomRisk / chooseAiBottomPrepDiscard`，说明“后程转守底”和“同侧领先时优先腾出可扣底资源”已有第一版实现，见 [src/shared/ai-objectives.js](../src/shared/ai-objectives.js)、[src/shared/ai-evaluate.js](../src/shared/ai-evaluate.js) 与 [src/shared/ai-shared.js](../src/shared/ai-shared.js)。
- `不透视甩牌`：甩牌风险已经改成公开信息评估，不再直接读对手暗手，见 [src/shared/ai-candidates.js](../src/shared/ai-candidates.js) 与 [tests/unit/check-ai-intermediate-foundation.js](../tests/unit/check-ai-intermediate-foundation.js)。
- `递牌` 已有初级 / 中级分层：
  初级只用公开绝门做保守递牌；中级则会在公开高张耗尽、敌方仍保有小牌的情况下，把这门视作更值得尝试的递牌门，并在接牌时考虑直接用更大的主或王稳接。
- 新补了一条未站队阶段的接手修正：
  如果前位闲家递出的是公开上已经不再稳控的高副牌、打家仍在后位，而中位自己握有同门真正控张，中级会优先把这一手抢下来，不再被 `tentative_defender_hold` 误压回去。
- `高张定门再递牌` 也开始进中级统一评分：
  当朋友已站队、公开信息显示这门全桌都还在跟、自己又同时握有这门 `A` 和后续小牌时，中级会把这手 `A` 视作“高张信号 + 递牌铺垫”的正向候选，而不是一律把它和控制过热混为一谈。

仍未完全满足的部分：

- `朋友未站队时的简单概率态` 还没有落地。
  现在更像“持有朋友牌 / 确定成友 / 暂定闲家”的离散门槛，而不是对“谁更像朋友”持续打分，这和路线图目标仍有差距。
- `甩牌风险` 还没有进入 `evaluateState` 的正式 breakdown。
  目前它主要停留在候选标签和首发评分修正里，导致 rollout 能看到风险，但统一评分器还没把它当作一等公民。
- `保扣底时尽量提前甩掉王，给同伴保留有效扣底空间` 还没有完全正式化。
  现在有 `chooseAiBottomPrepDiscard` 这类启发式，但还没有被拆成显式的“王张释放 / 扣底窗口让渡 / 末局主牌保留”评分项。
- `朋友已站队后的策略切换` 已经存在，但仍部分依赖短路规则。
  headless 数据已经证明它会切，但实现里仍留有 `forced reveal / support-before-reveal` 这类直接返回逻辑，说明还没彻底下沉为评分器行为。
- `非打家的级牌扣底潜力预判` 已经落了 beginner 第一版，但还不完整。
  现在已完成到：
  `beginner` 会在开局先看“级牌 / 主长度 / 倒数第二手上手的大主”是否同时具备，再决定是否把级牌扣底当成局内副目标；如果后续被叫到朋友但不是叫死，也会允许短暂保留犹豫，不急着立刻强站队。
  `intermediate` 则已经能把这条路线接进 objective、breakdown 和跟牌/首发评分；在 `J / Q / K / A` 这类特殊级里，也会进一步提高这条路线的权重。
  仍未完成的部分是：这条路线还没有完全沉到“更完整的末局兑现、多拍控轮和 sampled worlds”。
- `打家亮友后控局 / 无主少探朋友门 / 晚亮友 bailout` 已经落了 beginner 第一版，但还不完整。
  现在已完成到：
  `beginner` 会在朋友刚亮后的短窗口里优先 `清主 / 续控`；无主打家若前几轮已经明显握有双王、较长主或稳定主结构，会先走控制线；若到第 `6` 轮左右朋友仍未亮，则会切到一版 `solo banker fallback`，优先保住主控和低分安全牌。
  `intermediate` 目前先复用同一组入口规则，避免运行时覆盖 beginner 入口后丢掉这批行为。
  仍未完成的部分是：这组规则当前仍以首发入口 heuristic 为主，还没有完全沉到统一跟牌评分与多轮控局链路。

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
- `递牌` 也应归到这一类协同打法里：
- 初级只保留“公开绝门递牌”的硬规则。
- 中级已经开始把“软递牌首发”和“稳接递牌”的判断接进评分，但还没有完全沉到统一 objective。

第四优先级：`把规则复盘场景补成专项回归`

- 新增“未站队阶段误判朋友方向”的固定样本。
- 新增“未站队阶段高张试探是否被 probeRisk / unresolvedProbeVetoPenalty 正确压住”的固定样本。
- 新增“保扣底阶段是否及时卸王”的固定样本。
- 新增“甩牌风险进入 evaluateState 后，权重调整不回退”的单项回归。

第五优先级：`把级牌扣底预判从 beginner 第一版推进到完整链路`

- 保留现有“非打家开局轻量判定”的入口，但把它继续接进更完整的末局控轮与扣底兑现。
- 让“吊主 + 保大主 + 保级牌结构”不只存在于入口 heuristic，而是能进入统一评分项。
- 让“被叫到朋友但不是叫死时允许短暂延迟强站队”拥有更清晰的回退时机，避免中后盘过度犹豫。

第六优先级：`把打家控局补强从首发入口推进到整轮策略`

- 保留现有“亮友后短窗口清主续控 / 无主少探朋友门 / 晚亮友先保自己”的入口规则。
- 继续把这些规则推进到跟牌评分、分数危险响应和更完整的多轮控局链路，减少它们只在首发时生效的局限。
- 让打家在“朋友已亮”和“朋友久不亮”两类局面里，都能更稳定地切换到正确模式，而不是靠几条短路 return 勉强兜住。

## 现状评估

### 初级 AI

当前判断：`已完成当前档位目标，成熟度高`

依据：

- 路线图把初级定义为“规则合法 + 固定启发式 + 只用公开断门与公开分数信息”，见 [ai-roadmap.md](ai-roadmap.md#L22)。
- 当前决策入口把 `beginner` 单独路由到 `getBeginnerLegalHintForPlayer`，而非走中级搜索链路，见 [src/shared/ai.js](../src/shared/ai.js)。
- 回归里也专门验证了初级不记额外出牌信息，只保留公开断门与公开分数门控，见 [tests/unit/check-ai-memory-strategy.js](../tests/unit/check-ai-memory-strategy.js#L171)。

和路线图对比：

- 对“当前产品定义”的初级来说，基本对齐。
- 对“长期 4 档目标”里的初级而言，还可以继续补一点身份协同、打家控局完整度和末局兑现，但这些更多是锦上添花，不是当前唯一短板。

结论：

- 初级现在更像“稳定基线”和“回归兜底档”。
- 仍然不建议把主要精力长期砸在初级加规则上，但这轮 headless 已经暴露出“打家控局”仍值得做少量高收益补强。

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
- `throwRisk` 现在已经正式进入 `evaluateState(...)` breakdown，
  因此“甩牌风险是否正式评分化”这条不再是 `评估函数第二版` 的缺口；
  当前更实际的缺口已经转成“剩余高风险样本能否被专项回归稳定钉住”和“性能上限是否足够稳”。

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
- mixed `20` 局的正式长跑执行与持续维护。
- 第二阶段性能收口，例如克隆/评估缓存与更细的耗时看板。
- 高级的 belief / sampled worlds 还完全没有开始。
- 候选与状态彻底解耦仍是重要架构缺口，但当前最直接影响实战体感的问题，已经转为残局 `牌权续控`、失先手代价和朋友已站队后的策略切换是否足够完整。

## 下一步最值得做的提升

### 第一优先级：继续做大样本 mixed 守门与第二阶段性能收口

这是现在最该继续推进的一步。

原因：

- 当前中级已经能看到“本轮结束”和“下次自己行动前”，`turnAccess / controlRisk / pointRunRisk / safeLead / controlExit / probeRisk / throwRisk / bottomRelease` 也都已经进了统一评分，`3.5 / 4` 需要的 fixed-seed 门禁、摘要指标和真实页面 smoke 也已补齐。
- 现在更直接影响实战体感的，不再是“有没有这些门禁”，而是“这些能力在更大样本 mixed 和更复杂热路径下会不会回升，或被性能成本拖慢”。

建议的具体目标：

- 现在中级已经有 rollout、完整 breakdown、fixed-seed 复盘门禁、`turn_access_hold` 正向摘要和真实页面 smoke，最应该做的是把这些能力放到更大样本 mixed 与第二阶段性能守门里验证，而不是继续盲加新分项。
- 当前 `dangerous_point_lead / point_run_risk / turn_access_hold` 的 headless 统计都已经收紧成“可复盘样本”口径，说明后续做大样本门槛时，数字会更有参考价值。

建议重点：

- 持续执行 mixed `20` 局长门禁，确认 `dangerous_point_lead / point_run_risk / turn_access_hold` 不回升。
- 继续盯 `friend=revealed` 下的 `keep_control / clear_trump / protect_bottom` 场景，但重点转成“在更大样本里是否回升”。
- 再按 `slowestGames / slowestDecisions` 暴露出的热点补第二阶段性能收口，例如克隆/评估缓存与更细的耗时观测。
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

## 2026-03-16 人类声明交互同步

- 本次改动只修正人类玩家的声明 UI：补亮窗口新增 `不亮`，PC 最后反主的跳过按钮恢复成 `不反主` 正常文案。
- AI 亮主 / 反主策略没有调整；AI 仍按现有规则自行决定亮主、反主或放弃。
- 这意味着本轮不需要改 AI 强度定位，但后续凡是继续改声明阶段交互，仍要验证不会误导用户理解 AI 真实决策能力。

## 2026-03-16 主牌拖拉机自动选择性能同步

- 本轮不改变 beginner / intermediate 的跟牌策略目标，只修正“候选层如何更快拿到同型主拖拉机”的实现。
- 当跟牌方在同门里已经持有可直接匹配的主牌拖拉机时，候选层现在会把精确连组视为完整合法集，直接返回，不再继续做组合枚举补齐。
- 这属于性能与工程收口修复，不应被记成新的 AI 智力提升；难度定位保持不变。
