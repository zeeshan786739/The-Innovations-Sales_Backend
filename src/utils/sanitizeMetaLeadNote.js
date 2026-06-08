function toISOString(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function sanitizeMetaLeadNote(record) {
  const raw =
    record && typeof record.data === 'function'
      ? { id: record.id, ...record.data() }
      : record || {}

  return {
    id: raw.id || null,
    content: raw.content || '',
    createdBy: raw.createdBy || null,
    createdByName: raw.createdByName || 'Team Member',
    createdAt: toISOString(raw.createdAt),
    updatedAt: toISOString(raw.updatedAt),
  }
}

module.exports = sanitizeMetaLeadNote
