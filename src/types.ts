export interface Profile {
  id: string;
  display_name: string;
  handle: string;
  bio: string;
  avatar_color: string;
  invite_code?: string;
}
export interface Friendship {
  id: string;
  sender_id: string;
  recipient_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
}
export interface Bet {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  category: string;
  stake: number;
  deadline: string;
  status: "open" | "locked" | "proposed" | "resolved" | "cancelled";
  options: string[];
  outcome: string | null;
  resolution_note: string;
  created_at: string;
}
export interface Participant {
  bet_id: string;
  user_id: string;
  option: string | null;
  status: "invited" | "joined" | "declined";
}
export interface Vote {
  bet_id: string;
  user_id: string;
  approved: boolean;
}
export interface Obligation {
  id: string;
  bet_id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  remaining: number;
  created_at: string;
}
export interface Settlement {
  id: string;
  debtor_id: string;
  creditor_id: string;
  amount: number;
  method: string;
  note: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
}
export interface Comment {
  id: string;
  bet_id: string;
  user_id: string;
  body: string;
  created_at: string;
}
export interface Snapshot {
  profile: Profile;
  profiles: Profile[];
  friendships: Friendship[];
  bets: Bet[];
  participants: Participant[];
  votes: Vote[];
  obligations: Obligation[];
  settlements: Settlement[];
  comments: Comment[];
}
export interface CreateBetInput {
  title: string;
  description: string;
  category: string;
  stake: number;
  deadline: string;
  options: string[];
  option: string;
  friend_ids: string[];
}
export type Action =
  | "update_profile"
  | "connect_friend"
  | "respond_friend"
  | "create_bet"
  | "join_bet"
  | "decline_bet"
  | "lock_bet"
  | "cancel_bet"
  | "propose_result"
  | "vote_result"
  | "send_settlement"
  | "respond_settlement"
  | "add_comment";
