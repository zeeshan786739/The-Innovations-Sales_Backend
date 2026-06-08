const ALLOWED_META_LEAD_FIELDS = [
  'id',
  'leadChannel',
  'leadCategory',
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'companyName',
  'city',
  'formName',
  'estimatedProjectBudget',
  'websiteType',
  'source',
  'service',
  'temperature',
  'stage',
  'status',
  'assignedTo',
  'assignedMember',
  'nextFollowUpAt',
  'customFields',
  'customFieldLabels',
  'importedColumnOrder',
  'importBatchId',
  'importedFromFile',
  'originalRowNumber',
  'createdBy',
  'createdAt',
  'updatedAt',
  'importedAt',
  'archivedAt',
]

function toISOString(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function sanitizeMetaLead(record, assignedMember = null) {
  const raw =
    record && typeof record.data === 'function'
      ? { id: record.id, ...record.data() }
      : record || {}

  const sanitized = {
    id: raw.id || null,
    leadChannel: raw.leadChannel || null,
    leadCategory: raw.leadCategory || null,
    fullName: raw.fullName || null,
    firstName: raw.firstName || null,
    lastName: raw.lastName || null,
    email: raw.email || null,
    phone: raw.phone || null,
    companyName: raw.companyName || null,
    city: raw.city || null,
    formName: raw.formName || null,
    estimatedProjectBudget: raw.estimatedProjectBudget || null,
    websiteType: raw.websiteType || null,
    source: raw.source || null,
    service: raw.service || null,
    temperature: raw.temperature || null,
    stage: raw.stage || null,
    status: raw.status || null,
    assignedTo: raw.assignedTo || null,
    assignedMember,
    nextFollowUpAt: toISOString(raw.nextFollowUpAt),
    customFields: raw.customFields || {},
    customFieldLabels: raw.customFieldLabels || {},
    importedColumnOrder: Array.isArray(raw.importedColumnOrder)
      ? raw.importedColumnOrder
      : [],
    importBatchId: raw.importBatchId || null,
    importedFromFile: raw.importedFromFile || null,
    originalRowNumber: raw.originalRowNumber ?? null,
    createdBy: raw.createdBy || null,
    createdAt: toISOString(raw.createdAt),
    updatedAt: toISOString(raw.updatedAt),
    importedAt: toISOString(raw.importedAt),
    archivedAt: toISOString(raw.archivedAt),
  }

  return ALLOWED_META_LEAD_FIELDS.reduce((result, field) => {
    result[field] = sanitized[field]
    return result
  }, {})
}

module.exports = sanitizeMetaLead
