import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeVotingStage,
  buildRevoteStage,
  formatVoterSequence,
  groupVotingStages,
  ineligibleVotersForStage,
  isThreeWayTieAmongNine,
  normalizeVotingStages,
  parseVoterSequence,
  removeVoterChoices,
  roundOutcomeSummary,
  requiresTieBreak,
  setNominationVoters,
  setVoterChoice,
  stageHasFollowingRevote,
  VotingController,
} from "../js/voting.js";

test("legacy voting rounds are restored as regular stages", () => {
  const stages = normalizeVotingStages([[2, 5, 2], [10]]);
  assert.deepEqual(stages.map((stage) => ({
    kind: stage.kind,
    roundNumber: stage.roundNumber,
    nominees: stage.nominations.map(({ playerNumber }) => playerNumber),
  })), [
    { kind: "round", roundNumber: 0, nominees: [2, 5] },
    { kind: "round", roundNumber: 1, nominees: [10] },
  ]);
});

test("a voter can belong to only one candidate in a voting stage", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [
      { playerNumber: 2, voters: [1, 3] },
      { playerNumber: 5, voters: [4] },
    ],
  }]);
  const moved = setVoterChoice(stage, 5, 1);
  assert.deepEqual(moved.nominations.map(({ voters }) => voters), [[3], [4, 1]]);

  const removed = setVoterChoice(moved, 5, 1);
  assert.deepEqual(removed.nominations.map(({ voters }) => voters), [[3], [4]]);
});

test("joined keyboard input parses player ten and removes duplicates", () => {
  assert.deepEqual(parseVoterSequence("1230"), [1, 2, 3, 10]);
  assert.deepEqual(parseVoterSequence("12310"), [1, 2, 3, 10]);
  assert.deepEqual(parseVoterSequence("0"), [10]);
  assert.deepEqual(parseVoterSequence("10"), [1, 10]);
  assert.deepEqual(parseVoterSequence("110"), [1, 10]);
  assert.deepEqual(parseVoterSequence("10-2-2"), [1, 10, 2]);
  assert.equal(formatVoterSequence([1, 10]), "10");
  assert.equal(formatVoterSequence([10]), "0");
});

test("joined keyboard input moves voters from other candidates", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [
      { playerNumber: 2, voters: [1, 3, 10] },
      { playerNumber: 5, voters: [2, 4] },
    ],
  }]);
  const updated = setNominationVoters(stage, 5, parseVoterSequence("12310"));

  assert.deepEqual(updated.nominations, [
    { playerNumber: 2, voters: [] },
    { playerNumber: 5, voters: [1, 2, 3, 10] },
  ]);
});

test("joined keyboard input triggers the same automatic revote flow", () => {
  const controller = automaticController([{
    nominations: [2, 5],
  }]);
  let changes = 0;
  let focusMoves = 0;
  controller.roundsElement = { scrollTop: 0, scrollHeight: 100 };
  controller.renderStage = () => {};
  controller.renderAll = () => {};
  controller.updateNextButton = () => {};
  controller.focusVoterSequence = () => { focusMoves += 1; };
  controller.onChange = () => { changes += 1; };

  controller.recordVoterSequence(0, 2, "12345");
  controller.recordVoterSequence(0, 5, "67890");

  assert.equal(changes, 2);
  assert.equal(focusMoves, 1);
  assert.equal(controller.currentRoundIndex, 1);
  assert.deepEqual(controller.rounds[0].revoteCandidates, [2, 5]);
  assert.deepEqual(controller.rounds[1].nominations, [
    { playerNumber: 2, voters: [] },
    { playerNumber: 5, voters: [] },
  ]);
});

test("restored duplicate votes keep the first candidate only", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [
      { playerNumber: 2, voters: [1, 3] },
      { playerNumber: 5, voters: [1, 4] },
    ],
  }]);
  assert.deepEqual(stage.nominations.map(({ voters }) => voters), [[1, 3], [4]]);
});

test("voting outcome keeps only nominated players", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [2, 5],
    eliminatedPlayers: [5, 9],
  }]);
  assert.deepEqual(stage.eliminatedPlayers, [5]);
});

