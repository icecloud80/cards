function cloneCardForSimulation(card) {
  return card ? { ...card } : card;
}

function cloneCardsForSimulation(cards) {
  return Array.isArray(cards) ? cards.map(cloneCardForSimulation) : [];
}

function clonePlayerForSimulation(player) {
  if (!player) return null;
  return {
    ...player,
    hand: cloneCardsForSimulation(player.hand),
    played: cloneCardsForSimulation(player.played),
  };
}

function clonePlayForSimulation(play) {
  if (!play) return null;
  return {
    ...play,
    cards: cloneCardsForSimulation(play.cards),
  };
}

function cloneExposedSuitVoidForSimulation(exposedSuitVoid) {
  return PLAYER_ORDER.reduce((acc, playerId) => {
    acc[playerId] = {
      clubs: !!exposedSuitVoid?.[playerId]?.clubs,
      diamonds: !!exposedSuitVoid?.[playerId]?.diamonds,
      spades: !!exposedSuitVoid?.[playerId]?.spades,
      hearts: !!exposedSuitVoid?.[playerId]?.hearts,
    };
    return acc;
  }, {});
}

function cloneSimulationState(sourceState = state) {
  return {
    players: Array.isArray(sourceState.players) ? sourceState.players.map(clonePlayerForSimulation) : [],
    playerLevels: { ...(sourceState.playerLevels || {}) },
    trumpSuit: sourceState.trumpSuit,
    levelRank: sourceState.levelRank,
    bankerId: sourceState.bankerId,
    hiddenFriendId: sourceState.hiddenFriendId,
    friendTarget: sourceState.friendTarget ? { ...sourceState.friendTarget } : null,
    defenderPoints: sourceState.defenderPoints || 0,
    currentTurnId: sourceState.currentTurnId,
    leaderId: sourceState.leaderId,
    trickNumber: sourceState.trickNumber || 1,
    currentTrick: Array.isArray(sourceState.currentTrick) ? sourceState.currentTrick.map(clonePlayForSimulation) : [],
    currentTrickBeatCount: sourceState.currentTrickBeatCount || 0,
    leadSpec: sourceState.leadSpec ? { ...sourceState.leadSpec } : null,
    lastTrick: sourceState.lastTrick
      ? {
          ...sourceState.lastTrick,
          plays: Array.isArray(sourceState.lastTrick.plays)
            ? sourceState.lastTrick.plays.map(clonePlayForSimulation)
            : [],
        }
      : null,
    playHistory: cloneCardsForSimulation(sourceState.playHistory),
    bottomCards: cloneCardsForSimulation(sourceState.bottomCards),
    declaration: sourceState.declaration ? { ...sourceState.declaration } : null,
    exposedTrumpVoid: PLAYER_ORDER.reduce((acc, playerId) => {
      acc[playerId] = !!sourceState.exposedTrumpVoid?.[playerId];
      return acc;
    }, {}),
    exposedSuitVoid: cloneExposedSuitVoidForSimulation(sourceState.exposedSuitVoid),
  };
}

function getSimulationPlayer(simState, playerId) {
  return simState?.players?.find((player) => player.id === playerId) || null;
}

const SIMULATION_STATE_KEYS = [
  "players",
  "playerLevels",
  "trumpSuit",
  "levelRank",
  "bankerId",
  "hiddenFriendId",
  "friendTarget",
  "defenderPoints",
  "currentTurnId",
  "leaderId",
  "trickNumber",
  "currentTrick",
  "currentTrickBeatCount",
  "leadSpec",
  "lastTrick",
  "playHistory",
  "bottomCards",
  "selectedCardIds",
  "declaration",
  "phase",
  "gameOver",
  "logs",
  "allLogs",
  "centerAnnouncement",
  "centerAnnouncementQueue",
  "lastAiDecision",
  "aiDecisionHistory",
  "aiDecisionHistorySeq",
  "exposedTrumpVoid",
  "exposedSuitVoid",
];

