const bcrypt = require('bcryptjs')
const { FieldValue } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeUser = require('../utils/sanitizeUser')

const BCRYPT_ROUNDS = 12
const USERS_COLLECTION = 'users'
const CREDENTIALS_COLLECTION = 'teamMemberCredentials'
const MANAGED_ACCOUNT_ERROR =
  'This account cannot be managed through the team-member controls.'
const NOT_FOUND_ERROR = 'Team member not found.'
const DUPLICATE_EMAIL_ERROR = 'A team member with this email already exists.'

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

async function findCredentialByEmail(email) {
  const emailLower = normalizeEmail(email)
  if (!emailLower) return null

  const snapshot = await db
    .collection(CREDENTIALS_COLLECTION)
    .where('emailLower', '==', emailLower)
    .limit(1)
    .get()

  if (snapshot.empty) return null

  const doc = snapshot.docs[0]
  return { id: doc.id, ...doc.data() }
}

async function emailUsedByAnotherMember(emailLower, memberId) {
  const existingCredential = await findCredentialByEmail(emailLower)
  if (!existingCredential) return false
  return (
    existingCredential.userId !== memberId &&
    existingCredential.id !== memberId
  )
}

async function getCustomTeamMemberById(memberId) {
  const profileSnap = await db.collection(USERS_COLLECTION).doc(memberId).get()

  if (!profileSnap.exists) {
    throw new AppError(NOT_FOUND_ERROR, 404)
  }

  const profile = profileSnap.data()

  if (profile.authType !== 'custom') {
    throw new AppError(MANAGED_ACCOUNT_ERROR, 403)
  }

  return { id: profileSnap.id, ...profile }
}

async function findTeamMemberByEmail(email) {
  const credential = await findCredentialByEmail(email)
  if (!credential?.userId || !credential.passwordHash) return null

  const profileSnap = await db
    .collection(USERS_COLLECTION)
    .doc(credential.userId)
    .get()

  if (!profileSnap.exists) return null

  return {
    profile: { id: profileSnap.id, ...profileSnap.data() },
    passwordHash: credential.passwordHash,
  }
}

async function createTeamMember(payload, createdBy) {
  const emailLower = normalizeEmail(payload.email)
  const existingCredential = await findCredentialByEmail(emailLower)

  if (existingCredential) {
    throw new AppError(DUPLICATE_EMAIL_ERROR, 400)
  }

  const passwordHash = await bcrypt.hash(payload.password, BCRYPT_ROUNDS)
  const memberRef = db.collection(USERS_COLLECTION).doc()
  const memberId = memberRef.id
  const batch = db.batch()

  const profileData = {
    name: payload.name.trim(),
    email: emailLower,
    phone: payload.phone?.trim() || '',
    role: payload.role,
    status: payload.status,
    assignedLeadsCount: 0,
    lastLoginAt: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy,
    authType: 'custom',
  }

  const credentialData = {
    userId: memberId,
    emailLower,
    passwordHash,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  batch.set(memberRef, profileData)
  batch.set(db.collection(CREDENTIALS_COLLECTION).doc(memberId), credentialData)
  await batch.commit()

  const createdSnap = await memberRef.get()
  return sanitizeUser(createdSnap)
}

async function updateTeamMemberProfile(memberId, payload) {
  const member = await getCustomTeamMemberById(memberId)
  const emailLower = normalizeEmail(payload.email)
  const currentEmailLower = normalizeEmail(member.email)

  if (emailLower !== currentEmailLower) {
    const duplicate = await emailUsedByAnotherMember(emailLower, memberId)
    if (duplicate) {
      throw new AppError(DUPLICATE_EMAIL_ERROR, 400)
    }
  }

  const batch = db.batch()
  const memberRef = db.collection(USERS_COLLECTION).doc(memberId)
  const credentialRef = db.collection(CREDENTIALS_COLLECTION).doc(memberId)

  batch.update(memberRef, {
    name: payload.name.trim(),
    email: emailLower,
    phone: payload.phone?.trim() || '',
    role: payload.role,
    updatedAt: FieldValue.serverTimestamp(),
  })

  if (emailLower !== currentEmailLower) {
    batch.update(credentialRef, {
      emailLower,
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()

  const updatedSnap = await memberRef.get()
  return sanitizeUser(updatedSnap)
}

async function updateTeamMemberStatus(memberId, status) {
  await getCustomTeamMemberById(memberId)

  const memberRef = db.collection(USERS_COLLECTION).doc(memberId)
  await memberRef.update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const updatedSnap = await memberRef.get()
  return sanitizeUser(updatedSnap)
}

async function resetTeamMemberPassword(memberId, plainPassword) {
  await getCustomTeamMemberById(memberId)

  const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS)
  const credentialRef = db.collection(CREDENTIALS_COLLECTION).doc(memberId)

  await credentialRef.update({
    passwordHash,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return { success: true }
}

async function archiveTeamMember(memberId) {
  await getCustomTeamMemberById(memberId)

  const memberRef = db.collection(USERS_COLLECTION).doc(memberId)
  await memberRef.update({
    status: 'inactive',
    archivedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const updatedSnap = await memberRef.get()
  return sanitizeUser(updatedSnap)
}

async function validateTeamMemberPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false
  return bcrypt.compare(plainPassword, passwordHash)
}

async function updateLastLoginAt(userId) {
  await db.collection(USERS_COLLECTION).doc(userId).update({
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

async function getTeamMemberById(userId) {
  const doc = await db.collection(USERS_COLLECTION).doc(userId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...doc.data() }
}

module.exports = {
  findTeamMemberByEmail,
  createTeamMember,
  getCustomTeamMemberById,
  updateTeamMemberProfile,
  updateTeamMemberStatus,
  resetTeamMemberPassword,
  archiveTeamMember,
  validateTeamMemberPassword,
  updateLastLoginAt,
  getTeamMemberById,
}
