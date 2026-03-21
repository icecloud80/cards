function createCandidateEntry(cards, source, tags = []) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  if (cards.some((card) => !card || !card.id)) return null;
  return {
    cards,
    source,
    tags: [...tags],
  };
}

function dedupeCandidateEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) return false;
    if (entry.cards.some((card) => !card || !card.id)) return false;
    const key = getComboKey(entry.cards);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 作用：
 * 为被过滤的候选生成一条可用于调试的记录。
 *
 * 为什么这样写：
 * 里程碑 0 需要把“为什么被过滤”显式记录进 debug bundle，
 * 否则后面调评分时只能看到剩下的候选，看不到关键候选为何被踢掉。
 *
 * 输入：
 * @param {Array<object>} cards - 被过滤的候选牌组。
 * @param {string} source - 候选来源标签。
 * @param {Array<string>} tags - 过滤前的候选标签。
 * @param {string} filterReason - 结构化过滤原因代码。
 * @param {string|null} detailReason - 规则层返回的原始说明文案。
 *
 * 输出：
 * @returns {object|null} 返回一条可序列化的过滤记录；输入无效时返回 null。
 *
 * 注意：
 * - `filterReason` 应是稳定代码，而不是直接依赖文案。
 * - `detailReason` 仅用于调试展示，不应用于程序逻辑分支。
 */
function createFilteredCandidateEntry(cards, source, tags = [], filterReason, detailReason = null) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  if (cards.some((card) => !card || !card.id)) return null;
  return {
    cards,
    source,
    tags: [...tags],
    filterReason,
    detailReason,
  };
}

/**
 * 作用：
 * 在候选层需要复用旧 helper 时，按需把某个 sourceState 临时映射到全局 state 上执行。
 *
 * 为什么这样写：
 * 当前候选生成正在从全局 state 迁移到显式 sourceState 入参。
 * 这层适配器只包住还没完成迁移的 legacy helper，避免整个候选构建流程都隐式依赖 live state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {Function} builder - 需要在该状态下执行的旧 helper。
 *
 * 输出：
 * @returns {*} 返回 builder 在对应状态下的执行结果。
 *
 * 注意：
 * - `builder` 仍可能读取全局 `state`，因此只应包裹尚未迁移的旧逻辑。
 * - 不要把整个候选生成过程都继续塞进这层适配器里，否则解耦没有意义。
 */
function runCandidateLegacyHelper(sourceState, builder) {
  if (!sourceState) return [];
  if (sourceState === state) {
    return builder();
  }
  return withSimulationState(sourceState, builder);
}

/**
 * 作用：
 * 为指定状态读取某位玩家的手牌视图。
 *
 * 为什么这样写：
 * 候选生成优先基于显式 sourceState 工作，避免直接从 live state 取玩家数据。
 *
 * 输入：
 * @param {object|null} sourceState - 候选生成使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要读取手牌的玩家 ID。
 *
 * 输出：
 * @returns {object|null} 返回对应玩家对象；不存在时返回 null。
 *
 * 注意：
 * - 该函数只读 sourceState，不负责克隆。
 * - sourceState 既可能是 live state，也可能是 simulation state。
 */
function getCandidateSourcePlayer(sourceState, playerId) {
  return getSimulationPlayer(sourceState, playerId);
}

/**
 * 作用：
 * 为候选生成稳定的牌型标签名，避免把“合法但不成型”的牌组写成 `invalid`。
 *
 * 为什么这样写：
 * 里程碑 0 明确要求调试信息区分“真正非法”和“合法但不成型”。
 * 对 follow 候选来说，`classifyPlay` 返回 `invalid` 不等于这手牌不合法，可能只是因跟牌义务导致的合法散牌。
 *
 * 输入：
 * @param {{ok?: boolean, type?: string}} pattern - `classifyPlay` 返回的牌型描述。
 *
 * 输出：
 * @returns {string} 返回调试标签使用的稳定牌型名。
 *
 * 注意：
 * - 合法但不成型的组合统一记为 `unshaped`。
 * - 真正非法会通过过滤原因单独记录，而不是混进 tags。
 */
function getCandidatePatternTag(pattern) {
  return pattern?.ok ? pattern.type : "unshaped";
}

/**
 * 作用：
 * 从指定状态读取 legacy 首发建议，作为候选层的兼容来源之一。
 *
 * 为什么这样写：
 * 当前首发启发式仍有不少逻辑留在旧链路中，先通过局部适配保留行为一致性，
 * 同时把候选主流程迁到 sourceState 驱动。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要读取建议的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回 legacy 首发建议牌组。
 *
 * 注意：
 * - 这里只是兼容入口，不代表候选层未来长期要继续依赖旧决策器。
 * - 结果可能为空数组，调用方需要自行兜底。
 */
function getLegacyLeadChoiceForState(sourceState, playerId) {
  return runCandidateLegacyHelper(sourceState, () => chooseAiLeadPlay(playerId));
}

/**
 * 作用：
 * 从指定状态读取 beginner 兜底提示，保证候选层始终保留稳定基线动作。
 *
 * 为什么这样写：
 * 候选层在逐步解耦过程中，仍需要保留现有产品行为的一致性和回归稳定性。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要读取提示的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回 beginner 风格的合法提示牌组。
 *
 * 注意：
 * - 该函数当前仍通过适配层调用旧 helper。
 * - 后续如果 beginner 链路也完成显式传参迁移，这里可以继续收窄。
 */
