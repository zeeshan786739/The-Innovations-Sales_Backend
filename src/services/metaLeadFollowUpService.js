const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeMetaLeadFollowUp = require('../utils/sanitizeMetaLeadFollowUp')
const sanitizeMetaLead = require('../utils/sanitizeMetaLead')
const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
const {
  assertCanViewMetaLead,
  canMutateMetaLeadWorkflow,
} = require('../utils/metaLeadPermissions')

const LEADS_COLLECTION = 'leads'
const FOLLOW_UPS_SUBCOLLECTION = 'followUps'

async function getMetaLeadRecord(leadId) {
  const snap = await db.collection(LEADS_COLLECTION).doc(leadId).get()
  if (!snap.exists) {
    throw new AppError('Lead not found.', 404)
  }

  const lead = { id: snap.id, ...snap.data() }
  if (lead.leadChannel !== 'meta') {
    throw new AppError('Lead not found.', 404)
  }

  return lead
}

async function findPendingFollowUpRef(leadId) {
  const snapshot = await db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(FOLLOW_UPS_SUBCOLLECTION)
    .where('status', '==', 'pending')
    .limit(1)
    .get()

  if (snapshot.empty) return null
  return snapshot.docs[0]
}

function formatHistoryDate(iso) {
  if (!iso) return 'a later date'
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

async function getActiveMetaLeadFollowUp(leadId, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)

  const pendingDoc = await findPendingFollowUpRef(leadId)
  if (pendingDoc) {
    return sanitizeMetaLeadFollowUp(pendingDoc)
  }

  if (!lead.nextFollowUpAt) return null

  const scheduledAt =
    typeof lead.nextFollowUpAt.toDate === 'function'
      ? lead.nextFollowUpAt.toDate().toISOString()
      : new Date(lead.nextFollowUpAt).toISOString()

  const followUpRef = db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(FOLLOW_UPS_SUBCOLLECTION)
    .doc()

  await followUpRef.set({
    scheduledAt: Timestamp.fromDate(new Date(scheduledAt)),
    status: 'pending',
    outcomeNote: '',
    completedAt: null,
    createdBy: authUser.id,
    createdByName: authUser.name || 'Team Member',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const snap = await followUpRef.get()
  return sanitizeMetaLeadFollowUp(snap)
}

async function syncMetaLeadFollowUpSchedule(leadId, nextFollowUpAt, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  if (!canMutateMetaLeadWorkflow(lead, authUser)) {
    throw new AppError('You are not authorized to update this lead.', 403)
  }

  const pendingDoc = await findPendingFollowUpRef(leadId)
  if (pendingDoc) {
    await pendingDoc.ref.update({
      status: 'cancelled',
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  if (!nextFollowUpAt) {
    await addMetaLeadHistoryEntry(
      leadId,
      {
        type: 'follow_up_cancelled',
        title: 'Follow-up cleared',
        description: 'The scheduled follow-up was removed.',
      },
      authUser
    )
    return null
  }

  const scheduledDate = new Date(nextFollowUpAt)
  const followUpRef = db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(FOLLOW_UPS_SUBCOLLECTION)
    .doc()

  await followUpRef.set({
    scheduledAt: Timestamp.fromDate(scheduledDate),
    status: 'pending',
    outcomeNote: '',
    completedAt: null,
    createdBy: authUser.id,
    createdByName: authUser.name || 'Team Member',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await addMetaLeadHistoryEntry(
    leadId,
    {
      type: 'follow_up_scheduled',
      title: 'Follow-up scheduled',
      description: `Follow-up set for ${formatHistoryDate(scheduledDate.toISOString())}.`,
      metadata: { scheduledAt: scheduledDate.toISOString() },
    },
    authUser
  )

  const snap = await followUpRef.get()
  return sanitizeMetaLeadFollowUp(snap)
}

async function completeMetaLeadFollowUp(leadId, payload, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  if (!canMutateMetaLeadWorkflow(lead, authUser)) {
    throw new AppError('You are not authorized to update this lead.', 403)
  }
  if (lead.status === 'archived') {
    throw new AppError('Follow-ups cannot be updated on an archived lead.', 400)
  }

  const pendingDoc = await findPendingFollowUpRef(leadId)
  if (!pendingDoc) {
    throw new AppError('No active follow-up found for this lead.', 404)
  }

  const status = payload.status === 'missed' ? 'missed' : 'completed'
  const outcomeNote = String(payload.note || '').trim()

  await pendingDoc.ref.update({
    status,
    outcomeNote,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    nextFollowUpAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const followUpData = pendingDoc.data()
  const scheduledAt =
    typeof followUpData.scheduledAt?.toDate === 'function'
      ? followUpData.scheduledAt.toDate().toISOString()
      : null

  const isCompleted = status === 'completed'
  void addMetaLeadHistoryEntry(
    leadId,
    {
      type: isCompleted ? 'follow_up_completed' : 'follow_up_missed',
      title: isCompleted ? 'Follow-up completed' : 'Follow-up not completed',
      description: outcomeNote
        || (isCompleted
          ? `Follow-up for ${formatHistoryDate(scheduledAt)} was marked as done.`
          : `Follow-up for ${formatHistoryDate(scheduledAt)} was not completed.`),
      metadata: {
        scheduledAt,
        status,
        outcomeNote,
      },
    },
    authUser
  )

  return {
    followUp: sanitizeMetaLeadFollowUp({
      id: pendingDoc.id,
      ...followUpData,
      status,
      outcomeNote,
      completedAt: new Date(),
      updatedAt: new Date(),
    }),
    lead: sanitizeMetaLead({
      ...lead,
      nextFollowUpAt: null,
      updatedAt: new Date(),
    }),
  }
}

module.exports = {
  getActiveMetaLeadFollowUp,
  syncMetaLeadFollowUpSchedule,
  completeMetaLeadFollowUp,
}
