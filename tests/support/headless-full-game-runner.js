const fs = require("fs");
const path = require("path");

const { loadHeadlessGameContext } = require("./headless-game-context");

const DEFAULT_DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const DECISION_SIGNAL_SAMPLE_LIMIT = 5;
const CONTROL_SHIFT_OBJECTIVES = new Set(["clear_trump", "keep_control", "pressure_void"]);

/**
 * 作用：
 * 把命令行参数解析成 headless 回归配置。
 *
 * 为什么这样写：
 * 这套 runner 既要能作为默认单测运行，也要支持后续批量采集数据，所以需要保留可配置入口。
 *
 * 输入：
 * @param {string[]} [argv=process.argv.slice(2)] - 传入脚本的命令行参数列表。
 *
 * 输出：
 * @returns {{gamesPerDifficulty: number, difficulties: string[], baseSeed: string, outputDir: string, maxSteps: number}} 归一化后的回归配置。
 *
 * 注意：
 * - 未识别参数会直接报错，避免静默拼写错误。
 * - `outputDir` 会被解析为绝对路径，方便测试与脚本统一引用。
 */
function parseHeadlessRegressionArgs(argv = process.argv.slice(2)) {
  const options = {
    gamesPerDifficulty: 1,
    difficulties: [...DEFAULT_DIFFICULTIES],
    baseSeed: "headless-regression",
    outputDir: path.resolve(process.cwd(), "artifacts/headless-regression/latest"),
    maxSteps: 4000,
  };

  for (const argument of argv) {
    if (argument.startsWith("--games-per-difficulty=")) {
      options.gamesPerDifficulty = Number(argument.split("=")[1]);
      continue;
    }
    if (argument.startsWith("--difficulty=")) {
      options.difficulties = argument.split("=")[1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (argument.startsWith("--seed=")) {
      options.baseSeed = argument.split("=")[1] || options.baseSeed;
      continue;
    }
    if (argument.startsWith("--output-dir=")) {
      options.outputDir = path.resolve(process.cwd(), argument.split("=")[1] || options.outputDir);
      continue;
    }
    if (argument.startsWith("--max-steps=")) {
      options.maxSteps = Number(argument.split("=")[1]);
      continue;
    }
    throw new Error(`未知参数：${argument}`);
  }

  if (!Number.isInteger(options.gamesPerDifficulty) || options.gamesPerDifficulty <= 0) {
    throw new Error(`games-per-difficulty 必须是正整数，当前为 ${options.gamesPerDifficulty}`);
  }
  if (!Number.isInteger(options.maxSteps) || options.maxSteps <= 0) {
    throw new Error(`max-steps 必须是正整数，当前为 ${options.maxSteps}`);
  }
  if (!Array.isArray(options.difficulties) || options.difficulties.length === 0) {
    throw new Error("至少要指定一个 AI 难度");
  }

  return options;
}

/**
 * 作用：
 * 为单局回归构造可复现、可读的派生 seed。
 *
 * 为什么这样写：
 * 批量跑多个难度和多局时，需要既能保证可复现，又能通过 seed 名称直接定位具体样本。
 *
 * 输入：
 * @param {string|number} baseSeed - 本轮回归的基础种子。
 * @param {string} difficulty - 当前局对应的 AI 难度。
 * @param {number} gameIndex - 当前难度下的第几局。
 *
 * 输出：
 * @returns {string} 带有难度和局号信息的派生 seed。
 *
 * 注意：
 * - seed 会直接出现在日志文件名和汇总 JSON 中，保持可读性比压缩长度更重要。
 * - 不要改成随机生成，否则失败局无法通过 seed 直接复跑。
 */
function buildGameSeed(baseSeed, difficulty, gameIndex) {
  return `${baseSeed}:${difficulty}:game-${String(gameIndex).padStart(2, "0")}`;
}

/**
 * 作用：
 * 将牌对象收敛成适合写日志的轻量结构。
 *
 * 为什么这样写：
 * 结构化事件和分析报告不需要完整图片路径等展示信息，压缩字段后更利于后续做数据处理。
 *
 * 输入：
 * @param {object[]} cards - 当前动作涉及的牌对象列表。
 *
 * 输出：
 * @returns {Array<{id: string, suit: string, rank: string}>} 轻量牌面数组。
 *
 * 注意：
 * - 返回值只保留稳定的业务字段。
 * - 这里假设传入对象已经是当前上下文里的合法牌。
 */
function summarizeCards(cards) {
  return (Array.isArray(cards) ? cards : []).map((card) => ({
    id: card.id,
    suit: card.suit,
    rank: card.rank,
  }));
}

/**
 * 作用：
 * 将叫主/反主信息转成稳定的日志结构。
 *
 * 为什么这样写：
 * 叫主结果既会出现在状态里，也会出现在事件里，统一格式后便于做 diff 和聚合分析。
 *
 * 输入：
 * @param {object|null} declaration - 当前状态里的叫主对象。
 *
 * 输出：
 * @returns {object|null} 可序列化的声明摘要。
 *
 * 注意：
 * - 需要包含 `cards`，方便后续分析叫主强度。
 * - 空值要显式返回 `null`，不要混成空对象。
 */
function summarizeDeclaration(declaration) {
  if (!declaration) {
    return null;
  }
  return {
    playerId: declaration.playerId,
    suit: declaration.suit,
    rank: declaration.rank,
    count: declaration.count,
    cards: summarizeCards(declaration.cards),
  };
}

/**
 * 作用：
 * 将朋友目标牌状态转成稳定的摘要。
 *
 * 为什么这样写：
 * 朋友是否站队、是否误出，是分析完局性和后续 AI 训练价值的重要标签。
 *
 * 输入：
 * @param {object|null} friendTarget - 当前状态中的朋友目标牌对象。
 *
 * 输出：
 * @returns {object|null} 可写入日志和汇总报告的朋友状态摘要。
 *
 * 注意：
 * - `label` 字段保留原文，便于直接阅读文本日志。
 * - 这里不推导阵营，仅忠实反映状态机结果。
 */
function summarizeFriendTarget(friendTarget) {
  if (!friendTarget) {
    return null;
  }
  return {
    suit: friendTarget.suit,
    rank: friendTarget.rank,
    occurrence: friendTarget.occurrence,
    label: friendTarget.label,
    revealed: !!friendTarget.revealed,
    revealedBy: friendTarget.revealedBy || null,
    failed: !!friendTarget.failed,
    matchesSeen: friendTarget.matchesSeen || 0,
  };
}

/**
 * 作用：
 * 将朋友目标对象归一化为当前时刻的朋友状态标签。
 *
 * 为什么这样写：
 * headless 结构化事件需要记录“这一步发生时朋友是否已经站队”，
 * 这样后续才能在批量复盘里判断策略是否已从“找朋友”切到“协同 / 清主 / 保先手”。
 *
 * 输入：
 * @param {object|null} friendTarget - 当前状态中的朋友目标牌摘要或原始对象。
 *
 * 输出：
 * @returns {"not_called"|"revealed"|"failed"|"unrevealed"} 当前朋友状态标签。
 *
 * 注意：
 * - 这里不推导阵营强弱，只忠实反映状态机公开出来的信息。
 * - 调用方可以传摘要对象，也可以传原始 `state.friendTarget`，只要字段兼容即可。
 */
function getFriendStateLabel(friendTarget) {
  if (!friendTarget) {
    return "not_called";
  }
  if (friendTarget.revealed) {
    return "revealed";
  }
  if (friendTarget.failed) {
    return "failed";
  }
  return "unrevealed";
}

/**
 * 作用：
 * 提取一份适合训练数据与回归日志复盘的 AI 决策摘要。
 *
 * 为什么这样写：
 * 中高级 AI 的 `lastAiDecision` 里信息很多，但不适合整对象落盘；保留最关键的候选和评分即可兼顾可读性与数据价值。
 *
 * 输入：
 * @param {object|null} decision - `state.lastAiDecision` 的当前值。
 *
 * 输出：
 * @returns {object|null} 精简后的决策摘要。
 *
 * 注意：
 * - 这里只保留前 3 个候选，避免日志无限膨胀。
 * - 返回结构必须避免引用原状态对象，防止后续被业务代码继续修改。
 */
function summarizeAiDecision(decision) {
  if (!decision) {
    return null;
  }
  return {
    mode: decision.mode || null,
    objective: decision.objective
      ? {
          primary: decision.objective.primary || null,
          secondary: decision.objective.secondary || null,
        }
      : null,
    decisionTimeMs: typeof decision.decisionTimeMs === "number" ? decision.decisionTimeMs : null,
    debugStats: decision.debugStats
      ? {
          candidateCount: decision.debugStats.candidateCount,
          filteredCandidateCount: decision.debugStats.filteredCandidateCount,
          filteredReasonCounts: decision.debugStats.filteredReasonCounts ? { ...decision.debugStats.filteredReasonCounts } : {},
          completedRolloutCount: decision.debugStats.completedRolloutCount,
          extendedRolloutCount: decision.debugStats.extendedRolloutCount,
          turnAccessRiskCount: decision.debugStats.turnAccessRiskCount,
          pointRunRiskCount: decision.debugStats.pointRunRiskCount,
          maxRolloutDepth: decision.debugStats.maxRolloutDepth,
        }
      : null,
    selectedSource: decision.selectedSource || null,
    selectedTags: Array.isArray(decision.selectedTags) ? [...decision.selectedTags] : [],
    selectedScore: typeof decision.selectedScore === "number" ? decision.selectedScore : null,
    selectedDangerousPointLeadPenalty: typeof decision.selectedDangerousPointLeadPenalty === "number"
      ? decision.selectedDangerousPointLeadPenalty
      : null,
    selectedStructureControlPenalty: typeof decision.selectedStructureControlPenalty === "number"
      ? decision.selectedStructureControlPenalty
      : null,
    selectedRolloutTriggerFlags: Array.isArray(decision.selectedRolloutTriggerFlags)
      ? [...decision.selectedRolloutTriggerFlags]
      : [],
    selectedCards: summarizeCards(decision.selectedCards),
    topCandidates: (Array.isArray(decision.candidateEntries) ? decision.candidateEntries : [])
      .slice(0, 3)
      .map((entry) => ({
        cards: summarizeCards(entry.cards),
        source: entry.source || null,
        tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
        score: typeof entry.score === "number" ? entry.score : null,
        heuristicScore: typeof entry.heuristicScore === "number" ? entry.heuristicScore : null,
        dangerousPointLeadPenalty: typeof entry.dangerousPointLeadPenalty === "number"
          ? entry.dangerousPointLeadPenalty
          : null,
        structureControlPenalty: typeof entry.structureControlPenalty === "number"
          ? entry.structureControlPenalty
          : null,
        rolloutScore: typeof entry.rolloutScore === "number" ? entry.rolloutScore : null,
        rolloutDepth: entry.rolloutDepth || 0,
        rolloutCompleted: !!entry.rolloutCompleted,
        rolloutReachedOwnTurn: !!entry.rolloutReachedOwnTurn,
        rolloutTriggerFlags: Array.isArray(entry.rolloutTriggerFlags) ? [...entry.rolloutTriggerFlags] : [],
      })),
  };
}

/**
 * 作用：
 * 在 headless 回归上下文里显式打开 AI 决策调试快照。
 *
 * 为什么这样写：
 * 中高级 AI 的 `lastAiDecision` 只有在调试开关开启时才会记录；
 * 如果 headless 不主动打开，这轮新增的批量复盘摘要就只能看到一堆 0，失去里程碑 3.5 的价值。
 *
 * 输入：
 * @param {object} context - 当前 VM 游戏上下文。
 *
 * 输出：
 * @returns {void} 直接原地修改状态开关。
 *
 * 注意：
 * - 这里只打开数据采集，不依赖任何 UI 渲染路径。
 * - 必须在 `setupGame` 之后调用，因为新局初始化会把该开关重置为 `false`。
 */
function enableHeadlessAiDecisionDebug(context) {
  if (!context?.state) {
    return;
  }
  context.state.showDebugPanel = true;
}

/**
 * 作用：
 * 构造一份用于 headless 批量复盘的空决策信号汇总桶。
 *
 * 为什么这样写：
 * 里程碑 3.5 需要把“牌权续控风险、连续跑分风险、危险带分领牌、朋友已站队策略切换”
 * 统一沉淀到同一份摘要结构里，先定义稳定骨架，后续加信号时才不会反复改 JSON 形状。
 *
 * 输入：
 * @param {void} - 无额外输入。
 *
 * 输出：
 * @returns {object} 带有计数、过滤统计和样本列表的空汇总桶。
 *
 * 注意：
 * - `samples` 数量必须受限，避免一批长回归把 summary.json 撑得过大。
 * - 这里统计的是“决策层信号”，不是整局胜负好坏的最终评价。
 */
function buildEmptyDecisionSignalSummary() {
  return {
    totalDecisions: 0,
    selectedSignals: {
      turnAccessRisk: 0,
      pointRunRisk: 0,
      dangerousPointLead: 0,
      revealedFriendControlShift: 0,
    },
    candidateAudit: {
      turnAccessRiskCandidates: 0,
      pointRunRiskCandidates: 0,
      filteredCandidates: 0,
      filteredReasonCounts: {},
    },
    samples: {
      turnAccessRisk: [],
      pointRunRisk: [],
      dangerousPointLead: [],
      revealedFriendControlShift: [],
    },
    topSignalGames: [],
  };
}

/**
 * 作用：
 * 向某类决策信号样本列表中追加一条去重后的复盘样本。
 *
 * 为什么这样写：
 * 批量回归最需要的是“有代表性的种子和步数”，而不是把所有命中都塞进 summary；
 * 做有限样本保留后，分析报告既可读，又能直接复跑定位。
 *
 * 输入：
 * @param {object[]} samples - 某个信号类型当前已有的样本列表。
 * @param {object} sample - 待追加的简要样本。
 *
 * 输出：
 * @returns {void} 原地修改样本数组。
 *
 * 注意：
 * - 去重键优先使用 `seed + step + playerId + signal`，避免同一步重复记两次。
 * - 达到上限后直接忽略后续样本，保持摘要稳定。
 */
function pushDecisionSignalSample(samples, sample) {
  if (!Array.isArray(samples) || !sample) {
    return;
  }
  const duplicate = samples.some((entry) => (
    entry.seed === sample.seed
    && entry.step === sample.step
    && entry.playerId === sample.playerId
    && entry.signal === sample.signal
  ));
  if (duplicate || samples.length >= DECISION_SIGNAL_SAMPLE_LIMIT) {
    return;
  }
  samples.push(sample);
}

/**
 * 作用：
 * 维护一个“单局命中决策信号最多”的固定 seed 榜单。
 *
 * 为什么这样写：
 * 批量采样后最常见的问题不是“有没有命中”，而是“哪几局最值得优先复跑”；
 * 用轻量榜单把高密度异常种子直接挑出来，可以明显减少人工翻日志时间。
 *
 * 输入：
 * @param {object[]} leaders - 当前榜单数组。
 * @param {object} candidate - 待加入榜单的单局摘要。
 *
 * 输出：
 * @returns {void} 原地更新榜单数组。
 *
 * 注意：
 * - 这里只保留少量高价值样本，避免 summary 再次膨胀。
 * - 排序优先级是 `signalCount`，然后才是候选审计数量。
 */
function pushTopSignalGame(leaders, candidate) {
  if (!Array.isArray(leaders) || !candidate || candidate.signalCount <= 0) {
    return;
  }
  leaders.push(candidate);
  leaders.sort((left, right) => {
    const signalDiff = (right.signalCount || 0) - (left.signalCount || 0);
    if (signalDiff !== 0) return signalDiff;
    return (right.auditCount || 0) - (left.auditCount || 0);
  });
  if (leaders.length > DECISION_SIGNAL_SAMPLE_LIMIT) {
    leaders.length = DECISION_SIGNAL_SAMPLE_LIMIT;
  }
}

/**
 * 作用：
 * 从单次出牌事件构造一条适合写入 summary 的决策信号样本。
 *
 * 为什么这样写：
 * 后续复盘时最常见的动作是“拿着 seed 回放这一步”，所以样本里要保留种子、步数、玩家、牌型和目标权重。
 *
 * 输入：
 * @param {object} game - 当前单局回归结果。
 * @param {object} event - 单次 `play` 事件。
 * @param {string} signal - 当前命中的信号名。
 *
 * 输出：
 * @returns {object} 可直接写入 summary 的轻量复盘样本。
 *
 * 注意：
 * - 这里依赖事件里已经落好的 `decision` 摘要，不直接读取 live state。
 * - 只保留最关键字段，详细 trace 继续看 events.ndjson 和单局日志。
 */
function buildDecisionSignalSample(game, event, signal) {
  const decision = event.decision || {};
  return {
    signal,
    seed: game.summary.seed,
    difficulty: game.summary.difficulty,
    gameIndex: game.summary.gameIndex,
    step: event.step,
    trickNumber: event.trickNumber,
    playerId: event.playerId,
    mode: event.mode,
    friendState: event.friendState || "not_called",
    source: decision.selectedSource || event.source || null,
    objectivePrimary: decision.objective?.primary || null,
    objectiveSecondary: decision.objective?.secondary || null,
    selectedDangerousPointLeadPenalty: decision.selectedDangerousPointLeadPenalty || 0,
    selectedRolloutTriggerFlags: Array.isArray(decision.selectedRolloutTriggerFlags)
      ? [...decision.selectedRolloutTriggerFlags]
      : [],
    cards: Array.isArray(event.cards) ? event.cards.map((card) => ({ ...card })) : [],
  };
}

/**
 * 作用：
 * 汇总一组已完成对局中的决策信号与候选审计数据。
 *
 * 为什么这样写：
 * 里程碑 3.5 的目标不是再做一套搜索，而是让批量回归可以直接告诉我们：
 * “哪些种子出现了掉控风险、连续跑分风险、危险带分领牌，以及朋友站队后的控制型策略切换”。
 *
 * 输入：
 * @param {object[]} games - 已完成的单局回归结果列表。
 *
 * 输出：
 * @returns {object} 聚合后的决策信号摘要。
 *
 * 注意：
 * - 这里只统计 `play` 事件，因为这些信号都依附于实际出牌决策。
 * - `revealedFriendControlShift` 记的是策略切换信号，不等同于“错误”。
 */
function summarizeDecisionSignalsForGames(games) {
  const summary = buildEmptyDecisionSignalSummary();

  for (const game of Array.isArray(games) ? games : []) {
    let gameSignalCount = 0;
    let gameAuditCount = 0;
    for (const event of Array.isArray(game.events) ? game.events : []) {
      if (event.type !== "play" || !event.decision) {
        continue;
      }
      const decision = event.decision;
      const debugStats = decision.debugStats || {};
      const selectedFlags = Array.isArray(decision.selectedRolloutTriggerFlags)
        ? decision.selectedRolloutTriggerFlags
        : [];

      summary.totalDecisions += 1;
      summary.candidateAudit.turnAccessRiskCandidates += debugStats.turnAccessRiskCount || 0;
      summary.candidateAudit.pointRunRiskCandidates += debugStats.pointRunRiskCount || 0;
      summary.candidateAudit.filteredCandidates += debugStats.filteredCandidateCount || 0;
      gameAuditCount += (debugStats.turnAccessRiskCount || 0) + (debugStats.pointRunRiskCount || 0) + (debugStats.filteredCandidateCount || 0);

      for (const [reason, count] of Object.entries(debugStats.filteredReasonCounts || {})) {
        summary.candidateAudit.filteredReasonCounts[reason] = (
          summary.candidateAudit.filteredReasonCounts[reason] || 0
        ) + count;
      }

      if (selectedFlags.includes("turn_access_risk")) {
        summary.selectedSignals.turnAccessRisk += 1;
        gameSignalCount += 1;
        pushDecisionSignalSample(summary.samples.turnAccessRisk, buildDecisionSignalSample(game, event, "turn_access_risk"));
      }

      if (selectedFlags.includes("point_run_risk")) {
        summary.selectedSignals.pointRunRisk += 1;
        gameSignalCount += 1;
        pushDecisionSignalSample(summary.samples.pointRunRisk, buildDecisionSignalSample(game, event, "point_run_risk"));
      }

      if ((decision.selectedDangerousPointLeadPenalty || 0) > 0 && event.mode === "lead") {
        summary.selectedSignals.dangerousPointLead += 1;
        gameSignalCount += 1;
        pushDecisionSignalSample(
          summary.samples.dangerousPointLead,
          buildDecisionSignalSample(game, event, "dangerous_point_lead")
        );
      }

      const objectivePrimary = decision.objective?.primary || null;
      const objectiveSecondary = decision.objective?.secondary || null;
      const shiftedAfterReveal = event.friendState === "revealed"
        && objectivePrimary !== "find_friend"
        && (CONTROL_SHIFT_OBJECTIVES.has(objectivePrimary) || CONTROL_SHIFT_OBJECTIVES.has(objectiveSecondary));
      if (shiftedAfterReveal) {
        summary.selectedSignals.revealedFriendControlShift += 1;
        gameSignalCount += 1;
        pushDecisionSignalSample(
          summary.samples.revealedFriendControlShift,
          buildDecisionSignalSample(game, event, "revealed_friend_control_shift")
        );
      }
    }
    pushTopSignalGame(summary.topSignalGames, {
      seed: game.summary.seed,
      difficulty: game.summary.difficulty,
      gameIndex: game.summary.gameIndex,
      signalCount: gameSignalCount,
      auditCount: gameAuditCount,
      friendState: game.summary.friendState || "not_called",
    });
  }

  return summary;
}

/**
 * 作用：
 * 将所有座位切成托管 AI。
 *
 * 为什么这样写：
 * 这次回归目标是验证“无 UI、全托管、能打完”，因此必须显式关闭 1 号位的人类交互路径。
 *
 * 输入：
 * @param {object} context - 当前 VM 游戏上下文。
 *
 * 输出：
 * @returns {void} 直接原地修改上下文内玩家对象。
 *
 * 注意：
 * - 需要在 `setupGame` 后调用，因为 `setupGame` 会重建玩家数组。
 * - 不要只改 `state.phase` 或按钮状态，真正影响流程的是 `player.isHuman`。
 */
function setAllPlayersToManagedAi(context) {
  for (const player of context.state.players) {
    player.isHuman = false;
  }
}

/**
 * 作用：
 * 为当前出牌回合选出一手可执行的托管方案。
 *
 * 为什么这样写：
 * 正式 UI 流程依赖定时器触发 `autoPlayCurrentTurn`，headless 模式需要在同步循环里显式复用同一套选牌回退顺序。
 *
 * 输入：
 * @param {object} context - 当前 VM 游戏上下文。
 * @param {number} playerId - 当前行动玩家 ID。
 *
 * 输出：
 * @returns {{cards: object[], source: string, decision: object|null}} 实际要出的牌、来源以及可选的 AI 决策摘要。
 *
 * 注意：
 * - 选牌优先级必须和线上托管保持一致：hint -> search -> forced -> emergency。
 * - 出牌前要先清空 `lastAiDecision`，避免误把上一手决策带到本手日志里。
 */
function pickManagedPlay(context, playerId) {
  context.state.lastAiDecision = null;

  const candidates = [
    { source: "hint", cards: context.getLegalHintForPlayer(playerId) },
    { source: "search", cards: context.findLegalSelectionBySearch(playerId) },
    { source: "forced", cards: context.buildForcedFollowFallback(playerId) },
    { source: "emergency", cards: context.findEmergencyLegalSelection(playerId) },
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate.cards) && candidate.cards.length > 0) {
      return {
        cards: candidate.cards,
        source: candidate.source,
        decision: summarizeAiDecision(context.state.lastAiDecision),
      };
    }
  }

  throw new Error(`玩家${playerId} 没有可执行的托管出牌方案`);
}

