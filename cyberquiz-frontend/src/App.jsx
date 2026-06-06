import React, { useState, useEffect, useRef, useCallback } from "react";
import { api, setToken, getToken, avatarSrc } from "./api.js";

/* ─────────────────────────── shared helpers ─────────────────────────── */
const AVATAR_COLORS = [
  ["#2ce6b0", "#0b5"], ["#5b8cff", "#3457d5"], ["#ff7eb6", "#c44569"],
  ["#ffb454", "#e07b00"], ["#a78bfa", "#6d3bf5"], ["#4dd0e1", "#0288a8"],
];
const RESERVED = new Set([
  "admin", "administrator", "root", "superuser", "superadmin", "user", "users",
  "guest", "test", "tester", "demo", "mod", "moderator", "staff", "system",
  "sysadmin", "support", "helpdesk", "help", "info", "contact", "owner",
  "official", "null", "undefined", "none", "anonymous", "anon", "default",
  "operator", "webmaster", "postmaster", "security", "cyberquiz", "api", "bot",
]);
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
function localUsernameError(raw) {
  const n = (raw || "").trim();
  if (!n) return "Username is required.";
  if (!USERNAME_RE.test(n))
    return "3–20 chars, start with a letter, letters/numbers/_ only.";
  if (RESERVED.has(n.toLowerCase())) return "That username is reserved.";
  return null;
}
const initials = (name) => {
  const p = (name || "?").trim().split(/\s+/);
  return ((p[0]?.[0] || "?") + (p[1]?.[0] || "")).toUpperCase();
};
const fmtTime = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const DAY = 86400000;
const NAME_COOLDOWN = 21 * DAY;

