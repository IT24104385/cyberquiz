// Thin client for the CyberQuiz backend. Holds the JWT, attaches it to every
// request, and exposes one method per endpoint.

export const apiBase = import.meta.env.VITE_API_URL || "http://localhost:4000";

const TOKEN_KEY = "cq_token";
let token = localStorage.getItem(TOKEN_KEY) || null;

export function setToken(t) {
  token = t || null;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
export function getToken() {
  return token;
}

// Resolve a stored avatar path (e.g. "/uploads/x.png") to an absolute URL.
export function avatarSrc(url) {
  if (!url) return null;
  return url.startsWith("http") || url.startsWith("data:") ? url : apiBase + url;
}

async function req(path, { method = "GET", body, multipart = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  const opts = { method, headers };
  if (multipart) {
    opts.body = body; // FormData — let the browser set the boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(apiBase + path, opts);
  } catch (e) {
    throw Object.assign(new Error("Can't reach the server. Is the backend running on " + apiBase + "?"), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || `Request failed (${res.status})`), {
      status: res.status,
      data,
    });
  }
  return data;
}

export const api = {
  health: () => req("/health"),

  // auth
  login: (email, password, name) => req("/auth/login", { method: "POST", body: { email, password, name } }),
  devLogin: (email, name) => req("/auth/dev-login", { method: "POST", body: { email, name } }),
  completeSignup: (username, avatarColor) =>
    req("/auth/complete-signup", { method: "POST", body: { username, avatarColor } }),
  oauthUrl: (provider) => `${apiBase}/auth/${provider}`,

  // me
  me: () => req("/api/me"),
  activity: () => req("/api/me/activity"),
  setDisplayName: (displayName) =>
    req("/api/me/display-name", { method: "PATCH", body: { displayName } }),
  setAvatarColor: (color) => req("/api/me/avatar-color", { method: "PATCH", body: { color } }),
  setAvatar: (dataUrl) => req("/api/me/avatar", { method: "PATCH", body: { dataUrl } }),

  // quizzes
  quizzes: () => req("/api/quizzes"),
  quiz: (id) => req("/api/quizzes/" + id),
  createQuiz: (payload) => req("/api/quizzes", { method: "POST", body: payload }),
  submit: (id, payload) => req("/api/quizzes/" + id + "/submit", { method: "POST", body: payload }),

  // leaderboard
  leaderboard: () => req("/api/leaderboard"),

  // admin
  adminStats: () => req("/api/admin/stats"),
  adminUsers: () => req("/api/admin/users"),
  adminDisableUser: (id) => req(`/api/admin/users/${id}/disable`, { method: "PATCH" }),
  adminEnableUser: (id) => req(`/api/admin/users/${id}/enable`, { method: "PATCH" }),
  adminDeleteUser: (id) => req(`/api/admin/users/${id}`, { method: "DELETE" }),
  adminAddAdmin: (userId) => req("/api/admin/admins", { method: "POST", body: { userId } }),
  adminRemoveAdmin: (id) => req(`/api/admin/admins/${id}`, { method: "DELETE" }),
  adminQuizzes: () => req("/api/admin/quizzes"),
  adminDeleteQuiz: (id) => req(`/api/admin/quizzes/${id}`, { method: "DELETE" }),
};
