const jwt = require('jsonwebtoken')
const env = require('../config/env')
const { firebaseAuth, db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeUser = require('../utils/sanitizeUser')

async function authenticateFirebaseUser(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7).trim()
  if (!token) return null

  let decodedToken
  try {
    decodedToken = await firebaseAuth.verifyIdToken(token)
  } catch {
    throw new AppError('Your session has expired. Please sign in again.', 401)
  }

  const profileSnap = await db.collection('users').doc(decodedToken.uid).get()
  if (!profileSnap.exists) {
    throw new AppError('Your session has expired. Please sign in again.', 401)
  }

  const profile = profileSnap.data()
  if (profile.status !== 'active') {
    throw new AppError('Your session has expired. Please sign in again.', 401)
  }

  const user = sanitizeUser(profileSnap)
  return {
    ...user,
    authType: 'firebase',
  }
}

async function authenticateCustomUser(req) {
  const token = req.cookies?.[env.COOKIE_NAME]
  if (!token) return null

  let decoded
  try {
    decoded = jwt.verify(token, env.JWT_SECRET)
  } catch {
    return null
  }

  if (!decoded?.sub || decoded.authType !== 'custom') {
    return null
  }

  const memberSnap = await db.collection('users').doc(decoded.sub).get()
  if (!memberSnap.exists) return null

  const member = memberSnap.data()
  if (member.authType !== 'custom' || member.status !== 'active') {
    return null
  }

  const user = sanitizeUser(memberSnap)
  return {
    ...user,
    authType: 'custom',
  }
}

async function requireCrmAuth(req, res, next) {
  try {
    const firebaseUser = await authenticateFirebaseUser(req)
    if (firebaseUser) {
      req.crmUser = firebaseUser
      return next()
    }

    const customUser = await authenticateCustomUser(req)
    if (customUser) {
      req.crmUser = customUser
      return next()
    }

    throw new AppError('Your session has expired. Please sign in again.', 401)
  } catch (error) {
    if (error instanceof AppError) {
      return next(error)
    }
    return next(new AppError('Your session has expired. Please sign in again.', 401))
  }
}

function requireCrmImporter(req, res, next) {
  const role = req.crmUser?.role
  if (role === 'super_admin' || role === 'sales_manager') {
    return next()
  }
  return next(
    new AppError('Only Super Admins and Sales Managers can import Meta leads.', 403)
  )
}

module.exports = {
  requireCrmAuth,
  requireCrmImporter,
}