const SIMULATION_STUB_FUNCTIONS = [
  "appendLog",
  "queueCenterAnnouncement",
  "render",
  "renderScorePanel",
  "renderHand",
  "renderCenterPanel",
  "updateActionHint",
  "clearTimers",
  "startTurn",
  "finishGame",
  "updateResultCountdownLabel",
];

function saveLiveStateSnapshot() {
  return SIMULATION_STATE_KEYS.reduce((snapshot, key) => {
    snapshot[key] = state[key];
    return snapshot;
  }, {});
}

function applySimulationState(simState) {
  Object.assign(state, cloneSimulationState(simState), {
    selectedCardIds: [],
    phase: simState.phase || "playing",
    gameOver: !!simState.gameOver,
    logs: [],
    allLogs: [],
    centerAnnouncement: null,
    centerAnnouncementQueue: [],
    lastAiDecision: null,
    aiDecisionHistory: [],
    aiDecisionHistorySeq: 0,
  });
}

function restoreLiveState(snapshot) {
  Object.assign(state, snapshot);
}

function saveSimulationFunctionSnapshot() {
  return SIMULATION_STUB_FUNCTIONS.reduce((snapshot, name) => {
    snapshot[name] = globalThis[name];
    return snapshot;
  }, {});
}

function installSimulationFunctionStubs() {
  for (const name of SIMULATION_STUB_FUNCTIONS) {
    globalThis[name] = function simulationNoop() {};
  }
}

function restoreSimulationFunctions(snapshot) {
  for (const name of SIMULATION_STUB_FUNCTIONS) {
    globalThis[name] = snapshot[name];
  }
}

function withSimulationState(simState, runner) {
  const stateSnapshot = saveLiveStateSnapshot();
  const functionSnapshot = saveSimulationFunctionSnapshot();
  applySimulationState(simState);
  installSimulationFunctionStubs();
  try {
    return runner();
  } finally {
    restoreSimulationFunctions(functionSnapshot);
    restoreLiveState(stateSnapshot);
  }
}

/**
 * 作用：
 * 为模拟态玩家生成一手稳定的合法提示牌。
 *
 * 为什么这样写：
 * 模拟链路需要和 sourceState 版提示 helper 共用同一套兜底口径，
 * 否则 rollout 里看到的后续行为会和真实提示链出现偏差。
 *
 * 输入：
 * @param {number} playerId - 当前需要提示出牌的模拟玩家 ID。
 *
 * 输出：
 * @returns {Array<object>} 返回该玩家在当前模拟态下的提示牌组。
 *
 * 注意：
 * - 当前函数依赖调用方已经把模拟态应用到全局 `state`。
 * - 优先级保持不变：beginner hint -> 搜索兜底 -> 强制跟牌兜底。
 */
function getSimulationHintForPlayer(playerId) {
  const hint = getBeginnerLegalHintForPlayer(playerId);
  if (hint.length > 0) return hint;
  const fallback = findLegalSelectionBySearchForState(state, playerId);
  if (fallback.length > 0) return fallback;
  return buildForcedFollowFallbackForState(state, playerId);
}

function simulatePlay(simState, playerId, cards, options = {}) {
  return withSimulationState(simState, () => {
    const chosenCards = Array.isArray(cards) ? cards : [];
    const played = playCards(playerId, chosenCards.map((card) => card.id), {
      skipStartTurn: true,
      skipResolveDelay: true,
      ...options,
    });
    return {
      ok: played,
      resultState: cloneSimulationState(state),
      phase: state.phase,
      trickNumber: state.trickNumber,
      currentTurnId: state.currentTurnId,
      lastTrick: state.lastTrick ? { ...state.lastTrick } : null,
    };
  });
}

