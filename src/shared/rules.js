// 创建并洗混本局要使用的牌堆。
function createDeck() {
  const deck = [];
  let seq = 0;
  for (let pack = 0; pack < 3; pack += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({
          id: `c-${pack}-${suit}-${rank}-${seq++}`,
          suit,
          rank,
          pack,
          img: getCardImage(suit, rank),
        });
      }
    }
    deck.push({
      id: `c-${pack}-joker-BJ-${seq++}`,
      suit: "joker",
      rank: "BJ",
      pack,
      img: getJokerImage("BJ"),
    });
    deck.push({
      id: `c-${pack}-joker-RJ-${seq++}`,
      suit: "joker",
      rank: "RJ",
      pack,
      img: getJokerImage("RJ"),
    });
  }
  return shuffle(deck);
}

// 返回大小王对应的图片路径。
function getJokerImage(rank) {
  return `${getCurrentCardAssetDir()}/${rank === "RJ" ? "red_joker" : "black_joker"}.svg`;
}

// 返回普通牌对应的图片路径。
function getCardImage(suit, rank) {
  const rankName = {
    A: "ace",
    K: "king",
    Q: "queen",
    J: "jack",
  }[rank] || rank;
  return `${getCurrentCardAssetDir()}/${rankName}_of_${suit}.svg`;
}

// 根据牌对象解析对应的图片路径。
function resolveCardImage(card) {
  if (!card) return "";
  if (card.suit === "joker") return getJokerImage(card.rank);
  if (card.suit && card.rank) return getCardImage(card.suit, card.rank);
  return card.img || "";
}

// 随机打乱数组顺序。
function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// 获取玩家等级。
function getPlayerLevel(playerId) {
  return state.playerLevels[playerId] || "2";
}

// 获取等级点数。
function getLevelRank(level) {
  if (level == null || level === "") return null;
  const normalized = String(level);
  return normalized.startsWith("-") ? normalized.slice(1) : normalized;
}

// 判断等级是否为负级。
function isNegativeLevel(level) {
  return typeof level === "string" && level.startsWith("-");
}

// 返回指定玩家当前的等级点数。
function getPlayerLevelRank(playerId) {
  return getLevelRank(getPlayerLevel(playerId));
}

// 返回当前这一局使用的等级点数。
function getCurrentLevelRank() {
  return getLevelRank(state.declaration?.rank || state.levelRank || null);
}

// 按升级步数推进等级。
function shiftLevel(rank, delta) {
  let current = [...NEGATIVE_LEVELS, ...RANKS].includes(rank) ? rank : "2";
  for (let i = 0; i < delta; i += 1) {
    if (current === "-2") {
      current = "-A";
      break;
    } else if (current === "-A") {
      current = "2";
      break;
    } else {
      const currentIndex = RANKS.indexOf(current);
      if (currentIndex < 0 || currentIndex >= RANKS.length - 1) {
        return "A";
      }
      current = RANKS[currentIndex + 1];
    }
    if (!isNegativeLevel(current) && MANDATORY_LEVELS.has(current)) {
      break;
    }
  }
  return current;
}

// 返回降级规则使用的兜底映射。
function getPenaltyFallbackMap(mode = "trump") {
  if (mode === "vice") return VICE_PENALTY_LEVEL_FALLBACK;
  return TRUMP_PENALTY_LEVEL_FALLBACK;
}

// 按惩罚规则降低等级。
function dropLevel(rank, steps = 1, mode = "trump") {
  let current = [...NEGATIVE_LEVELS, ...RANKS].includes(rank) ? rank : "2";
  const fallbackMap = getPenaltyFallbackMap(mode);
  for (let i = 0; i < steps; i += 1) {
    if (current === "-2") {
      current = "-2";
      continue;
    }
    if (current === "-A") {
      current = "-2";
      continue;
    }
    if (!RANKS.includes(current)) {
      current = "2";
      continue;
    }
    if (fallbackMap[current]) {
      current = fallbackMap[current];
      continue;
    }
    current = current === "2" ? "-A" : RANKS[Math.max(0, RANKS.indexOf(current) - 1)];
  }
  return current;
}

// 同步玩家等级进度。
function syncPlayerLevels() {
  for (const player of state.players) {
    player.level = getPlayerLevel(player.id);
  }
}

// 按展示规则对手牌排序。
function sortHand(hand) {
  return [...hand].sort((a, b) => {
    return compareHandCardsForDisplay(a, b);
  });
}