function getBeginnerLegalHintForState(sourceState, playerId) {
  return runCandidateLegacyHelper(sourceState, () => getBeginnerLegalHintForPlayer(playerId));
}

/**
 * 作用：
 * 判断指定花色在公开信息下是否仍有对手可能持有。
 *
 * 为什么这样写：
 * 非透视甩牌判断首先只能利用“谁已经暴露断门”这种公开信息。
 * 如果所有对手都已公开在该花色断门，那么这门组件就不需要再按暗手风险做保守惩罚。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 当前准备首发甩牌的玩家 ID。
 * @param {string} suit - 需要判断的有效花色。
 *
 * 输出：
 * @returns {boolean} 若仍有至少一名对手可能持有该花色，则返回 true。
 *
 * 注意：
 * - `trump` 花色依赖 `exposedTrumpVoid`，普通花色依赖 `exposedSuitVoid`。
 * - 这里只回答“是否可能仍持有”，不回答“是否一定持有”。
 */
function canAnyOpponentStillHoldSuitForState(sourceState, playerId, suit) {
  const players = Array.isArray(sourceState?.players) ? sourceState.players : [];
  if (suit === "trump") {
    return players.some((player) => player.id !== playerId && !sourceState?.exposedTrumpVoid?.[player.id]);
  }
  return players.some((player) => player.id !== playerId && !sourceState?.exposedSuitVoid?.[player.id]?.[suit]);
}

/**
 * 作用：
 * 为甩牌风险评估构造一组不依赖真实暗手的虚拟牌池。
 *
 * 为什么这样写：
 * 我们需要知道“理论上哪些更大的同类组件还可能存在”，
 * 但又不能读取对手暗手，所以只能从完整牌堆的公开规则出发构造一份中立牌池。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {string} suit - 需要枚举的有效花色。
 *
 * 输出：
 * @returns {Array<object>} 返回该有效花色下理论可能出现的全部牌对象。
 *
 * 注意：
 * - 这里使用固定 3 副牌规则，与真实规则层的牌堆规模保持一致。
 * - 生成的是虚拟牌对象，只用于组合可能性分析，不会进入真实 state。
 */
function buildVirtualCardPoolForThrowSuit(sourceState, suit) {
  const virtualCards = [];
  let sequence = 0;
  for (let pack = 0; pack < 3; pack += 1) {
    for (const cardSuit of SUITS) {
      for (const rank of RANKS) {
        const card = {
          id: `throw-virtual-${pack}-${cardSuit}-${rank}-${sequence++}`,
          suit: cardSuit,
          rank,
          pack,
        };
        if (effectiveSuit(card) === suit) {
          virtualCards.push(card);
        }
      }
    }
    const blackJoker = {
      id: `throw-virtual-${pack}-joker-BJ-${sequence++}`,
      suit: "joker",
      rank: "BJ",
      pack,
    };
    if (effectiveSuit(blackJoker) === suit) {
      virtualCards.push(blackJoker);
    }
    const redJoker = {
      id: `throw-virtual-${pack}-joker-RJ-${sequence++}`,
      suit: "joker",
      rank: "RJ",
      pack,
    };
    if (effectiveSuit(redJoker) === suit) {
      virtualCards.push(redJoker);
    }
  }
  return virtualCards;
}

/**
 * 作用：
 * 判断一张已出牌在指定 sourceState 下是否属于中级 AI 会记住的高张。
 *
 * 为什么这样写：
 * `getRememberedPlayedCardsForPlayer` 目前绑定 live state。
 * 候选层和模拟层迁到 sourceState 后，需要一份同口径的 stateful 版本，才能在不透视的前提下复用中级记牌边界。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 正在做判断的 AI 玩家 ID。
 * @param {object|null} card - 需要判断是否会被记住的已出牌。
 *
 * 输出：
 * @returns {boolean} 若该牌属于中级档位会记住的高张，则返回 true。
 *
 * 注意：
 * - 这里只根据 sourceState 里的当前手牌结构判断“是否值得记”。
 * - 高级档位不需要走这层过滤，会直接记全部已出牌。
 */
function isIntermediateRememberedCardForStatePlayer(sourceState, playerId, card) {
  if (!isMemorableHighCard(card)) return false;
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player) return false;
  const cardSuit = effectiveSuit(card);
  const cardPower = getPatternUnitPower(card, cardSuit);
  return getStructureCombosFromHand(player.hand).some((combo) => {
    const comboSuit = effectiveSuit(combo[0]);
    if (comboSuit !== cardSuit) return false;
    const comboTopPower = combo.reduce((max, entry) => Math.max(max, getPatternUnitPower(entry, comboSuit)), -Infinity);
    return cardPower > comboTopPower;
  });
}

/**
 * 作用：
 * 读取某位玩家在指定 sourceState 下允许使用的“已出牌记忆”。
 *
 * 为什么这样写：
 * 甩牌风险评估必须遵守难度差异。
 * 中级只能记与自己结构相关的高张，高级才能记全部已出牌，不能直接把整条 `playHistory` 都当成中级可用信息。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 正在做判断的 AI 玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回该 AI 在 sourceState 下可使用的已出牌记忆。
 *
 * 注意：
 * - 初级档位返回空数组。
 * - sourceState 没有 playHistory 时返回空数组，避免评估链路报错。
 */