function simulateTrickToEnd(simState, chooser = getSimulationHintForPlayer) {
  return withSimulationState(simState, () => {
    const startingTrickNumber = state.trickNumber;
    const trace = [];

    while (!state.gameOver && state.trickNumber === startingTrickNumber) {
      const playerId = state.currentTurnId;
      if (!PLAYER_ORDER.includes(playerId)) break;
      let cards = chooser(playerId, cloneSimulationState(state), trace);
      if (!Array.isArray(cards) || cards.length === 0 || cards.some((card) => !card || !card.id)) {
        cards = getSimulationHintForPlayer(playerId);
      }
      if (!Array.isArray(cards) || cards.length === 0 || cards.some((card) => !card || !card.id)) {
        break;
      }
      const ok = playCards(playerId, cards.map((card) => card.id), {
        skipStartTurn: true,
        skipResolveDelay: true,
      });
      if (!ok) {
        break;
      }
      trace.push({
        playerId,
        cards: cloneCardsForSimulation(cards),
      });
    }

    return {
      completed: state.trickNumber !== startingTrickNumber || state.phase === "ending",
      resultState: cloneSimulationState(state),
      trace,
      winnerId: state.lastTrick?.winnerId || null,
      points: state.lastTrick?.points || 0,
      trickNumber: startingTrickNumber,
    };
  });
}

function simulateCandidateToEndOfCurrentTrick(simState, playerId, cards, chooser = getSimulationHintForPlayer) {
  const afterPlay = simulatePlay(simState, playerId, cards);
  if (!afterPlay.ok) {
    return {
      completed: false,
      resultState: cloneSimulationState(simState),
      trace: [],
      winnerId: null,
      points: 0,
      trickNumber: simState.trickNumber,
    };
  }
  if (afterPlay.trickNumber !== simState.trickNumber || afterPlay.phase === "ending") {
    return {
      completed: true,
      resultState: afterPlay.resultState,
      trace: [{
        playerId,
        cards: cloneCardsForSimulation(cards),
      }],
      winnerId: afterPlay.lastTrick?.winnerId || null,
      points: afterPlay.lastTrick?.points || 0,
      trickNumber: simState.trickNumber,
    };
  }

  const rollout = simulateTrickToEnd(afterPlay.resultState, chooser);
  rollout.trace.unshift({
    playerId,
    cards: cloneCardsForSimulation(cards),
  });
  return rollout;
}

function simulateUntilNextOwnTurn(simState, playerId, chooser = getSimulationHintForPlayer, options = {}) {
  return withSimulationState(simState, () => {
    const trace = [];
    const maxSteps = Math.max(1, options.maxSteps || PLAYER_ORDER.length);
    let steps = 0;

    while (!state.gameOver && state.phase === "playing" && steps < maxSteps) {
      if (state.currentTurnId === playerId) {
        return {
          reachedOwnTurn: true,
          resultState: cloneSimulationState(state),
          trace,
          steps,
          nextTurnId: state.currentTurnId,
          trickNumber: state.trickNumber,
        };
      }

      const currentActorId = state.currentTurnId;
      if (!PLAYER_ORDER.includes(currentActorId)) break;

      let cards = chooser(currentActorId, cloneSimulationState(state), trace);
      if (!Array.isArray(cards) || cards.length === 0 || cards.some((card) => !card || !card.id)) {
        cards = getSimulationHintForPlayer(currentActorId);
      }
      if (!Array.isArray(cards) || cards.length === 0 || cards.some((card) => !card || !card.id)) break;

      const ok = playCards(currentActorId, cards.map((card) => card.id), {
        skipStartTurn: true,
        skipResolveDelay: true,
      });
      if (!ok) break;

      trace.push({
        playerId: currentActorId,
        cards: cloneCardsForSimulation(cards),
      });
      steps += 1;
    }

    return {
      reachedOwnTurn: state.phase === "playing" && state.currentTurnId === playerId,
      resultState: cloneSimulationState(state),
      trace,
      steps,
      nextTurnId: state.currentTurnId,
      trickNumber: state.trickNumber,
    };
  });
}