// 返回手牌分组时的花色顺序。
function groupOrder(card) {
  if (isTrump(card)) return 4;
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

// 获取显示花色顺序。
function getDisplaySuitOrder(card) {
  const activeTrumpSuit = getActiveTrumpSuit();
  if (card.suit === "joker") return 5;
  if (isTrump(card) && getCurrentLevelRank() && card.rank === getCurrentLevelRank()) {
    if (activeTrumpSuit && card.suit === activeTrumpSuit) return -1;
  }
  return { clubs: 0, diamonds: 1, spades: 2, hearts: 3 }[card.suit] ?? 4;
}

// 比较手牌显示顺序。
function compareHandCardsForDisplay(a, b) {
  const groupDiff = groupOrder(a) - groupOrder(b);
  if (groupDiff !== 0) return groupDiff;

  const strengthDiff = cardStrength(b) - cardStrength(a);
  if (strengthDiff !== 0) return strengthDiff;

  const suitDiff = getDisplaySuitOrder(a) - getDisplaySuitOrder(b);
  if (suitDiff !== 0) return suitDiff;

  return (a.deckIndex ?? 0) - (b.deckIndex ?? 0);
}

// 获取当前生效的主牌花色。
function getActiveTrumpSuit() {
  if (state.phase === "ready") {
    return null;
  }
  if (state.phase === "dealing") {
    if (!state.declaration || state.declaration.suit === "notrump") return null;
    return state.declaration.suit;
  }
  if (state.trumpSuit === "notrump") return null;
  return state.trumpSuit;
}

// 判断是否主牌。
function isTrump(card) {
  const currentLevelRank = getCurrentLevelRank();
  const activeTrumpSuit = getActiveTrumpSuit();
  return card.suit === "joker" || (currentLevelRank && card.rank === currentLevelRank) || (activeTrumpSuit ? card.suit === activeTrumpSuit : false);
}

// 返回牌在当前规则下的实际花色。
function effectiveSuit(card) {
  return isTrump(card) ? "trump" : card.suit;
}

// 返回主牌体系下的点数序位。
function getTrumpRankIndex(card) {
  const currentLevelRank = getCurrentLevelRank();
  const plainRanks = RANKS.filter((rank) => rank !== currentLevelRank);
  if (card.rank === "RJ") return plainRanks.length + 3;
  if (card.rank === "BJ") return plainRanks.length + 2;
  const activeTrumpSuit = getActiveTrumpSuit();
  if (currentLevelRank && card.rank === currentLevelRank && activeTrumpSuit && card.suit === activeTrumpSuit) {
    return plainRanks.length + 1;
  }
  if (currentLevelRank && card.rank === currentLevelRank) {
    return plainRanks.length;
  }
  return plainRanks.indexOf(card.rank);
}

// 计算单张牌在牌型比较中的强度。
function getPatternUnitPower(card, suit = effectiveSuit(card)) {
  return suit === "trump" ? getTrumpRankIndex(card) : getNonTrumpRankIndex(card.rank);
}

// 计算单张牌的基础强度。
function cardStrength(card) {
  const suit = effectiveSuit(card);
  return (suit === "trump" ? 500 : 100) + getPatternUnitPower(card, suit);
}

// 返回牌面的分值。
function scoreValue(card) {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

/**
 * 作用：
 * 计算一组牌里的总分牌分值。
 *
 * 为什么这样写：
 * 扣底上限、底牌展示和结算都依赖同一套分值口径，集中到一个函数里可以避免多处重复累加时出现规则偏差。
 *
 * 输入：
 * @param {Array<{rank: string}>} cards - 需要统计分值的一组牌
 *
 * 输出：
 * @returns {number} 这组牌按 5/10/K 规则累计后的总分
 *
 * 注意：
 * - 传入空数组或非数组时按 0 分处理
 * - 这里返回的是原始分值，不包含扣底翻倍或封顶逻辑
 */
function getCardsPointTotal(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + scoreValue(card), 0);
}

// 选出一组牌里最小的那张。
function lowestCard(cards) {
  return [...cards].sort((a, b) => cardStrength(a) - cardStrength(b))[0];
}

// 查找对子。
function findPairs(cards) {
  return findTuples(cards, 2);
}

// 判断是否存在必须跟出的对子。
function hasForcedPair(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()].some((count) => count === 2 || count >= 4);
}

// 获取牌分组数量。
function getCardGroupCounts(cards) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.values()];
}

// 拆出必须跟出的对子单元。
function getForcedPairUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => {
    if (count < 2 || count === 3) return sum;
    return sum + Math.floor(count / 2);
  }, 0);
}