/**
 * 作用：
 * 在 headless 模式下推进当前反主玩家的动作。
 *
 * 为什么这样写：
 * UI 流程里的反主动作是定时器驱动的，这里直接复用业务判定逻辑，并保持与线上一致的随机意愿规则。
 *
 * 输入：
 * @param {object} context - 当前 VM 游戏上下文。
 *
 * 输出：
 * @returns {{action: string, declaration: object|null}} 本次反主阶段执行的动作摘要。
 *
 * 注意：
 * - 必须遵守 `notrump / 三张 / 随机意愿` 的原有策略，不要为了通过回归擅自改成“总是反主”。
 * - 当前阶段若没有可反主方案，应落成 `pass` 而不是抛异常。
 */
function resolveManagedCounterAction(context) {
  const currentPlayerId = context.state.currentTurnId;
  const option = context.getCounterDeclarationForPlayer(currentPlayerId);
  if (!option) {
    context.passCounterForCurrentPlayer(false);
    return {
      action: "pass",
      declaration: null,
    };
  }

  const willing = option.suit === "notrump" || option.count >= 3 || context.Math.random() < 0.72;
  if (willing) {
    context.counterDeclare(currentPlayerId, option);
    return {
      action: "counter",
      declaration: summarizeDeclaration(option),
    };
  }

  context.passCounterForCurrentPlayer(false);
  return {
    action: "pass",
    declaration: summarizeDeclaration(option),
  };
}

