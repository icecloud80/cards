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
- `危险带分领牌` 与 `point_run_risk` 都出现了继续下降：这轮全桌 smoke 里，`dangerous_point_lead` 从上一轮观察到的 `4` 次降到 `2` 次，`point_run_risk` 从 `13` 次降到 `9` 次，说明“控制型高风险领牌二次否决”方向有效；但 mixed 小样本里仍有 `1` 次危险带分领牌，说明这条线还没有收官。
- 当前最准确的工程判断不是“AI 还不够聪明”，而是“中级搜索框架已经站住，接下来应该继续做评估函数第二版和 legacy 规则下沉”。

这次额外复核使用的现时证据：

- 快速单测 `36 / 36` 通过，说明目前共享层与 AI 专项回归处于稳定状态。
- 最新无 UI 全游戏回归 `3 / 3` 完局、`0` 告警，见 [artifacts/headless-regression/latest/analysis.md](../artifacts/headless-regression/latest/analysis.md)。
- 最新 mixed 验证 `2 / 2` 完局、`0` 告警，当前样本里 `turn_access_risk = 2`、`point_run_risk = 3`、`dangerous_point_lead = 1`，见 [artifacts/headless-regression/latest/mixed-validation/analysis.md](../artifacts/headless-regression/latest/mixed-validation/analysis.md)。

需要明确保留的边界：

- 这轮 mixed 样本只有 `2` 局，只能用来确认“当前代码没有明显回退”，不能替代路线图里那类 `20` 局混编门槛。
- 因此，路线图里的优先级不变：仍然先修高风险领牌，再修未站队阶段高张试探，再给 `clear_trump / keep_control` 降温，最后才固化长期门禁。

## 一句话结论

- `初级`：已经稳定，基本符合当前产品定义，短期不是主战场。
- `中级`：已经从“纯启发式”进入“启发式 + 短前瞻搜索”的第一阶段，属于当前最关键、也最接近收益兑现的位置。
- `高级`：目前仍然是“完整记牌版的中级”，还没有进入路线图里定义的 belief / 多世界模拟阶段。
- 之前暴露出来的“甩牌透视”红线已经修正：AI 决策层不再直接读取对手暗手判断甩牌成败，而是改成基于公开信息和记牌能力做风险评估。
- 对局节奏现已和 AI 难度拆开：`慢 / 中 / 快 / 瞬` 只控制 AI 行动等待与过渡速度，不改变三档 AI 的决策强度和信息利用边界。
- mobile 顶部托管现已对齐 `关闭 / 本局托管 / 跨局托管` 三态；这只改变玩家 1 是否交给 AI 接管，以及是否跨局保留，不改变 AI 的难度层级、信息边界和启发式强度。
- PC 与 mobile 顶部新增的 `重置本局` 图标同样只属于局内流程控制：它只会保留当前级别并重新洗牌发牌，不会改变 AI 难度、策略边界或信息利用能力。
- mobile 设置菜单现已移除重复的 `重置本局` 按钮；这次只是把同一能力收口到顶部高频入口，不涉及任何 AI 策略、评分或 heuristic 调整。
- App 默认入口切到 `index-app.html`、并把牌桌改成“顶部固定 / 中部自适应 / 底部固定”，同样只属于原生壳布局修复；它不会改变 AI 难度定位、评分逻辑或任何策略边界。
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

## 2026-03-16 人类声明交互同步

- 本次改动只修正人类玩家的声明 UI：补亮窗口新增 `不亮`，PC 最后反主的跳过按钮恢复成 `不反主` 正常文案。
- AI 亮主 / 反主策略没有调整；AI 仍按现有规则自行决定亮主、反主或放弃。
- 这意味着本轮不需要改 AI 强度定位，但后续凡是继续改声明阶段交互，仍要验证不会误导用户理解 AI 真实决策能力。

## 2026-03-16 主牌拖拉机自动选择性能同步

- 本轮不改变 beginner / intermediate 的跟牌策略目标，只修正“候选层如何更快拿到同型主拖拉机”的实现。
- 当跟牌方在同门里已经持有可直接匹配的主牌拖拉机时，候选层现在会把精确连组视为完整合法集，直接返回，不再继续做组合枚举补齐。
- 这属于性能与工程收口修复，不应被记成新的 AI 智力提升；难度定位保持不变。