// 拆出三张组。
function getTripleUnits(cards) {
  return getCardGroupCounts(cards).reduce((sum, count) => sum + Math.floor(count / 3), 0);
}

// 在保留三张组后拆出必须跟出的对子。
function getForcedPairUnitsWithReservedTriples(cards, reservedTriples = 0) {
  const counts = getCardGroupCounts(cards);
  let triplesLeft = reservedTriples;

  while (triplesLeft > 0) {
    const candidates = counts
      .map((count, index) => ({ count, index }))
      .filter((entry) => entry.count >= 3);
    if (candidates.length === 0) break;

    candidates.sort((a, b) => {
      const pairLossA = getPairUnitsFromCount(a.count) - getPairUnitsFromCount(a.count - 3);
      const pairLossB = getPairUnitsFromCount(b.count) - getPairUnitsFromCount(b.count - 3);
      if (pairLossA !== pairLossB) return pairLossA - pairLossB;
      return a.count - b.count;
    });

    counts[candidates[0].index] -= 3;
    triplesLeft -= 1;
  }

  return counts.reduce((sum, count) => sum + getPairUnitsFromCount(count), 0);
}

// 按计数结果生成对子单元。
function getPairUnitsFromCount(count) {
  if (count < 2 || count === 3) return 0;
  return Math.floor(count / 2);
}

// 查找刻子。
function findTriples(cards) {
  return findTuples(cards, 3);
}

// 查找同张组合。
function findTuples(cards, tupleSize) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }
  return [...map.values()]
    .filter((group) => group.length >= tupleSize)
    .map((group) => group.slice(0, tupleSize))
    .sort((a, b) => getPatternUnitPower(a[0]) - getPatternUnitPower(b[0]));
}

// 返回副牌体系下的点数序位。
function getNonTrumpRankIndex(rank) {
  const currentLevelRank = getCurrentLevelRank();
  const ranks = RANKS.filter((item) => item !== currentLevelRank);
  return ranks.indexOf(rank);
}

// 判断是否精确刻子。
function isExactTriple(cards) {
  return cards.length === 3
    && cards.every((card) => card.rank === cards[0].rank && card.suit === cards[0].suit);
}

// 查找连续同张组合。
function findSerialTuples(cards, tupleSize, exactChainLength = null) {
  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const bySuit = new Map();
  for (const group of map.values()) {
    if (group.length < tupleSize) continue;
    const tuple = group.slice(0, tupleSize);
    const suit = effectiveSuit(tuple[0]);
    const entry = {
      cards: tuple,
      suit,
      index: getPatternUnitPower(tuple[0], suit),
    };
    if (!bySuit.has(suit)) bySuit.set(suit, []);
    bySuit.get(suit).push(entry);
  }

  const results = [];
  for (const entries of bySuit.values()) {
    entries.sort((a, b) => a.index - b.index);
    let runStart = 0;
    for (let i = 1; i <= entries.length; i += 1) {
      const consecutive = i < entries.length && entries[i].index - entries[i - 1].index === 1;
      if (consecutive) continue;
      const run = entries.slice(runStart, i);
      const need = exactChainLength || run.length;
      if (run.length >= 2 && run.length >= need) {
        if (exactChainLength) {
          for (let j = 0; j <= run.length - exactChainLength; j += 1) {
            results.push(run.slice(j, j + exactChainLength).flatMap((entry) => entry.cards));
          }
        } else {
          results.push(run.flatMap((entry) => entry.cards));
        }
      }
      runStart = i;
    }
  }

  return results.sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
}

// 判断一组牌是否属于同一实际花色。
function isSameSuitSet(cards) {
  if (cards.length === 0) return false;
  const suit = effectiveSuit(cards[0]);
  return cards.every((card) => effectiveSuit(card) === suit);
}

