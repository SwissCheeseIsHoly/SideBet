import type { Action, Bet, CreateBetInput, Profile, Snapshot } from "./types";

const STORAGE_KEY = "sidebet_v5_demo";
const VIEWER = "demo-you";
const DEMO_VERSION = 1;
export const DEMO_EXPLANATION =
  "This demo saves on this device. Friends are sample profiles; sign in with real accounts to exchange invitations, confirm results, and approve one another’s settlements.";
let memory: Snapshot | undefined;

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const cents = (value: number) => Math.round(value * 100);
const money = (value: number) => Math.round(value) / 100;
const now = () => new Date().toISOString();
const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function seed(): Snapshot {
  const ago = (days: number) =>
    new Date(Date.now() - days * 86400000).toISOString();
  const later = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString();
  const profile: Profile = {
    id: VIEWER,
    display_name: "Alex Morgan",
    handle: "alexmorgan",
    bio: "Here for the good company. And the occasional win.",
    avatar_color: "#dbe8cb",
    invite_code: "ALEX7X",
  };
  const profiles: Profile[] = [
    profile,
    {
      id: "demo-josh",
      display_name: "Josh Chen",
      handle: "joshchen",
      bio: "A little friendly competition.",
      avatar_color: "#e4def6",
      invite_code: "JOSH8K",
    },
    {
      id: "demo-maya",
      display_name: "Maya Patel",
      handle: "mayap",
      bio: "Trivia night is my sport.",
      avatar_color: "#f8ddc9",
      invite_code: "MAYA3Q",
    },
    {
      id: "demo-sam",
      display_name: "Sam Rivera",
      handle: "samrivera",
      bio: "One more round?",
      avatar_color: "#cbe5ee",
      invite_code: "SAM6FR",
    },
    {
      id: "demo-riley",
      display_name: "Riley Brooks",
      handle: "rileyb",
      bio: "See you at game night.",
      avatar_color: "#f3e6b9",
      invite_code: "RILEY9",
    },
  ];
  const resolved = (
    id: string,
    title: string,
    stake: number,
    outcome: string,
    days: number,
    creator = VIEWER,
  ): Bet => ({
    id,
    creator_id: creator,
    title,
    description:
      "A little friendly competition. Everyone confirmed the result.",
    category: "Just for fun",
    stake,
    deadline: ago(days),
    status: "resolved",
    options: ["Alex", "Friends"],
    outcome,
    resolution_note: "Good game, everyone!",
    created_at: ago(days + 1),
  });
  return {
    profile,
    profiles,
    friendships: [
      ...["demo-josh", "demo-maya", "demo-sam"].map((id, index) => ({
        id: `friend-${index}`,
        sender_id: VIEWER,
        recipient_id: id,
        status: "accepted" as const,
        created_at: ago(20),
      })),
      {
        id: "friend-riley",
        sender_id: "demo-riley",
        recipient_id: VIEWER,
        status: "pending",
        created_at: ago(1),
      },
    ],
    bets: [
      {
        id: "bet-pickleball",
        creator_id: VIEWER,
        title: "Who takes the pickleball rematch?",
        description:
          "Saturday at the park. Best of three games, usual house rules. Losers split their stake between the winners.",
        category: "Sports",
        stake: 15,
        deadline: later(2),
        status: "open",
        options: ["Team Alex", "Team Josh"],
        outcome: null,
        resolution_note: "",
        created_at: ago(1),
      },
      {
        id: "bet-trivia",
        creator_id: "demo-maya",
        title: "Can we crack the top 3 at trivia?",
        description:
          "Our regular team, one big prediction. The final scoreboard decides it.",
        category: "Game night",
        stake: 10,
        deadline: later(4),
        status: "open",
        options: ["Top 3, easily", "There’s always next week"],
        outcome: null,
        resolution_note: "",
        created_at: ago(0.4),
      },
      {
        id: "bet-puzzle",
        creator_id: "demo-maya",
        title: "Finish the puzzle before midnight?",
        description:
          "A thousand pieces, four snacks, one very optimistic group.",
        category: "Game night",
        stake: 10,
        deadline: ago(1),
        status: "proposed",
        options: ["Before midnight", "Not a chance"],
        outcome: "Before midnight",
        resolution_note:
          "Last piece went in at 11:47pm! Confirm the result to finish this bet.",
        created_at: ago(2),
      },
      {
        id: "bet-pasta",
        creator_id: "demo-josh",
        title: "The great pasta cook-off",
        description: "Blind taste test. The group has spoken!",
        category: "Food & drink",
        stake: 60,
        deadline: ago(3),
        status: "resolved",
        options: ["Alex’s pesto", "Josh’s carbonara"],
        outcome: "Alex’s pesto",
        resolution_note: "Pesto won the blind taste test, 4–2.",
        created_at: ago(5),
      },
      resolved(
        "bet-darts",
        "Last Friday’s darts showdown",
        25,
        "Friends",
        4,
        "demo-maya",
      ),
      resolved("bet-boardgame", "The Catan comeback", 20, "Alex", 6),
      resolved(
        "bet-coffee",
        "Who gets to the café first?",
        15,
        "Friends",
        2,
        "demo-josh",
      ),
    ],
    participants: [
      {
        bet_id: "bet-pickleball",
        user_id: VIEWER,
        option: "Team Alex",
        status: "joined",
      },
      {
        bet_id: "bet-pickleball",
        user_id: "demo-josh",
        option: "Team Josh",
        status: "joined",
      },
      {
        bet_id: "bet-pickleball",
        user_id: "demo-sam",
        option: "Team Alex",
        status: "joined",
      },
      {
        bet_id: "bet-pickleball",
        user_id: "demo-maya",
        option: null,
        status: "invited",
      },
      {
        bet_id: "bet-trivia",
        user_id: "demo-maya",
        option: "Top 3, easily",
        status: "joined",
      },
      {
        bet_id: "bet-trivia",
        user_id: "demo-sam",
        option: "There’s always next week",
        status: "joined",
      },
      {
        bet_id: "bet-trivia",
        user_id: VIEWER,
        option: null,
        status: "invited",
      },
      {
        bet_id: "bet-puzzle",
        user_id: "demo-maya",
        option: "Before midnight",
        status: "joined",
      },
      {
        bet_id: "bet-puzzle",
        user_id: "demo-sam",
        option: "Not a chance",
        status: "joined",
      },
      {
        bet_id: "bet-puzzle",
        user_id: VIEWER,
        option: "Before midnight",
        status: "joined",
      },
      {
        bet_id: "bet-pasta",
        user_id: VIEWER,
        option: "Alex’s pesto",
        status: "joined",
      },
      {
        bet_id: "bet-pasta",
        user_id: "demo-josh",
        option: "Josh’s carbonara",
        status: "joined",
      },
      {
        bet_id: "bet-darts",
        user_id: VIEWER,
        option: "Alex",
        status: "joined",
      },
      {
        bet_id: "bet-darts",
        user_id: "demo-maya",
        option: "Friends",
        status: "joined",
      },
      {
        bet_id: "bet-boardgame",
        user_id: VIEWER,
        option: "Alex",
        status: "joined",
      },
      {
        bet_id: "bet-boardgame",
        user_id: "demo-sam",
        option: "Friends",
        status: "joined",
      },
      {
        bet_id: "bet-coffee",
        user_id: VIEWER,
        option: "Alex",
        status: "joined",
      },
      {
        bet_id: "bet-coffee",
        user_id: "demo-josh",
        option: "Friends",
        status: "joined",
      },
    ],
    votes: [
      ...["bet-pasta", "bet-darts", "bet-boardgame", "bet-coffee"].flatMap(
        (bet_id, index) =>
          [
            VIEWER,
            ["demo-josh", "demo-maya", "demo-sam", "demo-josh"][index],
          ].map((user_id) => ({ bet_id, user_id, approved: true })),
      ),
      { bet_id: "bet-puzzle", user_id: "demo-maya", approved: true },
      { bet_id: "bet-puzzle", user_id: "demo-sam", approved: true },
    ],
    obligations: [
      {
        id: "debt-pasta",
        bet_id: "bet-pasta",
        debtor_id: "demo-josh",
        creditor_id: VIEWER,
        amount: 60,
        remaining: 60,
        created_at: ago(3),
      },
      {
        id: "debt-darts",
        bet_id: "bet-darts",
        debtor_id: VIEWER,
        creditor_id: "demo-maya",
        amount: 25,
        remaining: 25,
        created_at: ago(4),
      },
      {
        id: "debt-boardgame",
        bet_id: "bet-boardgame",
        debtor_id: "demo-sam",
        creditor_id: VIEWER,
        amount: 20,
        remaining: 20,
        created_at: ago(6),
      },
      {
        id: "debt-coffee",
        bet_id: "bet-coffee",
        debtor_id: VIEWER,
        creditor_id: "demo-josh",
        amount: 15,
        remaining: 15,
        created_at: ago(2),
      },
    ],
    settlements: [
      {
        id: "settlement-josh",
        debtor_id: "demo-josh",
        creditor_id: VIEWER,
        amount: 40,
        method: "Venmo",
        note: "Sent you 40 for the pasta cook-off. That pesto was unfairly good.",
        status: "pending",
        created_at: ago(0.1),
      },
    ],
    comments: [
      {
        id: "comment-josh",
        bet_id: "bet-pickleball",
        user_id: "demo-josh",
        body: "I’ve been practicing. Just saying. 👀",
        created_at: ago(0.3),
      },
      {
        id: "comment-sam",
        bet_id: "bet-pickleball",
        user_id: "demo-sam",
        body: "Same court, 10am? I’ll bring the extra paddles.",
        created_at: ago(0.2),
      },
    ],
  };
}

