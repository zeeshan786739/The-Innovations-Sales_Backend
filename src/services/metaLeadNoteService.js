const { FieldValue } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeMetaLeadNote = require('../utils/sanitizeMetaLeadNote')
const {
  assertCanViewMetaLead,
  isMetaLeadManager,
} = require('../utils/metaLeadPermissions')

const LEADS_COLLECTION = 'leads'
const NOTES_SUBCOLLECTION = 'notes'

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

async function getNoteRecord(leadId, noteId) {
  const snap = await db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(NOTES_SUBCOLLECTION)
    .doc(noteId)
    .get()

  if (!snap.exists) {
    throw new AppError('Note not found.', 404)
  }

  return snap
}

function assertCanMutateNotes(lead) {
  if (lead.status === 'archived') {
    throw new AppError('Notes cannot be changed on an archived lead.', 400)
  }
}

function assertCanEditNote(note, authUser) {
  if (isMetaLeadManager(authUser)) return
  if (note.createdBy !== authUser.id) {
    throw new AppError('You can only edit your own notes.', 403)
  }
}

async function listMetaLeadNotes(leadId, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)

  const snapshot = await db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(NOTES_SUBCOLLECTION)
    .orderBy('createdAt', 'desc')
    .get()

  return snapshot.docs.map(sanitizeMetaLeadNote)
}

async function createMetaLeadNote(leadId, content, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)
  assertCanMutateNotes(lead)

  const noteRef = db
    .collection(LEADS_COLLECTION)
    .doc(leadId)
    .collection(NOTES_SUBCOLLECTION)
    .doc()

  const trimmedContent = content.trim()
  const now = new Date()

  await noteRef.set({
    content: trimmedContent,
    createdBy: authUser.id,
    createdByName: authUser.name || 'Team Member',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const note = sanitizeMetaLeadNote({
    id: noteRef.id,
    content: trimmedContent,
    createdBy: authUser.id,
    createdByName: authUser.name || 'Team Member',
    createdAt: now,
    updatedAt: now,
  })

  const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
  void addMetaLeadHistoryEntry(
    leadId,
    {
      type: 'note_added',
      title: 'Note added',
      description: trimmedContent.slice(0, 280),
      metadata: { noteId: note.id },
    },
    authUser
  )

  return note
}

async function updateMetaLeadNote(leadId, noteId, content, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)
  assertCanMutateNotes(lead)

  const noteSnap = await getNoteRecord(leadId, noteId)
  const note = noteSnap.data()
  assertCanEditNote(note, authUser)

  const trimmedContent = content.trim()
  const now = new Date()

  await noteSnap.ref.update({
    content: trimmedContent,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return sanitizeMetaLeadNote({
    id: noteSnap.id,
    content: trimmedContent,
    createdBy: note.createdBy,
    createdByName: note.createdByName || 'Team Member',
    createdAt: note.createdAt,
    updatedAt: now,
  })
}

async function deleteMetaLeadNote(leadId, noteId, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)
  assertCanMutateNotes(lead)

  const noteSnap = await getNoteRecord(leadId, noteId)
  const note = noteSnap.data()
  assertCanEditNote(note, authUser)

  await noteSnap.ref.delete()
  return sanitizeMetaLeadNote(noteSnap)
}

module.exports = {
  listMetaLeadNotes,
  createMetaLeadNote,
  updateMetaLeadNote,
  deleteMetaLeadNote,
}