// 从牌组里移除已选中的牌。
function removePickedCards(cards, pickedCards) {
  const remaining = [...cards];
  for (const picked of pickedCards) {
    const index = remaining.findIndex((card) => card.id === picked.id);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

// 生成甩牌拆解搜索键。
function getThrowSearchKey(cards) {
  const counts = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}:${count}`)
    .join("|");
}

// 返回甩牌组件类型的比较权重。
function getThrowComponentTypeWeight(component) {
  const typeOrder = {
    single: 0,
    pair: 1,
    triple: 2,
    tractor: 3,
    train: 4,
    bulldozer: 5,
  };
  return typeOrder[component?.type] ?? -1;
}

// 比较两个甩牌组件的强弱。
function compareThrowComponentStrength(a, b) {
  const typeDiff = getThrowComponentTypeWeight(a) - getThrowComponentTypeWeight(b);
  if (typeDiff !== 0) return typeDiff;
  if ((a.count ?? 0) !== (b.count ?? 0)) return (a.count ?? 0) - (b.count ?? 0);
  if ((a.chainLength ?? 0) !== (b.chainLength ?? 0)) return (a.chainLength ?? 0) - (b.chainLength ?? 0);
  return (a.power ?? 0) - (b.power ?? 0);
}

// 构建甩牌组成部分。
function buildThrowComponent(componentCards) {
  const pattern = classifyPlay(componentCards);
  if (!pattern.ok || pattern.type === "throw" || pattern.type === "invalid") return null;
  return {
    ...pattern,
    cards: sortPlayedCards(componentCards),
  };
}

// 获取甩牌候选项组成部分。
function getThrowCandidateComponents(cards) {
  const candidates = [];
  const seen = new Set();

  const addCandidate = (componentCards) => {
    const component = buildThrowComponent(componentCards);
    if (!component) return;
    const key = component.cards.map((card) => card.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(component);
  };

  for (const combo of findSerialTuples(cards, 3)) addCandidate(combo);
  for (const combo of findSerialTuples(cards, 2)) addCandidate(combo);
  for (const combo of findTriples(cards)) addCandidate(combo);
  for (const combo of findPairs(cards)) addCandidate(combo);

  const groups = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  for (const group of groups.values()) {
    addCandidate([group[0]]);
  }

  return candidates.sort((a, b) => compareThrowComponentStrength(b, a));
}

// 比较两种甩牌拆解方案的优先级。
function compareThrowDecomposition(a, b) {
  if (!a && !b) return 0;
  if (a && !b) return 1;
  if (!a && b) return -1;

  const singleCountA = a.filter((component) => component.type === "single").length;
  const singleCountB = b.filter((component) => component.type === "single").length;
  if (singleCountA !== singleCountB) return singleCountB - singleCountA;

  if (a.length !== b.length) return b.length - a.length;

  const sortedA = [...a].sort(compareThrowComponentStrength);
  const sortedB = [...b].sort(compareThrowComponentStrength);
  for (let i = 0; i < Math.min(sortedA.length, sortedB.length); i += 1) {
    const diff = compareThrowComponentStrength(sortedA[i], sortedB[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

// 搜索最优的甩牌拆解方案。
function searchBestThrowDecomposition(cards, memo = new Map()) {
  if (cards.length === 0) return [];
  const key = getThrowSearchKey(cards);
  if (memo.has(key)) return memo.get(key);

  let best = null;
  const candidates = getThrowCandidateComponents(cards);
  for (const component of candidates) {
    const remaining = removePickedCards(cards, component.cards);
    const rest = searchBestThrowDecomposition(remaining, memo);
    if (!rest) continue;
    const attempt = [component, ...rest];
    if (compareThrowDecomposition(attempt, best) > 0) {
      best = attempt;
    }
  }

  memo.set(key, best);
  return best;
}

// 将甩牌拆成可比较的组件。
function decomposeThrowComponents(cards) {
  if (!isSameSuitSet(cards)) return null;
  const components = searchBestThrowDecomposition(
    [...cards].sort((a, b) => cardStrength(b) - cardStrength(a))
  );
  if (!components) return null;
  return components.every((component) => component.ok) ? components : null;
}

// 判断是否连续同张组合出牌。
function isSerialTuplePlay(cards, tupleSize) {
  if (cards.length < tupleSize * 2 || cards.length % tupleSize !== 0) return false;
  const suit = effectiveSuit(cards[0]);
  if (cards.some((card) => effectiveSuit(card) !== suit)) return false;

  const map = new Map();
  for (const card of cards) {
    const key = `${card.suit}-${card.rank}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  }

  const groups = [...map.values()];
  if (groups.some((group) => group.length !== tupleSize)) return false;

  const ordered = groups
    .map((group) => ({
      index: getPatternUnitPower(group[0], suit),
      key: `${group[0].suit}-${group[0].rank}`,
    }))
    .sort((a, b) => a.index - b.index);

  if (new Set(ordered.map((item) => item.key)).size !== groups.length) return false;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].index - ordered[i - 1].index !== 1) {
      return false;
    }
  }
  return true;
}