function getRememberedPlayedCardsForStatePlayer(sourceState, playerId) {
  const historyCards = Array.isArray(sourceState?.playHistory) ? sourceState.playHistory : [];
  const difficulty = getAiDifficulty();
  if (difficulty === "advanced") return historyCards;
  if (difficulty !== "intermediate") return [];
  return historyCards.filter((card) => isIntermediateRememberedCardForStatePlayer(sourceState, playerId, card));
}

/**
 * 作用：
 * 将一组牌按“原始牌面 suit-rank”聚合计数。
 *
 * 为什么这样写：
 * 甩牌组件的对子、刻子、拖拉机判断，底层仍基于相同 `suit-rank` 的多副牌张数。
 * 风险评估只要知道某个组别还有多少未知副本未被公开或被自己占住，就能判断该组是否仍可能存在于对手手里。
 *
 * 输入：
 * @param {Array<object>} cards - 需要聚合计数的牌组。
 *
 * 输出：
 * @returns {Map<string, number>} 返回按 `suit-rank` 聚合后的计数映射。
 *
 * 注意：
 * - 这里故意不用 effective suit 作为 key，因为对子/刻子要求同原始牌面。
 * - 传入空数组时返回空 Map。
 */
function buildThrowGroupCountMap(cards) {
  const counts = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card?.suit || !card?.rank) continue;
    const key = `${card.suit}-${card.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * 作用：
 * 汇总某位玩家已知“不可能在对手手里”的同花色牌张数。
 *
 * 为什么这样写：
 * 非透视甩牌判断不能看对手暗手，但可以利用“自己手里拿着什么”和“自己记住哪些高张已经打出”。
 * 这两部分加起来，就是当前已知被对手排除掉的副本数。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 正在评估甩牌的 AI 玩家 ID。
 * @param {string} suit - 当前组件所属的有效花色。
 *
 * 输出：
 * @returns {Map<string, number>} 返回按 `suit-rank` 聚合后的已知排除计数。
 *
 * 注意：
 * - 只统计该有效花色下的牌，避免无关门数污染风险判断。
 * - 中级和高级的差异由 `getRememberedPlayedCardsForStatePlayer` 决定。
 */
function getKnownUnavailableThrowGroupCountsForState(sourceState, playerId, suit) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  const ownCards = Array.isArray(player?.hand)
    ? player.hand.filter((card) => effectiveSuit(card) === suit)
    : [];
  const rememberedPlayedCards = getRememberedPlayedCardsForStatePlayer(sourceState, playerId)
    .filter((card) => effectiveSuit(card) === suit);
  return buildThrowGroupCountMap([...ownCards, ...rememberedPlayedCards]);
}

/**
 * 作用：
 * 为一组候选牌生成稳定的“组别签名”。
 *
 * 为什么这样写：
 * 虚拟牌池里同一 `suit-rank` 会有多副物理牌。
 * 对甩牌风险来说，同组别的不同 pack 只代表同一种潜在威胁，不应该被重复计数。
 *
 * 输入：
 * @param {Array<object>} combo - 需要生成签名的候选牌组。
 *
 * 输出：
 * @returns {string} 返回按组别计数生成的稳定签名。
 *
 * 注意：
 * - 签名只用于去重威胁集合，不参与真实规则比较。
 * - 单张也会按 `suit-rank#1` 的形式生成签名。
 */
function getThrowComboGroupSignature(combo) {
  const counts = buildThrowGroupCountMap(combo);
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}#${count}`)
    .join("|");
}

/**
 * 作用：
 * 判断某个更大同类组合在公开信息下是否仍可能留在对手暗手里。
 *
 * 为什么这样写：
 * 中级甩牌判断的关键，不是“别人实际有没有”，而是“这组更大组合是否仍未被公开信息排除”。
 * 只要某个 beat combo 还可能存在，AI 就应该把它当作风险来源，而不是假装安全。
 *
 * 输入：
 * @param {Array<object>} combo - 一个理论上可用于压制当前组件的更大组合。
 * @param {Map<string, number>} knownUnavailableCounts - 已知不可在对手手里的组别计数。
 *
 * 输出：
 * @returns {boolean} 若该更大组合在公开信息下仍可能存在，则返回 true。
 *
 * 注意：
 * - 当前牌局固定是 3 副牌，因此某个 `suit-rank` 的总副本数恒为 3。
 * - 这里只判断“公开信息是否已排除”，不会猜测这些牌分布在哪个对手手里。
 */
function isThrowCounterComboStillPossible(combo, knownUnavailableCounts) {
  const requiredCounts = buildThrowGroupCountMap(combo);
  return [...requiredCounts.entries()].every(([key, needCount]) => {
    const unavailableCount = knownUnavailableCounts.get(key) || 0;
    const remainingCount = Math.max(0, 3 - unavailableCount);
    return remainingCount >= needCount;
  });
}

