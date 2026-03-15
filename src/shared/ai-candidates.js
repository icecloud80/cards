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

  const pattern = classifyPlay(cards);
  if (cards.length !== leadSpec.count) {
    return { ok: false, reason: TEXT.rules.validation.followCount(leadSpec.count) };
  }

  const suited = player.hand.filter((card) => effectiveSuit(card) === leadSpec.suit);
  if (suited.length >= leadSpec.count) {
    if (!cards.every((card) => effectiveSuit(card) === leadSpec.suit)) {
      return { ok: false, reason: TEXT.rules.validation.sameSuitFirst };
    }

    if (leadSpec.type === "pair") {
      if (hasForcedPair(suited) && pattern.type !== "pair") {
        return { ok: false, reason: TEXT.rules.validation.pairMustFollow };
      }
      return { ok: true };
    }

    if (leadSpec.type === "triple") {
      if (hasMatchingPattern(suited, leadSpec)) {
        if (!matchesLeadPattern(pattern, leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.tripleMustFollow };
        }
        return { ok: true };
      }

      if (hasForcedPair(suited) && getForcedPairUnits(cards) < 1) {
        return { ok: false, reason: TEXT.rules.validation.tripleFollowPair };
      }
      return { ok: true };
    }

    if (leadSpec.type === "tractor" || leadSpec.type === "train") {
      if (hasMatchingPattern(suited, leadSpec)) {
        if (!matchesLeadPattern(pattern, leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.trainMustFollow };
        }
        return { ok: true };
      }

      const requiredPairs = Math.min(leadSpec.chainLength || 0, getForcedPairUnits(suited));
      if (requiredPairs > 0 && getForcedPairUnits(cards) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.trainFollowPairs };
      }
      return { ok: true };
    }

    if (leadSpec.type === "bulldozer") {
      if (hasMatchingPattern(suited, leadSpec)) {
        if (!matchesLeadPattern(pattern, leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.bulldozerMustFollow };
        }
        return { ok: true };
      }

      const requiredTriples = Math.min(leadSpec.chainLength || 0, getTripleUnits(suited));
      if (requiredTriples > 0 && getTripleUnits(cards) < requiredTriples) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerTriples };
      }

      const requiredPairs = Math.min(2, getForcedPairUnitsWithReservedTriples(suited, requiredTriples));
      if (requiredPairs > 0 && getForcedPairUnitsWithReservedTriples(cards, requiredTriples) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerPairs };
      }
      return { ok: true };
    }

    if (hasMatchingPattern(suited, leadSpec) && !matchesLeadPattern(pattern, leadSpec)) {
      return { ok: false, reason: TEXT.rules.validation.samePattern };
    }
    return { ok: true };
  }

  if (suited.length > 0) {
    const suitedIds = new Set(suited.map((card) => card.id));
    const selectedSuitedCount = cards.filter((card) => suitedIds.has(card.id)).length;
    if (selectedSuitedCount !== suited.length) {
      return { ok: false, reason: TEXT.rules.validation.exhaustSuit };
    }
    return { ok: true };
  }

  return { ok: true };
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
  for (const pool of pools) {
    if (pool.length < targetCount) continue;
    for (const combo of enumerateCombinations(pool, targetCount)) {
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
    entries.push(createCandidateEntry(combo, "structure", [pattern.type, pattern.suit || effectiveSuit(combo[0])]));
  }

  const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries).slice(0, 20);
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
  const leadSpec = sourceState?.leadSpec || null;
  const entries = candidates.map((combo) => {
    const pattern = classifyPlay(combo);
    const tags = [pattern.type, pattern.suit || effectiveSuit(combo[0])];
    if (doesSelectionBeatCurrentForState(sourceState, playerId, combo)) tags.push("beats");
    if (leadSpec && matchesLeadPattern(pattern, leadSpec)) tags.push("matched");
    return createCandidateEntry(combo, "legal", tags);
  });

  const beginnerChoice = getBeginnerLegalHintForState(sourceState, playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries).slice(0, 24);
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
  return mode === "follow"
    ? generateFollowCandidates(sourceState, playerId)
    : generateLeadCandidates(sourceState, playerId);
}