// 识别出牌。
function classifyPlay(cards) {
  const sorted = sortPlayedCards(cards);
  const suit = sorted.length > 0 ? effectiveSuit(sorted[0]) : null;
  if (sorted.length === 1) {
    return { ok: true, type: "single", count: 1, suit, power: cardStrength(sorted[0]) };
  }
  if (isExactPair(sorted)) {
    return { ok: true, type: "pair", count: 2, suit, power: cardStrength(sorted[0]) };
  }
  if (isExactTriple(sorted)) {
    return { ok: true, type: "triple", count: 3, suit, power: cardStrength(sorted[0]) };
  }
  if (isSerialTuplePlay(sorted, 2)) {
    const pairs = findPairs(sorted).sort((a, b) => getPatternUnitPower(a[0], suit) - getPatternUnitPower(b[0], suit));
    const chainLength = pairs.length;
    return {
      ok: true,
      type: chainLength >= 3 ? "train" : "tractor",
      count: sorted.length,
      suit,
      chainLength,
      tupleSize: 2,
      power: getPatternUnitPower(pairs[pairs.length - 1][0], suit),
    };
  }
  if (isSerialTuplePlay(sorted, 3)) {
    const triples = findTriples(sorted).sort((a, b) => getPatternUnitPower(a[0], suit) - getPatternUnitPower(b[0], suit));
    return {
      ok: true,
      type: "bulldozer",
      count: sorted.length,
      suit,
      chainLength: triples.length,
      tupleSize: 3,
      power: getPatternUnitPower(triples[triples.length - 1][0], suit),
    };
  }
  const throwComponents = sorted.length > 1 ? decomposeThrowComponents(sorted) : null;
  if (throwComponents && throwComponents.length > 1) {
    return {
      ok: true,
      type: "throw",
      count: sorted.length,
      suit,
      components: throwComponents,
      power: Math.max(...throwComponents.map((component) => component.power ?? 0)),
    };
  }
  return { ok: false, type: "invalid", count: sorted.length, suit };
}

/**
 * 作用：
 * 根据一手合法末手牌型，返回扣底计分所需的倍数和说明标签。
 *
 * 为什么这样写：
 * 扣底结算、日志文案和测试都需要共用同一套倍率口径；把倍率规则集中在这里可以避免不同入口各自维护一套分支逻辑。
 *
 * 输入：
 * @param {{ok?: boolean, type?: string, chainLength?: number, components?: Array<object>}} pattern - 已识别出的出牌牌型
 *
 * 输出：
 * @returns {{multiplier: number, label: string}} 当前牌型对应的扣底倍数和展示标签
 *
 * 注意：
 * - 非法牌型或缺失牌型一律按单扣 `x2` 兜底
 * - 甩牌按组件中“倍率最大的合法组合”计分；如果倍率相同，优先保留更强的大组件标签
 */
function getBottomScoreInfoFromPattern(pattern) {
  if (!pattern?.ok) {
    return {
      multiplier: 2,
      label: TEXT.rules.bottomScoreLabels.single,
    };
  }

  if (pattern.type === "throw" && Array.isArray(pattern.components) && pattern.components.length > 0) {
    const bestComponent = pattern.components
      .map((component) => getBottomScoreInfoFromPattern(component))
      .reduce((best, current) => {
        if (!best || current.multiplier > best.multiplier) return current;
        return best;
      }, null);
    if (bestComponent) {
      return {
        multiplier: bestComponent.multiplier,
        label: `${TEXT.rules.bottomScoreLabels.throw}（按${bestComponent.label}）`,
      };
    }
  }

  if (pattern.type === "pair") {
    return {
      multiplier: 4,
      label: TEXT.rules.bottomScoreLabels.pair,
    };
  }
  if (pattern.type === "triple") {
    return {
      multiplier: 6,
      label: TEXT.rules.bottomScoreLabels.triple,
    };
  }
  if (pattern.type === "tractor") {
    return {
      multiplier: 2 * (2 ** Math.max(1, pattern.chainLength || 0)),
      label: TEXT.rules.bottomScoreLabels.tractor,
    };
  }
  if (pattern.type === "train") {
    return {
      multiplier: 2 * (2 ** Math.max(1, pattern.chainLength || 0)),
      label: TEXT.rules.bottomScoreLabels.train,
    };
  }
  if (pattern.type === "bulldozer") {
    return {
      multiplier: 2 * (3 ** Math.max(1, pattern.chainLength || 0)),
      label: TEXT.rules.bottomScoreLabels.bulldozer,
    };
  }
  return {
    multiplier: 2,
    label: TEXT.rules.bottomScoreLabels.single,
  };
}

