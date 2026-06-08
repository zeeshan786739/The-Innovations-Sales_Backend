const jwt = require('jsonwebtoken')
const env = require('../config/env')
const teamMemberService = require('../services/teamMemberService')
const AppError = require('../utils/AppError')
const sanitizeUser = require('../utils/sanitizeUser')
const { getSessionCookieOptions } = require('../utils/cookieOptions')

const INVALID_CREDENTIALS = 'Invalid email or password.'

async function loginTeamMember(req, res) {
  const { email, password } = req.validatedBody
  const memberRecord = await teamMemberService.findTeamMemberByEmail(email)

  if (!memberRecord?.profile || memberRecord.profile.authType !== 'custom') {
    throw new AppError(INVALID_CREDENTIALS, 401)
  }

  const { profile, passwordHash } = memberRecord

  if (profile.status !== 'active') {
    throw new AppError(
      'Your account is inactive. Please contact the administrator.',
      403
    )
  }

  const isValidPassword = await teamMemberService.validateTeamMemberPassword(
    password,
    passwordHash
  )

  if (!isValidPassword) {
    throw new AppError(INVALID_CREDENTIALS, 401)
  }

  await teamMemberService.updateLastLoginAt(profile.id)

  const token = jwt.sign(
    {
      sub: profile.id,
      role: profile.role,
      authType: 'custom',
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  )

  res.cookie(env.COOKIE_NAME, token, getSessionCookieOptions())

  const refreshedMember = await teamMemberService.getTeamMemberById(profile.id)

  res.json({
    success: true,
    message: 'Signed in successfully.',
    data: {
      user: sanitizeUser(refreshedMember),
    },
  })
}

async function getCurrentTeamMember(req, res) {
  res.json({
    success: true,
    data: {
      user: req.teamMember,
    },
  })
}

function logoutTeamMember(req, res) {
  res.clearCookie(env.COOKIE_NAME, getSessionCookieOptions())

  res.json({
    success: true,
    message: 'Signed out successfully.',
  })
}

module.exports = {
  loginTeamMember,
  getCurrentTeamMember,
  logoutTeamMember,
}