/**
 * 作用：
 * 枚举一个甩牌组件在公开信息视角下仍可能遇到的更大同类威胁。
 *
 * 为什么这样写：
 * 我们需要把“整手甩牌是否安全”拆到每个组件上，并且只根据理论牌池和公开信息来判断哪些更大组件还未被排除。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 正在评估甩牌的 AI 玩家 ID。
 * @param {object} component - `classifyPlay(...).components` 里的某个组件描述。
 *
 * 输出：
 * @returns {{unresolvedThreatCount: number, blockedThreatCount: number, unresolvedExamples: Array<string>, exposedVoidSafe: boolean}} 返回该组件的公开风险摘要。
 *
 * 注意：
 * - 若公开断门已经说明没有对手可能继续持有该花色，会直接判为 `exposedVoidSafe`。
 * - `unresolvedExamples` 只保留少量签名，目的是给 debug 提示，不是完整列出所有威胁。
 */
function assessThrowComponentRiskForState(sourceState, playerId, component) {
  if (!component?.ok || !component?.suit) {
    return {
      unresolvedThreatCount: 0,
      blockedThreatCount: 0,
      unresolvedExamples: [],
      exposedVoidSafe: false,
    };
  }

  if (!canAnyOpponentStillHoldSuitForState(sourceState, playerId, component.suit)) {
    return {
      unresolvedThreatCount: 0,
      blockedThreatCount: 0,
      unresolvedExamples: [],
      exposedVoidSafe: true,
    };
  }

  const virtualSuitPool = buildVirtualCardPoolForThrowSuit(sourceState, component.suit);
  const strongerCombos = getPatternCombos(virtualSuitPool, component)
    .filter((combo) => compareSameTypePlay(classifyPlay(combo), component, component.suit) > 0);
  const knownUnavailableCounts = getKnownUnavailableThrowGroupCountsForState(sourceState, playerId, component.suit);
  const seenThreats = new Set();
  let unresolvedThreatCount = 0;
  let blockedThreatCount = 0;
  const unresolvedExamples = [];

  for (const combo of strongerCombos) {
    const signature = getThrowComboGroupSignature(combo);
    if (seenThreats.has(signature)) continue;
    seenThreats.add(signature);
    if (isThrowCounterComboStillPossible(combo, knownUnavailableCounts)) {
      unresolvedThreatCount += 1;
      if (unresolvedExamples.length < 3) unresolvedExamples.push(signature);
    } else {
      blockedThreatCount += 1;
    }
  }

  return {
    unresolvedThreatCount,
    blockedThreatCount,
    unresolvedExamples,
    exposedVoidSafe: false,
  };
}

/**
 * 作用：
 * 对一手甩牌做“公开信息口径”的安全评估。
 *
 * 为什么这样写：
 * 规则层的 `getThrowFailure(...)` 会读取对手真实手牌，它只能用于裁定真实出牌结果，
 * 不能直接拿来当 AI 决策依据。这里把 AI 需要的判断改成“根据已知信息，这手甩牌有多冒险”。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 正在评估甩牌的 AI 玩家 ID。
 * @param {Array<object>} cards - 待评估的首发牌组。
 *
 * 输出：
 * @returns {object|null} 若该牌组是甩牌，则返回公开风险评估；否则返回 null。
 *
 * 注意：
 * - 返回的 `safe` 只表示“公开信息下未发现仍可能存在的更大组件”，不等于真实世界绝对安全。
 * - `scorePenalty` 是 AI 评分修正，不是规则层惩罚。
 */
function assessThrowCandidateForState(sourceState, playerId, cards) {
  const pattern = classifyPlay(cards);
  if (!pattern?.ok || pattern.type !== "throw" || !Array.isArray(pattern.components)) return null;

  const componentRisks = pattern.components.map((component) => {
    const risk = assessThrowComponentRiskForState(sourceState, playerId, component);
    return {
      type: component.type,
      suit: component.suit,
      power: component.power,
      count: component.count,
      unresolvedThreatCount: risk.unresolvedThreatCount,
      blockedThreatCount: risk.blockedThreatCount,
      unresolvedExamples: risk.unresolvedExamples,
      exposedVoidSafe: risk.exposedVoidSafe,
    };
  });

  const unresolvedThreatCount = componentRisks.reduce((sum, risk) => sum + risk.unresolvedThreatCount, 0);
  const blockedThreatCount = componentRisks.reduce((sum, risk) => sum + risk.blockedThreatCount, 0);
  const riskyComponentCount = componentRisks.filter((risk) => risk.unresolvedThreatCount > 0).length;
  const safe = riskyComponentCount === 0;
  const level = safe ? "safe" : unresolvedThreatCount <= 2 ? "guarded" : "risky";
  const scorePenalty = safe ? 0 : Math.min(140, 28 + unresolvedThreatCount * 14 + riskyComponentCount * 10);

  return {
    safe,
    level,
    scorePenalty,
    unresolvedThreatCount,
    blockedThreatCount,
    riskyComponentCount,
    componentRisks,
  };
}

/**
 * 作用：
 * 校验某组首发候选在指定状态下是否可安全进入评分和 rollout。
 *
 * 为什么这样写：
 * 首发链路仍需沿用规则层的合法性口径，但 AI 决策层不能再借机读取对手暗手。
 * 因此这里只负责判断“这手是否规则合法可首发”，而不在候选阶段透视甩牌成败。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 首发玩家 ID。
 * @param {Array<object>} cards - 待校验的首发候选牌组。
 *
 * 输出：
 * @returns {{ok: boolean, filterReason?: string, detailReason?: string|null}} 返回候选是否可进入评分。
 *
 * 注意：
 * - 甩牌风险改由公开信息评估器处理，这里不应直接调用全知的 `getThrowFailure(...)`。
 * - 规则合法性仍通过现有 `validateSelection` 口径复验，避免与真实出牌规则分叉。
 */
