import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRevoteStage,
  ineligibleVotersForStage,
  normalizeVotingStages,
  removeVoterChoices,
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
