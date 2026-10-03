import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Dices,
  Flag,
  Handshake,
  Home,
  Link2,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Users,
  Wallet,
  X,
  Zap,
  RefreshCw,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Action, Bet, Profile, Snapshot } from "./types";
import { supabase, loadSnapshot, runAction } from "./data";
import { getDemoSnapshot, runDemoAction, resetDemo } from "./demo";
import { authErrorMessage, authErrorCode, resendWaitSeconds } from "./auth";

const categories = [
  "All bets",
  "Sports",
  "Game night",
  "Everyday",
  "Work",
  "Family",
];
const categoryEmoji: Record<string, string> = {
  Sports: "🏀",
  "Game night": "🎲",
  Everyday: "☕",
  Work: "💼",
  Family: "🏡",
  Other: "✨",
};
const credits = (n: number) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
const dateLabel = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const initials = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
const avatarColors = [
  "#EBCFA6",
  "#CEDCB5",
  "#C7D8EC",
  "#E3C6DC",
  "#F0C1AD",
  "#D6D0ED",
];
const friendLink = (code: string) =>
  `${location.origin}${location.pathname}#invite/${encodeURIComponent(code)}`;
const shortError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /sb_snapshot|schema cache|could not find.*function/i.test(message)
    ? "Your Supabase project needs the SideBet database update. Follow docs/SETUP.md, then try again."
    : message;
};
function Avatar({ person, size = "" }: { person?: Profile; size?: string }) {
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: person?.avatar_color || "#dce0d1" }}
      title={person?.display_name}
    >
      {initials(person?.display_name || "?")}
    </span>
  );
}
function Brand() {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <Dices size={24} />
      </span>
      sidebet<span className="brand-dot">.</span>
    </span>
  );
}
function Empty({
  icon = <Target />,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]',
          ) || [],
        );
        const first = els[0],
          last = els.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<"loading" | "landing" | "demo" | "live">(
    "loading",
  );
  const [state, setState] = useState<Snapshot | null>(null),
    [page, setPage] = useState("home");
  const [modal, setModal] = useState<
    "create" | "invite" | "auth" | "settle" | "help" | null
  >(null);
  const [authMode, setAuthMode] = useState<
    "signup" | "login" | "reset" | "recovery" | "confirm"
  >("signup");
  const [selected, setSelected] = useState<string | null>(null),
    [settleFriend, setSettleFriend] = useState("");
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All bets"),
    [filter, setFilter] = useState("active"),
    [mobileNav, setMobileNav] = useState(false);
  const [inviteCode, setInviteCode] = useState(""),
    [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState(""),
    [authInfo, setAuthInfo] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authName, setAuthName] = useState("");
  const [resendUntil, setResendUntil] = useState<Record<string, number>>({});
  const [authNow, setAuthNow] = useState(Date.now());
  const authInFlight = useRef(false);
  const openedInvite = useRef("");
  const emailKey = authEmail.trim().toLowerCase();
  const resendSeconds = Math.max(
    0,
    Math.ceil(((resendUntil[emailKey] || 0) - authNow) / 1000),
  );
  function pauseResend(email: string, seconds = 60) {
    const now = Date.now();
    setAuthNow(now);
    setResendUntil((previous) => ({
      ...previous,
      [email.trim().toLowerCase()]: now + seconds * 1000,
    }));
  }
  useEffect(() => {
    if (modal !== "auth" || authMode !== "confirm" || resendSeconds === 0)
      return;
    const timer = window.setInterval(() => setAuthNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [modal, authMode, resendSeconds]);
  const scope = useRef<{
    mode: typeof mode;
    userId: string | null;
    generation: number;
  }>({ mode: "loading", userId: null, generation: 0 });
  const snapshotRequest = useRef(0),
    actionInFlight = useRef(false),
    authIntent = useRef(false),
    recovering = useRef(false);
  function enterMode(next: typeof mode, userId: string | null = null) {
    if (scope.current.mode !== next || scope.current.userId !== userId) {
      scope.current = {
        mode: next,
        userId,
        generation: scope.current.generation + 1,
      };
      snapshotRequest.current++;
      setState(null);
      setSelected(null);
      setSettleFriend("");
      setError("");
      setToast("");
      setRefreshing(false);
      setBusy(false);
      actionInFlight.current = false;
    }
    setMode(next);
  }
  function consumeInvite() {
    if (recovering.current) return;
    const pending = localStorage.getItem("sidebet_pending_invite");
    if (pending) {
      setInviteCode(pending);
      setModal("invite");
      localStorage.removeItem("sidebet_pending_invite");
    }
  }
  const refresh = async () => {
    const current = { ...scope.current };
    if (
      actionInFlight.current ||
      (current.mode !== "live" && current.mode !== "demo")
    )
      return;
    const request = ++snapshotRequest.current;
    setRefreshing(true);
    const relevant = () =>
      scope.current.generation === current.generation &&
      snapshotRequest.current === request;
    try {
      const data =
        current.mode === "demo" ? getDemoSnapshot() : await loadSnapshot();
      if (!relevant()) return;
      if (current.mode === "live" && data.profile.id !== current.userId) return;
      setState(data);
      setError("");
      if (current.mode === "live") consumeInvite();
    } catch (e) {
      if (relevant()) setError(shortError(e));
    } finally {
      if (relevant()) setRefreshing(false);
    }
  };
  useEffect(() => {
    let active = true,
      authEvents = 0,
      lastUserId: string | null = null;
    const loadSession = (userId: string) => {
      lastUserId = userId;
      sessionStorage.removeItem("sidebet_demo");
      enterMode("live", userId);
      setReady(true);
      const generation = scope.current.generation;
      setTimeout(() => {
        if (active && scope.current.generation === generation) void refresh();
      }, 0);
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        authEvents++;
        lastUserId = null;
        recovering.current = false;
        authIntent.current = false;
        enterMode("landing");
        setModal(null);
        setReady(true);
      }
      if ((event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") && session) {
        authEvents++;
        if (
          event === "SIGNED_IN" &&
          scope.current.mode === "demo" &&
          lastUserId === session.user.id &&
          !authIntent.current
        )
          return;
        if (event === "PASSWORD_RECOVERY") {
          recovering.current = true;
          setAuthMode("recovery");
          setModal("auth");
        }
        authIntent.current = false;
        loadSession(session.user.id);
      }
    });
    const initialEvents = authEvents;
    void supabase.auth
      .getSession()
      .then(({ data, error: err }) => {
        if (!active || authEvents !== initialEvents) return;
        if (err) throw err;
        lastUserId = data.session?.user.id || null;
        if (sessionStorage.getItem("sidebet_demo") === "yes") {
          enterMode("demo");
          setState(getDemoSnapshot());
        } else if (data.session) loadSession(data.session.user.id);
        else enterMode("landing");
        setReady(true);
      })
      .catch((e) => {
        if (active && authEvents === initialEvents) {
          enterMode("landing");
          setError(shortError(e));
          setReady(true);
        }
      });
    return () => {
      active = false;
      scope.current.generation++;
      snapshotRequest.current++;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    const read = () => {
      const hash = location.hash.slice(1);
      if (hash.startsWith("invite/")) {
        try {
          const code = decodeURIComponent(hash.slice(7));
          setInviteCode(code);
          localStorage.setItem("sidebet_pending_invite", code);
          if ((mode === "live" || mode === "demo") && !recovering.current)
            setModal("invite");
          else if (mode === "landing" && openedInvite.current !== code) {
            openedInvite.current = code;
            openAuth("signup");
          }
        } catch {
          setError(
            "This invite link is malformed. Ask your friend for a fresh link or enter their code.",
          );
        }
      } else if (
        ["home", "bets", "friends", "balances", "profile", "activity"].includes(
          hash,
        )
      ) {
        setPage(hash);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [mode]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (mode !== "live") return;
    const handler = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = setInterval(handler, 20000);
    window.addEventListener("focus", handler);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handler);
    };
  }, [mode]);
  function navigate(next: string) {
    setPage(next);
    location.hash = next;
    setMobileNav(false);
    setSearch("");
  }
  function demo() {
    sessionStorage.setItem("sidebet_demo", "yes");
    enterMode("demo");
    setState(getDemoSnapshot());
    setReady(true);
  }
  async function action(
    name: Action,
    payload: Record<string, unknown>,
    message = "Saved",
  ) {
    if (busy || actionInFlight.current) return false;
    const current = { ...scope.current };
    if (current.mode !== "demo" && current.mode !== "live") return false;
    actionInFlight.current = true;
    setBusy(true);
    setRefreshing(false);
    setError("");
    snapshotRequest.current++;
    const relevant = () => scope.current.generation === current.generation;
    try {
      if (current.mode === "demo") await runDemoAction(name, payload);
      else await runAction(name, payload);
      if (!relevant()) return false;
      const request = ++snapshotRequest.current;
      const data =
        current.mode === "demo" ? getDemoSnapshot() : await loadSnapshot();
      if (
        !relevant() ||
        (current.mode === "live" && data.profile.id !== current.userId)
      )
        return false;
      if (snapshotRequest.current === request) setState(data);
      setToast(message);
      return true;
    } catch (e) {
      if (relevant()) setError(shortError(e));
      return false;
    } finally {
      if (relevant()) {
        actionInFlight.current = false;
        setBusy(false);
      }
    }
  }
  function openAuth(kind: "signup" | "login") {
    if (authInFlight.current) return;
    setAuthNow(Date.now());
    authIntent.current = true;
    setAuthMode(kind);
    setAuthError("");
    setAuthInfo("");
    setModal("auth");
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied to clipboard");
    } catch {
      setToast("Copy isn’t available here. Select and copy the link below.");
    }
  }
  const close = useCallback(() => {
    authIntent.current = false;
    recovering.current = false;
    setModal(null);
    setSelected(null);
    setError("");
  }, []);
  const me = state?.profile;
  const person = (id: string) =>
    id === me?.id ? me : state?.profiles.find((p) => p.id === id);
  const myId = me?.id || "";
  const friends =
    state?.friendships
      .filter((f) => f.status === "accepted")
      .map((f) => person(f.sender_id === myId ? f.recipient_id : f.sender_id))
      .filter((p): p is Profile => !!p) || [];
  const requests =
    state?.friendships.filter(
      (f) => f.status === "pending" && f.recipient_id === myId,
    ) || [];
  const pendingSettlements =
    state?.settlements.filter(
      (s) => s.status === "pending" && s.creditor_id === myId,
    ) || [];
  const invitedBets =
    state?.bets.filter(
      (b) =>
        state.participants.some(
          (p) =>
            p.bet_id === b.id && p.user_id === myId && p.status === "invited",
        ) &&
        b.status === "open" &&
        new Date(b.deadline) > new Date(),
    ) || [];
  const pendingResults =
    state?.bets.filter(
      (b) =>
        b.status === "proposed" &&
        state.participants.some(
          (p) =>
            p.bet_id === b.id && p.user_id === myId && p.status === "joined",
        ) &&
        !state.votes.some(
          (v) => v.bet_id === b.id && v.user_id === myId && v.approved,
        ),
    ) || [];
  const pendingCount =
    requests.length +
    pendingSettlements.length +
    invitedBets.length +
    pendingResults.length;
  const owed =
    state?.obligations
      .filter((o) => o.creditor_id === myId)
      .reduce((n, o) => n + Number(o.remaining), 0) || 0;
  const owe =
    state?.obligations
      .filter((o) => o.debtor_id === myId)
      .reduce((n, o) => n + Number(o.remaining), 0) || 0;
  const activeBets =
    state?.bets.filter((b) => !["resolved", "cancelled"].includes(b.status)) ||
    [];
  const resolved =
    state?.bets.filter(
      (b) =>
        b.status === "resolved" &&
        state.participants.some(
          (p) =>
            p.bet_id === b.id && p.user_id === myId && p.status === "joined",
        ),
    ) || [];
  const wins = resolved.filter((b) =>
    state?.participants.some(
      (p) => p.bet_id === b.id && p.user_id === myId && p.option === b.outcome,
    ),
  ).length;
  const bet = state?.bets.find((b) => b.id === selected);
  const filtered =
    state?.bets
      .filter((b) =>
        page === "home" || filter === "active"
          ? !["resolved", "cancelled"].includes(b.status)
          : filter === "history"
            ? ["resolved", "cancelled"].includes(b.status)
            : invitedBets.includes(b),
      )
      .filter((b) => category === "All bets" || b.category === category)
      .filter((b) =>
        `${b.title} ${b.description}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) || [];
  const balancePeers = state
    ? Array.from(
        new Set([
          ...friends.map((f) => f.id),
          ...state.obligations.flatMap((o) => [o.debtor_id, o.creditor_id]),
          ...state.settlements.flatMap((s) => [s.debtor_id, s.creditor_id]),
        ]),
      )
        .filter((id) => id !== myId)
        .map(person)
        .filter((p): p is Profile => !!p)
    : [];
  const directionalBalance = (id: string, side: "owe" | "owed") =>
    state?.obligations
      .filter((o) =>
        side === "owe"
          ? o.debtor_id === myId && o.creditor_id === id
          : o.creditor_id === myId && o.debtor_id === id,
      )
      .reduce((n, o) => n + Number(o.remaining), 0) || 0;
  function statusLabel(b: Bet) {
    if (b.status === "open" && new Date(b.deadline) <= new Date())
      return "Ready for a result";
    return {
      open: "Open for picks",
      locked: "Picks locked",
      proposed: "Confirm the result",
      resolved: "All settled on a result",
      cancelled: "Cancelled",
    }[b.status];
  }
  function betCard(b: Bet) {
    const ps = state!.participants.filter(
      (p) => p.bet_id === b.id && p.status === "joined",
    );
    const mine = ps.find((p) => p.user_id === myId);
    const invited = invitedBets.includes(b);
    return (
      <button
        className={`bet-card category-${b.category.toLowerCase().replace(" ", "-")}`}
        key={b.id}
        onClick={() => setSelected(b.id)}
      >
        <div className="bet-card-top">
          <span className="category-icon">
            {categoryEmoji[b.category] || "✨"}
          </span>
          <span
            className={`status ${b.status === "proposed" || invited ? "status-amber" : b.status === "resolved" ? "status-purple" : ""}`}
          >
            <i />
            {invited ? "You’re invited" : statusLabel(b)}
          </span>
          <ArrowUpRight className="card-arrow" size={19} />
        </div>
        <span className="bet-category">{b.category}</span>
        <h3>{b.title}</h3>
        <p className="bet-description">
          {b.description || "A friendly challenge. What’s your call?"}
        </p>
        <div className="outcome-pills">
          {b.options.slice(0, 3).map((o) => (
            <span className={mine?.option === o ? "picked" : ""} key={o}>
              {mine?.option === o && <Check size={13} />} {o}
            </span>
          ))}
        </div>
        <div className="card-bottom">
          <span className="avatar-stack">
            {ps.slice(0, 3).map((p) => (
              <Avatar key={p.user_id} person={person(p.user_id)} size="tiny" />
            ))}
            <span>{ps.length} playing</span>
          </span>
          <span className="stake">
            <strong>{credits(b.stake)}</strong> cr / person
          </span>
        </div>
        <div className="card-deadline">
          <Clock3 size={12} />
          {b.status === "resolved"
            ? `Result: ${b.outcome}`
            : `Picks close ${dateLabel(b.deadline)}`}
        </div>
      </button>
    );
  }
  function requestsPanel() {
    return (
      <>
        {requests.map((r) => (
          <div className="request-row" key={r.id}>
            <Avatar person={person(r.sender_id)} />
            <div>
              <strong>{person(r.sender_id)?.display_name || "A friend"}</strong>
              <p>Wants to join your circle</p>
            </div>
            <button
              className="small-btn"
              disabled={busy}
              onClick={() =>
                action(
                  "respond_friend",
                  { id: r.id, accept: true },
                  "You’re connected!",
                )
              }
            >
              Accept
            </button>
            <button
              className="icon-button"
              disabled={busy}
              onClick={() =>
                action(
                  "respond_friend",
                  { id: r.id, accept: false },
                  "Request declined",
                )
              }
              aria-label="Decline friend request"
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {invitedBets.map((b) => (
          <button
            className="request-row row-button"
            key={b.id}
            onClick={() => setSelected(b.id)}
          >
            <span className="mini-icon">
              {categoryEmoji[b.category] || "🎲"}
            </span>
            <div>
              <strong>{b.title}</strong>
              <p>You’re invited · {credits(b.stake)} credits each</p>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
        {pendingResults.map((b) => (
          <button
            className="request-row row-button"
            key={b.id}
            onClick={() => setSelected(b.id)}
          >
            <span className="mini-icon">
              <Flag size={19} />
            </span>
            <div>
              <strong>{b.title}</strong>
              <p>Confirm result: {b.outcome}</p>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
        {pendingSettlements.map((s) => (
          <div className="settlement-request" key={s.id}>
            <div className="request-row">
              <Avatar person={person(s.debtor_id)} />
              <div>
                <strong>
                  {person(s.debtor_id)?.display_name} marked {credits(s.amount)}{" "}
                  credits paid
                </strong>
                <p>
                  Via {s.method} · {dateLabel(s.created_at)}
                </p>
              </div>
            </div>
            <p className="payment-note">“{s.note}”</p>
            <div className="inline-actions">
              <button
                className="small-btn"
                disabled={busy}
                onClick={() =>
                  action(
                    "respond_settlement",
                    { id: s.id, accept: true },
                    "Payment confirmed. Your balance is updated.",
                  )
                }
              >
                Accept payment note
              </button>
              <button
                className="small-btn secondary"
                disabled={busy}
                onClick={() =>
                  action(
                    "respond_settlement",
                    { id: s.id, accept: false },
                    "Note declined. The balance is unchanged.",
                  )
                }
              >
                Decline
              </button>
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {mode === "loading" || !ready ? (
        <main className="loading-screen">
          <Brand />
          <span className="loading-dot" />
          <p>Getting your circle together…</p>
        </main>
      ) : mode === "landing" ? (
        <div className="landing">
          <header className="landing-nav">
            <Brand />
            <div>
              <button className="text-btn" onClick={() => openAuth("login")}>
                Log in
              </button>
              <button
                className="primary-btn"
                onClick={() => openAuth("signup")}
              >
                Get started <ArrowUpRight size={17} />
              </button>
            </div>
          </header>
          {error && (
            <div className="global-error" role="alert">
              {error}
            </div>
          )}
          {inviteCode && (
            <div className="invite-banner">
              <Users size={18} /> You’ve been invited to connect on SideBet.
              Create an account or log in, then send your friend request.
            </div>
          )}
          <main>
            <section className="landing-hero">
              <div>
                <span className="eyebrow">
                  <span className="live-dot" /> GOOD FRIENDS. GREAT RIVALRIES.
                </span>
                <h1>
                  Big talk.
                  <br />
                  Friendly bets.
                  <br />
                  <span>All in good fun.</span>
                </h1>
                <p>
                  For the “bet you can’t” people in your life. Make a call,
                  bring your friends, and keep track of who owes who.
                </p>
                <div className="hero-actions">
                  <button
                    className="primary-btn"
                    onClick={() => openAuth("signup")}
                  >
                    Find your friendly competition <ArrowRight size={18} />
                  </button>
                  <button className="text-btn" onClick={demo}>
                    Take a look around <ArrowUpRight size={17} />
                  </button>
                </div>
                <div className="hero-note">
                  <ShieldCheck size={16} /> Just credits. No deposits. No money
                  moves here.
                </div>
              </div>
              <div className="landing-art">
                <span className="orbit-text">
                  A LITTLE SOMETHING TO PLAY FOR ↗
                </span>
                <div className="art-sticker sticker-one">I CALLED IT.</div>
                <div className="illustrated-card">
                  <div>
                    <span>THE WEEKEND CREW</span>
                    <Dices size={22} />
                  </div>
                  <span className="art-emoji">🏓</span>
                  <h2>
                    Who’s taking
                    <br />
                    game night?
                  </h2>
                  <p>Same friends. A little more at stake.</p>
                  <div className="illustrated-picks">
                    <span>
                      Team you <Check size={14} />
                    </span>
                    <span>The other guys</span>
                  </div>
                  <footer>
                    <span>👩🏻 🧑🏽 👨🏼</span>
                    <strong>
                      20 <small>credits each</small>
                    </strong>
                  </footer>
                </div>
                <div className="art-sticker sticker-two">
                  <Trophy size={24} /> Bragging rights
                  <br />
                  included.
                </div>
                <div className="art-balance">
                  <span className="mini-icon">
                    <Handshake />
                  </span>
                  <div>
                    <strong>Fair is fair.</strong>
                    <span>Settle up. Stay friends.</span>
                  </div>
                  <Check size={18} />
                </div>
                <span className="art-spark">✳</span>
              </div>
            </section>
            <section className="landing-bottom">
              <div>
                <span className="eyebrow">
                  EVERYDAY MOMENTS. BETTER STORIES.
                </span>
                <h2>There’s a bet in that.</h2>
                <p>The last slice. The next game. The office debate.</p>
              </div>
              <div className="feature">
                <span>01 /</span>
                <Users />
                <h3>Bring your people.</h3>
                <p>Connect with a link, a code, or a quick QR scan.</p>
              </div>
              <div className="feature">
                <span>02 /</span>
                <Target />
                <h3>Make your call.</h3>
                <p>Set the stakes, choose a side, and agree on the result.</p>
              </div>
              <div className="feature">
                <span>03 /</span>
                <Handshake />
                <h3>Keep it friendly.</h3>
                <p>Track IOUs and confirm when you’re all squared up.</p>
              </div>
            </section>
          </main>
          <footer className="landing-footer">
            <Brand />
            <span>A little rivalry. A lot of good times.</span>
            <button className="text-btn" onClick={() => setModal("help")}>
              How credits work <ArrowUpRight size={15} />
            </button>
          </footer>
        </div>
      ) : (
        <div className="app-layout">
          <aside
            id="main-sidebar"
            className={`sidebar ${mobileNav ? "mobile-open" : ""}`}
          >
            <a
              href="#home"
              className="brand-link"
              onClick={() => navigate("home")}
            >
              <Brand />
            </a>
            <button
              className="mobile-close icon-button"
              onClick={() => setMobileNav(false)}
              aria-label="Close navigation"
            >
              <X />
            </button>
            <div className="sidebar-label">YOUR CORNER</div>
            <nav aria-label="Main navigation">
              {[
                { id: "home", label: "Overview", icon: Home },
                { id: "bets", label: "Your bets", icon: Target },
                { id: "friends", label: "Your circle", icon: Users },
                { id: "balances", label: "Settle up", icon: Wallet },
                { id: "activity", label: "Inbox", icon: Bell },
              ].map((n) => (
                <button
                  key={n.id}
                  className={`nav-item ${page === n.id ? "active" : ""}`}
                  onClick={() => navigate(n.id)}
                >
                  <n.icon size={19} />
                  {n.label}
                  {n.id === "activity" && pendingCount > 0 && (
                    <span className="nav-badge">{pendingCount}</span>
                  )}
                </button>
              ))}
            </nav>
            <button
              className="new-bet-sidebar"
              onClick={() => setModal("create")}
            >
              <Plus size={18} /> Create a bet
            </button>
            <div className="sidebar-bottom">
              <div className="sidebar-promo">
                <div className="promo-icon">
                  <Sparkles size={21} />
                </div>
                <strong>Better with your people.</strong>
                <p>Bring a friend. Start a rivalry.</p>
                <button onClick={() => setModal("invite")}>
                  Invite a friend <ArrowUpRight size={16} />
                </button>
              </div>
              <button className="sidebar-help" onClick={() => setModal("help")}>
                <CircleHelp size={17} /> How SideBet works
              </button>
              <button
                className={`sidebar-profile ${page === "profile" ? "selected" : ""}`}
                onClick={() => navigate("profile")}
              >
                <Avatar person={me} />
                <span>
                  <strong>{me?.display_name || "Your profile"}</strong>
                  <small>@{me?.handle || "sidebet"}</small>
                </span>
                <Settings2 size={17} />
              </button>
            </div>
          </aside>
          {mobileNav && (
            <div className="nav-scrim" onClick={() => setMobileNav(false)} />
          )}
          <div className="app-main">
            <header className="topbar">
              <div>
                <button
                  className="icon-button mobile-toggle"
                  aria-label="Open navigation"
                  aria-controls="main-sidebar"
                  aria-expanded={mobileNav}
                  onClick={() => setMobileNav(true)}
                >
                  <Menu />
                </button>
                <span className="breadcrumb">
                  Your corner <ChevronRight size={14} />{" "}
                  <strong>
                    {
                      {
                        home: "Overview",
                        bets: "Your bets",
                        friends: "Your circle",
                        balances: "Settle up",
                        profile: "Profile",
                        activity: "Inbox",
                      }[page]
                    }
                  </strong>
                </span>
              </div>
              <div className="topbar-actions">
                <span className="credit-label">
                  <span className="live-dot" />
                  {mode === "demo" ? "DEMO PLAYGROUND" : "FRIENDLY COMPETITION"}
                </span>
                <button
                  className={`icon-button ${refreshing ? "spinning" : ""}`}
                  onClick={() => void refresh()}
                  aria-label="Refresh data"
                  disabled={refreshing}
                >
                  <RefreshCw size={17} />
                </button>
                <button
                  className="icon-button notification-button"
                  aria-label={`Inbox, ${pendingCount} pending items`}
                  onClick={() => navigate("activity")}
                >
                  <Bell size={20} />
                  {pendingCount > 0 && <i />}
                </button>
                <button
                  className="profile-trigger"
                  aria-label="View profile"
                  onClick={() => navigate("profile")}
                >
                  <Avatar person={me} size="small" />
                </button>
              </div>
            </header>
            {mode === "demo" && (
              <div className="demo-banner">
                <span>
                  <Sparkles size={14} /> You’re in the demo. Explore freely —
                  these are sample credits and people.
                </span>
                <button onClick={() => openAuth("signup")}>
                  Make it yours <ArrowRight size={14} />
                </button>
              </div>
            )}
            <main className="content">
              {error && !modal && !selected && (
                <div className="global-error" role="alert">
                  {error}
                  <button className="text-btn" onClick={() => void refresh()}>
                    Try again
                  </button>
                </div>
              )}
              {!state ? (
                <Empty
                  title="Your account is ready. Your database needs one more step."
                  icon={<Settings2 />}
                >
                  <p>
                    Apply the SideBet migration in your Supabase project, then
                    refresh. Setup instructions are in docs/SETUP.md.
                  </p>
                  <button
                    className="primary-btn"
                    onClick={() => void refresh()}
                  >
                    Try again
                  </button>
                  <button className="text-btn" onClick={demo}>
                    Explore the demo
                  </button>
                </Empty>
              ) : (
                <>
                  {(page === "home" || page === "bets") && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">
                            {page === "home"
                              ? `HEY, ${me?.display_name.split(" ")[0].toUpperCase()} 👋`
                              : "MAKE YOUR CALL"}
                          </span>
                          <h1>
                            {page === "home"
                              ? "What’s the friendly wager?"
                              : "Your bets, all in one place."}
                          </h1>
                          <p>
                            {page === "home"
                              ? "A little rivalry makes the everyday more interesting."
                              : "Big predictions. Tiny stakes. Stories that stick."}
                          </p>
                        </div>
                        <button
                          className="primary-btn"
                          onClick={() => setModal("create")}
                        >
                          <Plus size={18} /> Create a bet
                        </button>
                      </div>
                      {page === "home" && (
                        <>
                          <section className="dashboard-hero">
                            <div className="hero-copy">
                              <span className="eyebrow">
                                <Zap size={13} /> MAKE IT INTERESTING
                              </span>
                              <h2>
                                Less scrolling.
                                <br />
                                More “you’re on.”
                              </h2>
                              <p>
                                Game night, the group chat, or who’s doing the
                                dishes.
                                <br className="desktop-break" /> Your next great
                                bet is closer than you think.
                              </p>
                              <button
                                className="dark-btn"
                                onClick={() => setModal("create")}
                              >
                                Start something friendly{" "}
                                <ArrowUpRight size={16} />
                              </button>
                            </div>
                            <div className="hero-doodle" aria-hidden="true">
                              <span className="doodle-label">
                                BRAGGING RIGHTS
                                <br />
                                START HERE.
                              </span>
                              <div className="doodle-card back">
                                <Dices size={54} />
                              </div>
                              <div className="doodle-card front">
                                <span>
                                  I BET
                                  <br />
                                  YOU.
                                </span>
                                <span className="doodle-star">✳</span>
                              </div>
                              <div className="doodle-seal">
                                100%
                                <br />
                                <b>FRIENDLY</b>
                              </div>
                              <span className="doodle-swirl">↗</span>
                            </div>
                          </section>
                          <div className="stat-grid">
                            <button
                              className="stat-card"
                              onClick={() => navigate("bets")}
                            >
                              <span className="stat-icon green">
                                <Target size={20} />
                              </span>
                              <div>
                                <span>Active bets</span>
                                <strong>
                                  {activeBets.length}
                                  <small>in the mix</small>
                                </strong>
                              </div>
                              <ArrowUpRight size={16} />
                            </button>
                            <button
                              className="stat-card"
                              onClick={() => navigate("balances")}
                            >
                              <span className="stat-icon blue">
                                <ArrowDownLeft size={20} />
                              </span>
                              <div>
                                <span>You’re owed</span>
                                <strong>
                                  {credits(owed)}
                                  <small>credits</small>
                                </strong>
                              </div>
                              <ArrowUpRight size={16} />
                            </button>
                            <button
                              className="stat-card"
                              onClick={() => navigate("balances")}
                            >
                              <span className="stat-icon peach">
                                <ArrowUpRight size={20} />
                              </span>
                              <div>
                                <span>You owe</span>
                                <strong>
                                  {credits(owe)}
                                  <small>credits</small>
                                </strong>
                              </div>
                              <ArrowUpRight size={16} />
                            </button>
                            <button
                              className="stat-card"
                              onClick={() => navigate("friends")}
                            >
                              <span className="stat-icon lavender">
                                <Users size={20} />
                              </span>
                              <div>
                                <span>Your circle</span>
                                <strong>
                                  {friends.length}
                                  <small>
                                    {friends.length === 1
                                      ? "friend"
                                      : "friends"}
                                  </small>
                                </strong>
                              </div>
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                        </>
                      )}
                      <div
                        className={page === "home" ? "dashboard-columns" : ""}
                      >
                        <section className="bets-section">
                          <div className="section-title">
                            <h2>
                              {page === "home" ? "In the mix" : "The lineup"}{" "}
                              <span className="count-pill">
                                {filtered.length}
                              </span>
                            </h2>
                            {page === "home" ? (
                              <button
                                className="text-btn"
                                onClick={() => navigate("bets")}
                              >
                                View all <ArrowRight size={16} />
                              </button>
                            ) : (
                              <div className="tabs">
                                {[
                                  ["active", "Active"],
                                  ["invites", "Invitations"],
                                  ["history", "History"],
                                ].map(([v, l]) => (
                                  <button
                                    key={v}
                                    className={filter === v ? "selected" : ""}
                                    onClick={() => setFilter(v)}
                                  >
                                    {l}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="bet-tools">
                            <div className="category-filters">
                              {categories.map((c) => (
                                <button
                                  key={c}
                                  className={category === c ? "selected" : ""}
                                  onClick={() => setCategory(c)}
                                >
                                  {c === "All bets" ? "✳" : categoryEmoji[c]}{" "}
                                  {c}
                                </button>
                              ))}
                            </div>
                            {page === "bets" && (
                              <label className="search-input">
                                <Search size={16} />
                                <input
                                  aria-label="Search bets"
                                  placeholder="Find a friendly wager…"
                                  value={search}
                                  onChange={(e) => setSearch(e.target.value)}
                                />
                              </label>
                            )}
                          </div>
                          {filtered.length ? (
                            <div className="bet-grid">
                              {filtered.map(betCard)}
                            </div>
                          ) : (
                            <Empty title="Your next good story starts here.">
                              <p>
                                {search
                                  ? "No bets match that search. Try another word."
                                  : "Create a bet, invite your people, and see who calls it."}
                              </p>
                              <button
                                className="primary-btn"
                                onClick={() => setModal("create")}
                              >
                                <Plus size={16} /> Create a bet
                              </button>
                            </Empty>
                          )}
                        </section>
                        {page === "home" && (
                          <aside className="right-column">
                            <section className="circle-panel">
                              <div className="section-title">
                                <h2>Your people</h2>
                                <button
                                  className="icon-button"
                                  onClick={() => setModal("invite")}
                                  aria-label="Invite a friend"
                                >
                                  <Plus size={17} />
                                </button>
                              </div>
                              {friends.slice(0, 4).map((f) => {
                                const net =
                                  directionalBalance(f.id, "owed") -
                                  directionalBalance(f.id, "owe");
                                return (
                                  <button
                                    className="friend-mini"
                                    key={f.id}
                                    onClick={() => navigate("balances")}
                                  >
                                    <Avatar person={f} />
                                    <span>
                                      <strong>{f.display_name}</strong>
                                      <small>
                                        {net === 0
                                          ? "All squared up"
                                          : net > 0
                                            ? `${credits(net)} cr ahead overall`
                                            : `${credits(-net)} cr behind overall`}
                                      </small>
                                    </span>
                                    {net === 0 ? (
                                      <Check size={15} className="muted" />
                                    ) : (
                                      <ArrowUpRight
                                        size={15}
                                        className="muted"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                              {!friends.length && (
                                <p className="muted">
                                  Your people belong here. Invite your first
                                  friend.
                                </p>
                              )}
                              <button
                                className="invite-outline"
                                onClick={() => setModal("invite")}
                              >
                                <Link2 size={16} /> Invite your people
                              </button>
                            </section>
                            <section className="idea-panel">
                              <span className="eyebrow">
                                <Sparkles size={14} /> LITTLE BET, BIG ENERGY
                              </span>
                              <span className="idea-emoji">🍕</span>
                              <h3>
                                “Bet I can guess
                                <br />
                                your pizza order.”
                              </h3>
                              <p>Not every bet needs a scoreboard.</p>
                              <button
                                className="text-btn"
                                onClick={() => setModal("create")}
                              >
                                Make your own <ArrowUpRight size={15} />
                              </button>
                            </section>
                            {pendingCount > 0 && (
                              <button
                                className="inbox-nudge"
                                onClick={() => navigate("activity")}
                              >
                                <span className="stat-icon peach">
                                  <Bell size={18} />
                                </span>
                                <div>
                                  <strong>
                                    {pendingCount}{" "}
                                    {pendingCount === 1 ? "thing" : "things"}{" "}
                                    for you
                                  </strong>
                                  <small>
                                    Requests, results & settlement notes
                                  </small>
                                </div>
                                <ChevronRight size={16} />
                              </button>
                            )}
                          </aside>
                        )}
                      </div>
                    </>
                  )}
                  {page === "friends" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">BETTER TOGETHER</span>
                          <h1>Your people. Your circle.</h1>
                          <p>
                            For friends, family, coworkers, and your favorite
                            rivals.
                          </p>
                        </div>
                        <button
                          className="primary-btn"
                          onClick={() => setModal("invite")}
                        >
                          <Plus size={18} /> Add a friend
                        </button>
                      </div>
                      <div className="friend-invite-strip">
                        <div>
                          <Link2 size={25} />
                          <div>
                            <h3>Good times are one invite away.</h3>
                            <p>
                              Share your personal link or scan your QR code to
                              connect.
                            </p>
                          </div>
                        </div>
                        <button
                          className="dark-btn"
                          onClick={() => setModal("invite")}
                        >
                          Your friend code <ArrowRight size={16} />
                        </button>
                      </div>
                      {requests.length > 0 && (
                        <section className="panel">
                          <h2>
                            Friend requests{" "}
                            <span className="count-pill">
                              {requests.length}
                            </span>
                          </h2>
                          {requests.map((r) => (
                            <div className="request-row" key={r.id}>
                              <Avatar person={person(r.sender_id)} />
                              <div>
                                <strong>
                                  {person(r.sender_id)?.display_name}
                                </strong>
                                <p>@{person(r.sender_id)?.handle}</p>
                              </div>
                              <button
                                className="small-btn"
                                disabled={busy}
                                onClick={() =>
                                  action(
                                    "respond_friend",
                                    { id: r.id, accept: true },
                                    "Friend added!",
                                  )
                                }
                              >
                                Accept
                              </button>
                              <button
                                className="small-btn secondary"
                                disabled={busy}
                                onClick={() =>
                                  action(
                                    "respond_friend",
                                    { id: r.id, accept: false },
                                    "Request declined",
                                  )
                                }
                              >
                                Decline
                              </button>
                            </div>
                          ))}
                        </section>
                      )}
                      <div className="section-title">
                        <h2>
                          The usual suspects{" "}
                          <span className="count-pill">{friends.length}</span>
                        </h2>
                      </div>
                      <div className="friends-grid">
                        {friends.map((f) => (
                          <article className="friend-card" key={f.id}>
                            <Avatar person={f} size="large" />
                            <h3>{f.display_name}</h3>
                            <span className="muted">@{f.handle}</span>
                            <p>
                              {f.bio || "Always up for a friendly challenge."}
                            </p>
                            <div className="friend-balance">
                              <span>
                                You owe{" "}
                                <b>
                                  {credits(directionalBalance(f.id, "owe"))} cr
                                </b>
                              </span>
                              <span>
                                Owes you{" "}
                                <b>
                                  {credits(directionalBalance(f.id, "owed"))} cr
                                </b>
                              </span>
                            </div>
                            <button
                              className="secondary-btn"
                              onClick={() => setModal("create")}
                            >
                              Make a bet <ArrowUpRight size={15} />
                            </button>
                          </article>
                        ))}
                      </div>
                      {!friends.length && (
                        <Empty
                          icon={<Users />}
                          title="Your circle starts with one friend."
                        >
                          <p>
                            Send your personal invite, or enter a friend’s code.
                          </p>
                          <button
                            className="primary-btn"
                            onClick={() => setModal("invite")}
                          >
                            Add a friend
                          </button>
                        </Empty>
                      )}
                      {state.friendships.some(
                        (f) => f.sender_id === myId && f.status === "pending",
                      ) && (
                        <section className="panel">
                          <h2>Sent requests</h2>
                          {state.friendships
                            .filter(
                              (f) =>
                                f.sender_id === myId && f.status === "pending",
                            )
                            .map((f) => (
                              <div className="request-row" key={f.id}>
                                <Avatar person={person(f.recipient_id)} />
                                <div>
                                  <strong>
                                    {person(f.recipient_id)?.display_name ||
                                      "Friend request"}
                                  </strong>
                                  <p>Waiting for them to accept</p>
                                </div>
                                <span className="status status-amber">
                                  Pending
                                </span>
                              </div>
                            ))}
                        </section>
                      )}
                    </>
                  )}
                  {page === "balances" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">
                            GOOD FRIENDS KEEP GOOD TABS
                          </span>
                          <h1>All square feels good.</h1>
                          <p>
                            One place for who owes who. No money moves through
                            SideBet.
                          </p>
                        </div>
                        <button
                          className="secondary-btn"
                          onClick={() => setModal("help")}
                        >
                          <CircleHelp size={17} /> How it works
                        </button>
                      </div>
                      <div className="balance-summary">
                        <article className="balance-card balance-owed">
                          <span>
                            <ArrowDownLeft size={19} /> You’re owed
                          </span>
                          <strong>
                            {credits(owed)}
                            <small> credits</small>
                          </strong>
                          <p>Waiting to come back your way.</p>
                        </article>
                        <article className="balance-card balance-owe">
                          <span>
                            <ArrowUpRight size={19} /> You owe
                          </span>
                          <strong>
                            {credits(owe)}
                            <small> credits</small>
                          </strong>
                          <p>A few friendly tabs to take care of.</p>
                        </article>
                        <article className="balance-explainer">
                          <Handshake size={30} />
                          <h3>Paid them back?</h3>
                          <p>
                            Send a payment note. Your friend confirms, and the
                            IOU updates. That’s it.
                          </p>
                        </article>
                      </div>
                      {pendingSettlements.length > 0 && (
                        <section className="panel">
                          <h2>Payment notes to confirm</h2>
                          {pendingSettlements.map((s) => (
                            <div className="settlement-request" key={s.id}>
                              <div className="request-row">
                                <Avatar person={person(s.debtor_id)} />
                                <div>
                                  <strong>
                                    {person(s.debtor_id)?.display_name} marked{" "}
                                    {credits(s.amount)} credits paid
                                  </strong>
                                  <p>Via {s.method}</p>
                                </div>
                              </div>
                              <p className="payment-note">“{s.note}”</p>
                              <div className="inline-actions">
                                <button
                                  className="small-btn"
                                  disabled={busy}
                                  onClick={() =>
                                    action(
                                      "respond_settlement",
                                      { id: s.id, accept: true },
                                      "Accepted. The IOU is updated.",
                                    )
                                  }
                                >
                                  Accept
                                </button>
                                <button
                                  className="small-btn secondary"
                                  disabled={busy}
                                  onClick={() =>
                                    action(
                                      "respond_settlement",
                                      { id: s.id, accept: false },
                                      "Declined. Balance unchanged.",
                                    )
                                  }
                                >
                                  Decline
                                </button>
                              </div>
                            </div>
                          ))}
                        </section>
                      )}
                      <section className="panel">
                        <div className="section-title">
                          <h2>Between friends</h2>
                          <span className="muted">Credits, not cash</span>
                        </div>
                        {balancePeers.length ? (
                          balancePeers.map((f) => {
                            const debt = directionalBalance(f.id, "owe"),
                              credit = directionalBalance(f.id, "owed");
                            const pending = state.settlements
                              .filter(
                                (s) =>
                                  s.debtor_id === myId &&
                                  s.creditor_id === f.id &&
                                  s.status === "pending",
                              )
                              .reduce((n, s) => n + Number(s.amount), 0);
                            return (
                              <div className="balance-row" key={f.id}>
                                <Avatar person={f} />
                                <div className="balance-person">
                                  <strong>{f.display_name}</strong>
                                  <small>
                                    {pending > 0
                                      ? `${credits(pending)} credits awaiting confirmation`
                                      : `@${f.handle}`}
                                  </small>
                                </div>
                                <div className="balance-numbers">
                                  <span>
                                    You owe <strong>{credits(debt)} cr</strong>
                                  </span>
                                  <span>
                                    Owes you{" "}
                                    <strong>{credits(credit)} cr</strong>
                                  </span>
                                </div>
                                {debt - pending > 0 ? (
                                  <button
                                    className="small-btn"
                                    onClick={() => {
                                      setSettleFriend(f.id);
                                      setModal("settle");
                                    }}
                                  >
                                    Mark paid <ArrowUpRight size={14} />
                                  </button>
                                ) : (
                                  <span className="settled-label">
                                    {pending > 0 ? (
                                      <>
                                        <Clock3 size={15} /> Note sent
                                      </>
                                    ) : debt === 0 && credit === 0 ? (
                                      <>
                                        <Check size={15} /> All square
                                      </>
                                    ) : (
                                      "Waiting on them"
                                    )}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <Empty icon={<Wallet />} title="A clean slate.">
                            <p>
                              Balances appear after you and your friends confirm
                              a bet’s result.
                            </p>
                          </Empty>
                        )}
                      </section>
                      <section className="panel">
                        <h2>Payment note history</h2>
                        {state.settlements.length ? (
                          state.settlements
                            .slice()
                            .sort((a, b) =>
                              b.created_at.localeCompare(a.created_at),
                            )
                            .map((s) => (
                              <div className="history-row" key={s.id}>
                                <span
                                  className={`stat-icon ${s.status === "accepted" ? "green" : s.status === "declined" ? "peach" : "lavender"}`}
                                >
                                  {s.status === "accepted" ? (
                                    <Check size={18} />
                                  ) : s.status === "declined" ? (
                                    <X size={18} />
                                  ) : (
                                    <Clock3 size={18} />
                                  )}
                                </span>
                                <div>
                                  <strong>
                                    {s.debtor_id === myId
                                      ? "You"
                                      : person(s.debtor_id)?.display_name}{" "}
                                    →{" "}
                                    {s.creditor_id === myId
                                      ? "you"
                                      : person(s.creditor_id)?.display_name}
                                  </strong>
                                  <p>{s.note}</p>
                                  <small>
                                    {s.method} · {dateLabel(s.created_at)}
                                  </small>
                                </div>
                                <div className="history-amount">
                                  <strong>{credits(s.amount)} cr</strong>
                                  <span
                                    className={`status status-${s.status === "pending" ? "amber" : s.status === "declined" ? "gray" : "green"}`}
                                  >
                                    {s.status}
                                  </span>
                                </div>
                              </div>
                            ))
                        ) : (
                          <p className="muted">
                            No payment notes yet. When you mark a tab paid, it
                            will appear here.
                          </p>
                        )}
                      </section>
                      <section className="panel">
                        <h2>Where your credits came from</h2>
                        {state.obligations.length ? (
                          state.obligations.map((o) => (
                            <button
                              className="ledger-row"
                              key={o.id}
                              onClick={() => setSelected(o.bet_id)}
                            >
                              <div>
                                <strong>
                                  {state.bets.find((b) => b.id === o.bet_id)
                                    ?.title || "Confirmed bet"}
                                </strong>
                                <small>
                                  {person(o.debtor_id)?.display_name} owes{" "}
                                  {person(o.creditor_id)?.display_name}
                                </small>
                              </div>
                              <div>
                                <strong>{credits(o.remaining)} cr left</strong>
                                <small>Originally {credits(o.amount)} cr</small>
                              </div>
                              <ChevronRight size={16} />
                            </button>
                          ))
                        ) : (
                          <p className="muted">
                            Confirmed outcomes will create a clear record here.
                          </p>
                        )}
                      </section>
                    </>
                  )}
                  {page === "activity" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">YOU’RE UP</span>
                          <h1>A little back-and-forth.</h1>
                          <p>
                            Friend requests, bet invitations, results, and
                            payment notes.
                          </p>
                        </div>
                        <button
                          className="secondary-btn"
                          onClick={() => void refresh()}
                        >
                          <RefreshCw size={16} /> Refresh
                        </button>
                      </div>
                      <section className="panel inbox-panel">
                        {pendingCount ? (
                          requestsPanel()
                        ) : (
                          <Empty icon={<Check />} title="You’re all caught up.">
                            <p>
                              We’ll put anything that needs your attention right
                              here.
                            </p>
                          </Empty>
                        )}
                      </section>
                    </>
                  )}
                  {page === "profile" && (
                    <>
                      <div className="page-heading">
                        <div>
                          <span className="eyebrow">
                            THE PERSON BEHIND THE PREDICTIONS
                          </span>
                          <h1>Your corner of the circle.</h1>
                          <p>
                            A familiar face. A memorable handle. A friendly
                            reputation.
                          </p>
                        </div>
                      </div>
                      <div className="profile-grid">
                        <section className="profile-summary panel">
                          <Avatar person={me} size="huge" />
                          <h2>{me?.display_name}</h2>
                          <span className="muted">@{me?.handle}</span>
                          <p>
                            {me?.bio ||
                              "Add a bio and let your people know what you’re about."}
                          </p>
                          <div className="profile-stats">
                            <div>
                              <strong>{friends.length}</strong>
                              <span>friends</span>
                            </div>
                            <div>
                              <strong>{resolved.length}</strong>
                              <span>finished bets</span>
                            </div>
                            <div>
                              <strong>{wins}</strong>
                              <span>good calls</span>
                            </div>
                          </div>
                          <button
                            className="secondary-btn"
                            onClick={() => setModal("invite")}
                          >
                            <Link2 size={16} /> Share your profile
                          </button>
                        </section>
                        <section className="panel">
                          <h2>Make yourself at home.</h2>
                          <form
                            className="form-stack"
                            key={me?.id}
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              await action(
                                "update_profile",
                                Object.fromEntries(f),
                                "Profile updated",
                              );
                            }}
                          >
                            <label>
                              Display name
                              <input
                                name="display_name"
                                defaultValue={me?.display_name}
                                required
                                minLength={2}
                                maxLength={40}
                              />
                            </label>
                            <label>
                              Username
                              <span className="field-hint">
                                3–32 letters, numbers, or underscores. Friends
                                can use this to find you.
                              </span>
                              <input
                                name="handle"
                                defaultValue={me?.handle}
                                required
                                pattern="[a-zA-Z0-9_]{3,32}"
                                minLength={3}
                                maxLength={32}
                              />
                            </label>
                            <label>
                              A little about you
                              <textarea
                                name="bio"
                                defaultValue={me?.bio}
                                placeholder="Competitive about board games. Bad at keeping a poker face."
                                maxLength={180}
                                rows={3}
                              />
                            </label>
                            <fieldset className="color-field">
                              <legend>Your color</legend>
                              {avatarColors.map((c) => (
                                <label
                                  className="color-choice"
                                  style={{ background: c }}
                                  key={c}
                                >
                                  <input
                                    type="radio"
                                    name="avatar_color"
                                    value={c}
                                    defaultChecked={
                                      me?.avatar_color === c ||
                                      (!avatarColors.includes(
                                        me?.avatar_color || "",
                                      ) &&
                                        c === avatarColors[0])
                                    }
                                  />
                                  <span>
                                    <Check size={16} />
                                  </span>
                                  <span className="sr-only">{c}</span>
                                </label>
                              ))}
                            </fieldset>
                            <button className="primary-btn" disabled={busy}>
                              {busy ? "Saving…" : "Save profile"}{" "}
                              <Check size={16} />
                            </button>
                          </form>
                        </section>
                      </div>
                      <section className="panel account-panel">
                        <div>
                          <h3>
                            {mode === "demo"
                              ? "This is your demo playground."
                              : "Your account"}
                          </h3>
                          <p>
                            {mode === "demo"
                              ? "Demo changes stay in this browser. Create an account to connect with real friends."
                              : "Your bets and balances are saved to your Supabase account."}
                          </p>
                        </div>
                        {mode === "demo" ? (
                          <>
                            <button
                              className="secondary-btn"
                              onClick={() => {
                                resetDemo();
                                setState(getDemoSnapshot());
                                setToast("Demo reset to the starting lineup");
                              }}
                            >
                              Reset demo
                            </button>
                            <button
                              className="primary-btn"
                              onClick={() => openAuth("signup")}
                            >
                              Create account
                            </button>
                            <button
                              className="text-btn"
                              onClick={() => {
                                sessionStorage.removeItem("sidebet_demo");
                                enterMode("landing");
                              }}
                            >
                              Leave demo
                            </button>
                          </>
                        ) : (
                          <button
                            className="secondary-btn"
                            onClick={async () => {
                              const { error: e } =
                                await supabase.auth.signOut();
                              if (e) setError(e.message);
                              else {
                                enterMode("landing");
                              }
                            }}
                          >
                            <LogOut size={16} /> Sign out
                          </button>
                        )}
                      </section>
                    </>
                  )}
                  <footer className="app-footer">
                    <span>
                      <Dices size={16} /> Good friends. Great rivalries.
                    </span>
                    <button onClick={() => setModal("help")}>
                      Credits only. Always friendly. <CircleHelp size={13} />
                    </button>
                  </footer>
                </>
              )}
            </main>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal === "auth" && (
        <Modal
          title={
            authMode === "confirm"
              ? "Check your email—or log in."
              : authMode === "signup"
                ? "Your people are waiting."
                : authMode === "login"
                  ? "Welcome back."
                  : authMode === "recovery"
                    ? "Choose a new password."
                    : "Let’s get you back in."
          }
          subtitle={
            authMode === "confirm"
              ? "New account? Confirm your email to join your circle."
              : authMode === "signup"
                ? "Make your profile. Find your friends. Call your shot."
                : authMode === "login"
                  ? "Time to see who called it."
                  : "We’ll help you get back to your circle."
          }
          onClose={close}
        >
          <form
            key={authMode}
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                authInFlight.current ||
                (authMode === "confirm" && resendSeconds > 0)
              )
                return;
              authInFlight.current = true;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setAuthError("");
              setAuthInfo("");
              try {
                const email = String(f.get("email") || "").trim();
                setAuthEmail(email);
                const password = String(f.get("password") || "");
                const redirect = `${location.origin}${location.pathname}`;
                if (authMode === "signup") {
                  if (inviteCode)
                    localStorage.setItem("sidebet_pending_invite", inviteCode);
                  const { data, error: e } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                      data: {
                        display_name: String(f.get("display_name")).trim(),
                      },
                      emailRedirectTo: redirect,
                    },
                  });
                  if (e) throw e;
                  if (data.session) {
                    setModal(null);
                  } else {
                    pauseResend(email);
                    setAuthMode("confirm");
                  }
                } else if (authMode === "login") {
                  const { error: e } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                  });
                  if (e) throw e;
                  setModal(null);
                } else if (authMode === "confirm") {
                  const { error: e } = await supabase.auth.resend({
                    type: "signup",
                    email,
                    options: { emailRedirectTo: redirect },
                  });
                  if (e) throw e;
                  pauseResend(email);
                  setAuthInfo(
                    "Confirmation requested. If this address has an unconfirmed account, a new link is on its way. Already confirmed? Log in below.",
                  );
                } else if (authMode === "reset") {
                  const { error: e } =
                    await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: redirect,
                    });
                  if (e) throw e;
                  setAuthInfo(
                    "If an account exists for this email, you’ll receive a password reset link.",
                  );
                } else {
                  const { error: e } = await supabase.auth.updateUser({
                    password,
                  });
                  if (e) throw e;
                  recovering.current = false;
                  setToast("Password updated");
                  setModal(null);
                  consumeInvite();
                }
              } catch (e) {
                setAuthError(authErrorMessage(e));
                if (
                  authMode === "login" &&
                  authErrorCode(e) === "email_not_confirmed"
                )
                  setAuthMode("confirm");
                const wait = resendWaitSeconds(e);
                if (wait) pauseResend(authEmail, wait);
              } finally {
                authInFlight.current = false;
                setBusy(false);
              }
            }}
          >
            {inviteCode && (
              <div className="info-box">
                <Users size={17} /> Your friend’s invitation is saved in this
                browser. After you log in, you can send your friend request.
              </div>
            )}
            {authMode === "confirm" && (
              <div className="confirmation-help" role="status">
                <p>
                  <strong>If this email is new:</strong> look for a confirmation
                  link from SideBet. Check spam or junk, and make sure the
                  address below is your own working mailbox.
                </p>
                <p>
                  <strong>Already created an account?</strong> Log in with your
                  original password. Signing up again won’t send a new
                  confirmation for an account that is already confirmed.
                </p>
              </div>
            )}
            {authMode === "signup" && (
              <label>
                What should we call you?
                <input
                  name="display_name"
                  placeholder="Your name"
                  required
                  minLength={2}
                  maxLength={40}
                  autoComplete="name"
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                />
              </label>
            )}
            {authMode !== "recovery" && (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  maxLength={254}
                />
              </label>
            )}
            {authMode !== "reset" && authMode !== "confirm" && (
              <label>
                {authMode === "recovery" ? "New password" : "Password"}
                <input
                  name="password"
                  type="password"
                  placeholder={
                    authMode === "signup"
                      ? "At least 10 characters"
                      : "Your password"
                  }
                  required
                  minLength={authMode === "login" ? 1 : 10}
                  maxLength={128}
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                />
              </label>
            )}
            {authError && (
              <div className="form-error" role="alert">
                {authError}
              </div>
            )}
            {authInfo && (
              <div className="info-box" role="status">
                {authInfo}
              </div>
            )}
            <button
              className="primary-btn full-width"
              disabled={busy || (authMode === "confirm" && resendSeconds > 0)}
            >
              {busy
                ? "One moment…"
                : authMode === "confirm"
                  ? resendSeconds > 0
                    ? `Resend available in ${resendSeconds}s`
                    : "Resend confirmation email"
                  : authMode === "signup"
                    ? "Create your account"
                    : authMode === "login"
                      ? "Log in"
                      : authMode === "reset"
                        ? "Send reset link"
                        : "Update password"}
              <ArrowRight size={17} />
            </button>
            {authMode === "confirm" && (
              <>
                <button
                  type="button"
                  className="secondary-btn full-width"
                  disabled={busy}
                  onClick={() => openAuth("login")}
                >
                  Already confirmed? Log in <ArrowRight size={17} />
                </button>
                <button
                  type="button"
                  className="text-btn centered"
                  disabled={busy}
                  onClick={() => openAuth("signup")}
                >
                  Wrong email? Start again with a different address
                </button>
              </>
            )}
            {authMode === "login" && (
              <button
                type="button"
                className="text-btn centered"
                disabled={busy}
                onClick={() => {
                  setAuthMode("reset");
                  setAuthError("");
                  setAuthInfo("");
                }}
              >
                Forgot password?
              </button>
            )}
            {authMode === "login" && (
              <button
                type="button"
                className="text-btn centered"
                disabled={busy}
                onClick={() => {
                  setAuthMode("confirm");
                  setAuthNow(Date.now());
                  setAuthError("");
                  setAuthInfo("");
                }}
              >
                Need another confirmation email?
              </button>
            )}
            {authMode !== "confirm" && (
              <p className="auth-switch">
                {authMode === "signup"
                  ? "Already in the circle? "
                  : authMode === "login"
                    ? "New around here? "
                    : "Remember your password? "}
                <button
                  type="button"
                  className="text-btn"
                  disabled={busy}
                  onClick={() => {
                    setAuthMode(
                      authMode === "signup" || authMode === "reset"
                        ? "login"
                        : "signup",
                    );
                    setAuthError("");
                    setAuthInfo("");
                  }}
                >
                  {authMode === "login" ? "Create an account" : "Log in"}
                </button>
              </p>
            )}
            <div className="form-footnote">
              <ShieldCheck size={16} /> Credits track friendly IOUs. SideBet
              doesn’t process payments.
            </div>
          </form>
        </Modal>
      )}
      {modal === "create" && state && (
        <Modal
          title="Got a friendly wager?"
          subtitle="Set it up. Bring your people. Let the friendly rivalry begin."
          onClose={close}
          wide
        >
          <CreateBetForm
            friends={friends}
            busy={busy}
            error={error}
            onInvite={() => setModal("invite")}
            onSubmit={async (payload) => {
              if (
                await action(
                  "create_bet",
                  payload,
                  "Bet created. Your friends are invited!",
                )
              ) {
                setModal(null);
                setCategory("All bets");
                setFilter("active");
                navigate("bets");
              }
            }}
          />
        </Modal>
      )}
      {modal === "invite" && me && (
        <Modal
          title="Your circle starts here."
          subtitle="Good friends make great rivals. Bring yours along."
          onClose={close}
        >
          <div className="invite-content">
            <div className="qr-card">
              <div className="qr-code">
                <QRCodeSVG
                  value={friendLink(me.invite_code || me.handle)}
                  size={148}
                  level="M"
                  title="Scan to connect on SideBet"
                />
              </div>
              <div>
                <Avatar person={me} />
                <h3>{me.display_name}</h3>
                <span>@{me.handle}</span>
                <p>Scan to join my circle.</p>
              </div>
            </div>
            <label className="form-label">YOUR PERSONAL FRIEND CODE</label>
            <div className="code-display">
              <strong>{me.invite_code || me.handle}</strong>
              <button
                className="icon-button"
                aria-label="Copy friend code"
                onClick={() => copy(me.invite_code || me.handle)}
              >
                <Copy size={17} />
              </button>
            </div>
            <div className="share-link">
              <input
                readOnly
                aria-label="Your invite link"
                value={friendLink(me.invite_code || me.handle)}
                onFocus={(e) => e.target.select()}
              />
              <button
                className="small-btn"
                onClick={() => copy(friendLink(me.invite_code || me.handle))}
              >
                <Link2 size={15} /> Copy link
              </button>
            </div>
            <div className="divider">
              <span>OR CONNECT WITH A FRIEND</span>
            </div>
            <form
              className="form-stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const raw = inviteCode.trim();
                let code = raw;
                try {
                  if (raw.includes("#invite/"))
                    code = decodeURIComponent(raw.split("#invite/")[1]);
                } catch {
                  setError(
                    "This invite link is malformed. Enter your friend’s code instead.",
                  );
                  return;
                }
                if (
                  await action(
                    "connect_friend",
                    { code },
                    "Friend request sent. They’ll see it in their inbox.",
                  )
                )
                  setInviteCode("");
              }}
            >
              <label>
                Friend’s code, username, or invite link
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="e.g. josh or a personal invite code"
                  required
                  maxLength={300}
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary-btn" disabled={busy}>
                {busy ? "Sending…" : "Send friend request"}{" "}
                <ArrowUpRight size={16} />
              </button>
            </form>
            {mode === "demo" && (
              <div className="info-box">
                Demo tip: accept Riley’s request in Your circle. Real invite
                links connect real accounts after sign-up.
              </div>
            )}
            <p className="form-footnote">
              <ShieldCheck size={15} /> They’ll accept your request before you
              can invite each other to bets.
            </p>
          </div>
        </Modal>
      )}
      {modal === "settle" && state && (
        <Modal
          title="Made good on your bet?"
          subtitle="Send a note. Your friend confirms. The tab gets smaller."
          onClose={close}
        >
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await action(
                  "send_settlement",
                  {
                    creditor_id: settleFriend,
                    amount: Number(f.get("amount")),
                    method: f.get("method"),
                    note: String(f.get("note")).trim(),
                  },
                  "Payment note sent. Your balance updates when they accept.",
                )
              )
                setModal(null);
            }}
          >
            <div className="settle-to">
              <Avatar person={person(settleFriend)} />
              <div>
                <span>Sending a payment note to</span>
                <strong>{person(settleFriend)?.display_name}</strong>
              </div>
            </div>
            <label>
              Credits you’ve paid off
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                max={Math.max(
                  0,
                  Math.round(
                    (directionalBalance(settleFriend, "owe") -
                      state.settlements
                        .filter(
                          (s) =>
                            s.debtor_id === myId &&
                            s.creditor_id === settleFriend &&
                            s.status === "pending",
                        )
                        .reduce((n, s) => n + Number(s.amount), 0)) *
                      100,
                  ) / 100,
                )}
                defaultValue={
                  Math.round(
                    (directionalBalance(settleFriend, "owe") -
                      state.settlements
                        .filter(
                          (s) =>
                            s.debtor_id === myId &&
                            s.creditor_id === settleFriend &&
                            s.status === "pending",
                        )
                        .reduce((n, s) => n + Number(s.amount), 0)) *
                      100,
                  ) / 100
                }
                required
              />
            </label>
            <label>
              How did you settle up?
              <select name="method">
                <option>Venmo</option>
                <option>Cash</option>
                <option>Cash App</option>
                <option>PayPal</option>
                <option>Zelle</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Leave a note
              <textarea
                name="note"
                placeholder="Just sent you 40 via Venmo for our game-night bet."
                required
                minLength={3}
                maxLength={500}
                rows={3}
              />
            </label>
            <div className="info-box">
              <ShieldCheck size={18} /> This records a payment you already
              arranged. SideBet won’t send money or contact Venmo.
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary-btn" disabled={busy}>
              {busy ? "Sending…" : "Send payment note"} <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="Keep it simple. Keep it friendly."
          subtitle="A little rivalry. A lot of good times."
          onClose={close}
        >
          <div className="help-content">
            <div>
              <span className="step-number">1</span>
              <section>
                <h3>Connect your people.</h3>
                <p>
                  Share your personal friend code, link, or QR. Once your friend
                  accepts, you can invite each other to private bets.
                </p>
              </section>
            </div>
            <div>
              <span className="step-number">2</span>
              <section>
                <h3>Agree on a friendly wager.</h3>
                <p>
                  Everyone chooses a side and agrees to the same credit stake
                  before picks close. No entry fees or deposits. You can change
                  your pick until the deadline or the creator locks it.
                </p>
              </section>
            </div>
            <div>
              <span className="step-number">3</span>
              <section>
                <h3>Call it together.</h3>
                <p>
                  After picks lock, any joined player can propose the result.
                  Every joined player must confirm before IOUs appear. Disagree?
                  Dispute it and discuss in the comments. If nobody picked the
                  winner, nobody owes credits.
                </p>
              </section>
            </div>
            <div>
              <span className="step-number">4</span>
              <section>
                <h3>Settle up on your terms.</h3>
                <p>
                  Each losing player’s stake is split equally between winners,
                  to the nearest hundredth of a credit. Credits have no fixed
                  cash value. Agree together what settling means. Send a note
                  after settling outside SideBet; only the person owed can
                  accept it. Declining leaves the IOU unchanged.
                </p>
              </section>
            </div>
            <div className="info-box">
              The creator can cancel a bet while it is open, before picks have
              been explicitly locked or a result has been proposed. Confirmed
              results and accepted payment notes remain in the history. Demo
              friends don’t act on their own; shared play requires real
              accounts.
            </div>
          </div>
        </Modal>
      )}
      {bet && state && !modal && (
        <Modal
          title={bet.title}
          subtitle={`${bet.category} · Created by ${person(bet.creator_id)?.display_name || "a friend"}`}
          onClose={close}
          wide
        >
          <BetDetail
            bet={bet}
            state={state}
            person={person}
            busy={busy}
            error={error}
            isDemo={mode === "demo"}
            action={action}
            status={statusLabel(bet)}
          />
        </Modal>
      )}
    </>
  );
}

function CreateBetForm({
  friends,
  busy,
  error,
  onInvite,
  onSubmit,
}: {
  friends: Profile[];
  busy: boolean;
  error: string;
  onInvite: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [options, setOptions] = useState(["Yes, absolutely", "Not a chance"]),
    [stake, setStake] = useState(20),
    [selectedFriends, setSelectedFriends] = useState<string[]>([]),
    [choice, setChoice] = useState(0);
  const localDate = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  const [deadline] = useState(localDate(new Date(Date.now() + 86400000)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await onSubmit({
      title: String(f.get("title")).trim(),
      description: String(f.get("description")).trim(),
      category: f.get("category"),
      stake,
      deadline: new Date(String(f.get("deadline"))).toISOString(),
      options: options.map((o) => o.trim()),
      option: options[choice].trim(),
      friend_ids: selectedFriends,
    });
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <label>
        What’s the bet?
        <input
          name="title"
          required
          minLength={5}
          maxLength={120}
          placeholder="Will Josh finally win a game of pickleball?"
        />
      </label>
      <div className="form-columns">
        <label>
          Category
          <select name="category">
            {categories.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option>Other</option>
          </select>
        </label>
        <label>
          Picks close
          <input
            name="deadline"
            type="datetime-local"
            min={localDate(new Date())}
            defaultValue={deadline}
            required
          />
        </label>
      </div>
      <label>
        The ground rules
        <span className="field-hint">
          Make the outcome clear so everyone knows what they’re agreeing to.
        </span>
        <textarea
          name="description"
          required
          minLength={5}
          maxLength={1000}
          placeholder="Best of three this Saturday. The final score decides it. Everyone confirms the result."
          rows={3}
        />
      </label>
      <fieldset>
        <legend>
          The possible outcomes{" "}
          <span className="field-hint">Pick your side, too.</span>
        </legend>
        <div className="outcome-inputs">
          {options.map((o, i) => (
            <label
              key={i}
              className={`outcome-input ${choice === i ? "selected" : ""}`}
            >
              <input
                type="radio"
                name="your_pick"
                checked={choice === i}
                onChange={() => setChoice(i)}
                aria-label={`Choose outcome ${i + 1}`}
              />
              <input
                type="text"
                value={o}
                onChange={(e) =>
                  setOptions(
                    options.map((v, j) => (j === i ? e.target.value : v)),
                  )
                }
                required
                minLength={1}
                maxLength={60}
                aria-label={`Outcome ${i + 1}`}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove outcome ${i + 1}`}
                  onClick={() => {
                    setOptions(options.filter((_, j) => i !== j));
                    setChoice(0);
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </label>
          ))}
        </div>
        {options.length < 6 && (
          <button
            type="button"
            className="text-btn"
            onClick={() => setOptions([...options, ""])}
          >
            <Plus size={15} /> Add an outcome
          </button>
        )}
      </fieldset>
      <div className="stake-picker">
        <div>
          <label htmlFor="stake">A little skin in the game.</label>
          <span>Same credit stake for every person who joins.</span>
        </div>
        <div>
          <input
            id="stake"
            type="number"
            min="1"
            max="10000"
            step="0.01"
            value={stake}
            onChange={(e) => setStake(Number(e.target.value))}
            required
          />
          <span>credits / person</span>
        </div>
      </div>
      <fieldset>
        <legend>
          Who’s in?
          <span className="field-hint">
            Select 1–20 friends. They choose whether to join.
          </span>
        </legend>
        {friends.length ? (
          <div className="friend-picker">
            {friends.map((f) => (
              <label
                key={f.id}
                className={selectedFriends.includes(f.id) ? "selected" : ""}
              >
                <Avatar person={f} size="small" />
                <span>{f.display_name}</span>
                <input
                  type="checkbox"
                  checked={selectedFriends.includes(f.id)}
                  onChange={(e) =>
                    setSelectedFriends(
                      e.target.checked
                        ? [...selectedFriends, f.id]
                        : selectedFriends.filter((x) => x !== f.id),
                    )
                  }
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="info-box">
            Connect with a friend to create your first bet.{" "}
            <button className="text-btn" type="button" onClick={onInvite}>
              Add a friend <ArrowRight size={15} />
            </button>
          </div>
        )}
      </fieldset>
      <div className="form-footnote">
        <ShieldCheck size={17} /> Private to invited friends. No IOUs until
        everyone confirms the result.
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-btn full-width"
        disabled={
          busy || !selectedFriends.length || selectedFriends.length > 20
        }
      >
        {busy ? "Getting the crew together…" : "Create bet & invite friends"}{" "}
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}

function BetDetail({
  bet,
  state,
  person,
  busy,
  error,
  isDemo,
  action,
  status,
}: {
  bet: Bet;
  state: Snapshot;
  person: (id: string) => Profile | undefined;
  busy: boolean;
  error: string;
  isDemo: boolean;
  action: (
    name: Action,
    payload: Record<string, unknown>,
    message?: string,
  ) => Promise<boolean>;
  status: string;
}) {
  const me = state.profile.id;
  const participants = state.participants.filter((p) => p.bet_id === bet.id);
  const joined = participants.filter((p) => p.status === "joined");
  const mine = participants.find((p) => p.user_id === me);
  const open = bet.status === "open" && new Date(bet.deadline) > new Date();
  const canPropose =
    (bet.status === "locked" || (bet.status === "open" && !open)) &&
    mine?.status === "joined" &&
    joined.length >= 2;
  const voted = state.votes.some(
    (v) => v.bet_id === bet.id && v.user_id === me && v.approved,
  );
  const votes = state.votes.filter((v) => v.bet_id === bet.id && v.approved);
  const comments = state.comments.filter((c) => c.bet_id === bet.id);
  const [outcome, setOutcome] = useState(bet.options[0]),
    [cancelConfirm, setCancelConfirm] = useState(false);
  return (
    <div className="bet-detail">
      <div className="detail-banner">
        <span className="detail-emoji">
          {categoryEmoji[bet.category] || "🎲"}
        </span>
        <div>
          <span
            className={`status ${bet.status === "proposed" ? "status-amber" : ""}`}
          >
            <i />
            {status}
          </span>
          <strong>
            {credits(bet.stake)} <small>credits per player</small>
          </strong>
        </div>
        <div>
          <span className="muted">Picks close</span>
          <strong className="date-value">{dateLabel(bet.deadline)}</strong>
        </div>
      </div>
      <section>
        <h3>The ground rules</h3>
        <p className="preserve-whitespace">{bet.description}</p>
        <p className="detail-rule">
          Losing stakes are shared equally among the winning players. Everyone
          confirms the result before any IOUs are recorded.
        </p>
      </section>
      <section>
        <h3>What’s your call?</h3>
        <div className="detail-options">
          {bet.options.map((o) => {
            const players = joined.filter((p) => p.option === o);
            return (
              <button
                key={o}
                disabled={!open || busy || !mine}
                className={`option-card ${mine?.option === o && mine.status === "joined" ? "selected" : ""}`}
                onClick={() =>
                  action(
                    "join_bet",
                    { id: bet.id, option: o },
                    mine?.status === "joined"
                      ? "Your pick is updated"
                      : "You’re in!",
                  )
                }
              >
                <strong>
                  {o}
                  {mine?.option === o && mine.status === "joined" && (
                    <Check size={16} />
                  )}
                </strong>
                <span>
                  {players.length} {players.length === 1 ? "pick" : "picks"}{" "}
                  {players.length > 0 &&
                    "· " +
                      players
                        .map((p) =>
                          p.user_id === me
                            ? "You"
                            : person(p.user_id)?.display_name.split(" ")[0],
                        )
                        .join(", ")}
                </span>
              </button>
            );
          })}
        </div>
        {open && mine?.status === "invited" && (
          <p className="field-hint">
            Choose a side to agree to a {credits(bet.stake)}-credit stake and
            join this bet.
          </p>
        )}
        {open &&
          mine &&
          mine.user_id !== bet.creator_id &&
          mine.status !== "declined" && (
            <button
              className="text-btn"
              disabled={busy}
              onClick={() =>
                action(
                  "decline_bet",
                  { id: bet.id },
                  "You’re sitting this one out.",
                )
              }
            >
              {mine.status === "joined"
                ? "Leave before picks lock"
                : "Sit this one out"}
            </button>
          )}
      </section>
      <section>
        <h3>
          The lineup <span className="count-pill">{participants.length}</span>
        </h3>
        <div className="lineup">
          {participants.map((p) => (
            <div key={p.user_id}>
              <Avatar person={person(p.user_id)} size="small" />
              <span>
                <strong>
                  {p.user_id === me ? "You" : person(p.user_id)?.display_name}
                </strong>
                <small>
                  {p.status === "joined"
                    ? p.option
                    : p.status === "invited"
                      ? "Invited · hasn’t joined"
                      : "Sitting out"}
                </small>
              </span>
              {p.user_id === bet.creator_id && (
                <span className="tiny-label">HOST</span>
              )}
            </div>
          ))}
        </div>
      </section>
      {canPropose && (
        <section className="result-box">
          <h3>So, what happened?</h3>
          <p>Propose the winning outcome. Everyone who joined gets a say.</p>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await action(
                "propose_result",
                { id: bet.id, outcome, note: String(f.get("note")) },
                "Result proposed. Waiting for everyone to confirm.",
              );
            }}
          >
            <label>
              Winning outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {bet.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label>
              How was it decided?
              <textarea
                name="note"
                required
                minLength={3}
                maxLength={500}
                placeholder="Final score, the agreed proof, or what happened."
                rows={2}
              />
            </label>
            <button className="primary-btn" disabled={busy}>
              Propose result <Flag size={16} />
            </button>
          </form>
        </section>
      )}
      {bet.status === "proposed" && (
        <section className="result-box">
          <span className="eyebrow">
            <Flag size={14} /> RESULT TO CONFIRM
          </span>
          <h3>{bet.outcome}</h3>
          <p>{bet.resolution_note}</p>
          <p>
            <strong>
              {votes.length} of {joined.length}
            </strong>{" "}
            players have confirmed.
          </p>
          {mine?.status === "joined" && !voted ? (
            <div className="inline-actions">
              <button
                className="primary-btn"
                disabled={busy}
                onClick={() =>
                  action(
                    "vote_result",
                    { id: bet.id, approve: true },
                    "Result confirmation saved",
                  )
                }
              >
                <Check size={16} /> That’s right
              </button>
              <button
                className="secondary-btn"
                disabled={busy}
                onClick={() =>
                  action(
                    "vote_result",
                    { id: bet.id, approve: false },
                    "Result disputed. Discuss and propose a new outcome.",
                  )
                }
              >
                Dispute result
              </button>
            </div>
          ) : (
            <p className="form-footnote">
              <Clock3 size={16} />{" "}
              {voted
                ? "You’ve confirmed. Waiting for the rest of the crew."
                : "Joined players are confirming this result."}
            </p>
          )}
        </section>
      )}
      {bet.status === "resolved" && (
        <section className="result-box">
          <span className="eyebrow">
            <Trophy size={14} /> EVERYONE CALLED IT
          </span>
          <h3>The result: {bet.outcome}</h3>
          <p>{bet.resolution_note}</p>
          <p>Confirmed by all players. Any credit IOUs are in Settle up.</p>
        </section>
      )}
      {bet.creator_id === me && bet.status === "open" && (
        <div className="host-controls">
          {open && (
            <button
              className="secondary-btn"
              disabled={busy}
              onClick={() =>
                action(
                  "lock_bet",
                  { id: bet.id },
                  "Picks locked. No one can join or change sides now.",
                )
              }
            >
              <Flag size={16} /> Lock picks now
            </button>
          )}
          {!cancelConfirm ? (
            <button
              className="text-btn danger"
              onClick={() => setCancelConfirm(true)}
            >
              Cancel bet
            </button>
          ) : (
            <div className="cancel-confirm">
              <p>Cancel for everyone? No credits will be owed.</p>
              <button
                className="small-btn danger-btn"
                disabled={busy}
                onClick={async () => {
                  if (
                    await action(
                      "cancel_bet",
                      { id: bet.id },
                      "Bet cancelled. No IOUs created.",
                    )
                  )
                    setCancelConfirm(false);
                }}
              >
                Yes, cancel bet
              </button>
              <button
                className="text-btn"
                onClick={() => setCancelConfirm(false)}
              >
                Keep playing
              </button>
            </div>
          )}
        </div>
      )}
      <section className="comments">
        <h3>
          <MessageCircle size={18} /> The friendly back-and-forth{" "}
          <span className="count-pill">{comments.length}</span>
        </h3>
        {comments.length ? (
          comments.map((c) => (
            <div className="comment" key={c.id}>
              <Avatar person={person(c.user_id)} size="small" />
              <div>
                <strong>
                  {person(c.user_id)?.display_name}
                  <small>{dateLabel(c.created_at)}</small>
                </strong>
                <p>{c.body}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">
            A little friendly trash talk? A question about the rules? Start
            here.
          </p>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const body = String(new FormData(form).get("body")).trim();
            if (
              await action("add_comment", { id: bet.id, body }, "Comment added")
            )
              form.reset();
          }}
        >
          <label className="sr-only" htmlFor="comment-body">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            name="body"
            placeholder="Keep it friendly…"
            required
            maxLength={1000}
            rows={2}
          />
          <button className="small-btn" disabled={busy}>
            Post <ArrowUpRight size={14} />
          </button>
        </form>
      </section>
      {isDemo && (
        <div className="info-box">
          You’re playing as Alex in this demo. Sample friends won’t take actions
          on their own. Create a real account for shared play.
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