function validateLeadCandidateForState(sourceState, playerId, cards) {
  const validation = runCandidateLegacyHelper(sourceState, () => validateSelection(playerId, cards));
  if (!validation?.ok) {
    return {
      ok: false,
      filterReason: "illegal_lead",
      detailReason: validation?.reason || null,
    };
  }
  return { ok: true };
}

/**
 * 作用：
 * 校验某组候选在指定状态下是否满足跟牌合法性要求。
 *
 * 为什么这样写：
 * 候选枚举的主要阻碍是旧版 `validateSelection` 直接读取全局 `state`。
 * 这里先把“跟牌阶段”的规则约束抽成显式 `sourceState` 版本，为候选层继续去全局化铺路。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 跟牌玩家 ID。
 * @param {Array<object>} cards - 待校验的候选牌组。
 *
 * 输出：
 * @returns {{ok: boolean, reason?: string}} 返回该候选在 sourceState 下是否合法。
 *
 * 注意：
 * - 这里只处理“当前墩非空”的跟牌合法性；首发合法性仍由旧链路处理。
 * - 文案沿用现有 `TEXT.rules.validation`，避免测试和界面口径分叉。
 */
function validateFollowSelectionForState(sourceState, playerId, cards) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  const leadSpec = sourceState?.leadSpec || null;
  if (!player || !Array.isArray(cards) || cards.length === 0) {
    return { ok: false, reason: TEXT.rules.validation.selectCards };
  }
  if (!leadSpec || !sourceState?.currentTrick?.length) {
    return { ok: false, reason: TEXT.rules.validation.selectCards };
  }
  return validateFollowSelectionAgainstLead(player.hand, leadSpec, cards);
}

/**
 * 作用：
 * 校验某组候选在指定状态下是否允许进入评分和 rollout。
 *
 * 为什么这样写：
 * 候选层、评分层和 rollout 都需要统一口径，防止“候选生成说合法，但 rollout 前又发现非法”的脏链路。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 出牌玩家 ID。
 * @param {Array<object>} cards - 待校验的候选牌组。
 * @param {string} mode - 当前是 `lead` 还是 `follow`。
 *
 * 输出：
 * @returns {{ok: boolean, filterReason?: string, detailReason?: string|null}} 返回候选是否可进入后续流程。
 *
 * 注意：
 * - follow 模式只做合法跟牌校验，不会把“合法但不压”的牌组判成非法。
 * - lead 模式只做规则合法性复验；甩牌风险由独立的公开信息评估器处理。
 */
function validateCandidateForState(sourceState, playerId, cards, mode = "lead") {
  if (mode === "follow") {
    const validation = validateFollowSelectionForState(sourceState, playerId, cards);
    if (!validation.ok) {
      return {
        ok: false,
        filterReason: "illegal_follow",
        detailReason: validation.reason || null,
      };
    }
    return { ok: true };
  }
  return validateLeadCandidateForState(sourceState, playerId, cards);
}

/**
 * 作用：
 * 在显式 `sourceState` 候选链路里，优先补入与首家牌型完全匹配的结构候选。
 *
 * 为什么这样写：
 * 中级 AI、模拟层和调试候选都共用 `getLegalSelectionsForState`；
 * 如果这里只靠固定上限的组合枚举，仍会出现“真实有合法主拖拉机，但候选层没扫到”的假空集问题。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {Array<Array<object>>} results - 已收集到的合法候选列表。
 * @param {Set<string>} seen - 已去重候选键集合。
 * @param {Array<object>} suitedCards - 当前与首家同门的牌池。
 * @param {number} limit - 最多允许保留的合法候选数。
 *
 * 输出：
 * @returns {boolean} 若已达到 `limit` 并可提前结束，则返回 `true`。
 *
 * 注意：
 * - 这里只做“精确牌型优先注入”，后续仍会继续做组合枚举补齐散牌候选。
 * - 合法性继续走 `validateFollowSelectionForState`，避免 sourceState 与 live state 规则漂移。
 */
function canStopAfterDirectPatternSeeding(sourceState, suitedCards) {
  const leadSpec = sourceState?.leadSpec || null;
  if (!leadSpec || !Array.isArray(suitedCards) || suitedCards.length < leadSpec.count) return false;

  if (leadSpec.type === "single") return true;
  if (leadSpec.type === "pair") return hasForcedPair(suitedCards);
  if (leadSpec.type === "triple" || leadSpec.type === "tractor" || leadSpec.type === "train"
    || leadSpec.type === "bulldozer" || leadSpec.type === "throw") {
    return hasMatchingPattern(suitedCards, leadSpec);
  }
  return false;
}

