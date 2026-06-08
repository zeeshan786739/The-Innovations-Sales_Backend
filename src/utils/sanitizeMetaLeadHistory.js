function toISOString(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function sanitizeMetaLeadHistory(record) {
  const raw =
    record && typeof record.data === 'function'
      ? { id: record.id, ...record.data() }
      : record || {}

  return {
    id: raw.id || null,
    type: raw.type || 'activity',
    title: raw.title || '',
    description: raw.description || '',
    metadata: raw.metadata || {},
    createdBy: raw.createdBy || null,
    createdByName: raw.createdByName || 'Team Member',
    createdAt: toISOString(raw.createdAt),
  }
}

module.exports = sanitizeMetaLeadHistory