test("nobody-left outcome overrides stored eliminated players", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [2, 5],
    eliminatedPlayers: [5],
    noElimination: true,
  }]);
  assert.equal(stage.noElimination, true);
  assert.deepEqual(stage.eliminatedPlayers, []);
});

test("revote contains only selected nominees and starts with empty votes", () => {
  const [stage] = normalizeVotingStages([{
    kind: "round",
    roundNumber: 2,
    nominations: [
      { playerNumber: 2, voters: [1, 3] },
      { playerNumber: 5, voters: [4] },
      { playerNumber: 8, voters: [6] },
    ],
    revoteCandidates: [2, 8],
  }]);
  const revote = buildRevoteStage(stage);
  assert.equal(revote.kind, "revote");
  assert.equal(revote.roundNumber, 2);
  assert.deepEqual(revote.nominations, [
    { playerNumber: 2, voters: [] },
    { playerNumber: 8, voters: [] },
  ]);
});

test("an outcome belongs only to the final stage of a revote chain", () => {
  const stages = normalizeVotingStages([
    {
      kind: "round",
      roundNumber: 2,
      nominations: [2, 8],
      eliminatedPlayers: [2],
    },
    {
      kind: "revote",
      roundNumber: 2,
      revoteNumber: 1,
      nominations: [2, 8],
      eliminatedPlayers: [8],
    },
  ]);
  assert.equal(stageHasFollowingRevote(stages, 0), true);
  assert.deepEqual(stages[0].eliminatedPlayers, []);
  assert.equal(stageHasFollowingRevote(stages, 1), false);
  assert.deepEqual(stages[1].eliminatedPlayers, [8]);
});

test("voting stages are grouped with their revotes and summarize the final stage", () => {
  const stages = normalizeVotingStages([
    { kind: "round", roundNumber: 0, nominations: [2, 5] },
    { kind: "revote", roundNumber: 0, revoteNumber: 1, nominations: [2, 5] },
    { kind: "revote", roundNumber: 0, revoteNumber: 2, nominations: [2, 5], eliminatedPlayers: [5] },
    { kind: "round", roundNumber: 1, nominations: [], noElimination: true },
  ]);
  const groups = groupVotingStages(stages);

  assert.deepEqual(groups, [
    { roundNumber: 0, stageIndexes: [0, 1, 2] },
    { roundNumber: 1, stageIndexes: [3] },
  ]);
  assert.equal(roundOutcomeSummary(stages, groups[0].stageIndexes), "Покинул игру: 5");
  assert.equal(roundOutcomeSummary(stages, groups[1].stageIndexes), "Никто не покинул");
  assert.equal(roundOutcomeSummary(stages, [0, 1]), "Никто не покинул");
});

test("a voting round header toggles its collapsed state and accessibility state", () => {
  const controller = Object.create(VotingController.prototype);
  const classes = new Set();
  const attributes = new Map();
  controller.collapsedRounds = new Set();
  controller.roundElements = new Map([[0, {
    round: {
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
    },
    header: {
      setAttribute(name, value) {
        attributes.set(name, value);
      },
    },
  }]]);

  controller.toggleRound(0);
  assert.equal(controller.collapsedRounds.has(0), true);
  assert.equal(classes.has("is-collapsed"), true);
  assert.equal(attributes.get("aria-expanded"), "false");

  controller.toggleRound(0);
  assert.equal(controller.collapsedRounds.has(0), false);
  assert.equal(classes.has("is-collapsed"), false);
  assert.equal(attributes.get("aria-expanded"), "true");
});

test("automatic voting waits until every eligible player has voted", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
      { playerNumber: 5, voters: [6, 7, 8, 9] },
    ],
  }]);

  assert.deepEqual(analyzeVotingStage(stage), {
    status: "incomplete",
    assignedCount: 9,
    eligibleCount: 10,
    leaders: [],
  });
  assert.deepEqual(analyzeVotingStage(stage, new Set([10])), {
    status: "winner",
    assignedCount: 9,
    eligibleCount: 9,
    leaders: [2],
  });
});

test("automatic voting uses the unique top result despite a lower tie", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4] },
      { playerNumber: 5, voters: [5, 6, 7] },
      { playerNumber: 8, voters: [8, 9, 10] },
    ],
  }]);

  assert.deepEqual(analyzeVotingStage(stage), {
    status: "winner",
    assignedCount: 10,
    eligibleCount: 10,
    leaders: [2],
  });
});