/**
 * 作用：
 * 给单局回归记录追加一条结构化事件。
 *
 * 为什么这样写：
 * 文本日志适合看过程，结构化事件更适合后续做聚合统计、筛选失败样本和训练数据清洗。
 *
 * 输入：
 * @param {object[]} events - 当前单局的事件数组。
 * @param {number} step - 当前已推进的状态步数。
 * @param {string} type - 事件类型。
 * @param {object} payload - 事件额外负载。
 *
 * 输出：
 * @returns {void} 直接把事件 push 到数组中。
 *
 * 注意：
 * - 事件必须是纯 JSON 结构，避免写盘时报循环引用。
 * - `step` 使用 runner 的推进步数，而不是游戏的 trick 序号。
 */
function pushEvent(events, step, type, payload) {
  events.push({
    step,
    type,
    ...payload,
  });
}

/**
 * 作用：
 * 运行一局从发牌到结算的 headless 托管对局。
 *
 * 为什么这样写：
 * 单局 runner 是这次能力的核心，它负责同步推进状态机、捕获中间事件、输出可分析的完整样本。
 *
 * 输入：
 * @param {object} options - 单局回归配置。
 * @param {string} options.difficulty - 本局使用的 AI 难度。
 * @param {string} options.seed - 本局的随机种子。
 * @param {number} options.gameIndex - 本局在整体批次中的顺序编号。
 * @param {number} options.maxSteps - 单局允许的最大推进步数。
 *
 * 输出：
 * @returns {object} 单局完整结果，包括汇总、事件、文本日志和采集到的告警。
 *
 * 注意：
 * - 任何无法推进的状态都应该直接抛错，不能默默吞掉。
 * - 这里默认每局都从 Lv2 新牌局开始，以保证回归样本可比较。
 */