function save(snapshot: Snapshot): void {
  memory = copy(snapshot);
  try {
    globalThis.localStorage?.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: DEMO_VERSION, snapshot }),
    );
  } catch {
    /* Browsers with storage disabled can still explore this session. */
  }
}

export function getDemoSnapshot(): Snapshot {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as {
        version?: number;
        snapshot?: Snapshot;
      };
      if (
        stored.version === DEMO_VERSION &&
        stored.snapshot?.profile?.id === VIEWER &&
        [
          "profiles",
          "friendships",
          "bets",
          "participants",
          "votes",
          "obligations",
          "settlements",
          "comments",
        ].every((key) =>
          Array.isArray(stored.snapshot?.[key as keyof Snapshot]),
        )
      ) {
        memory = stored.snapshot;
      }
    }
  } catch {
    /* Recover from unavailable storage or an incomplete old save. */
  }
  if (!memory) save(seed());
  return copy(memory!);
}

export function resetDemo(): void {
  save(seed());
}

function text(
  payload: Record<string, unknown>,
  name: string,
  min = 0,
  max = 2000,
): string {
  const value = typeof payload[name] === "string" ? payload[name].trim() : "";
  if (value.length < min || value.length > max)
    throw new Error(
      `${name.replaceAll("_", " ")} must be ${min ? `${min}–` : "at most "}${max} characters.`,
    );
  return value;
}