/**
 * 作用：
 * 在显式 `sourceState` 候选链路里，优先补入与首家牌型完全匹配的结构候选。
 *
 * 为什么这样写：
 * 中级 AI、模拟层和调试候选都共用 `getLegalSelectionsForState`；
 * 如果这里只靠固定上限的组合枚举，仍会出现“真实有合法主拖拉机，但候选层没扫到”的假空集问题。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {Array<Array<object>>} results - 已收集到的合法候选列表。
 * @param {Set<string>} seen - 已去重候选键集合。
 * @param {number} playerId - 当前出牌玩家 ID。
 * @param {Array<object>} suitedCards - 当前与首家同门的牌池。
 * @param {number} limit - 最多允许保留的合法候选数。
 *
 * 输出：
 * @returns {boolean} 若已达到 `limit` 并可提前结束，则返回 `true`。
 *
 * 注意：
 * - 当同门里已经存在“必须精确跟型”的结构时，直接牌型集合就是完整合法集，可安全提前结束。
 * - 只有无法确定“精确结构已覆盖全部合法解”时，才继续回落到组合枚举补齐散牌候选。
 */
function seedDirectPatternSelectionsForState(sourceState, results, seen, suitedCards, limit) {
  const leadSpec = sourceState?.leadSpec || null;
  if (!leadSpec || !Array.isArray(suitedCards) || suitedCards.length < leadSpec.count) return false;

  const directPatternCombos = getPatternCombos(suitedCards, leadSpec);
  for (const combo of directPatternCombos) {
    const key = combo.map((card) => card.id).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(combo);
    if (results.length >= limit) return true;
  }
  return directPatternCombos.length > 0 && canStopAfterDirectPatternSeeding(sourceState, suitedCards);
}

/**
 * 作用：
 * 从指定状态读取所有合法跟牌候选，作为 follow 模式的候选基础集。
 *
 * 为什么这样写：
 * 候选层已经开始转向 sourceState 驱动，因此这里把跟牌合法枚举也改成显式状态版本，
 * 避免为了拿候选集合而反复切换全局 state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要枚举候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<Array<object>>} 返回该玩家当前所有合法跟牌候选。
 *
 * 注意：
 * - 当前只迁移了跟牌合法性，首发合法性仍保留在旧链路。
 * - 返回的候选顺序尽量保持与旧实现一致，避免行为突变。
 */
function getLegalSelectionsForState(sourceState, playerId) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  const leadSpec = sourceState?.leadSpec || null;
  if (!player || !leadSpec || !sourceState?.currentTrick?.length) return [];

  const hand = [...player.hand].sort((a, b) => cardStrength(a) - cardStrength(b));
  const targetCount = leadSpec.count;
  const suited = hand.filter((card) => effectiveSuit(card) === leadSpec.suit);
  const pools = [];

  if (suited.length >= targetCount) {
    pools.push(suited);
  } else if (suited.length > 0) {
    pools.push([...suited, ...hand.filter((card) => !suited.some((suitedCard) => suitedCard.id === card.id))]);
  }
  pools.push(hand);

  const seen = new Set();
  const results = [];
  if (seedDirectPatternSelectionsForState(sourceState, results, seen, suited, 72)) {
    return results;
  }
  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    const combinationLimit = getCombinationEnumerationLimit(pool.length, targetCount, 72 * 16);
    for (const combo of enumerateCombinations(pool, targetCount, combinationLimit)) {
      if (!validateFollowSelectionForState(sourceState, playerId, combo).ok) continue;
      const key = combo.map((card) => card.id).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(combo);
      if (results.length >= 72) return results;
    }
  }
  return results;
}

/**
 * 作用：
 * 基于指定状态判断某组候选是否能压过当前桌面最大牌。
 *
 * 为什么这样写：
 * 候选标签里的 `beats` 需要和 sourceState 对齐，不能再偷偷读 live state。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 出牌玩家 ID。
 * @param {Array<object>} cards - 待评估的候选牌组。
 *
 * 输出：
 * @returns {boolean} 返回该候选在 sourceState 下是否能压过当前最大牌。
 *
 * 注意：
 * - 这里不负责校验候选是否合法，只回答“如果打这手，是否能压住”。
 * - 逻辑故意只依赖 sourceState，避免标签和真实模拟上下文不一致。
 */
function doesSelectionBeatCurrentForState(sourceState, playerId, cards) {
  if (!sourceState?.leadSpec || !sourceState?.currentTrick?.length || !Array.isArray(cards) || cards.length === 0) {
    return false;
  }
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player) return false;
  const suited = player.hand.filter((card) => effectiveSuit(card) === sourceState.leadSpec.suit);
  if (suited.length > 0) return false;

  const pattern = classifyPlay(cards);
  if (!matchesLeadPattern(pattern, sourceState.leadSpec)) return false;

  const currentWinningPlay = getSimulationCurrentWinningPlay(sourceState);
  if (!currentWinningPlay) return false;
  const currentPattern = classifyPlay(currentWinningPlay.cards);
  if (sourceState.leadSpec.type === "single") {
    return compareSingle(cards[0], currentWinningPlay.cards[0], sourceState.leadSpec.suit) > 0;
  }
  return compareSameTypePlay(pattern, currentPattern, sourceState.leadSpec.suit) > 0;
}

/**
 * 作用：
 * 按指定状态和模式，把原始候选条目过滤成可进入评分链路的干净集合。
 *
 * 为什么这样写：
 * 里程碑 0 需要统一“候选生成 -> 合法复验 -> 过滤 -> 打标签”的顺序，
 * 这样非法甩牌、真正非法跟牌和标签混乱问题才能一起解决。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 出牌玩家 ID。
 * @param {string} mode - 当前是 `lead` 还是 `follow`。
 * @param {Array<object>} rawEntries - 未过滤的候选条目列表。
 *
 * 输出：
 * @returns {{entries: Array<object>, filteredEntries: Array<object>}} 返回过滤后的候选和过滤记录。
 *
 * 注意：
 * - 该函数不会重新排序，只负责过滤和标签规范化。
 * - 所有真正非法候选都应进入 `filteredEntries`，而不是以 `invalid` tag 混入 `entries`。
 */