function runSingleHeadlessGame(options) {
  const { context, capture, timers } = loadHeadlessGameContext({ seed: options.seed });
  context.state.aiDifficulty = options.difficulty;
  context.setupGame();
  enableHeadlessAiDecisionDebug(context);
  setAllPlayersToManagedAi(context);

  const events = [];
  let steps = 0;
  let playCount = 0;
  let decisionCount = 0;
  let decisionTimeTotalMs = 0;
  let maxPendingTimers = timers.getPendingCount();

  pushEvent(events, steps, "game_initialized", {
    difficulty: options.difficulty,
    seed: options.seed,
    bankerId: context.state.bankerId,
    nextFirstDealPlayerId: context.state.nextFirstDealPlayerId,
  });

  context.startDealing();
  pushEvent(events, steps, "dealing_started", {
    phase: context.state.phase,
  });

  while (!context.state.gameOver) {
    steps += 1;
    maxPendingTimers = Math.max(maxPendingTimers, timers.getPendingCount());
    if (steps > options.maxSteps) {
      throw new Error(`超过最大推进步数 ${options.maxSteps}，当前阶段为 ${context.state.phase}`);
    }

    if (context.state.phase === "dealing") {
      if (context.state.awaitingHumanDeclaration) {
        const bestDeclaration = context.getBestDeclarationForPlayer(1);
        if (bestDeclaration && context.canOverrideDeclaration(bestDeclaration)) {
          context.declareTrump(1, bestDeclaration, "auto");
          pushEvent(events, steps, "auto_declare", {
            playerId: 1,
            declaration: summarizeDeclaration(context.state.declaration),
          });
        }
        context.finishDealingPhase();
        continue;
      }

      const previousIndex = context.state.dealIndex;
      const previousDeclarationKey = JSON.stringify(summarizeDeclaration(context.state.declaration));
      context.dealOneCard();
      const nextDeclarationKey = JSON.stringify(summarizeDeclaration(context.state.declaration));
      if (previousDeclarationKey !== nextDeclarationKey && context.state.declaration) {
        pushEvent(events, steps, "declaration_changed", {
          declaration: summarizeDeclaration(context.state.declaration),
          dealIndex: context.state.dealIndex,
        });
      }
      if (context.state.dealIndex === previousIndex && context.state.phase === "dealing") {
        throw new Error("发牌阶段未推进");
      }
      continue;
    }

    if (context.state.phase === "bottomReveal") {
      pushEvent(events, steps, "bottom_reveal", {
        bankerId: context.state.bankerId,
        trumpSuit: context.state.trumpSuit,
        message: context.state.bottomRevealMessage,
      });
      context.finishBottomRevealPhase();
      continue;
    }

    if (context.state.phase === "countering") {
      const playerId = context.state.currentTurnId;
      const counterAction = resolveManagedCounterAction(context);
      pushEvent(events, steps, "counter_action", {
        playerId,
        action: counterAction.action,
        declaration: counterAction.declaration,
        currentDeclaration: summarizeDeclaration(context.state.declaration),
      });
      continue;
    }

    if (context.state.phase === "burying") {
      const bankerId = context.state.bankerId;
      const buryCards = context.getBuryHintForPlayer(bankerId);
      if (!Array.isArray(buryCards) || buryCards.length !== 7) {
        throw new Error(`玩家${bankerId} 扣底建议数量异常：${buryCards.length}`);
      }
      pushEvent(events, steps, "bury_bottom", {
        bankerId,
        cards: summarizeCards(buryCards),
      });
      context.completeBurying(bankerId, buryCards.map((card) => card.id));
      continue;
    }

    if (context.state.phase === "callingFriend") {
      const recommendation = context.state.bankerId === 1
        ? context.getFriendPickerRecommendation()?.target
        : context.chooseFriendTarget()?.target;
      if (!recommendation) {
        throw new Error(`玩家${context.state.bankerId} 未能生成找朋友方案`);
      }
      context.confirmFriendTargetSelection(recommendation);
      pushEvent(events, steps, "friend_called", {
        bankerId: context.state.bankerId,
        target: summarizeFriendTarget(context.state.friendTarget),
      });
      continue;
    }

    if (context.state.phase === "playing") {
      const playerId = context.state.currentTurnId;
      const mode = context.state.currentTrick.length === 0 ? "lead" : "follow";
      const handCountBefore = context.getPlayer(playerId)?.hand?.length || 0;
      const lastResolvedTrick = context.state.lastTrick?.trickNumber || 0;
      const choice = pickManagedPlay(context, playerId);
      const played = context.playCards(playerId, choice.cards.map((card) => card.id), {
        skipStartTurn: true,
        skipResolveDelay: true,
      });
      if (!played) {
        throw new Error(`玩家${playerId} 出牌失败，来源 ${choice.source}`);
      }

      playCount += 1;
      if (choice.decision?.decisionTimeMs != null) {
        decisionCount += 1;
        decisionTimeTotalMs += choice.decision.decisionTimeMs;
      }

      pushEvent(events, steps, "play", {
        playerId,
        mode,
        source: choice.source,
        cards: summarizeCards(choice.cards),
        friendState: getFriendStateLabel(context.state.friendTarget),
        handCountBefore,
        handCountAfter: context.getPlayer(playerId)?.hand?.length || 0,
        trickNumber: context.state.lastTrick?.trickNumber || context.state.trickNumber,
        decision: choice.decision,
      });

      if ((context.state.lastTrick?.trickNumber || 0) > lastResolvedTrick) {
        pushEvent(events, steps, "trick_resolved", {
          trickNumber: context.state.lastTrick.trickNumber,
          winnerId: context.state.lastTrick.winnerId,
          points: context.state.lastTrick.points,
          defenderPoints: context.state.defenderPoints,
        });
      }
      continue;
    }

    if (context.state.phase === "ending") {
      context.finishGame();
      continue;
    }

    throw new Error(`遇到未处理的阶段：${context.state.phase}`);
  }

  const bottomResult = context.getBottomResultSummary();
  const outcome = context.getOutcome(context.state.defenderPoints, {
    bottomPenalty: bottomResult?.penalty || null,
  });
  const friendTarget = summarizeFriendTarget(context.state.friendTarget);
  const friendState = getFriendStateLabel(friendTarget);
  const textLog = context.getResultLogText();
  const gameSummary = {
    gameIndex: options.gameIndex,
    difficulty: options.difficulty,
    seed: options.seed,
    completed: true,
    steps,
    totalEvents: events.length,
    totalLogs: context.state.allLogs.length,
    totalPlays: playCount,
    totalTricks: context.state.lastTrick?.trickNumber || 0,
    bankerId: context.state.bankerId,
    trumpSuit: context.state.trumpSuit,
    declaration: summarizeDeclaration(context.state.declaration),
    defenderPoints: context.state.defenderPoints,
    winner: outcome.winner,
    bankerLevels: outcome.bankerLevels,
    defenderLevels: outcome.defenderLevels,
    bottomPenaltyLevels: bottomResult?.penalty?.levels || 0,
    friendState,
    friendTarget,
    hiddenFriendId: context.state.hiddenFriendId || null,
    nextFirstDealPlayerId: context.state.nextFirstDealPlayerId,
    pendingTimers: timers.getPendingCount(),
    maxPendingTimers,
    warnings: [...capture.warnings],
    errors: [...capture.errors],
    decisionCount,
    averageDecisionTimeMs: decisionCount > 0 ? Math.round((decisionTimeTotalMs / decisionCount) * 100) / 100 : 0,
  };

  pushEvent(events, steps, "game_finished", {
    defenderPoints: context.state.defenderPoints,
    winner: outcome.winner,
    bankerLevels: outcome.bankerLevels,
    defenderLevels: outcome.defenderLevels,
    bottomPenaltyLevels: bottomResult?.penalty?.levels || 0,
    friendState,
  });

  return {
    summary: gameSummary,
    events,
    textLog,
  };
}