function amount(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (
    !Number.isFinite(parsed) ||
    parsed < 0.01 ||
    parsed > 1000000 ||
    Math.abs(parsed * 100 - cents(parsed)) > 0.000001
  ) {
    throw new Error(
      "Enter a credit amount greater than zero, at most 1,000,000, with up to two decimal places.",
    );
  }
  return money(cents(parsed));
}

function acceptedFriend(snapshot: Snapshot, id: string): boolean {
  return snapshot.friendships.some(
    (friend) =>
      friend.status === "accepted" &&
      ((friend.sender_id === VIEWER && friend.recipient_id === id) ||
        (friend.recipient_id === VIEWER && friend.sender_id === id)),
  );
}

function settleResult(snapshot: Snapshot, bet: Bet): void {
  const joined = snapshot.participants.filter(
    (p) => p.bet_id === bet.id && p.status === "joined",
  );
  if (
    !joined.every((p) =>
      snapshot.votes.some(
        (v) => v.bet_id === bet.id && v.user_id === p.user_id && v.approved,
      ),
    )
  )
    return;
  const winners = joined
    .filter((p) => p.option === bet.outcome)
    .sort((a, b) => a.user_id.localeCompare(b.user_id));
  const losers = joined.filter((p) => p.option !== bet.outcome);
  bet.status = "resolved";
  if (!winners.length) return;
  const whole = Math.floor(cents(bet.stake) / winners.length);
  const remainder = cents(bet.stake) % winners.length;
  for (const loser of losers)
    winners.forEach((winner, index) => {
      const value = money(whole + (index < remainder ? 1 : 0));
      if (value > 0 && (loser.user_id === VIEWER || winner.user_id === VIEWER))
        snapshot.obligations.push({
          id: uid(),
          bet_id: bet.id,
          debtor_id: loser.user_id,
          creditor_id: winner.user_id,
          amount: value,
          remaining: value,
          created_at: now(),
        });
    });
}

