const { FieldValue } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')
const sanitizeMetaLeadHistory = require('../utils/sanitizeMetaLeadHistory')
const { assertCanViewMetaLead } = require('../utils/metaLeadPermissions')

const LEADS_COLLECTION = 'leads'
const HISTORY_SUBCOLLECTION = 'history'

async function getMetaLeadRecord(leadId) {
  const snap = await db.collection(LEADS_COLLECTION).doc(leadId).get()
  if (!snap.exists) {
    const AppError = require('../utils/AppError')
    throw new AppError('Lead not found.', 404)
  }

  const lead = { id: snap.id, ...snap.data() }
  if (lead.leadChannel !== 'meta') {
    const AppError = require('../utils/AppError')
    throw new AppError('Lead not found.', 404)
  }

  return lead
}

async function addMetaLeadHistoryEntry(leadId, entry, authUser) {
  const ref = db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(HISTORY_SUBCOLLECTION)
    .doc()

  await ref.set({
    type: entry.type,
    title: entry.title,
    description: entry.description || '',
    metadata: entry.metadata || {},
    createdBy: authUser.id,
    createdByName: authUser.name || 'Team Member',
    createdAt: FieldValue.serverTimestamp(),
  })

  const snap = await ref.get()
  return sanitizeMetaLeadHistory(snap)
}

async function listMetaLeadHistory(leadId, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)

  const snapshot = await db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(HISTORY_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .get()

  return snapshot.docs.map(sanitizeMetaLeadHistory)
}

module.exports = {
  addMetaLeadHistoryEntry,
  listMetaLeadHistory,
}