function filterCandidateEntriesForState(sourceState, playerId, mode, rawEntries) {
  const entries = [];
  const filteredEntries = [];
  const leadSpec = sourceState?.leadSpec || null;

  for (const entry of Array.isArray(rawEntries) ? rawEntries : []) {
    if (!entry || !Array.isArray(entry.cards) || entry.cards.length === 0) continue;
    const pattern = classifyPlay(entry.cards);
    const baseTags = Array.isArray(entry.tags) ? [...entry.tags] : [];
    const normalizedTags = [];

    for (const tag of baseTags) {
      if (tag === "invalid") continue;
      if (!normalizedTags.includes(tag)) normalizedTags.push(tag);
    }

    const shapeTag = getCandidatePatternTag(pattern);
    if (!normalizedTags.includes(shapeTag)) normalizedTags.push(shapeTag);

    const suitTag = pattern.suit || effectiveSuit(entry.cards[0]);
    if (suitTag && !normalizedTags.includes(suitTag)) normalizedTags.push(suitTag);

    if (mode === "follow") {
      const beats = doesSelectionBeatCurrentForState(sourceState, playerId, entry.cards);
      const shapeRelationTag = pattern.ok && leadSpec && matchesLeadPattern(pattern, leadSpec)
        ? "matched"
        : "off_pattern";
      const beatTag = beats ? "beats" : "non_beating";
      if (!normalizedTags.includes(shapeRelationTag)) normalizedTags.push(shapeRelationTag);
      if (!normalizedTags.includes(beatTag)) normalizedTags.push(beatTag);
    }

    const validation = validateCandidateForState(sourceState, playerId, entry.cards, mode);
    if (!validation.ok) {
      const filtered = createFilteredCandidateEntry(
        entry.cards,
        entry.source || null,
        normalizedTags,
        validation.filterReason || "filtered",
        validation.detailReason || null
      );
      if (filtered) filteredEntries.push(filtered);
      continue;
    }

    const throwAssessment = mode === "lead" && pattern.type === "throw"
      ? (entry.throwAssessment || assessThrowCandidateForState(sourceState, playerId, entry.cards))
      : null;
    if (throwAssessment) {
      const throwRiskTag = `throw_${throwAssessment.level}`;
      if (!normalizedTags.includes(throwRiskTag)) normalizedTags.push(throwRiskTag);
    }

    entries.push({
      ...entry,
      tags: normalizedTags,
      throwAssessment,
    });
  }

  return {
    entries: dedupeCandidateEntries(entries),
    filteredEntries,
  };
}

/**
 * 作用：
 * 基于指定状态的手牌结构生成中级首发候选，而不是直接读取 live state。
 *
 * 为什么这样写：
 * 首发结构候选其实主要依赖玩家当前手牌，先把这部分改成纯 sourceState 计算，
 * 能显著减少候选层对全局 state 的隐式耦合。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成首发候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<Array<object>>} 返回该玩家在 sourceState 下的首发候选列表。
 *
 * 注意：
 * - 会保留一手 legacy 首发建议，保证当前产品行为不突然跳变。
 * - 这里只产出候选，不负责打分排序。
 */
function getIntermediateLeadCandidatesForState(sourceState, playerId) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player || player.hand.length === 0) return [];
  const hand = player.hand;
  const seen = new Set();
  const candidates = [];

  addUniqueCombo(candidates, seen, getLegacyLeadChoiceForState(sourceState, playerId));

  const patternGroups = [
    findSerialTuples(hand, 3),
    findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "train"),
    findSerialTuples(hand, 2).filter((combo) => classifyPlay(combo).type === "tractor"),
    findTriples(hand),
    findPairs(hand),
  ];
  for (const combos of patternGroups) {
    if (combos.length === 0) continue;
    addUniqueCombo(candidates, seen, combos[0]);
    addUniqueCombo(candidates, seen, combos[combos.length - 1]);
  }

  const suitBuckets = new Map();
  for (const card of hand) {
    const suit = effectiveSuit(card);
    if (!suitBuckets.has(suit)) suitBuckets.set(suit, []);
    suitBuckets.get(suit).push(card);
  }

  for (const cards of suitBuckets.values()) {
    addUniqueCombo(candidates, seen, [lowestCard(cards)]);
    addUniqueCombo(candidates, seen, [highestCard(cards)]);
    addUniqueCombo(candidates, seen, chooseStrongLeadFromCards(cards));
  }

  return candidates;
}

/**
 * 作用：
 * 构建首发模式下未过滤的原始候选条目。
 *
 * 为什么这样写：
 * 里程碑 0 需要先收集所有候选，再统一做合法复验和过滤原因记录；
 * 如果在生成过程中直接丢掉候选，就无法把“为什么被过滤”写入 debug bundle。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成首发候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回首发模式下的原始候选条目。
 *
 * 注意：
 * - 这里不负责过滤合法性。
 * - 去重在过滤前先做一次，避免重复候选污染过滤统计。
 */
