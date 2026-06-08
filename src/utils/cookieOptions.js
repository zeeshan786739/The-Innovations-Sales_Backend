const env = require('../config/env')

function parseExpiresInToMs(expiresIn) {
  const match = String(expiresIn).match(/^(\d+)([smhd])$/i)
  if (!match) return 8 * 60 * 60 * 1000

  const value = Number(match[1])
  const unit = match[2].toLowerCase()
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }

  return value * multipliers[unit]
}

function getSessionCookieOptions() {
  const isProduction = env.NODE_ENV === 'production'

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: parseExpiresInToMs(env.JWT_EXPIRES_IN),
  }
}

module.exports = {
  getSessionCookieOptions,
  parseExpiresInToMs,
}