/**
 * 作用：
 * 计算一批回归结果的聚合统计。
 *
 * 为什么这样写：
 * 后续自动化和数据采集都需要一眼看出“完局率、告警数、不同难度表现”这些核心指标。
 *
 * 输入：
 * @param {object[]} games - 批量回归得到的单局结果列表。
 * @param {object} options - 本次批量运行配置。
 *
 * 输出：
 * @returns {object} 可直接写入 `summary.json` 的聚合结果。
 *
 * 注意：
 * - 这里假设 `games` 里既可能有成功样本，也可能有失败样本。
 * - 统计指标优先保证稳定和可读，不追求复杂 BI 维度。
 */
function summarizeRegressionBatch(games, options) {
  const requestedGames = options.difficulties.length * options.gamesPerDifficulty;
  const completedGames = games.filter((game) => game.summary.completed);
  const failedGames = games.filter((game) => !game.summary.completed);

  function averageOf(items, field) {
    if (items.length === 0) {
      return 0;
    }
    const total = items.reduce((sum, item) => sum + (item.summary[field] || 0), 0);
    return Math.round((total / items.length) * 100) / 100;
  }

  const byDifficulty = Object.fromEntries(options.difficulties.map((difficulty) => {
    const scopedGames = completedGames.filter((game) => game.summary.difficulty === difficulty);
    const decisionSignals = summarizeDecisionSignalsForGames(scopedGames);
    const winnerBreakdown = scopedGames.reduce((accumulator, game) => {
      accumulator[game.summary.winner] = (accumulator[game.summary.winner] || 0) + 1;
      return accumulator;
    }, { banker: 0, defender: 0 });
    return [
      difficulty,
      {
        requestedGames: options.gamesPerDifficulty,
        completedGames: scopedGames.length,
        averageSteps: averageOf(scopedGames, "steps"),
        averageTricks: averageOf(scopedGames, "totalTricks"),
        averageWarnings: Math.round((scopedGames.reduce((sum, game) => sum + game.summary.warnings.length, 0) / Math.max(scopedGames.length, 1)) * 100) / 100,
        averageDecisionTimeMs: averageOf(scopedGames, "averageDecisionTimeMs"),
        winnerBreakdown,
        decisionSignals,
      },
    ];
  }));

  const warningCounts = new Map();
  for (const game of completedGames) {
    for (const warning of game.summary.warnings) {
      warningCounts.set(warning, (warningCounts.get(warning) || 0) + 1);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    baseSeed: options.baseSeed,
    gamesPerDifficulty: options.gamesPerDifficulty,
    difficulties: [...options.difficulties],
    totals: {
      requestedGames,
      completedGames: completedGames.length,
      failedGames: failedGames.length,
      completionRate: requestedGames === 0 ? 0 : Math.round((completedGames.length / requestedGames) * 10000) / 100,
      averageSteps: averageOf(completedGames, "steps"),
      averageTricks: averageOf(completedGames, "totalTricks"),
      averageLogs: averageOf(completedGames, "totalLogs"),
      averageWarnings: Math.round((completedGames.reduce((sum, game) => sum + game.summary.warnings.length, 0) / Math.max(completedGames.length, 1)) * 100) / 100,
      averageDecisionTimeMs: averageOf(completedGames, "averageDecisionTimeMs"),
    },
    winnerBreakdown: completedGames.reduce((accumulator, game) => {
      accumulator[game.summary.winner] = (accumulator[game.summary.winner] || 0) + 1;
      return accumulator;
    }, { banker: 0, defender: 0 }),
    friendBreakdown: completedGames.reduce((accumulator, game) => {
      accumulator[game.summary.friendState] = (accumulator[game.summary.friendState] || 0) + 1;
      return accumulator;
    }, { revealed: 0, failed: 0, unrevealed: 0, not_called: 0 }),
    decisionSignals: summarizeDecisionSignalsForGames(completedGames),
    byDifficulty,
    topWarnings: [...warningCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count })),
    failures: failedGames.map((game) => ({
      gameIndex: game.summary.gameIndex,
      difficulty: game.summary.difficulty,
      seed: game.summary.seed,
      error: game.summary.error,
    })),
  };
}