function buildRawLeadCandidateEntries(sourceState, playerId) {
  const player = getCandidateSourcePlayer(sourceState, playerId);
  if (!player || player.hand.length === 0) return [];

  const entries = [];
  const heuristicLead = getLegacyLeadChoiceForState(sourceState, playerId);
  if (heuristicLead.length > 0) {
    entries.push(createCandidateEntry(heuristicLead, "heuristic", ["legacy", "special"]));
  }

  const structuralCandidates = getIntermediateLeadCandidatesForState(sourceState, playerId);
  for (const combo of structuralCandidates) {
    const pattern = classifyPlay(combo);
    entries.push(createCandidateEntry(combo, "structure", [getCandidatePatternTag(pattern), pattern.suit || effectiveSuit(combo[0])]));
  }

  const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries);
}

/**
 * 作用：
 * 生成指定状态下的首发候选条目。
 *
 * 为什么这样写：
 * 这一步让首发候选的主体逻辑直接吃 sourceState，只有 legacy 候选和 beginner 基线走适配器，
 * 从而把候选层逐步从全局 state 中剥离出来。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成首发候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回带来源和标签的首发候选条目列表。
 *
 * 注意：
 * - 返回值会在函数末尾去重并限制数量。
 * - 这里的标签只描述候选本身，不参与胜负判断。
 */
function generateLeadCandidates(sourceState, playerId) {
  return filterCandidateEntriesForState(
    sourceState,
    playerId,
    "lead",
    buildRawLeadCandidateEntries(sourceState, playerId)
  ).entries.slice(0, 20);
}

/**
 * 作用：
 * 生成指定状态下的跟牌候选条目。
 *
 * 为什么这样写：
 * 跟牌候选的合法集暂时仍由旧规则引擎提供，但候选标签和压制判断已经改为显式读取 sourceState，
 * 这样后续继续迁移合法性判断时，候选条目层不需要再返工一次。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成跟牌候选的玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回带来源和标签的跟牌候选条目列表。
 *
 * 注意：
 * - `matched` 和 `beats` 都必须基于 sourceState 计算，不能混入 live state。
 * - 这里仍保留 beginner 基线候选，保证候选层有稳定保底。
 */
function generateFollowCandidates(sourceState, playerId) {
  const candidates = getLegalSelectionsForState(sourceState, playerId);
  const entries = candidates.map((combo) => {
    const pattern = classifyPlay(combo);
    const tags = [getCandidatePatternTag(pattern), pattern.suit || effectiveSuit(combo[0])];
    return createCandidateEntry(combo, "legal", tags);
  });

  const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return filterCandidateEntriesForState(sourceState, playerId, "follow", entries).entries.slice(0, 24);
}

/**
 * 作用：
 * 生成指定状态下的候选结果，包含可评分候选与被过滤候选。
 *
 * 为什么这样写：
 * 评分和 debug 都需要同时看到“留下了哪些候选”和“过滤掉了哪些候选及原因”，
 * 单纯返回数组已经不够表达里程碑 0 需要的调试信息。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成候选的玩家 ID。
 * @param {string} mode - 当前是 `lead` 还是 `follow`。
 *
 * 输出：
 * @returns {{entries: Array<object>, filteredEntries: Array<object>}} 返回过滤后的候选和过滤记录。
 *
 * 注意：
 * - 这里会再次走统一过滤层，保证不同来源的候选结果口径一致。
 * - `generateCandidatePlays` 只是它的兼容包装器。
 */
function generateCandidateResultForState(sourceState, playerId, mode) {
  const rawEntries = mode === "follow"
    ? (() => {
      const candidates = getLegalSelectionsForState(sourceState, playerId);
      const entries = candidates.map((combo) => {
        const pattern = classifyPlay(combo);
        const tags = [getCandidatePatternTag(pattern), pattern.suit || effectiveSuit(combo[0])];
        return createCandidateEntry(combo, "legal", tags);
      });
      const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
      if (beginnerChoice.length > 0) {
        entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
      }
      return dedupeCandidateEntries(entries);
    })()
    : buildRawLeadCandidateEntries(sourceState, playerId);
  const filteredResult = filterCandidateEntriesForState(sourceState, playerId, mode, rawEntries);
  return {
    entries: filteredResult.entries.slice(0, mode === "follow" ? 24 : 20),
    filteredEntries: filteredResult.filteredEntries,
  };
}

/**
 * 作用：
 * 按指定模式统一生成候选条目。
 *
 * 为什么这样写：
 * 中级搜索主流程已经统一到 mode 入口，这里保持同样的切面，方便后续继续把 candidate pipeline 做成纯函数。
 *
 * 输入：
 * @param {object|null} sourceState - 当前候选评估使用的真实或模拟牌局状态。
 * @param {number} playerId - 需要生成候选的玩家 ID。
 * @param {string} mode - 当前是 `lead` 还是 `follow`。
 *
 * 输出：
 * @returns {Array<object>} 返回该模式下的候选条目列表。
 *
 * 注意：
 * - 未识别的 mode 会按 `lead` 处理，保持现有行为简单稳定。
 * - 这里只负责产出候选，不负责评分和排序。
 */
function generateCandidatePlays(sourceState, playerId, mode) {
  return generateCandidateResultForState(sourceState, playerId, mode).entries;
}
