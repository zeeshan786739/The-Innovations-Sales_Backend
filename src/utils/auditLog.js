const { FieldValue } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')

async function writeAuditLog({ action, performedBy, targetUserId, metadata }) {
  try {
    const entry = {
      action,
      performedBy,
      targetUserId: targetUserId || null,
      createdAt: FieldValue.serverTimestamp(),
    }
    if (metadata && typeof metadata === 'object') {
      entry.metadata = metadata
    }
    await db.collection('auditLogs').add(entry)
  } catch {
    // Audit logging must not block CRM operations.
  }
}

module.exports = { writeAuditLog }
