function toISOString(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function sanitizeMetaLeadFollowUp(record) {
  const raw =
    record && typeof record.data === 'function'
      ? { id: record.id, ...record.data() }
      : record || {}

  return {
    id: raw.id || null,
    scheduledAt: toISOString(raw.scheduledAt),
    status: raw.status || 'pending',
    outcomeNote: raw.outcomeNote || '',
    completedAt: toISOString(raw.completedAt),
    createdBy: raw.createdBy || null,
    createdByName: raw.createdByName || 'Team Member',
    createdAt: toISOString(raw.createdAt),
    updatedAt: toISOString(raw.updatedAt),
  }
}

module.exports = sanitizeMetaLeadFollowUp