test("automatic voting sends only tied leaders to a revote", () => {
  const [stage] = normalizeVotingStages([{
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4] },
      { playerNumber: 5, voters: [5, 6, 7, 8] },
      { playerNumber: 8, voters: [9, 10] },
    ],
  }]);

  assert.deepEqual(analyzeVotingStage(stage), {
    status: "tie",
    assignedCount: 10,
    eligibleCount: 10,
    leaders: [2, 5],
  });
});

function automaticController(rounds) {
  const controller = Object.create(VotingController.prototype);
  controller.rounds = normalizeVotingStages(rounds);
  controller.currentRoundIndex = controller.rounds.length - 1;
  controller.killedFromRound = new Map();
  controller.hasAppliedNightKills = false;
  return controller;
}

test("controller stores a unique automatic winner", () => {
  const controller = automaticController([{
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4, 5, 6] },
      { playerNumber: 5, voters: [7, 8, 9, 10] },
    ],
  }]);

  assert.equal(controller.synchronizeResolution(0), false);
  assert.deepEqual(controller.rounds[0].eliminatedPlayers, [2]);
  assert.equal(controller.rounds.length, 1);
});

test("a repeated tie in the first revote waits for the host's tie-break choice", () => {
  const controller = automaticController([{
    kind: "round",
    roundNumber: 3,
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
      { playerNumber: 5, voters: [6, 7, 8, 9, 10] },
    ],
  }]);

  assert.equal(controller.synchronizeResolution(0), true);
  assert.equal(controller.rounds[1].kind, "revote");
  assert.equal(controller.rounds[1].roundNumber, 3);
  assert.equal(controller.rounds[1].revoteNumber, 1);

  controller.rounds[1].nominations[0].voters = [1, 2, 3, 4, 5];
  controller.rounds[1].nominations[1].voters = [6, 7, 8, 9, 10];
  assert.equal(controller.synchronizeResolution(1), false);
  assert.equal(controller.rounds.length, 2);
  const analysis = analyzeVotingStage(controller.rounds[1]);
  assert.equal(requiresTieBreak(controller.rounds, 1, analysis), true);
  assert.deepEqual(groupVotingStages(controller.rounds), [
    { roundNumber: 3, stageIndexes: [0, 1] },
  ]);

  controller.renderStage = () => {};
  controller.updateNextButton = () => {};
  controller.onChange = () => {};
  controller.resolveTieBreak(1, "lift");
  assert.deepEqual(controller.rounds[1].eliminatedPlayers, [2, 5]);
  assert.equal(controller.rounds[1].tieBreakChoice, "lift");
  assert.equal(roundOutcomeSummary(controller.rounds, [0, 1]), "Покинули игру: 2, 5");
});

test("the host can keep everyone after a repeated tie in the first revote", () => {
  const controller = automaticController([
    {
      kind: "round",
      roundNumber: 3,
      nominations: [
        { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
        { playerNumber: 5, voters: [6, 7, 8, 9, 10] },
      ],
      revoteCandidates: [2, 5],
    },
    {
      kind: "revote",
      roundNumber: 3,
      revoteNumber: 1,
      nominations: [
        { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
        { playerNumber: 5, voters: [6, 7, 8, 9, 10] },
      ],
    },
  ]);
  controller.renderStage = () => {};
  controller.updateNextButton = () => {};
  controller.onChange = () => {};

  controller.resolveTieBreak(1, "nobody");

  assert.deepEqual(controller.rounds[1].eliminatedPlayers, []);
  assert.equal(controller.rounds[1].noElimination, true);
  assert.equal(controller.rounds[1].tieBreakChoice, "nobody");
  assert.equal(roundOutcomeSummary(controller.rounds, [0, 1]), "Никто не покинул");

  controller.resolveTieBreak(1, "lift");
  assert.deepEqual(controller.rounds[1].eliminatedPlayers, [2, 5]);
  assert.equal(controller.rounds[1].noElimination, false);
  assert.equal(controller.rounds[1].tieBreakChoice, "lift");
});

test("a repeated three-way tie among nine voters ends without a lift choice", () => {
  const controller = automaticController([{
    kind: "round",
    roundNumber: 3,
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3] },
      { playerNumber: 5, voters: [4, 5, 6] },
      { playerNumber: 8, voters: [7, 8, 9] },
    ],
  }]);
  controller.killedFromRound = new Map([[10, 1]]);

  assert.equal(controller.synchronizeResolution(0), true);
  controller.rounds[1].nominations[0].voters = [1, 2, 3];
  controller.rounds[1].nominations[1].voters = [4, 5, 6];
  controller.rounds[1].nominations[2].voters = [7, 8, 9];

  const analysis = analyzeVotingStage(controller.rounds[1], controller.getIneligibleVoters(1));
  assert.equal(requiresTieBreak(controller.rounds, 1, analysis), true);
  assert.equal(isThreeWayTieAmongNine(analysis), true);
  assert.equal(controller.synchronizeResolution(1), false);
  assert.equal(controller.rounds.length, 2);
  assert.equal(controller.rounds[1].noElimination, true);
  assert.equal(controller.rounds[1].tieBreakChoice, null);
});