export async function runDemoAction(
  action: Action,
  payload: Record<string, unknown>,
): Promise<void> {
  const snapshot = getDemoSnapshot();
  const id = typeof payload.id === "string" ? payload.id : "";
  const getBet = () => {
    const bet = snapshot.bets.find((b) => b.id === id);
    if (
      !bet ||
      !snapshot.participants.some(
        (p) => p.bet_id === id && p.user_id === VIEWER,
      )
    )
      throw new Error("This bet is not available to you.");
    return bet;
  };
  const requireJoined = () => {
    const participant = snapshot.participants.find(
      (p) => p.bet_id === id && p.user_id === VIEWER && p.status === "joined",
    );
    if (!participant)
      throw new Error("Join this bet before taking that action.");
    return participant;
  };
  switch (action) {
    case "update_profile": {
      const display_name = text(payload, "display_name", 1, 60);
      const handle = text(payload, "handle", 3, 32).toLowerCase();
      if (!/^[a-z0-9_]{3,32}$/.test(handle))
        throw new Error(
          "Use 3–32 letters, numbers, or underscores for your handle.",
        );
      if (
        snapshot.profiles.some(
          (p) => p.id !== VIEWER && p.handle.toLowerCase() === handle,
        )
      )
        throw new Error("That handle is already in use.");
      const bio = text(payload, "bio", 0, 240);
      const avatar_color = text(payload, "avatar_color", 4, 20);
      if (!/^#[0-9a-f]{6}$/i.test(avatar_color))
        throw new Error("Choose a valid profile color.");
      snapshot.profile = {
        ...snapshot.profile,
        display_name,
        handle,
        bio,
        avatar_color,
      };
      snapshot.profiles = snapshot.profiles.map((p) =>
        p.id === VIEWER ? copy(snapshot.profile) : p,
      );
      break;
    }
    case "connect_friend": {
      const code = text(payload, "code", 1, 100)
        .replace(/^@/, "")
        .toLowerCase();
      const friend = snapshot.profiles.find(
        (p) =>
          p.invite_code?.toLowerCase() === code ||
          p.handle.toLowerCase() === code,
      );
      if (!friend)
        throw new Error(
          "No sample profile matches that code. Try @rileyb, or sign in to connect with a real friend.",
        );
      if (friend.id === VIEWER)
        throw new Error("That’s your own invite code. Share it with a friend.");
      const existing = snapshot.friendships.find(
        (f) =>
          (f.sender_id === VIEWER && f.recipient_id === friend.id) ||
          (f.recipient_id === VIEWER && f.sender_id === friend.id),
      );
      if (existing?.status === "accepted")
        throw new Error("You’re already connected.");
      if (existing?.status === "pending")
        throw new Error(
          existing.recipient_id === VIEWER
            ? "This friend already sent you a request. Accept it in your requests."
            : "Your request is already waiting for their response.",
        );
      if (existing)
        Object.assign(existing, {
          sender_id: VIEWER,
          recipient_id: friend.id,
          status: "pending",
          created_at: now(),
        });
      else
        snapshot.friendships.unshift({
          id: uid(),
          sender_id: VIEWER,
          recipient_id: friend.id,
          status: "pending",
          created_at: now(),
        });
      break;
    }
    case "respond_friend": {
      const friend = snapshot.friendships.find(
        (f) =>
          f.id === id && f.recipient_id === VIEWER && f.status === "pending",
      );
      if (!friend)
        throw new Error(
          "Only the recipient can respond to a pending friend request.",
        );
      if (typeof payload.accept !== "boolean")
        throw new Error("Choose accept or decline.");
      friend.status = payload.accept ? "accepted" : "declined";
      break;
    }
    case "create_bet": {
      const input = payload as unknown as CreateBetInput;
      const title = text(payload, "title", 3, 120);
      const description = text(payload, "description", 0, 1000);
      const category = text(
        { ...payload, category: payload.category ?? "Everyday" },
        "category",
        1,
        40,
      );
      const stake = amount(input.stake);
      const deadline = new Date(input.deadline);
      const latest = new Date();
      latest.setFullYear(latest.getFullYear() + 1);
      if (
        !Number.isFinite(deadline.getTime()) ||
        deadline.getTime() <= Date.now() ||
        deadline > latest
      )
        throw new Error(
          "Choose a future time for picks to close within one year.",
        );
      if (
        !Array.isArray(input.options) ||
        input.options.length < 2 ||
        input.options.length > 8 ||
        input.options.some(
          (option) =>
            typeof option !== "string" ||
            !option.trim() ||
            option.trim().length > 60,
        )
      )
        throw new Error("Add 2–8 options, each with 1–60 characters.");
      const options = input.options.map((option) => option.trim());
      if (
        new Set(options.map((option) => option.toLowerCase())).size !==
        options.length
      )
        throw new Error("Every option must be different.");
      const option = text(payload, "option", 1, 60);
      if (!options.includes(option))
        throw new Error("Choose one of this bet’s options.");
      if (
        !Array.isArray(input.friend_ids) ||
        !input.friend_ids.length ||
        new Set(input.friend_ids).size > 30 ||
        input.friend_ids.some((friend) => !acceptedFriend(snapshot, friend))
      )
        throw new Error("Invite between 1 and 30 connected friends.");
      const betId = uid();
      snapshot.bets.unshift({
        id: betId,
        creator_id: VIEWER,
        title,
        description,
        category,
        stake,
        deadline: deadline.toISOString(),
        options,
        outcome: null,
        resolution_note: "",
        status: "open",
        created_at: now(),
      });
      snapshot.participants.push(
        { bet_id: betId, user_id: VIEWER, option, status: "joined" },
        ...[...new Set(input.friend_ids)].map((user_id) => ({
          bet_id: betId,
          user_id,
          option: null,
          status: "invited" as const,
        })),
      );
      break;
    }
    case "join_bet":
    case "decline_bet": {
      const bet = getBet();
      if (
        bet.status !== "open" ||
        new Date(bet.deadline).getTime() <= Date.now()
      )
        throw new Error("Picks are closed for this bet.");
      const participant = snapshot.participants.find(
        (p) => p.bet_id === id && p.user_id === VIEWER,
      )!;
      if (action === "decline_bet") {
        if (bet.creator_id === VIEWER)
          throw new Error(
            "As the host, cancel the bet instead of declining it.",
          );
        participant.status = "declined";
        participant.option = null;
      } else {
        const option = text(payload, "option", 1, 60);
        if (!bet.options.includes(option))
          throw new Error("Choose one of this bet’s options.");
        participant.status = "joined";
        participant.option = option;
      }
      break;
    }
    case "lock_bet":
    case "cancel_bet": {
      const bet = getBet();
      if (bet.creator_id !== VIEWER)
        throw new Error("Only the host can do that.");
      if (bet.status !== "open")
        throw new Error("Only an open bet can be locked or cancelled.");
      if (
        action === "lock_bet" &&
        snapshot.participants.filter(
          (p) => p.bet_id === id && p.status === "joined",
        ).length < 2
      )
        throw new Error("At least two people must join before locking picks.");
      bet.status = action === "lock_bet" ? "locked" : "cancelled";
      break;
    }
    case "propose_result": {
      const bet = getBet();
      requireJoined();
      if (
        bet.status !== "locked" &&
        !(
          bet.status === "open" &&
          new Date(bet.deadline).getTime() <= Date.now()
        )
      )
        throw new Error(
          "Lock picks or wait for the deadline before proposing a result.",
        );
      if (
        snapshot.participants.filter(
          (p) => p.bet_id === id && p.status === "joined",
        ).length < 2
      )
        throw new Error(
          "At least two people must join before a result can be proposed.",
        );
      const outcome = text(payload, "outcome", 1, 60);
      if (!bet.options.includes(outcome))
        throw new Error("Choose one of this bet’s options.");
      bet.status = "proposed";
      bet.outcome = outcome;
      bet.resolution_note = text(payload, "note", 0, 1000);
      snapshot.votes = snapshot.votes.filter((v) => v.bet_id !== id);
      snapshot.votes.push({ bet_id: id, user_id: VIEWER, approved: true });
      settleResult(snapshot, bet);
      break;
    }
    case "vote_result": {
      const bet = getBet();
      requireJoined();
      if (bet.status !== "proposed")
        throw new Error("There is no pending result to confirm.");
      if (typeof payload.approve !== "boolean")
        throw new Error("Choose confirm or dispute.");
      if (!payload.approve) {
        bet.status = "locked";
        bet.outcome = null;
        bet.resolution_note = "";
        snapshot.votes = snapshot.votes.filter((v) => v.bet_id !== id);
      } else {
        snapshot.votes = snapshot.votes.filter(
          (v) => !(v.bet_id === id && v.user_id === VIEWER),
        );
        snapshot.votes.push({ bet_id: id, user_id: VIEWER, approved: true });
        settleResult(snapshot, bet);
      }
      break;
    }
    case "send_settlement": {
      const creditor_id = text(payload, "creditor_id", 1, 100);
      if (creditor_id === VIEWER)
        throw new Error("You can’t send a settlement to yourself.");
      const value = amount(payload.amount);
      const outstanding = snapshot.obligations
        .filter((o) => o.debtor_id === VIEWER && o.creditor_id === creditor_id)
        .reduce((sum, o) => sum + cents(o.remaining), 0);
      const pending = snapshot.settlements
        .filter(
          (s) =>
            s.debtor_id === VIEWER &&
            s.creditor_id === creditor_id &&
            s.status === "pending",
        )
        .reduce((sum, s) => sum + cents(s.amount), 0);
      if (cents(value) > outstanding - pending)
        throw new Error(
          "This exceeds what you owe after pending settlement notes.",
        );
      const method = text(payload, "method", 1, 60);
      const note = text(payload, "note", 0, 500);
      snapshot.settlements.unshift({
        id: uid(),
        debtor_id: VIEWER,
        creditor_id,
        amount: value,
        method,
        note,
        status: "pending",
        created_at: now(),
      });
      break;
    }
    case "respond_settlement": {
      const settlement = snapshot.settlements.find(
        (s) =>
          s.id === id && s.creditor_id === VIEWER && s.status === "pending",
      );
      if (!settlement)
        throw new Error(
          "Only the recipient can respond to a pending settlement note.",
        );
      if (typeof payload.accept !== "boolean")
        throw new Error("Choose accept or decline.");
      if (payload.accept) {
        const obligations = snapshot.obligations
          .filter(
            (o) =>
              o.debtor_id === settlement.debtor_id &&
              o.creditor_id === VIEWER &&
              o.remaining > 0,
          )
          .sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          );
        let remaining = cents(settlement.amount);
        if (
          obligations.reduce((sum, o) => sum + cents(o.remaining), 0) <
          remaining
        )
          throw new Error(
            "The outstanding balance changed. Decline this note and request an updated amount.",
          );
        for (const obligation of obligations) {
          const applied = Math.min(cents(obligation.remaining), remaining);
          obligation.remaining = money(cents(obligation.remaining) - applied);
          remaining -= applied;
        }
      }
      settlement.status = payload.accept ? "accepted" : "declined";
      break;
    }
    case "add_comment": {
      getBet();
      snapshot.comments.push({
        id: uid(),
        bet_id: id,
        user_id: VIEWER,
        body: text(payload, "body", 1, 1000),
        created_at: now(),
      });
      break;
    }
    default:
      throw new Error("That action is not available.");
  }
  save(snapshot);
}