/**
 * 作用：
 * 根据聚合结果生成一份便于人读的分析报告。
 *
 * 为什么这样写：
 * 自动回归不仅要有机器可读 JSON，也要有给开发者快速扫一眼的中文结论，方便大改后第一时间判断稳定性。
 *
 * 输入：
 * @param {object} summary - 聚合后的回归汇总对象。
 *
 * 输出：
 * @returns {string} Markdown 格式的分析报告正文。
 *
 * 注意：
 * - 这里强调“完局性、告警、后续采样价值”三类信息，避免报告沦为纯数字堆砌。
 * - 报告内容要和 summary 对齐，不要额外引入不可复现的推测数据。
 */
function buildAnalysisMarkdown(summary) {
  const overallSignals = summary.decisionSignals || buildEmptyDecisionSignalSummary();
  const lines = [
    "# 无 UI 全游戏回归分析",
    "",
    `- 生成时间：${summary.generatedAt}`,
    `- 基础种子：${summary.baseSeed}`,
    `- 难度：${summary.difficulties.join(" / ")}`,
    `- 每档局数：${summary.gamesPerDifficulty}`,
    "",
    "## 总览",
    "",
    `- 请求局数：${summary.totals.requestedGames}`,
    `- 完成局数：${summary.totals.completedGames}`,
    `- 失败局数：${summary.totals.failedGames}`,
    `- 完局率：${summary.totals.completionRate}%`,
    `- 平均推进步数：${summary.totals.averageSteps}`,
    `- 平均轮数：${summary.totals.averageTricks}`,
    `- 平均日志条数：${summary.totals.averageLogs}`,
    `- 平均告警数：${summary.totals.averageWarnings}`,
    `- 平均 AI 决策耗时：${summary.totals.averageDecisionTimeMs} ms`,
    "",
    "## 胜负与朋友揭示",
    "",
    `- 打家方胜局：${summary.winnerBreakdown.banker}`,
    `- 闲家方胜局：${summary.winnerBreakdown.defender}`,
    `- 朋友已站队：${summary.friendBreakdown.revealed}`,
    `- 朋友牌误出 / 1 打 4：${summary.friendBreakdown.failed}`,
    `- 直到结算仍未站队：${summary.friendBreakdown.unrevealed}`,
    "",
    "## 决策信号摘要",
    "",
    `- 触发 turn_access_risk 的已选动作：${overallSignals.selectedSignals.turnAccessRisk}`,
    `- 触发 point_run_risk 的已选动作：${overallSignals.selectedSignals.pointRunRisk}`,
    `- 仍被选中的危险带分领牌：${overallSignals.selectedSignals.dangerousPointLead}`,
    `- 朋友已站队后的控制型策略切换：${overallSignals.selectedSignals.revealedFriendControlShift}`,
    `- 候选池内 turn_access_risk 总数：${overallSignals.candidateAudit.turnAccessRiskCandidates}`,
    `- 候选池内 point_run_risk 总数：${overallSignals.candidateAudit.pointRunRiskCandidates}`,
    `- 被过滤候选总数：${overallSignals.candidateAudit.filteredCandidates}`,
    "",
    "## 各难度表现",
    "",
  ];

  for (const difficulty of summary.difficulties) {
    const detail = summary.byDifficulty[difficulty];
    lines.push(`### ${difficulty}`);
    lines.push("");
    lines.push(`- 完成局数：${detail.completedGames}/${detail.requestedGames}`);
    lines.push(`- 平均推进步数：${detail.averageSteps}`);
    lines.push(`- 平均轮数：${detail.averageTricks}`);
    lines.push(`- 平均告警数：${detail.averageWarnings}`);
    lines.push(`- 平均 AI 决策耗时：${detail.averageDecisionTimeMs} ms`);
    lines.push(`- 打家方胜局：${detail.winnerBreakdown.banker}`);
    lines.push(`- 闲家方胜局：${detail.winnerBreakdown.defender}`);
    lines.push(`- 已选 turn_access_risk：${detail.decisionSignals.selectedSignals.turnAccessRisk}`);
    lines.push(`- 已选 point_run_risk：${detail.decisionSignals.selectedSignals.pointRunRisk}`);
    lines.push(`- 已选危险带分领牌：${detail.decisionSignals.selectedSignals.dangerousPointLead}`);
    lines.push(`- 朋友站队后控制型切换：${detail.decisionSignals.selectedSignals.revealedFriendControlShift}`);
    lines.push("");
  }

  lines.push("## 结论");
  lines.push("");
  if (summary.totals.failedGames === 0) {
    lines.push("- 本轮样本全部可以从发牌推进到结算，说明当前规则状态机在无 UI 托管模式下能够闭环完局。");
  } else {
    lines.push("- 本轮存在未完局样本，需优先根据失败 seed 复跑并定位卡住阶段。");
  }
  if (summary.topWarnings.length === 0) {
    lines.push("- 本轮没有采集到 runtime warn/error，适合作为大改后的基础完局性守门回归。");
  } else {
    lines.push("- 运行过程中出现了告警，建议先排查高频 warning，再把这套回归接到更严格的 CI 门禁。");
  }
  lines.push("- 结构化事件和单局文本日志已经可直接用于后续批量采样，适合继续扩展成“AI 决策数据集”生产链路。");
  lines.push("");
  lines.push("## 高频告警");
  lines.push("");
  if (summary.topWarnings.length === 0) {
    lines.push("- 无");
  } else {
    for (const warning of summary.topWarnings) {
      lines.push(`- ${warning.count} 次：${warning.message}`);
    }
  }

  lines.push("");
  lines.push("## 高频异常种子");
  lines.push("");
  if (!overallSignals.topSignalGames.length) {
    lines.push("- 本轮没有出现高密度策略信号样本。");
  } else {
    for (const game of overallSignals.topSignalGames) {
      lines.push(
        `- [${game.difficulty}] ${game.seed} signalCount=${game.signalCount} auditCount=${game.auditCount} friend=${game.friendState}`
      );
    }
  }

  lines.push("");
  lines.push("## 决策信号样本");
  lines.push("");
  if (
    overallSignals.samples.turnAccessRisk.length === 0
    && overallSignals.samples.pointRunRisk.length === 0
    && overallSignals.samples.dangerousPointLead.length === 0
    && overallSignals.samples.revealedFriendControlShift.length === 0
  ) {
    lines.push("- 本轮未采到需要重点复跑的策略信号样本。");
  } else {
    const sampleSections = [
      ["turn_access_risk", overallSignals.samples.turnAccessRisk],
      ["point_run_risk", overallSignals.samples.pointRunRisk],
      ["dangerous_point_lead", overallSignals.samples.dangerousPointLead],
      ["revealed_friend_control_shift", overallSignals.samples.revealedFriendControlShift],
    ];
    for (const [label, samples] of sampleSections) {
      if (!samples.length) {
        continue;
      }
      lines.push(`### ${label}`);
      lines.push("");
      for (const sample of samples) {
        lines.push(
          `- [${sample.difficulty}] ${sample.seed} step=${sample.step} player=${sample.playerId} trick=${sample.trickNumber} `
          + `friend=${sample.friendState} objective=${sample.objectivePrimary || "none"}/${sample.objectiveSecondary || "none"}`
        );
      }
      lines.push("");
    }
  }

  if (summary.failures.length > 0) {
    lines.push("");
    lines.push("## 失败样本");
    lines.push("");
    for (const failure of summary.failures) {
      lines.push(`- [${failure.difficulty}] ${failure.seed}：${failure.error}`);
    }
  }

  return lines.join("\n");
}