/**
 * 作用：
 * 直接根据实际出的牌，返回扣底计分用的倍数信息。
 *
 * 为什么这样写：
 * 结算阶段通常拿到的是最后获胜那手的牌本身，而不是预先缓存好的牌型对象；这里做一层轻包装，可以让调用方不用重复 `classifyPlay`。
 *
 * 输入：
 * @param {Array<object>} cards - 最后一手获胜牌型的实际牌列表
 *
 * 输出：
 * @returns {{multiplier: number, label: string}} 这手牌用于扣底计分的倍率信息
 *
 * 注意：
 * - 仅用于“最后一手已确认合法”的场景
 * - 甩牌内部会自动递归分析其组成部分
 */
function getBottomScoreInfo(cards) {
  return getBottomScoreInfoFromPattern(classifyPlay(cards));
}

// 返回甩牌组件的形状描述。
function getThrowComponentShape(component) {
  if (!component) return "";
  return `${component.type}:${component.chainLength || 0}:${component.count || 0}`;
}

// 生成甩牌形状签名。
function getThrowShapeSignature(pattern) {
  if (!pattern || pattern.type !== "throw" || !Array.isArray(pattern.components)) return "";
  return [...pattern.components]
    .map(getThrowComponentShape)
    .sort()
    .join("|");
}

// 判断牌型是否匹配指定甩牌形状。
function matchesThrowShape(pattern, leadSpec) {
  return getThrowShapeSignature(pattern) !== "" && getThrowShapeSignature(pattern) === getThrowShapeSignature(leadSpec);
}

// 判断牌型是否符合首发牌型要求。
function matchesLeadPattern(pattern, leadSpec) {
  if (!pattern?.ok || !leadSpec) return false;
  if (pattern.count !== leadSpec.count) return false;
  if (pattern.type !== leadSpec.type) return false;
  if (pattern.type === "tractor" || pattern.type === "train" || pattern.type === "bulldozer") {
    return pattern.chainLength === leadSpec.chainLength;
  }
  if (pattern.type === "throw") {
    return matchesThrowShape(pattern, leadSpec);
  }
  return true;
}

// 判断手牌里是否存在匹配的牌型。
function hasMatchingPattern(cards, leadSpec) {
  if (!leadSpec) return false;
  if (leadSpec.type === "single") return cards.length >= 1;
  if (leadSpec.type === "pair") return findPairs(cards).length > 0;
  if (leadSpec.type === "triple") return findTriples(cards).length > 0;
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "train") return findSerialTuples(cards, 2, leadSpec.chainLength).some((combo) => classifyPlay(combo).type === "train");
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength).length > 0;
  if (leadSpec.type === "throw") return getPatternCombos(cards, leadSpec).length > 0;
  return false;
}

// 枚举符合条件的牌型组合。
function getPatternCombos(cards, leadSpec) {
  if (!leadSpec) return [];
  if (leadSpec.type === "single") return cards.map((card) => [card]).sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  if (leadSpec.type === "pair") return findPairs(cards);
  if (leadSpec.type === "triple") return findTriples(cards);
  if (leadSpec.type === "tractor") return findSerialTuples(cards, 2, leadSpec.chainLength);
  if (leadSpec.type === "train") return findSerialTuples(cards, 2, leadSpec.chainLength).filter((combo) => classifyPlay(combo).type === "train");
  if (leadSpec.type === "bulldozer") return findSerialTuples(cards, 3, leadSpec.chainLength);
  if (leadSpec.type === "throw") {
    return enumerateCombinations(cards, leadSpec.count)
      .filter((combo) => {
        if (!isSameSuitSet(combo)) return false;
        const pattern = classifyPlay(combo);
        return pattern.ok && pattern.type === "throw" && matchesThrowShape(pattern, leadSpec);
      })
      .sort((a, b) => classifyPlay(a).power - classifyPlay(b).power);
  }
  return [];
}

// 枚举组合。
function enumerateCombinations(cards, count) {
  const results = [];
  const current = [];
  const limit = count <= 4 ? 240 : count <= 6 ? 360 : 520;

  // 递归遍历组合搜索的下一层分支。
  function walk(start) {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < cards.length; i += 1) {
      current.push(cards[i]);
      walk(i + 1);
      current.pop();
      if (results.length >= limit) return;
    }
  }

  walk(0);
  return results;
}

