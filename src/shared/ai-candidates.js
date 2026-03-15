function createCandidateEntry(cards, source, tags = []) {
  return {
    cards,
    source,
    tags: [...tags],
  };
}

function dedupeCandidateEntries(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = getComboKey(entry.cards);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function generateLeadCandidates(sourceState, playerId) {
  if (sourceState !== state) return [];
  const player = getPlayer(playerId);
  if (!player || player.hand.length === 0) return [];

  const entries = [];
  const heuristicLead = chooseAiLeadPlay(playerId);
  if (heuristicLead.length > 0) {
    entries.push(createCandidateEntry(heuristicLead, "heuristic", ["legacy", "special"]));
  }

  const structuralCandidates = getIntermediateLeadCandidates(playerId);
  for (const combo of structuralCandidates) {
    const pattern = classifyPlay(combo);
    entries.push(createCandidateEntry(combo, "structure", [pattern.type, pattern.suit || effectiveSuit(combo[0])]));
  }

  const beginnerChoice = getBeginnerLegalHintForPlayer(playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries).slice(0, 20);
}

function generateFollowCandidates(sourceState, playerId) {
  if (sourceState !== state) return [];
  const candidates = getLegalSelectionsForPlayer(playerId);
  const entries = candidates.map((combo) => {
    const pattern = classifyPlay(combo);
    const tags = [pattern.type, pattern.suit || effectiveSuit(combo[0])];
    if (doesSelectionBeatCurrent(playerId, combo)) tags.push("beats");
    if (matchesLeadPattern(pattern, state.leadSpec)) tags.push("matched");
    return createCandidateEntry(combo, "legal", tags);
  });

  const beginnerChoice = getBeginnerLegalHintForPlayer(playerId);
  if (beginnerChoice.length > 0) {
    entries.push(createCandidateEntry(beginnerChoice, "baseline", ["beginner"]));
  }

  return dedupeCandidateEntries(entries).slice(0, 24);
}

function generateCandidatePlays(sourceState, playerId, mode) {
  return mode === "follow"
    ? generateFollowCandidates(sourceState, playerId)
    : generateLeadCandidates(sourceState, playerId);
}
