const jwt = require("jsonwebtoken");
const config = require("./config");

// stage 'active'     -> fully onboarded session token
// stage 'onboarding' -> short-lived token issued right after OAuth, only
//                       valid for POST /auth/complete-signup.
function sign(user, stage = "active") {
  const ttl = stage === "onboarding" ? "15m" : "7d";
  return jwt.sign({ uid: user.id, stage }, config.jwtSecret, { expiresIn: ttl });
}

function verify(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