/* ============================== root app ============================== */
export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("login");
  const [onboardName, setOnboardName] = useState("");
  const [toast, setToast] = useState(null);

  // shared data caches
  const [quizzes, setQuizzes] = useState([]);
  const [board, setBoard] = useState([]);
  const [activity, setActivity] = useState({ created: [], scores: [] });

  // quiz-taking state
  const [taking, setTaking] = useState(null);
  const [answers, setAnswers] = useState({});
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);
  const timerRef = useRef(null);
  const answersRef = useRef({});
  const timeLeftRef = useRef(0);
  const takingRef = useRef(null);
  const finishedRef = useRef(false);
  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { takingRef.current = taking; }, [taking]);

  const notify = useCallback((msg, kind = "info") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3400);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [q, lb, act] = await Promise.all([
        api.quizzes(), api.leaderboard(), api.activity(),
      ]);
      setQuizzes(q.quizzes);
      setBoard(lb.leaderboard);
      setActivity(act);
    } catch (e) {
      notify(e.message, "warn");
    }
  }, [notify]);

  /* ----- bootstrap: handle OAuth redirect or restore session ----- */
  useEffect(() => {
    (async () => {
      const hash = window.location.hash.slice(1); // e.g. "auth?token=..."
      const [route, query] = hash.split("?");
      const params = new URLSearchParams(query || "");
      const hashToken = params.get("token");

      if (route === "onboarding" && hashToken) {
        setToken(hashToken);
        setOnboardName(params.get("name") || "");
        history.replaceState(null, "", window.location.pathname);
        setView("onboarding");
        setBooting(false);
        return;
      }
      if (route === "auth-error") {
        history.replaceState(null, "", window.location.pathname);
        notify("Login failed. Please try again.", "warn");
      }
      if (route === "auth" && hashToken) {
        setToken(hashToken);
        history.replaceState(null, "", window.location.pathname);
      }

      if (getToken()) {
        try {
          const { user } = await api.me();
          setUser(user);
          setView("dashboard");
          await loadAll();
        } catch {
          setToken(null);
          setView("login");
        }
      }
      setBooting(false);
    })();
  }, [loadAll, notify]);

  /* ----- timer ----- */
  useEffect(() => {
    if (view === "take" && taking) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { clearInterval(timerRef.current); finishQuiz(true); return 0; }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [view, taking]);

  /* ----- auth actions ----- */
  async function afterAuthToken() {
    const { user } = await api.me();
    setUser(user);
    setView("dashboard");
    await loadAll();
  }

  async function login(email, password, name) {
    const r = await api.login(email, password, name);
    setToken(r.token);
    if (r.stage === "onboarding") {
      setOnboardName(r.user.displayName || name);
      setView("onboarding");
    } else {
      await afterAuthToken();
      notify(`Signed in as @${r.user.username}`, "ok");
    }
  }

  async function completeSignup(username, color) {
    const r = await api.completeSignup(username, color);
    setToken(r.token);
    setUser(r.user);
    setView("dashboard");
    await loadAll();
    notify(`Welcome, @${r.user.username}!`, "ok");
  }

  function logout() {
    setToken(null);
    setUser(null);
    setQuizzes([]); setBoard([]); setActivity({ created: [], scores: [] });
    setView("login");
  }

  /* ----- quiz taking ----- */
  async function startQuiz(id) {
    try {
      const { quiz } = await api.quiz(id);
      finishedRef.current = false;
      setTaking(quiz);
      setAnswers({}); answersRef.current = {};
      setQIndex(0);
      setTimeLeft(quiz.timeLimit); timeLeftRef.current = quiz.timeLimit;
      setResult(null);
      setView("take");
    } catch (e) { notify(e.message, "warn"); }
  }

  async function finishQuiz(timedOut = false) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearInterval(timerRef.current);
    const quiz = takingRef.current;
    if (!quiz) return;
    try {
      const { result } = await api.submit(quiz.id, {
        answers: answersRef.current,
        timeTaken: quiz.timeLimit - timeLeftRef.current,
        timedOut,
      });
      setResult({ quiz, ...result });
      setTaking(null);
      setView("result");
      loadAll();
    } catch (e) {
      notify(e.message, "warn");
      finishedRef.current = false;
    }
  }

  /* ----- create quiz ----- */
  async function publishQuiz(payload) {
    try {
      const { quiz } = await api.createQuiz(payload);
      await loadAll();
      notify(`“${quiz.title}” published!`, "ok");
      setView("browse");
    } catch (e) { notify(e.message, "warn"); }
  }

  /* ----- profile mutations ----- */
  async function changeName(name) {
    try {
      const { user } = await api.setDisplayName(name);
      setUser(user); loadAll();
      notify("Display name updated.", "ok");
      return null;
    } catch (e) { return e.message; }
  }
  async function changeColor(i) {
    try { const { user } = await api.setAvatarColor(i); setUser(user); loadAll(); }
    catch (e) { notify(e.message, "warn"); }
  }
  async function setAvatar(dataUrl) {
    try { const { user } = await api.setAvatar(dataUrl); setUser(user); loadAll(); notify("Profile picture updated.", "ok"); }
    catch (e) { notify(e.message, "warn"); }
  }

  /* ----- render ----- */
  if (booting)
    return (
      <div className="cq-root"><BgFx />
        <div className="cq-loading"><div className="cq-logo-mark" /><span>connecting to cyberquiz…</span></div>
      </div>
    );

  return (
    <div className="cq-root">
      <BgFx />
      {user && <Header user={user} view={view} go={setView} logout={logout} />}
      <main className="cq-main">
        {view === "login" && <Login onLogin={login} notify={notify} />}
        {view === "onboarding" && <Onboarding name={onboardName} onSubmit={completeSignup} />}
        {view === "dashboard" && user && (
          <Dashboard user={user} quizzes={quizzes} board={board} activity={activity}
            go={setView} startQuiz={startQuiz} />
        )}
        {view === "browse" && <Browse quizzes={quizzes} startQuiz={startQuiz} go={setView} />}
        {view === "take" && taking && (
          <Take quiz={taking} qIndex={qIndex} setQIndex={setQIndex} answers={answers}
            setAnswers={setAnswers} timeLeft={timeLeft}
            onFinish={() => finishQuiz(false)}
            onQuit={() => { clearInterval(timerRef.current); setTaking(null); setView("browse"); }} />
        )}
        {view === "result" && result && (
          <Result result={result} go={setView} retake={() => startQuiz(result.quiz.id)} />
        )}
        {view === "create" && <Create onPublish={publishQuiz} go={setView} />}
        {view === "leaderboard" && <Leaderboard board={board} me={user?.username} />}
        {view === "profile" && user && (
          <Profile user={user} activity={activity} onName={changeName}
            onColor={changeColor} onUpload={setAvatar} />
        )}
        {view === "admin" && user && (user.role === "admin" || user.role === "primary_admin") && (
          <AdminPanel me={user} notify={notify} onUserChange={(updated) => {
            if (updated && updated.id === user.id) setUser(updated);
          }} />
        )}
      </main>
      {toast && <div className={"cq-toast cq-toast-" + toast.kind}>{toast.msg}</div>}
    </div>
  );
}

/* ─────────────────────────── presentational ─────────────────────────── */
function BgFx() {
  return (<><div className="cq-grid" /><div className="cq-glow cq-glow-1" /><div className="cq-glow cq-glow-2" /></>);
}

function Avatar({ name, color = 0, url, size = 40 }) {
  const src = avatarSrc(url);
  if (src) return <img className="cq-avatar" src={src} alt="" style={{ width: size, height: size }} />;
  const [c1, c2] = AVATAR_COLORS[(color || 0) % AVATAR_COLORS.length];
  return (
    <div className="cq-avatar cq-avatar-init"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
      {initials(name)}
    </div>
  );
}

function Header({ user, view, go, logout }) {
  const isAdmin = user.role === "admin" || user.role === "primary_admin";
  const nav = [["dashboard", "Dashboard"], ["browse", "Quizzes"], ["leaderboard", "Leaderboard"], ["create", "Create"]];
  return (
    <header className="cq-header">
      <div className="cq-brand" onClick={() => go("dashboard")}>
        <span className="cq-logo-mark" /><span className="cq-brand-text">CYBER<b>QUIZ</b></span>
      </div>
      <nav className="cq-nav">
        {nav.map(([k, l]) => (
          <button key={k} className={"cq-nav-btn" + (view === k ? " active" : "")} onClick={() => go(k)}>{l}</button>
        ))}
        {isAdmin && (
          <button className={"cq-nav-btn cq-admin-btn" + (view === "admin" ? " active" : "")} onClick={() => go("admin")}>
            ⚙ Admin
          </button>
        )}
      </nav>
      <div className="cq-header-right">
        <button className="cq-userchip" onClick={() => go("profile")}>
          <Avatar name={user.displayName} color={user.avatarColor} url={user.avatarUrl} size={30} />
          <span className="cq-userchip-name">{user.displayName}</span>
          {isAdmin && <span className="cq-role-badge">{user.role === "primary_admin" ? "OWNER" : "ADMIN"}</span>}
        </button>
        <button className="cq-icon-btn" title="Sign out" onClick={logout}>⏻</button>
      </div>
    </header>
  );
}

