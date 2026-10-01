const SUPABASE_URL = "https://rrfiyvflpzegpzrcpdhd.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7M8Q3It7KJvj28_zS1zBJw_8RWc29fF";

const sidebetSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

async function ensureSideBetUser() {
    const {
        data: { session }
    } = await sidebetSupabase.auth.getSession();

    if (session) {
        return session.user;
    }

    const { data, error } =
        await sidebetSupabase.auth.signInAnonymously();

    if (error) {
        console.error("SideBet sign-in failed:", error);
        return null;
    }

    return data.user;
}

window.sidebetSupabase = sidebetSupabase;
window.ensureSideBetUser = ensureSideBetUser;

ensureSideBetUser().then(user => {
    if (user) {
        console.log("SideBet user connected:", user.id);
    }
});