test("removing the last vote clears an automatic outcome", () => {
  const controller = automaticController([{
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4, 5, 6] },
      { playerNumber: 5, voters: [7, 8, 9, 10] },
    ],
  }]);
  controller.synchronizeResolution(0);
  controller.rounds[0].nominations[0].voters.pop();

  assert.equal(controller.synchronizeResolution(0), false);
  assert.deepEqual(controller.rounds[0].eliminatedPlayers, []);
  assert.equal(analyzeVotingStage(controller.rounds[0]).status, "incomplete");
});

test("editing an earlier tie preserves or rebuilds its dependent revote", () => {
  const controller = automaticController([
    {
      kind: "round",
      roundNumber: 0,
      nominations: [
        { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
        { playerNumber: 5, voters: [6, 7, 8, 9, 10] },
      ],
      revoteCandidates: [2, 5],
    },
    {
      kind: "revote",
      roundNumber: 0,
      revoteNumber: 1,
      nominations: [
        { playerNumber: 2, voters: [1, 2] },
        { playerNumber: 5, voters: [3] },
      ],
    },
  ]);

  assert.equal(controller.synchronizeResolution(0), false);
  assert.deepEqual(controller.rounds[1].nominations[0].voters, [1, 2]);

  controller.rounds[0].nominations[0].voters.push(6);
  controller.rounds[0].nominations[1].voters = [7, 8, 9, 10];
  assert.equal(controller.synchronizeResolution(0), true);
  assert.equal(controller.rounds.length, 1);
  assert.deepEqual(controller.rounds[0].eliminatedPlayers, [2]);
});

test("the initial night restore preserves a legacy manual outcome", () => {
  const controller = automaticController([{
    roundNumber: 1,
    nominations: [
      { playerNumber: 2, voters: [1] },
      { playerNumber: 5, voters: [2] },
    ],
    eliminatedPlayers: [2],
  }]);
  controller.renderAll = () => {};

  controller.setNightKills([]);

  assert.deepEqual(controller.rounds[0].eliminatedPlayers, [2]);
  assert.equal(controller.hasAppliedNightKills, true);
});

test("the initial night restore completes a fully voted stage without an outcome", () => {
  const controller = automaticController([{
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
      { playerNumber: 5, voters: [6, 7, 8, 9, 10] },
    ],
  }]);
  controller.renderAll = () => {};

  controller.setNightKills([]);

  assert.equal(controller.rounds.length, 2);
  assert.equal(controller.rounds[1].kind, "revote");
  assert.deepEqual(controller.rounds[0].revoteCandidates, [2, 5]);
});

test("the initial restore completes earlier voted rounds before cleaning later votes", () => {
  const controller = automaticController([
    {
      kind: "round",
      roundNumber: 0,
      nominations: [
        { playerNumber: 2, voters: [1, 2, 3, 4, 5, 6] },
        { playerNumber: 5, voters: [7, 8, 9, 10] },
      ],
    },
    {
      kind: "round",
      roundNumber: 1,
      nominations: [{ playerNumber: 3, voters: [2, 3] }],
    },
  ]);
  controller.renderAll = () => {};

  controller.setNightKills([]);

  assert.deepEqual(controller.rounds[0].eliminatedPlayers, [2]);
  assert.deepEqual(controller.rounds[1].nominations[0].voters, [3]);
});

