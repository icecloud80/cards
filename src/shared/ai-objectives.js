function isSimulationFriendTeamResolved(simState) {
  return !!simState?.friendTarget && (simState.friendTarget.revealed || simState.friendTarget.failed);
}

function isSimulationDefenderTeam(simState, playerId) {
  if (playerId === simState?.bankerId) return false;
  if (simState?.friendTarget?.failed) return true;
  if (!simState?.friendTarget?.revealed) return false;
  return playerId !== simState.hiddenFriendId;
}

function isSimulationSameSide(simState, playerA, playerB) {
  if (playerA === playerB) return true;
  if (!isSimulationFriendTeamResolved(simState)) {
    return playerA === simState?.bankerId && playerB === simState?.bankerId;
  }
  return isSimulationDefenderTeam(simState, playerA) === isSimulationDefenderTeam(simState, playerB);
}

function buildIntermediateObjectiveWeights(baseWeights, primary, secondary) {
  const weights = { ...baseWeights };
  if (primary && weights[primary] != null) weights[primary] += 0.6;
  if (secondary && weights[secondary] != null) weights[secondary] += 0.25;
  return weights;
}

/**
 * 作用：
 * 为中级 AI 生成当前局面的主/副目标与对应评分权重。
 *
 * 为什么这样写：
 * 当前中级已经不再只靠首发 heuristic 直接 return，而是需要把
 * `find_friend / keep_control / clear_trump / protect_bottom / grade_bottom`
 * 这些局内目标统一折算成评估器权重。
 * 这轮又额外补了“朋友已站队后的控牌降温”，因此要在目标层直接把
 * `controlExit` 纳入 resolved-friend 阶段的默认关注项，避免 `clear_trump`
 * 一路把高张硬控推到过热。
 * 同时，“保扣底时王张 / 高主释放”也要进正式评分，因此 `protect_bottom / grade_bottom`
 * 现在会额外抬高 `bottomRelease`，让评估器看懂“我是不是已经把该让给同侧的资源让出来了”。
 * 同时，未站队阶段也要把“高张试探预算”沉到统一权重里，
 * 避免 `find_friend` 继续把高张试探误当成廉价收益。
 *
 * 输入：
 * @param {number} playerId - 当前准备决策的玩家 ID。
 * @param {string} [mode="lead"] - 当前决策模式，支持 `lead / follow`。
 * @param {object} [simState=state] - 当前模拟或真实牌局状态。
 *
 * 输出：
 * @returns {{primary: string, secondary: string, weights: object}} 返回主目标、副目标和评分权重。
 *
 * 注意：
 * - 这里返回的是“倾向配置”，不直接决定最终出牌。
 * - `controlExit` 只在朋友已站队后真正放大，避免未站队阶段过早干扰找朋友路线。
 */