// 比较同类型出牌的强弱。
function compareSameTypePlay(candidatePattern, currentPattern, leadSuit) {
  if (candidatePattern.type === "throw" && currentPattern.type === "throw") {
    const candidateComponents = [...candidatePattern.components].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    const currentComponents = [...currentPattern.components].sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    for (let i = 0; i < Math.min(candidateComponents.length, currentComponents.length); i += 1) {
      const diff = compareSameTypePlay(candidateComponents[i], currentComponents[i], leadSuit);
      if (diff !== 0) return diff;
    }
    return 0;
  }
  const candidateTrump = candidatePattern.suit === "trump";
  const currentTrump = currentPattern.suit === "trump";
  if (candidateTrump && !currentTrump) return 1;
  if (!candidateTrump && currentTrump) return -1;
  if (!candidateTrump && !currentTrump) {
    if (candidatePattern.suit === leadSuit && currentPattern.suit !== leadSuit) return 1;
    if (candidatePattern.suit !== leadSuit && currentPattern.suit === leadSuit) return -1;
  }
  return candidatePattern.power - currentPattern.power;
}

// 比较牌型组件的规模。
function compareComponentSize(a, b) {
  if ((a.power ?? 0) !== (b.power ?? 0)) return (a.power ?? 0) - (b.power ?? 0);
  if ((a.count ?? 0) !== (b.count ?? 0)) return (a.count ?? 0) - (b.count ?? 0);
  const typeOrder = { single: 0, pair: 1, triple: 2, tractor: 3, train: 4, bulldozer: 5 };
  return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99);
}

// 判断手牌里是否还有更强的同类牌型。
function handHasStrongerPattern(hand, targetPattern) {
  const suited = hand.filter((card) => effectiveSuit(card) === targetPattern.suit);
  const combos = getPatternCombos(suited, targetPattern);
  return combos.some((combo) => {
    const candidate = classifyPlay(combo);
    return compareSameTypePlay(candidate, targetPattern, targetPattern.suit) > 0;
  });
}

// 获取甩牌失败情况。
function getThrowFailure(playerId, pattern) {
  if (!pattern?.ok || pattern.type !== "throw" || state.currentTrick.length !== 0) return null;
  const vulnerableComponents = pattern.components.filter((component) =>
    state.players.some((player) =>
      player.id !== playerId && handHasStrongerPattern(player.hand, component)
    )
  );
  if (vulnerableComponents.length === 0) return null;
  const forcedComponent = [...vulnerableComponents].sort(compareComponentSize)[0];
  return {
    forcedCards: forcedComponent.cards,
    failedComponent: forcedComponent,
  };
}

// 应用甩牌失败惩罚。
function applyThrowFailurePenalty(playerId) {
  const penalty = 10;
  const player = getPlayer(playerId);
  if (!player) return penalty;
  player.roundPoints -= penalty;
  if (!isFriendTeamResolved()) {
    player.capturedPoints -= penalty;
  }
  if (isFriendTeamResolved() && isDefenderTeam(playerId)) {
    state.defenderPoints -= penalty;
  } else if (isFriendTeamResolved()) {
    state.defenderPoints += penalty;
  }
  return penalty;
}

// 获取甩牌惩罚摘要。
function getThrowPenaltySummary(playerId, penalty) {
  return isDefenderTeam(playerId)
    ? TEXT.rules.throwPenaltySummaryDefender(penalty)
    : TEXT.rules.throwPenaltySummaryBanker(penalty);
}

