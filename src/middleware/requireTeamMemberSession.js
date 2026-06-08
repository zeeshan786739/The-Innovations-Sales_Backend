const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeUser = require('../utils/sanitizeUser')

async function requireTeamMemberSession(req, res, next) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME]

    if (!token) {
      throw new AppError('Authentication required.', 401)
    }

    let decoded
    try {
      decoded = jwt.verify(token, env.JWT_SECRET)
    } catch {
      throw new AppError('Invalid or expired session.', 401)
    }

    if (!decoded?.sub || decoded.authType !== 'custom') {
      throw new AppError('Invalid or expired session.', 401)
    }

    const memberSnap = await db.collection('users').doc(decoded.sub).get()

    if (!memberSnap.exists) {
      throw new AppError('Invalid or expired session.', 401)
    }

    const member = memberSnap.data()

    if (member.authType !== 'custom' || member.status !== 'active') {
      throw new AppError('Invalid or expired session.', 401)
    }

    req.teamMember = sanitizeUser(memberSnap)
    return next()
  } catch (error) {
    if (error instanceof AppError) {
      return next(error)
    }
    return next(new AppError('Authentication required.', 401))
  }
}

module.exports = requireTeamMemberSession