/**
 * 作用：
 * 将批量回归结果写入磁盘产物目录。
 *
 * 为什么这样写：
 * 日志与分析文件是这次能力的核心交付，必须让开发者在不看测试 stdout 的情况下也能直接查看结果。
 *
 * 输入：
 * @param {object[]} games - 批量回归结果列表。
 * @param {object} summary - 聚合汇总结果。
 * @param {string} outputDir - 目标输出目录。
 *
 * 输出：
 * @returns {{summaryFile: string, analysisFile: string, gamesFile: string, eventsFile: string, logsDir: string}} 主要产物路径。
 *
 * 注意：
 * - 即使存在失败样本，也要尽量把已拿到的结果写盘，方便排障。
 * - 日志文件名要稳定可读，便于按难度和 seed 快速检索。
 */
function writeRegressionArtifacts(games, summary, outputDir) {
  const logsDir = path.join(outputDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  const gamesFile = path.join(outputDir, "games.ndjson");
  const eventsFile = path.join(outputDir, "events.ndjson");
  const summaryFile = path.join(outputDir, "summary.json");
  const analysisFile = path.join(outputDir, "analysis.md");

  const allEvents = [];
  for (const game of games) {
    const safeSeed = game.summary.seed.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const logFile = path.join(
      logsDir,
      `game-${String(game.summary.gameIndex).padStart(2, "0")}-${game.summary.difficulty}-${safeSeed}.log`
    );
    fs.writeFileSync(logFile, game.textLog || (game.summary.error || ""), "utf8");
    game.summary.logFile = logFile;
    if (Array.isArray(game.events)) {
      for (const event of game.events) {
        allEvents.push({
          gameIndex: game.summary.gameIndex,
          difficulty: game.summary.difficulty,
          seed: game.summary.seed,
          ...event,
        });
      }
    }
  }

  fs.writeFileSync(
    gamesFile,
    games.map((game) => JSON.stringify(game.summary)).join("\n") + (games.length > 0 ? "\n" : ""),
    "utf8"
  );
  fs.writeFileSync(
    eventsFile,
    allEvents.map((event) => JSON.stringify(event)).join("\n") + (allEvents.length > 0 ? "\n" : ""),
    "utf8"
  );
  fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(analysisFile, `${buildAnalysisMarkdown(summary)}\n`, "utf8");

  return {
    summaryFile,
    analysisFile,
    gamesFile,
    eventsFile,
    logsDir,
  };
}

/**
 * 作用：
 * 运行完整的一批 headless 全游戏回归，并生成日志与分析文件。
 *
 * 为什么这样写：
 * 这是给单测、手动脚本和未来自动化复用的统一入口，保证不同场景下拿到一致的回归产物结构。
 *
 * 输入：
 * @param {object} options - 批量回归配置。
 *
 * 输出：
 * @returns {{games: object[], summary: object, files: object}} 本次回归的完整结果与产物路径。
 *
 * 注意：
 * - 即使局部失败也会先写产物，再把失败信息抛给调用方。
 * - 失败时抛出的错误消息会汇总所有失败 seed，方便直接复跑定位。
 */
function runHeadlessRegression(options) {
  const games = [];
  let gameIndex = 0;

  for (const difficulty of options.difficulties) {
    for (let offset = 1; offset <= options.gamesPerDifficulty; offset += 1) {
      gameIndex += 1;
      const seed = buildGameSeed(options.baseSeed, difficulty, offset);
      try {
        games.push(runSingleHeadlessGame({
          difficulty,
          seed,
          gameIndex,
          maxSteps: options.maxSteps,
        }));
      } catch (error) {
        games.push({
          summary: {
            gameIndex,
            difficulty,
            seed,
            completed: false,
            error: error instanceof Error ? error.message : String(error),
          },
          events: [],
          textLog: error instanceof Error && error.stack ? error.stack : String(error),
        });
      }
    }
  }

  const summary = summarizeRegressionBatch(games, options);
  const files = writeRegressionArtifacts(games, summary, options.outputDir);

  if (summary.failures.length > 0) {
    const details = summary.failures
      .map((failure) => `[${failure.difficulty}] ${failure.seed}: ${failure.error}`)
      .join("\n");
    const error = new Error(`Headless 全游戏回归失败：\n${details}`);
    error.summary = summary;
    error.files = files;
    throw error;
  }

  return {
    games,
    summary,
    files,
  };
}

module.exports = {
  parseHeadlessRegressionArgs,
  runHeadlessRegression,
};