test("keyboard sequence focus moves to the requested replacement input", () => {
  const controller = Object.create(VotingController.prototype);
  const focused = [];
  const inputs = [2, 5, 8].map((nomineeNumber) => ({
    dataset: { nominee: String(nomineeNumber) },
    focus: () => focused.push(nomineeNumber),
  }));
  controller.stageElements = [{
    nominees: { querySelectorAll: () => inputs },
  }];

  controller.focusVoterSequence(0, { afterNomineeNumber: 2 });
  controller.focusVoterSequence(0, { nomineeNumber: 8 });

  assert.deepEqual(focused, [5, 8]);
});

test("a later night change recalculates the affected automatic result", () => {
  const controller = automaticController([{
    roundNumber: 1,
    nominations: [
      { playerNumber: 2, voters: [1, 2, 3, 4, 5] },
      { playerNumber: 5, voters: [6, 7, 8, 9] },
      { playerNumber: 8, voters: [10] },
    ],
    eliminatedPlayers: [2],
  }]);
  controller.hasAppliedNightKills = true;
  controller.renderAll = () => {};

  controller.setNightKills([{ playerNumber: 1, fromRoundNumber: 1 }]);

  assert.equal(controller.rounds.length, 2);
  assert.deepEqual(controller.rounds[0].eliminatedPlayers, []);
  assert.deepEqual(controller.rounds[0].revoteCandidates, [2, 5]);
  assert.deepEqual(controller.rounds[1].nominations, [
    { playerNumber: 2, voters: [] },
    { playerNumber: 5, voters: [] },
  ]);
});

test("only stages in the active numbered round remain editable", () => {
  const controller = automaticController([
    { kind: "round", roundNumber: 0, nominations: [2] },
    { kind: "round", roundNumber: 1, nominations: [3, 5] },
    { kind: "revote", roundNumber: 1, revoteNumber: 1, nominations: [3, 5] },
  ]);

  assert.equal(controller.isStageEditable(0), false);
  assert.equal(controller.isStageEditable(1), true);
  assert.equal(controller.isStageEditable(2), true);
});

test("a player eliminated by voting cannot vote in later stages", () => {
  const stages = normalizeVotingStages([
    {
      nominations: [
        { playerNumber: 2, voters: [1] },
        { playerNumber: 5, voters: [5] },
      ],
      eliminatedPlayers: [5],
    },
    {
      nominations: [{ playerNumber: 4, voters: [5, 7] }],
    },
  ]);
  const ineligible = ineligibleVotersForStage(stages, 1);
  assert.equal(ineligible.has(5), true);
  assert.equal(setVoterChoice(stages[1], 4, 5, ineligible), stages[1]);
  assert.deepEqual(removeVoterChoices(stages[1], ineligible).nominations[0].voters, [7]);
});

test("night victims are blocked by round number, including revotes", () => {
  const stages = normalizeVotingStages([
    { kind: "round", roundNumber: 0, nominations: [{ playerNumber: 2, voters: [3] }] },
    { kind: "revote", roundNumber: 0, nominations: [{ playerNumber: 2, voters: [3] }] },
    { kind: "round", roundNumber: 1, nominations: [{ playerNumber: 4, voters: [3] }] },
  ]);
  const killedFromRound = new Map([[3, 1]]);
  assert.equal(ineligibleVotersForStage(stages, 0, killedFromRound).has(3), false);
  assert.equal(ineligibleVotersForStage(stages, 1, killedFromRound).has(3), false);
  assert.equal(ineligibleVotersForStage(stages, 2, killedFromRound).has(3), true);
});

test("the first-night victim can still vote in round zero", () => {
  const controller = Object.create(VotingController.prototype);
  controller.rounds = normalizeVotingStages([
    { kind: "round", roundNumber: 0, nominations: [] },
    { kind: "round", roundNumber: 1, nominations: [] },
  ]);
  controller.currentRoundIndex = 0;
  controller.killedFromRound = new Map();
  controller.reconcileVotingEligibility = () => {};

  controller.setNightKills([{ playerNumber: 3, fromRoundNumber: 1 }]);

  assert.equal(controller.getIneligibleVoters(0).has(3), false);
  assert.equal(controller.getIneligibleVoters(1).has(3), true);
});
