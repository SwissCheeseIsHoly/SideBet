import { createClient } from "@supabase/supabase-js";
import type { Action, Snapshot } from "./types";

const env = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

// These are the project's existing public browser credentials. Authorization
// belongs to the database policies and RPCs; no service-role key belongs here.
export const supabase = createClient(
  env?.VITE_SUPABASE_URL || "https://rrfiyvflpzegpzrcpdhd.supabase.co",
  env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_7M8Q3It7KJvj28_zS1zBJw_8RWc29fF",
);

function databaseError(error: { message: string; code?: string }): Error {
  if (error.code === "PGRST202" || error.code === "42883") {
    return new Error(
      "SideBet’s shared database needs its setup migration. Your account is safe; follow the Supabase setup guide to enable shared bets.",
    );
  }
  return new Error(error.message);
}

export async function loadSnapshot(): Promise<Snapshot> {
  const { data, error } = await supabase.rpc("sb_snapshot");
  if (error) throw databaseError(error);
  if (!data || !data.profile)
    throw new Error("Sign in to load your SideBet profile.");
  return data as Snapshot;
}

export async function runAction(
  action: Action,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc(`sb_${action}`, { payload });
  if (error) throw databaseError(error);
}
