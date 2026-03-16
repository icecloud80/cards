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

function getIntermediateObjective(playerId, mode = "lead", simState = state) {
  const unresolvedFriend = !!simState.friendTarget && !isSimulationFriendTeamResolved(simState);
  const resolvedFriend = !!simState.friendTarget && isSimulationFriendTeamResolved(simState);
  const defenderSide = isSimulationDefenderTeam(simState, playerId);
  const cardsLeft = simState.players.reduce((sum, player) => sum + (player.hand?.length || 0), 0);
  const lateRound = cardsLeft <= 20;
  const unresolvedFriendBeliefLean = unresolvedFriend && playerId !== simState.bankerId && typeof getSimulationFriendBeliefLean === "function"
    ? getSimulationFriendBeliefLean(simState, playerId)
    : 0;

  let primary = "keep_control";
  let secondary = defenderSide ? "pressure_void" : "run_points";

  if (unresolvedFriend) {
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

  const weights = buildIntermediateObjectiveWeights({
    structure: 1.15,
    control: 1.0,
    points: defenderSide ? 0.8 : 1.0,
    friend: unresolvedFriend ? 1.15 : resolvedFriend ? 0.1 : 0.45,
    friendBelief: unresolvedFriend ? 0.75 : 0.05,
    allySupport: resolvedFriend ? 0.95 : 0.05,
    bottom: lateRound ? 1.0 : 0.3,
    voidPressure: defenderSide ? 0.95 : 0.45,
    tempo: 0.85,
    turnAccess: 0.95,
    controlRisk: lateRound ? 1.05 : 0.75,
    pointRunRisk: lateRound ? 1.0 : 0.65,
    safeLead: lateRound ? 0.8 : 0.2,
    friendRisk: unresolvedFriend ? 0.75 : resolvedFriend ? 0.05 : 0.2,
    bottomRisk: lateRound ? 0.85 : 0.2,
  }, {
    find_friend: "friend",
    run_points: "points",
    protect_bottom: "bottom",
    clear_trump: "control",
    keep_control: "control",
    pressure_void: "voidPressure",
  }[primary], {
    find_friend: "friend",
    run_points: "points",
    protect_bottom: "bottom",
    clear_trump: "control",
    keep_control: "control",
    pressure_void: "voidPressure",
  }[secondary]);

  if (primary === "find_friend") weights.friendRisk += 0.35;
  if (secondary === "find_friend") weights.friendRisk += 0.15;
  if (unresolvedFriend) weights.friendBelief += 0.2;
  if (primary === "keep_control" || primary === "clear_trump") weights.tempo += 0.35;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.tempo += 0.15;
  if (primary === "keep_control" || primary === "clear_trump") weights.turnAccess += 0.45;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.turnAccess += 0.2;
  if (primary === "keep_control" || primary === "clear_trump") weights.controlRisk += 0.35;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.controlRisk += 0.15;
  if (primary === "keep_control" || primary === "clear_trump") weights.pointRunRisk += 0.3;
  if (secondary === "keep_control" || secondary === "clear_trump") weights.pointRunRisk += 0.15;
  if (resolvedFriend) weights.allySupport += 0.25;
  if (resolvedFriend && (primary === "keep_control" || primary === "clear_trump")) weights.allySupport += 0.35;
  if (resolvedFriend && (secondary === "keep_control" || secondary === "clear_trump")) weights.allySupport += 0.15;
  if (primary === "protect_bottom") weights.bottomRisk += 0.35;
  if (secondary === "protect_bottom") weights.bottomRisk += 0.15;
  if (primary === "protect_bottom") weights.safeLead += 0.35;
  if (secondary === "protect_bottom") weights.safeLead += 0.15;
  if (primary === "protect_bottom") weights.turnAccess += 0.2;
  if (secondary === "protect_bottom") weights.turnAccess += 0.1;
  if (primary === "protect_bottom") weights.pointRunRisk += 0.25;
  if (secondary === "protect_bottom") weights.pointRunRisk += 0.1;
  if (unresolvedFriendBeliefLean >= 16) {
    weights.friend += 0.2;
    weights.turnAccess += 0.1;
  }
  if (unresolvedFriendBeliefLean <= -16) {
    weights.voidPressure += 0.2;
    weights.controlRisk += 0.1;
  }

  return {
    primary,
    secondary,
    weights,
  };
}