/* ------------------------------- login -------------------------------- */
function Login({ onLogin, notify }) {
  const [health, setHealth] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ ok: false })); }, []);

  const oauth = (p) => { window.location.href = api.oauthUrl(p); };

  const submit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return notify("Enter a valid email.", "warn");
    if (password.length < 6) return notify("Password must be at least 6 characters.", "warn");
    setBusy(true);
    try { await onLogin(email.toLowerCase().trim(), password, name.trim()); }
    catch (e) { notify(e.message, "warn"); } finally { setBusy(false); }
  };

  const googleOn = health?.googleEnabled;
  const fbOn = health?.facebookEnabled;

  return (
    <div className="cq-auth">
      <div className="cq-auth-hero">
        <span className="cq-logo-mark cq-logo-lg" />
        <h1 className="cq-auth-title">CYBER<b>QUIZ</b></h1>
        <p className="cq-auth-sub">Timed multiple-choice challenges in cryptography, security & beyond.
          Build quizzes, climb the leaderboard, prove you know your stuff.</p>
      </div>

      <div className="cq-card cq-auth-card">
        <h2 className="cq-h2">Sign in to continue</h2>

        {(googleOn || fbOn) && (
          <>
            {googleOn && (
              <button className="cq-oauth cq-google" onClick={() => oauth("google")}>
                <GoogleIcon /> Continue with Google
              </button>
            )}
            {fbOn && (
              <button className="cq-oauth cq-fb" onClick={() => oauth("facebook")}>
                <FbIcon /> Continue with Facebook
              </button>
            )}
            <div className="cq-divider"><span>or sign in with email</span></div>
          </>
        )}

        <label className="cq-label">Name <span className="cq-muted" style={{fontSize:11}}>(new accounts only)</span></label>
        <input className="cq-input" value={name} placeholder="Your name"
          onChange={(e) => setName(e.target.value)} />
        <label className="cq-label" style={{marginTop:10}}>Email</label>
        <input className="cq-input" value={email} placeholder="you@example.com" type="email"
          onChange={(e) => setEmail(e.target.value)} />
        <label className="cq-label" style={{marginTop:10}}>Password</label>
        <div style={{position:"relative"}}>
          <input className="cq-input" value={password} placeholder="••••••••"
            type={showPw ? "text" : "password"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            style={{paddingRight:44}} />
          <button type="button" onClick={() => setShowPw(!showPw)}
            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#888",fontSize:13}}>
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
        <button className="cq-btn accent" style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={submit}>
          {busy ? "Signing in…" : "Continue"}
        </button>
        <p className="cq-fineprint" style={{marginTop:10}}>
          New here? Just enter your name, email & a password — your account is created automatically.
        </p>
        {health && !health.ok && (
          <p className="cq-err" style={{ marginTop: 14 }}>Can’t reach the backend. Check VITE_API_URL.</p>
        )}
      </div>
      <div className="cq-secline">🔒 reserved names blocked · unique handles · 3-week name lock · server-side scoring</div>
    </div>
  );
}

/* ---------------------------- onboarding ------------------------------ */
function Onboarding({ name, onSubmit }) {
  const [username, setUsername] = useState(
    (name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)
  );
  const [color, setColor] = useState(0);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const liveErr = localUsernameError(username);

  const finish = async () => {
    setErr(null); setBusy(true);
    try { await onSubmit(username.trim(), color); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="cq-auth">
      <div className="cq-auth-hero">
        <span className="cq-logo-mark cq-logo-lg" />
        <h1 className="cq-auth-title">Almost there</h1>
        <p className="cq-auth-sub">Welcome{name ? `, ${name}` : ""}! Choose a username — it’s permanent
          and shown on quizzes and the leaderboard.</p>
      </div>
      <div className="cq-card cq-auth-card">
        <div className="cq-username-wrap">
          <span className="cq-at">@</span>
          <input className="cq-input cq-username" value={username} placeholder="choose_a_handle"
            onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className={"cq-hint " + (liveErr ? "bad" : "good")}>{liveErr || "✓ Looks good"}</div>
        <label className="cq-label">Pick an avatar colour</label>
        <div className="cq-color-row">
          {AVATAR_COLORS.map((c, i) => (
            <button key={i} className={"cq-color-dot" + (color === i ? " sel" : "")}
              style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }} onClick={() => setColor(i)} />
          ))}
        </div>
        {err && <div className="cq-err">{err}</div>}
        <button className="cq-btn accent" style={{ width: "100%", marginTop: 16 }}
          disabled={!!liveErr || busy} onClick={finish}>{busy ? "Creating…" : "Create account"}</button>
      </div>
    </div>
  );
}