// 校验选牌。
function validateSelection(playerId, cards) {
  const player = getPlayer(playerId);
  if (!player || cards.length === 0) {
    return { ok: false, reason: TEXT.rules.validation.selectCards };
  }
  const pattern = classifyPlay(cards);

  if (state.currentTrick.length === 0) {
    if (pattern.ok) return { ok: true };
    return { ok: false, reason: TEXT.rules.validation.leadSupported };
  }

  if (cards.length !== state.leadSpec.count) {
    return { ok: false, reason: TEXT.rules.validation.followCount(state.leadSpec.count) };
  }

  const suited = player.hand.filter((card) => effectiveSuit(card) === state.leadSpec.suit);
  if (suited.length >= state.leadSpec.count) {
    if (!cards.every((card) => effectiveSuit(card) === state.leadSpec.suit)) {
      return { ok: false, reason: TEXT.rules.validation.sameSuitFirst };
    }

    if (state.leadSpec.type === "pair") {
      if (hasForcedPair(suited) && pattern.type !== "pair") {
        return { ok: false, reason: TEXT.rules.validation.pairMustFollow };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "triple") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.tripleMustFollow };
        }
        return { ok: true };
      }

      if (hasForcedPair(suited) && getForcedPairUnits(cards) < 1) {
        return { ok: false, reason: TEXT.rules.validation.tripleFollowPair };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "tractor" || state.leadSpec.type === "train") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.trainMustFollow };
        }
        return { ok: true };
      }

      const requiredPairs = Math.min(state.leadSpec.chainLength || 0, getForcedPairUnits(suited));
      if (requiredPairs > 0 && getForcedPairUnits(cards) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.trainFollowPairs };
      }
      return { ok: true };
    }

    if (state.leadSpec.type === "bulldozer") {
      if (hasMatchingPattern(suited, state.leadSpec)) {
        if (!matchesLeadPattern(pattern, state.leadSpec)) {
          return { ok: false, reason: TEXT.rules.validation.bulldozerMustFollow };
        }
        return { ok: true };
      }

      const requiredTriples = Math.min(state.leadSpec.chainLength || 0, getTripleUnits(suited));
      if (requiredTriples > 0 && getTripleUnits(cards) < requiredTriples) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerTriples };
      }

      const requiredPairs = Math.min(2, getForcedPairUnitsWithReservedTriples(suited, requiredTriples));
      if (requiredPairs > 0 && getForcedPairUnitsWithReservedTriples(cards, requiredTriples) < requiredPairs) {
        return { ok: false, reason: TEXT.rules.validation.bulldozerPairs };
      }
      return { ok: true };
    }

    if (hasMatchingPattern(suited, state.leadSpec) && !matchesLeadPattern(pattern, state.leadSpec)) {
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

// 判断是否精确对子。
function isExactPair(cards) {
  return cards.length === 2 && cards[0].rank === cards[1].rank && cards[0].suit === cards[1].suit;
}

// 比较单张。
function compareSingle(candidate, current, leadSuit) {
  const candidateSuit = effectiveSuit(candidate);
  const currentSuit = effectiveSuit(current);
  const candidateTrump = candidateSuit === "trump";
  const currentTrump = currentSuit === "trump";
  if (candidateTrump && !currentTrump) return 1;
  if (!candidateTrump && currentTrump) return -1;
  if (!candidateTrump && !currentTrump) {
    if (candidateSuit === leadSuit && currentSuit !== leadSuit) return 1;
    if (candidateSuit !== leadSuit && currentSuit === leadSuit) return -1;
  }
  return getPatternUnitPower(candidate, candidateSuit) - getPatternUnitPower(current, currentSuit);
}

// 判断是否扣底惩罚等级牌。
function isBottomPenaltyLevelCard(card) {
  const currentLevelRank = getCurrentLevelRank();
  if (!card || !currentLevelRank || card.suit === "joker") return false;
  if (card.rank !== currentLevelRank) return false;
  return state.trumpSuit === "notrump" ? true : card.suit === state.trumpSuit;
}

// 获取扣底惩罚。
function getBottomPenalty() {
  if (!state.lastTrick || !isDefenderTeam(state.lastTrick.winnerId)) return null;

  const winningPlay = state.lastTrick.plays.find((play) => play.playerId === state.lastTrick.winnerId);
  if (!winningPlay || winningPlay.cards.length === 0) return null;
  if (!winningPlay.cards.some((card) => isBottomPenaltyLevelCard(card))) return null;

  const pattern = classifyPlay(winningPlay.cards);
  if (!pattern.ok) return null;

  const penaltyByType = {
    single: { levels: 1, label: TEXT.rules.bottomPenaltyLabels.single },
    pair: { levels: 2, label: TEXT.rules.bottomPenaltyLabels.pair },
    triple: { levels: 3, label: TEXT.rules.bottomPenaltyLabels.triple },
    tractor: { levels: 4, label: TEXT.rules.bottomPenaltyLabels.tractor },
    train: { levels: 6, label: TEXT.rules.bottomPenaltyLabels.train },
    bulldozer: { levels: 6, label: TEXT.rules.bottomPenaltyLabels.bulldozer },
  };
  const penalty = penaltyByType[pattern.type];
  if (!penalty) return null;

  return {
    levels: penalty.levels,
    label: penalty.label,
    winnerId: state.lastTrick.winnerId,
    mode: "trump",
  };
}

// 获取扣底结果摘要。
function getBottomResultSummary() {
  if (!state.lastTrick) return null;
  const bottomPlayer = getPlayer(state.lastTrick.winnerId);
  if (!bottomPlayer) return null;
  const defenderBottom = isDefenderTeam(state.lastTrick.winnerId);
  const penalty = getBottomPenalty();
  return {
    playerId: bottomPlayer.id,
    playerName: bottomPlayer.name,
    defenderBottom,
    penalty,
    nextLeadPlayerId: bottomPlayer.id,
  };
}
