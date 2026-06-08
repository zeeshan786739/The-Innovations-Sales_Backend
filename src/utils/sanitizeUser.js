const ALLOWED_USER_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'role',
  'status',
  'assignedLeadsCount',
  'createdAt',
  'updatedAt',
  'lastLoginAt',
  'archivedAt',
  'createdBy',
  'authType',
]

function toISOString(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function sanitizeUser(record) {
  const raw =
    record && typeof record.data === 'function'
      ? { id: record.id, ...record.data() }
      : record || {}

  const sanitized = {
    id: raw.id || null,
    name: raw.name || null,
    email: raw.email || null,
    phone: raw.phone || null,
    role: raw.role || null,
    status: raw.status || null,
    assignedLeadsCount: Number(raw.assignedLeadsCount || 0),
    createdAt: toISOString(raw.createdAt),
    updatedAt: toISOString(raw.updatedAt),
    lastLoginAt: toISOString(raw.lastLoginAt),
    archivedAt: toISOString(raw.archivedAt),
    createdBy: raw.createdBy || null,
    authType: raw.authType || null,
  }

  return ALLOWED_USER_FIELDS.reduce((result, field) => {
    result[field] = sanitized[field]
    return result
  }, {})
}

module.exports = sanitizeUser