/* ----------------------------- dashboard ------------------------------ */
function Dashboard({ user, quizzes, board, activity, go, startQuiz }) {
  const myScores = activity.scores || [];
  const best = myScores.length ? Math.max(...myScores.map((s) => s.percentage)) : null;
  const myRank = board.findIndex((r) => r.username === user.username);
  const recent = quizzes.slice(0, 3);
  return (
    <div className="cq-page">
      <div className="cq-welcome">
        <Avatar name={user.displayName} color={user.avatarColor} url={user.avatarUrl} size={64} />
        <div>
          <h1 className="cq-h1">Welcome back, {user.displayName}</h1>
          <p className="cq-muted">@{user.username} · {user.provider} account</p>
        </div>
      </div>
      <div className="cq-stat-grid">
        <Stat label="Quizzes taken" value={myScores.length} />
        <Stat label="Best score" value={best === null ? "—" : best + "%"} />
        <Stat label="Leaderboard rank" value={myRank < 0 ? "—" : "#" + (myRank + 1)} />
        <Stat label="Quizzes available" value={quizzes.length} />
      </div>
      <div className="cq-dash-cols">
        <section className="cq-card cq-section">
          <div className="cq-section-head"><h2 className="cq-h2">Jump back in</h2>
            <button className="cq-link" onClick={() => go("browse")}>All quizzes →</button></div>
          <div className="cq-quiz-list">
            {recent.map((q) => (
              <div key={q.id} className="cq-mini-quiz" onClick={() => startQuiz(q.id)}>
                <div><div className="cq-mini-title">{q.title}</div>
                  <div className="cq-muted sm">{q.category} · {q.questionCount} Q · {fmtTime(q.timeLimit)} · by @{q.creator}</div></div>
                <span className="cq-play">▶</span>
              </div>
            ))}
            {recent.length === 0 && <p className="cq-muted">No quizzes yet.</p>}
          </div>
        </section>
        <section className="cq-card cq-section">
          <div className="cq-section-head"><h2 className="cq-h2">Top players</h2>
            <button className="cq-link" onClick={() => go("leaderboard")}>Full board →</button></div>
          {board.length === 0 && <p className="cq-muted">No scores yet. Be the first!</p>}
          <ol className="cq-top-list">
            {board.slice(0, 5).map((r, i) => (
              <li key={r.username} className={r.username === user.username ? "me" : ""}>
                <span className="cq-rank">{["🥇", "🥈", "🥉"][i] || i + 1}</span>
                <span className="cq-top-name">{r.displayName}</span>
                <span className="cq-top-pts">{r.totalPoints} pts</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="cq-cta-row">
        <button className="cq-btn accent lg" onClick={() => go("browse")}>Take a quiz</button>
        <button className="cq-btn ghost lg" onClick={() => go("create")}>+ Create a quiz</button>
      </div>
    </div>
  );
}
function Stat({ label, value }) {
  return <div className="cq-card cq-stat"><div className="cq-stat-value">{value}</div><div className="cq-stat-label">{label}</div></div>;
}

/* ------------------------------- browse ------------------------------- */
function Browse({ quizzes, startQuiz, go }) {
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const cats = ["All", ...Array.from(new Set(quizzes.map((x) => x.category)))];
  const filtered = quizzes.filter((x) =>
    (cat === "All" || x.category === cat) &&
    (x.title.toLowerCase().includes(q.toLowerCase()) ||
     x.creator.toLowerCase().includes(q.toLowerCase()) ||
     (x.description || "").toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="cq-page">
      <div className="cq-page-head"><h1 className="cq-h1">Quiz library</h1>
        <button className="cq-btn accent" onClick={() => go("create")}>+ New quiz</button></div>
      <div className="cq-filters">
        <input className="cq-input cq-search" placeholder="Search by title or creator…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="cq-chips">{cats.map((c) => (
          <button key={c} className={"cq-chip" + (cat === c ? " sel" : "")} onClick={() => setCat(c)}>{c}</button>))}</div>
      </div>
      <div className="cq-grid-cards">
        {filtered.map((quiz) => (
          <div key={quiz.id} className="cq-card cq-quiz-card">
            <div className="cq-tag">{quiz.category}</div>
            <h3 className="cq-quiz-title">{quiz.title}</h3>
            <p className="cq-quiz-desc">{quiz.description}</p>
            <div className="cq-quiz-meta"><span>📝 {quiz.questionCount} questions</span><span>⏱ {fmtTime(quiz.timeLimit)}</span></div>
            <div className="cq-quiz-foot"><span className="cq-creator">by @{quiz.creator}</span>
              <button className="cq-btn accent sm" onClick={() => startQuiz(quiz.id)}>Start</button></div>
          </div>
        ))}
        {filtered.length === 0 && <p className="cq-muted">No quizzes match.</p>}
      </div>
    </div>
  );
}

/* -------------------------------- take -------------------------------- */
function Take({ quiz, qIndex, setQIndex, answers, setAnswers, timeLeft, onFinish, onQuit }) {
  const q = quiz.questions[qIndex];
  const answered = Object.keys(answers).length;
  const last = qIndex === quiz.questions.length - 1;
  const low = timeLeft <= 15;
  const pct = ((qIndex + 1) / quiz.questions.length) * 100;
  const pick = (i) => setAnswers({ ...answers, [qIndex]: i });
  return (
    <div className="cq-page cq-take">
      <div className="cq-take-bar">
        <button className="cq-link" onClick={onQuit}>← Quit</button>
        <div className="cq-take-title">{quiz.title}</div>
        <div className={"cq-timer" + (low ? " low" : "")}>⏱ {fmtTime(timeLeft)}</div>
      </div>
      <div className="cq-progress"><div className="cq-progress-fill" style={{ width: pct + "%" }} /></div>
      <div className="cq-card cq-question-card">
        <div className="cq-qcount">Question {qIndex + 1} of {quiz.questions.length}</div>
        <h2 className="cq-question">{q.q}</h2>
        <div className="cq-options">
          {q.options.map((opt, i) => (
            <button key={i} className={"cq-option" + (answers[qIndex] === i ? " sel" : "")} onClick={() => pick(i)}>
              <span className="cq-option-key">{String.fromCharCode(65 + i)}</span><span>{opt}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="cq-take-foot">
        <button className="cq-btn ghost" disabled={qIndex === 0} onClick={() => setQIndex(qIndex - 1)}>Previous</button>
        <span className="cq-muted sm">{answered}/{quiz.questions.length} answered</span>
        {last ? <button className="cq-btn accent" onClick={onFinish}>Submit quiz</button>
          : <button className="cq-btn accent" onClick={() => setQIndex(qIndex + 1)}>Next</button>}
      </div>
    </div>
  );
}

/* ------------------------------- result ------------------------------- */
function Result({ result, go, retake }) {
  const ring = result.percentage;
  const grade = ring >= 80 ? "Excellent" : ring >= 50 ? "Good effort" : "Keep practising";
  return (
    <div className="cq-page cq-result">
      <div className="cq-card cq-result-card">
        {result.timedOut && <div className="cq-timedout">⏱ Time ran out — auto-submitted</div>}
        <div className="cq-score-ring" style={{ "--pct": ring }}>
          <div className="cq-score-inner"><span className="cq-score-num">{ring}%</span>
            <span className="cq-score-sub">{result.correct}/{result.total}</span></div>
        </div>
        <h1 className="cq-h1">{grade}</h1>
        <p className="cq-muted">You earned <b>{result.points} points</b> · finished in {fmtTime(result.timeTaken)}</p>
        <div className="cq-creator-box">
          <div className="cq-avatar cq-avatar-init" style={{ width: 36, height: 36, fontSize: 14, background: "linear-gradient(135deg,#2ce6b0,#0b5)" }}>CQ</div>
          <div><div className="cq-muted sm">Quiz created by</div><div className="cq-creator-name">@{result.creator}</div></div>
        </div>
        <div className="cq-row center">
          <button className="cq-btn ghost" onClick={retake}>Retake</button>
          <button className="cq-btn accent" onClick={() => go("browse")}>More quizzes</button>
          <button className="cq-btn ghost" onClick={() => go("leaderboard")}>Leaderboard</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- create ------------------------------- */
function Create({ onPublish, go }) {
  const blankQ = () => ({ q: "", options: ["", "", "", ""], correct: 0 });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("Cryptography");
  const [minutes, setMinutes] = useState(5);
  const [questions, setQuestions] = useState([blankQ()]);
  const [err, setErr] = useState(null);

  const setQ = (i, patch) => setQuestions(questions.map((qq, j) => (j === i ? { ...qq, ...patch } : qq)));
  const setOpt = (i, oi, v) => setQuestions(questions.map((qq, j) =>
    j === i ? { ...qq, options: qq.options.map((o, k) => (k === oi ? v : o)) } : qq));

  function publish() {
    setErr(null);
    if (title.trim().length < 4) return setErr("Give the quiz a title (4+ chars).");
    for (let i = 0; i < questions.length; i++) {
      const qq = questions[i];
      if (!qq.q.trim()) return setErr(`Question ${i + 1} has no text.`);
      if (qq.options.filter((o) => o.trim()).length < 2) return setErr(`Question ${i + 1} needs 2+ options.`);
      if (!qq.options[qq.correct]?.trim()) return setErr(`Mark a valid correct answer for question ${i + 1}.`);
    }
    onPublish({
      title: title.trim(), description: desc.trim(), category: category.trim() || "General",
      timeLimit: Math.max(30, Math.round(minutes * 60)),
      questions: questions.map((qq) => {
        const opts = qq.options.map((o) => o.trim()).filter(Boolean);
        return { q: qq.q.trim(), options: opts, correct: Math.min(qq.correct, opts.length - 1) };
      }),
    });
  }

  return (
    <div className="cq-page">
      <div className="cq-page-head"><h1 className="cq-h1">Create a quiz</h1>
        <button className="cq-link" onClick={() => go("browse")}>Cancel</button></div>
      <div className="cq-card cq-section">
        <div className="cq-form-grid">
          <div className="cq-field"><label className="cq-label">Title</label>
            <input className="cq-input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Network Security Basics" /></div>
          <div className="cq-field"><label className="cq-label">Category</label>
            <input className="cq-input" value={category} maxLength={30} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="cq-field"><label className="cq-label">Time limit (minutes)</label>
            <input className="cq-input" type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></div>
          <div className="cq-field full"><label className="cq-label">Description</label>
            <input className="cq-input" value={desc} maxLength={160} onChange={(e) => setDesc(e.target.value)} placeholder="One line about the quiz" /></div>
        </div>
      </div>
      {questions.map((qq, i) => (
        <div key={i} className="cq-card cq-section cq-qedit">
          <div className="cq-section-head"><h3 className="cq-h3">Question {i + 1}</h3>
            {questions.length > 1 && <button className="cq-link danger" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>Remove</button>}</div>
          <input className="cq-input" value={qq.q} placeholder="Question text" onChange={(e) => setQ(i, { q: e.target.value })} />
          <div className="cq-opt-edit-list">
            {qq.options.map((opt, oi) => (
              <label key={oi} className={"cq-opt-edit" + (qq.correct === oi ? " correct" : "")}>
                <input type="radio" name={"correct" + i} checked={qq.correct === oi} onChange={() => setQ(i, { correct: oi })} />
                <span className="cq-opt-key">{String.fromCharCode(65 + oi)}</span>
                <input className="cq-input bare" value={opt} placeholder={`Option ${String.fromCharCode(65 + oi)}`} onChange={(e) => setOpt(i, oi, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="cq-muted sm">Select the radio button next to the correct answer.</div>
        </div>
      ))}
      {err && <div className="cq-err">{err}</div>}
      <div className="cq-row">
        <button className="cq-btn ghost" onClick={() => setQuestions([...questions, blankQ()])}>+ Add question</button>
        <button className="cq-btn accent" onClick={publish}>Publish quiz</button>
      </div>
    </div>
  );
}

/* ----------------------------- leaderboard ---------------------------- */
function Leaderboard({ board, me }) {
  return (
    <div className="cq-page">
      <h1 className="cq-h1">🏆 Global leaderboard</h1>
      <p className="cq-muted">Ranked by total points (best attempt per quiz) across every quiz.</p>
      {board.length === 0 && <div className="cq-card cq-empty">No scores recorded yet — take a quiz to get on the board.</div>}
      <div className="cq-board">
        {board.map((r, i) => (
          <div key={r.username} className={"cq-board-row" + (r.username === me ? " me" : "") + (i < 3 ? " podium" : "")}>
            <div className="cq-board-rank">{["🥇", "🥈", "🥉"][i] || "#" + (i + 1)}</div>
            <Avatar name={r.displayName} color={r.avatarColor} url={r.avatarUrl} size={42} />
            <div className="cq-board-id">
              <div className="cq-board-name">{r.displayName}{r.username === me && <span className="cq-you">YOU</span>}</div>
              <div className="cq-muted sm">@{r.username} · {r.quizzesDone} quizzes · avg {r.avgPercentage}%</div>
            </div>
            <div className="cq-board-pts">{r.totalPoints}<span>pts</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- profile ------------------------------ */
function Profile({ user, activity, onName, onColor, onUpload }) {
  const [name, setName] = useState(user.displayName);
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const last = user.lastNameChange;
  const locked = last && Date.now() - last < NAME_COOLDOWN;
  const daysLeft = locked ? Math.ceil((NAME_COOLDOWN - (Date.now() - last)) / DAY) : 0;
  const best = (activity.scores || []).length ? Math.max(...activity.scores.map((s) => s.percentage)) : null;

  async function save() { setErr(null); const e = await onName(name); if (e) setErr(e); }

  async function onFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErr("Please choose an image file.");
    const small = await downscale(file);
    onUpload(small);
  }

  return (
    <div className="cq-page">
      <h1 className="cq-h1">Your profile</h1>
      <div className="cq-card cq-section cq-profile-top">
        <div className="cq-profile-pic">
          <Avatar name={user.displayName} color={user.avatarColor} url={user.avatarUrl} size={96} />
          <div className="cq-pic-actions">
            <button className="cq-btn ghost sm" onClick={() => fileRef.current.click()}>Upload photo</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
        </div>
        <div className="cq-profile-info">
          <div className="cq-profile-handle">@{user.username}</div>
          <div className="cq-muted">{user.email} · {user.provider}</div>
          <div className="cq-muted sm">Joined {new Date(user.createdAt).toLocaleDateString()}</div>
          {!user.avatarUrl && (<>
            <label className="cq-label" style={{ marginTop: 14 }}>Avatar colour</label>
            <div className="cq-color-row">{AVATAR_COLORS.map((c, i) => (
              <button key={i} className={"cq-color-dot" + (user.avatarColor === i ? " sel" : "")}
                style={{ background: `linear-gradient(135deg, ${c[0]}, ${c[1]})` }} onClick={() => onColor(i)} />))}</div>
          </>)}
        </div>
      </div>
      <div className="cq-card cq-section">
        <h3 className="cq-h3">Display name</h3>
        <p className="cq-muted sm">Changeable once every 3 weeks. Your @username is permanent.</p>
        <div className="cq-row" style={{ marginTop: 10 }}>
          <input className="cq-input" value={name} disabled={locked} maxLength={30} onChange={(e) => setName(e.target.value)} />
          <button className="cq-btn accent" disabled={locked} onClick={save}>Save</button>
        </div>
        {locked && <div className="cq-hint bad">🔒 Locked — available again in {daysLeft} day{daysLeft > 1 ? "s" : ""}.</div>}
        {err && <div className="cq-err">{err}</div>}
      </div>
      <div className="cq-stat-grid">
        <Stat label="Quizzes taken" value={(activity.scores || []).length} />
        <Stat label="Best score" value={best === null ? "—" : best + "%"} />
        <Stat label="Quizzes created" value={(activity.created || []).length} />
      </div>
      {(activity.created || []).length > 0 && (
        <div className="cq-card cq-section">
          <h3 className="cq-h3">Quizzes you created</h3>
          <div className="cq-quiz-list">
            {activity.created.map((q) => (
              <div key={q.id} className="cq-mini-quiz static">
                <div><div className="cq-mini-title">{q.title}</div>
                  <div className="cq-muted sm">{q.category} · {q.questionCount} Q</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function downscale(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = size; c.height = size;
        const ctx = c.getContext("2d");
        const min = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject; img.src = ev.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

/* ─────────────────────────── admin panel ─────────────────────────── */
function AdminPanel({ me, notify, onUserChange }) {
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [userList, setUserList] = useState([]);
  const [quizList, setQuizList] = useState([]);
  const [loading, setLoading] = useState(false);
  const isPrimary = me.role === "primary_admin";

  const loadStats = async () => {
    try { const d = await api.adminStats(); setStats(d); } catch (e) { notify(e.message, "warn"); }
  };
  const loadUsers = async () => {
    try { const d = await api.adminUsers(); setUserList(d.users); } catch (e) { notify(e.message, "warn"); }
  };
  const loadQuizzes = async () => {
    try { const d = await api.adminQuizzes(); setQuizList(d.quizzes); } catch (e) { notify(e.message, "warn"); }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStats(), loadUsers(), loadQuizzes()]).finally(() => setLoading(false));
  }, []);

  const disableUser = async (u) => {
    try {
      const r = await api.adminDisableUser(u.id);
      setUserList((l) => l.map((x) => x.id === u.id ? r.user : x));
      if (r.user.id === me.id) onUserChange(r.user);
      notify(`@${u.username} disabled.`, "ok");
    } catch (e) { notify(e.message, "warn"); }
  };

  const enableUser = async (u) => {
    try {
      const r = await api.adminEnableUser(u.id);
      setUserList((l) => l.map((x) => x.id === u.id ? r.user : x));
      notify(`@${u.username} enabled.`, "ok");
    } catch (e) { notify(e.message, "warn"); }
  };

  const deleteUser = async (u) => {
    if (!confirm(`Delete user @${u.username}? This cannot be undone.`)) return;
    try {
      await api.adminDeleteUser(u.id);
      setUserList((l) => l.filter((x) => x.id !== u.id));
      loadStats();
      notify(`@${u.username} deleted.`, "ok");
    } catch (e) { notify(e.message, "warn"); }
  };

  const makeAdmin = async (u) => {
    try {
      const r = await api.adminAddAdmin(u.id);
      setUserList((l) => l.map((x) => x.id === u.id ? r.user : x));
      loadStats();
      notify(`@${u.username} is now an admin.`, "ok");
    } catch (e) { notify(e.message, "warn"); }
  };

  const removeAdmin = async (u) => {
    if (!confirm(`Remove admin role from @${u.username}?`)) return;
    try {
      const r = await api.adminRemoveAdmin(u.id);
      setUserList((l) => l.map((x) => x.id === u.id ? r.user : x));
      loadStats();
      notify(`@${u.username} demoted to user.`, "ok");
    } catch (e) { notify(e.message, "warn"); }
  };

  const deleteQuiz = async (q) => {
    if (!confirm(`Delete quiz "${q.title}"? This cannot be undone.`)) return;
    try {
      await api.adminDeleteQuiz(q.id);
      setQuizList((l) => l.filter((x) => x.id !== q.id));
      loadStats();
      notify(`"${q.title}" deleted.`, "ok");
    } catch (e) { notify(e.message, "warn"); }
  };

  const roleBadge = (role) => {
    if (role === "primary_admin") return <span style={badgeStyle("#e04040")}>OWNER</span>;
    if (role === "admin") return <span style={badgeStyle("#2ce6b0")}>ADMIN</span>;
    return null;
  };
  const badgeStyle = (color) => ({
    fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: color + "22", color, border: `1px solid ${color}55`,
    borderRadius: 4, padding: "2px 6px", marginLeft: 6,
  });

  const tabs = [["overview", "Overview"], ["users", "Users"], ["quizzes", "Quizzes"]];

  return (
    <div className="cq-page">
      <div className="cq-page-head">
        <h1 className="cq-h1">⚙ Admin Panel</h1>
        <span style={{ fontSize: 13, color: "#888" }}>
          Logged in as {isPrimary ? "Primary Admin (Owner)" : "Admin"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600,
              background: tab === k ? "#2ce6b0" : "#1a2235", color: tab === k ? "#0a0f1a" : "#a0b0c8",
              fontSize: 14, transition: "all .15s",
            }}>
            {l}
          </button>
        ))}
      </div>

      {loading && <p className="cq-muted">Loading…</p>}

      {/* ── Overview ── */}
      {tab === "overview" && stats && (
        <div className="cq-stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>
          <div className="cq-card cq-stat"><div className="cq-stat-value">{stats.totalUsers}</div><div className="cq-stat-label">Total users</div></div>
          <div className="cq-card cq-stat"><div className="cq-stat-value">{stats.disabledUsers}</div><div className="cq-stat-label">Disabled users</div></div>
          <div className="cq-card cq-stat"><div className="cq-stat-value">{stats.adminCount}</div><div className="cq-stat-label">Admins</div></div>
          <div className="cq-card cq-stat"><div className="cq-stat-value">{stats.totalQuizzes}</div><div className="cq-stat-label">Total quizzes</div></div>
          <div className="cq-card cq-stat"><div className="cq-stat-value">{stats.totalScores}</div><div className="cq-stat-label">Total attempts</div></div>
        </div>
      )}

      {/* ── Users ── */}
      {tab === "users" && (
        <div className="cq-card cq-section" style={{ overflowX: "auto" }}>
          <h2 className="cq-h2" style={{ marginBottom: 16 }}>All Users ({userList.length})</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e2d47", color: "#667" }}>
                <th style={th}>User</th>
                <th style={th}>Email</th>
                <th style={th}>Provider</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Joined</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {userList.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #111a2b" }}>
                  <td style={td}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={u.displayName} color={u.avatarColor} url={u.avatarUrl} size={28} />
                      <div>
                        <div style={{ fontWeight: 600, color: "#e0eaf8" }}>{u.displayName}</div>
                        <div style={{ color: "#667", fontSize: 11 }}>@{u.username || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td style={td}>{u.email || "—"}</td>
                  <td style={td}>{u.provider}</td>
                  <td style={td}>
                    {roleBadge(u.role)}
                    {!roleBadge(u.role) && <span style={{ color: "#667" }}>user</span>}
                  </td>
                  <td style={td}>
                    <span style={{ color: u.isDisabled ? "#e04040" : "#2ce6b0", fontWeight: 600, fontSize: 11 }}>
                      {u.isDisabled ? "DISABLED" : "ACTIVE"}
                    </span>
                  </td>
                  <td style={td}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}</td>
                  <td style={td}>
                    {u.id !== me.id && u.role !== "primary_admin" && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {u.isDisabled
                          ? <ABtn color="#2ce6b0" onClick={() => enableUser(u)}>Enable</ABtn>
                          : <ABtn color="#e08020" onClick={() => disableUser(u)}>Disable</ABtn>}
                        <ABtn color="#e04040" onClick={() => deleteUser(u)}>Delete</ABtn>
                        {isPrimary && u.role !== "admin" && (
                          <ABtn color="#5b8cff" onClick={() => makeAdmin(u)}>Make Admin</ABtn>
                        )}
                        {isPrimary && u.role === "admin" && (
                          <ABtn color="#a78bfa" onClick={() => removeAdmin(u)}>Remove Admin</ABtn>
                        )}
                      </div>
                    )}
                    {u.id === me.id && <span style={{ color: "#667", fontSize: 11 }}>You</span>}
                    {u.role === "primary_admin" && u.id !== me.id && <span style={{ color: "#667", fontSize: 11 }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Quizzes ── */}
      {tab === "quizzes" && (
        <div className="cq-card cq-section" style={{ overflowX: "auto" }}>
          <h2 className="cq-h2" style={{ marginBottom: 16 }}>All Quizzes ({quizList.length})</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e2d47", color: "#667" }}>
                <th style={th}>Title</th>
                <th style={th}>Category</th>
                <th style={th}>Creator</th>
                <th style={th}>Questions</th>
                <th style={th}>Created</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quizList.map((q) => (
                <tr key={q.id} style={{ borderBottom: "1px solid #111a2b" }}>
                  <td style={td}><span style={{ color: "#e0eaf8", fontWeight: 600 }}>{q.title}</span></td>
                  <td style={td}>{q.category}</td>
                  <td style={td}>{q.creator || "—"}</td>
                  <td style={td}>{q.questionCount}</td>
                  <td style={td}>{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "—"}</td>
                  <td style={td}>
                    <ABtn color="#e04040" onClick={() => deleteQuiz(q)}>Delete</ABtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { textAlign: "left", padding: "8px 12px", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 };
const td = { padding: "10px 12px", verticalAlign: "middle" };

function ABtn({ color, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "3px 10px", borderRadius: 5, border: `1px solid ${color}55`,
      background: color + "15", color, fontSize: 11, fontWeight: 700,
      cursor: "pointer", letterSpacing: 0.5,
    }}>{children}</button>
  );
}

/* -------------------------------- icons ------------------------------- */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z" />
      <path fill="#4CAF50" d="M24 43.5c5.2 0 10.1-2 13.7-5.3l-6.3-5.3C29.2 34.5 26.7 35.5 24 35.5c-5.3 0-9.7-3.1-11.3-7.5l-6.6 5.1C9.4 39 16.1 43.5 24 43.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.4l6.3 5.3C41.5 35 43.5 30 43.5 24c0-1.2-.1-2.3-.3-3.5z" />
    </svg>
  );
}
function FbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
      <path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7v-3.5h3.1V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9v2.2h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z" />
    </svg>
  );
}
