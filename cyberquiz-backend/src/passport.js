const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const config = require("./config");
const { users } = require("./repo");

// Find an existing OAuth identity or create a fresh (username-less) account.
async function findOrCreate(provider, profile) {
  const providerId = String(profile.id);
  const existing = await users.byProvider(provider, providerId);
  if (existing) return existing;
  const email = profile.emails?.[0]?.value || null;
  const displayName = profile.displayName || email?.split("@")[0] || "Player";
  return users.create({ provider, providerId, email, displayName });
}

if (config.googleEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: `${config.backendUrl}/auth/google/callback`,
        scope: ["profile", "email"],
      },
      (_at, _rt, profile, done) => {
        findOrCreate("google", profile).then((u) => done(null, u)).catch(done);
      }
    )
  );
}

if (config.facebookEnabled) {
  passport.use(
    new FacebookStrategy(
      {
        clientID: config.facebook.appId,
        clientSecret: config.facebook.appSecret,
        callbackURL: `${config.backendUrl}/auth/facebook/callback`,
        profileFields: ["id", "displayName", "emails"],
      },
      (_at, _rt, profile, done) => {
        findOrCreate("facebook", profile).then((u) => done(null, u)).catch(done);
      }
    )
  );
}

// Shape a DB user row into the safe object the frontend receives.
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    email: u.email,
    provider: u.provider,
    avatarColor: u.avatar_color,
    avatarUrl: u.avatar_url,
    createdAt: u.created_at,
    lastNameChange: u.last_name_change,
    role: u.role || "user",
    isDisabled: u.is_disabled || false,
  };
}

module.exports = { passport, publicUser, findOrCreate };