function getIntermediateObjective(playerId, mode = "lead", simState = state) {
  const unresolvedFriend = !!simState.friendTarget && !isSimulationFriendTeamResolved(simState);
  const resolvedFriend = !!simState.friendTarget && isSimulationFriendTeamResolved(simState);
  const defenderSide = isSimulationDefenderTeam(simState, playerId);
  const cardsLeft = simState.players.reduce((sum, player) => sum + (player.hand?.length || 0), 0);
  const lateRound = cardsLeft <= 20;
  const unresolvedFriendBeliefLean = unresolvedFriend && playerId !== simState.bankerId && typeof getSimulationFriendBeliefLean === "function"
    ? getSimulationFriendBeliefLean(simState, playerId)
    : 0;
  const gradeBottomProfile = typeof getSimulationGradeBottomProfile === "function"
    ? getSimulationGradeBottomProfile(simState, playerId)
    : { active: false, specialPriority: false };
  const shouldForceGradeBottom = gradeBottomProfile.active
    && (gradeBottomProfile.specialPriority || lateRound || unresolvedFriendBeliefLean <= -12);

  let primary = "keep_control";
  let secondary = defenderSide ? "pressure_void" : "run_points";

  if (shouldForceGradeBottom) {
    primary = "grade_bottom";
    secondary = mode === "lead" ? "pressure_void" : "keep_control";
  } else if (unresolvedFriend) {
    if (unresolvedFriendBeliefLean <= -16) {
      primary = mode === "follow" ? "keep_control" : "pressure_void";
      secondary = mode === "follow" ? "pressure_void" : "keep_control";
    } else {
      primary = "find_friend";
      secondary = mode === "follow" || unresolvedFriendBeliefLean >= 16 ? "keep_control" : "run_points";
    }
  } else if (lateRound && defenderSide) {
    primary = "protect_bottom";
    secondary = "keep_control";
  } else if (resolvedFriend && !defenderSide && mode === "lead") {
    primary = "clear_trump";
    secondary = "keep_control";
  } else if (resolvedFriend && !defenderSide) {
    primary = "keep_control";
    secondary = "run_points";
  } else if (resolvedFriend && defenderSide) {
    primary = "keep_control";
    secondary = "pressure_void";
  } else if (!defenderSide && mode === "lead") {
    primary = "run_points";
    secondary = "keep_control";
  } else if (defenderSide && mode === "lead") {
    primary = "pressure_void";
    secondary = "keep_control";
  }

  if (gradeBottomProfile.active && primary !== "grade_bottom") {
    secondary = secondary === "run_points" || secondary === "find_friend" ? "grade_bottom" : secondary;
  }

  const weights = buildIntermediateObjectiveWeights({
    structure: 1.15,
    control: 1.0,
    points: defenderSide ? 0.8 : 1.0,
    friend: unresolvedFriend ? 1.15 : resolvedFriend ? 0.1 : 0.45,
    friendBelief: unresolvedFriend ? 0.75 : 0.05,
    probeRisk: unresolvedFriend ? 0.95 : 0.05,
    allySupport: resolvedFriend ? 0.95 : 0.05,
    bottom: lateRound ? 1.0 : 0.3,
    gradeBottom: gradeBottomProfile.active ? (gradeBottomProfile.specialPriority ? 1.25 : 0.95) : 0.15,
    bottomRelease: lateRound ? 0.25 : 0.05,
    voidPressure: defenderSide ? 0.95 : 0.45,
    tempo: 0.85,
    turnAccess: 0.95,
    controlExit: resolvedFriend ? 0.75 : 0.1,
    controlRisk: lateRound ? 1.05 : 0.75,
    pointRunRisk: lateRound ? 1.0 : 0.65,
    safeLead: lateRound ? 0.8 : 0.2,
    friendRisk: unresolvedFriend ? 0.75 : resolvedFriend ? 0.05 : 0.2,
    bottomRisk: lateRound ? 0.85 : 0.2,
  }, {
    find_friend: "friend",
    run_points: "points",
    protect_bottom: "bottom",
    grade_bottom: "gradeBottom",
    clear_trump: "control",
    keep_control: "control",
    pressure_void: "voidPressure",
  }[primary], {
    find_friend: "friend",
    run_points: "points",
    protect_bottom: "bottom",
    grade_bottom: "gradeBottom",
    clear_trump: "control",
    keep_control: "control",
    pressure_void: "voidPressure",
  }[secondary]);

  if (primary === "find_friend") weights.friendRisk += 0.35;
  if (secondary === "find_friend") weights.friendRisk += 0.15;
  if (unresolvedFriend) weights.friendBelief += 0.2;
  if (primary === "find_friend") weights.probeRisk += 0.45;
  if (secondary === "find_friend") weights.probeRisk += 0.2;
  if (unresolvedFriend) weights.turnAccess += 0.1;
  if (primary === "keep_control" || primary === "clear_trump") weights.tempo += 0.35;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.tempo += 0.15;
  if (primary === "keep_control" || primary === "clear_trump") weights.turnAccess += 0.45;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.turnAccess += 0.2;
  if (primary === "keep_control" || primary === "clear_trump") weights.controlExit += 0.45;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.controlExit += 0.2;
  if (primary === "keep_control" || primary === "clear_trump") weights.controlRisk += 0.35;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.controlRisk += 0.15;
  if (primary === "keep_control" || primary === "clear_trump") weights.pointRunRisk += 0.3;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.pointRunRisk += 0.15;
  if (resolvedFriend) weights.allySupport += 0.25;
  if (resolvedFriend && (primary === "keep_control" || primary === "clear_trump")) weights.allySupport += 0.35;
  if (resolvedFriend && (secondary === "keep_control" || secondary === "clear_trump")) weights.allySupport += 0.15;
  if (primary === "protect_bottom") weights.bottomRisk += 0.35;
  if (secondary === "protect_bottom") weights.bottomRisk += 0.15;
  if (primary === "protect_bottom") weights.bottomRelease += 0.45;
  if (secondary === "protect_bottom") weights.bottomRelease += 0.2;
  if (primary === "protect_bottom") weights.safeLead += 0.35;
  if (secondary === "protect_bottom") weights.safeLead += 0.15;
  if (primary === "protect_bottom") weights.turnAccess += 0.2;
  if (secondary === "protect_bottom") weights.turnAccess += 0.1;
  if (primary === "protect_bottom") weights.pointRunRisk += 0.25;
  if (secondary === "protect_bottom") weights.pointRunRisk += 0.1;
  if (primary === "grade_bottom") weights.turnAccess += 0.45;
  if (secondary === "grade_bottom") weights.turnAccess += 0.2;
  if (primary === "grade_bottom") weights.controlRisk += 0.35;
  if (secondary === "grade_bottom") weights.controlRisk += 0.15;
  if (primary === "grade_bottom") weights.pointRunRisk += 0.3;
  if (secondary === "grade_bottom") weights.pointRunRisk += 0.15;
  if (primary === "grade_bottom") weights.bottomRelease += 0.3;
  if (secondary === "grade_bottom") weights.bottomRelease += 0.15;
  if (primary === "grade_bottom") weights.bottomRisk += 0.35;
  if (secondary === "grade_bottom") weights.bottomRisk += 0.15;
  if (primary === "grade_bottom") weights.safeLead += 0.25;
  if (secondary === "grade_bottom") weights.safeLead += 0.1;
  if (primary === "grade_bottom") weights.voidPressure += 0.2;
  if (secondary === "grade_bottom") weights.voidPressure += 0.1;
  if (unresolvedFriendBeliefLean >= 16) {
    weights.friend += 0.2;
    weights.turnAccess += 0.1;
    weights.probeRisk = Math.max(0.45, weights.probeRisk - 0.2);
  }
  if (unresolvedFriendBeliefLean <= -16) {
    weights.voidPressure += 0.2;
    weights.controlRisk += 0.1;
    weights.probeRisk += 0.15;
  }
  if (gradeBottomProfile.active) {
    weights.bottom += 0.15;
  }
  if (gradeBottomProfile.specialPriority) {
    weights.gradeBottom += 0.35;
    weights.turnAccess += 0.15;
    weights.controlRisk += 0.1;
  }
  if (resolvedFriend && !defenderSide) {
    weights.control = Math.max(0.7, weights.control - 0.12);
    weights.tempo = Math.max(0.65, weights.tempo - 0.08);
    weights.controlExit += 0.25;
    weights.safeLead += 0.15;
  }

  return {
    primary,
    secondary,
    weights,
  };
}
