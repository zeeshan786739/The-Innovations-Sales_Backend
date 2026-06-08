const { firebaseAuth, db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeUser = require('../utils/sanitizeUser')

async function requireFirebaseSuperAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication required.', 401)
    }

    const token = authHeader.slice(7).trim()
    if (!token) {
      throw new AppError('Authentication required.', 401)
    }

    let decodedToken
    try {
      decodedToken = await firebaseAuth.verifyIdToken(token)
    } catch {
      throw new AppError('Invalid or expired authentication token.', 401)
    }

    const profileSnap = await db.collection('users').doc(decodedToken.uid).get()

    if (!profileSnap.exists) {
      throw new AppError('You are not authorized to perform this action.', 403)
    }

    const profile = profileSnap.data()

    if (profile.role !== 'super_admin' || profile.status !== 'active') {
      throw new AppError('You are not authorized to perform this action.', 403)
    }

    req.superAdmin = sanitizeUser(profileSnap)
    return next()
  } catch (error) {
    if (error instanceof AppError) {
      return next(error)
    }
    return next(new AppError('Authentication failed.', 401))
  }
}

module.exports = requireFirebaseSuperAdmin
