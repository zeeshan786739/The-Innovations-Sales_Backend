const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')
const AppError = require('../utils/AppError')
const sanitizeMetaLead = require('../utils/sanitizeMetaLead')
const {
  canViewAllMetaLeads,
  canMutateMetaLeadWorkflow,
  assertCanViewMetaLead,
  assertCanEditMetaLead,
  assertCanAssignMetaLeads,
  assertCanArchiveMetaLeads,
  assertCanExportMetaLeads,
  isMetaLeadManager,
  isAssignableRole,
} = require('../utils/metaLeadPermissions')
const { parseSpreadsheetFile } = require('./spreadsheetImportService')

const LEADS_COLLECTION = 'leads'
const BATCHES_COLLECTION = 'leadImportBatches'
const USERS_COLLECTION = 'users'

const HEADER_ALIASES = {
  form_name: ['form_name', 'form', 'campaign', 'campaign_name'],
  full_name: ['full_name', 'name', 'lead_name'],
  email: ['email', 'email_address'],
  phone: ['phone', 'phone_number', 'mobile', 'mobile_number', 'contact', 'contact_number'],
  company_name: ['company_name', 'company', 'business_name'],
  city: ['city', 'location', 'town'],
  estimated_project_budget: [
    'what_is_your_estimated_project_budget',
    'estimated_project_budget',
    'project_budget',
    'budget',
    'estimated_budget',
    'your_budget',
    'budget_range',
  ],
  website_type: [
    'what_type_of_website_are_you_looking_for',
    'website_type',
    'type_of_website',
    'project_type',
    'website_requirement',
    'required_website_type',
  ],
}

const CANONICAL_TO_FIELD = {
  form_name: 'formName',
  full_name: 'fullName',
  email: 'email',
  phone: 'phone',
  company_name: 'companyName',
  city: 'city',
  estimated_project_budget: 'estimatedProjectBudget',
  website_type: 'websiteType',
}

const VALID_CATEGORIES = new Set(['mobile_app_development', 'web_development'])

const ALIAS_LOOKUP = {}
Object.entries(HEADER_ALIASES).forEach(([canonicalKey, aliases]) => {
  ;[canonicalKey, ...aliases].forEach((alias) => {
    ALIAS_LOOKUP[normalizeSpreadsheetHeader(alias)] = canonicalKey
  })
})

function normalizeSpreadsheetHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isRowEmpty(row) {
  return !Object.entries(row).some(
    ([key, value]) => key !== '__rowNumber' && String(value || '').trim()
  )
}

function mapRowData(row, headerOrder = []) {
  const canonicalValues = {}
  const mappedCanonicalHeaders = []
  const customFields = {}
  const customFieldLabels = {}
  const importedValues = {}
  const mappedCanonicalKeys = new Set()

  const sourceHeaders =
    headerOrder.length > 0
      ? headerOrder
      : Object.keys(row).filter((key) => key !== '__rowNumber')

  sourceHeaders.forEach((originalHeader) => {
    const value = String(row[originalHeader] ?? '').trim()
    if (!value) return

    importedValues[originalHeader] = value
    const normalizedKey = normalizeSpreadsheetHeader(originalHeader)
    const canonicalAlias = ALIAS_LOOKUP[normalizedKey]

    if (canonicalAlias && CANONICAL_TO_FIELD[canonicalAlias]) {
      const fieldName = CANONICAL_TO_FIELD[canonicalAlias]
      if (!canonicalValues[fieldName]) {
        canonicalValues[fieldName] = value
        mappedCanonicalHeaders.push(originalHeader)
        mappedCanonicalKeys.add(normalizedKey)
      }
      return
    }

    if (!mappedCanonicalKeys.has(normalizedKey)) {
      customFields[normalizedKey] = value
      customFieldLabels[normalizedKey] = originalHeader
    }
  })

  return {
    canonicalValues,
    mappedCanonicalHeaders,
    customFields,
    customFieldLabels,
    importedValues,
    importedColumnOrder: sourceHeaders,
  }
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function normalizePhone(phone) {
  let raw = String(phone || '').trim()
  if (raw.startsWith("'")) {
    raw = raw.slice(1).trim()
  }
  if (!raw) return { phone: '', phoneNormalized: '' }
  const normalized = raw.replace(/[^\d+]/g, '')
  return { phone: raw, phoneNormalized: normalized }
}

function quickSanitizedLead(lead, updates = {}, assignedMember = null) {
  const merged = { ...lead, ...updates, updatedAt: new Date() }
  if ('nextFollowUpAt' in updates) {
    if (updates.nextFollowUpAt === null) {
      merged.nextFollowUpAt = null
    } else if (updates.nextFollowUpAt instanceof Timestamp) {
      merged.nextFollowUpAt = updates.nextFollowUpAt.toDate()
    } else if (updates.nextFollowUpAt) {
      merged.nextFollowUpAt = new Date(updates.nextFollowUpAt)
    }
  }
  return sanitizeMetaLead(merged, assignedMember)
}

function buildEnrichmentUpdates(existing, incoming) {
  const updates = {}

  const scalarFields = [
    'fullName',
    'firstName',
    'lastName',
    'email',
    'emailLower',
    'phone',
    'phoneNormalized',
    'companyName',
    'city',
    'formName',
    'estimatedProjectBudget',
    'websiteType',
  ]

  scalarFields.forEach((field) => {
    const incomingValue = incoming[field]
    const existingValue = existing[field]
    if (incomingValue && !existingValue) {
      updates[field] = incomingValue
    }
  })

  const customFields = { ...(existing.customFields || {}) }
  const customFieldLabels = { ...(existing.customFieldLabels || {}) }
  let customChanged = false

  Object.entries(incoming.customFields || {}).forEach(([key, value]) => {
    if (value && !customFields[key]) {
      customFields[key] = value
      customFieldLabels[key] = incoming.customFieldLabels?.[key] || key
      customChanged = true
    }
  })

  if (customChanged) {
    updates.customFields = customFields
    updates.customFieldLabels = customFieldLabels
  }

  const order = [...(existing.importedColumnOrder || [])]
  ;(incoming.importedColumnOrder || []).forEach((header) => {
    if (header && !order.includes(header)) {
      order.push(header)
    }
  })

  if (order.length !== (existing.importedColumnOrder || []).length) {
    updates.importedColumnOrder = order
  }

  if (!Object.keys(updates).length) {
    return null
  }

  updates.updatedAt = FieldValue.serverTimestamp()
  return updates
}

const SERVICE_LABELS = {
  mobile_app_development: 'Mobile App Development',
  web_development: 'Web Development',
}

const TEMPERATURE_LABELS = { cold: 'Cold', warm: 'Warm', hot: 'Hot' }
const STAGE_LABELS = {
  new: 'New Lead',
  outreach_started: 'Outreach Started',
  engaged: 'Engaged',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
}

function isMetaCategoryLead(lead, category) {
  const categoryMatch =
    lead.leadCategory === category || lead.service === category
  if (!categoryMatch) return false
  if (lead.leadChannel && lead.leadChannel !== 'meta') return false
  if (!lead.leadChannel && lead.source && lead.source !== 'meta') return false
  return true
}

async function fetchCategoryLeads(category) {
  const [categorySnapshot, serviceSnapshot] = await Promise.all([
    db.collection(LEADS_COLLECTION).where('leadCategory', '==', category).get(),
    db.collection(LEADS_COLLECTION).where('service', '==', category).get(),
  ])

  const leadsById = new Map()
  ;[categorySnapshot, serviceSnapshot].forEach((snapshot) => {
    snapshot.docs.forEach((doc) => {
      leadsById.set(doc.id, { id: doc.id, ...doc.data() })
    })
  })

  return Array.from(leadsById.values()).filter((lead) =>
    isMetaCategoryLead(lead, category)
  )
}

async function getAssignedMemberMap() {
  const snapshot = await db.collection(USERS_COLLECTION).get()
  const map = new Map()
  snapshot.docs.forEach((doc) => {
    const data = doc.data()
    map.set(doc.id, data.name || data.full_name || 'Team Member')
  })
  return map
}

function buildLeadRecord(rowData, category, context, rowNumber) {
  const fullName = String(rowData.canonicalValues.fullName || '').trim()
  const email = String(rowData.canonicalValues.email || '').trim()
  const { phone, phoneNormalized } = normalizePhone(rowData.canonicalValues.phone)
  const companyName = String(rowData.canonicalValues.companyName || '').trim()
  const city = String(rowData.canonicalValues.city || '').trim()
  const formName = String(rowData.canonicalValues.formName || '').trim()
  const estimatedProjectBudget = String(
    rowData.canonicalValues.estimatedProjectBudget || ''
  ).trim()
  const websiteType = String(rowData.canonicalValues.websiteType || '').trim()
  const { firstName, lastName } = splitName(fullName)
  const emailLower = email ? email.toLowerCase() : ''

  return {
    leadChannel: 'meta',
    leadCategory: category,
    fullName: fullName || 'Unnamed Lead',
    firstName,
    lastName,
    email,
    emailLower,
    phone,
    phoneNormalized,
    companyName,
    city,
    formName,
    estimatedProjectBudget,
    websiteType,
    source: 'meta',
    service: category,
    temperature: 'cold',
    stage: 'new',
    status: 'active',
    assignedTo: null,
    nextFollowUpAt: null,
    customFields: rowData.customFields,
    customFieldLabels: rowData.customFieldLabels,
    importedColumnOrder: rowData.importedColumnOrder,
    importedFromFile: context.originalFileName,
    originalRowNumber: rowNumber,
    createdBy: context.authUser.id,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    importedAt: FieldValue.serverTimestamp(),
    archivedAt: null,
  }
}

function normalizeImportedRow(row, category, context, headerOrder) {
  if (isRowEmpty(row)) {
    return {
      valid: false,
      reason: 'Empty row',
      mappedHeaders: [],
      preview: null,
    }
  }

  const rowData = mapRowData(row, headerOrder)
  const fullName = String(rowData.canonicalValues.fullName || '').trim()
  const email = String(rowData.canonicalValues.email || '').trim()
  const { phone, phoneNormalized } = normalizePhone(rowData.canonicalValues.phone)

  if (!fullName && !email && !phone) {
    return {
      valid: false,
      reason: 'Missing name, email, and phone',
      mappedHeaders: rowData.mappedCanonicalHeaders,
      preview: null,
    }
  }

  const emailLower = email ? email.toLowerCase() : ''
  const duplicateReasons = []
  let existingLeadId = null

  if (emailLower && context.existingByEmail.has(emailLower)) {
    duplicateReasons.push('Existing email match')
    existingLeadId = context.existingByEmail.get(emailLower)
  }
  if (phoneNormalized && context.existingByPhone.has(phoneNormalized)) {
    duplicateReasons.push('Existing phone match')
    if (!existingLeadId) {
      existingLeadId = context.existingByPhone.get(phoneNormalized)
    }
  }
  if (emailLower && context.fileEmails.has(emailLower)) {
    duplicateReasons.push('Duplicate email in file')
    existingLeadId = null
  }
  if (phoneNormalized && context.filePhones.has(phoneNormalized)) {
    duplicateReasons.push('Duplicate phone in file')
    existingLeadId = null
  }

  if (emailLower) context.fileEmails.add(emailLower)
  if (phoneNormalized) context.filePhones.add(phoneNormalized)

  const record = buildLeadRecord(rowData, category, context, row.__rowNumber)

  const preview = {
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    companyName: record.companyName,
    city: record.city,
    formName: record.formName,
    estimatedProjectBudget: record.estimatedProjectBudget,
    websiteType: record.websiteType,
    customFields: record.customFields,
    customFieldLabels: record.customFieldLabels,
    importedValues: rowData.importedValues,
    source: 'meta',
    service: category,
    temperature: 'cold',
    stage: 'new',
    status: 'active',
    assignedTo: null,
    originalRowNumber: row.__rowNumber,
  }

  return {
    valid: duplicateReasons.length === 0,
    duplicate: duplicateReasons.length > 0,
    duplicateReasons,
    existingLeadId,
    reason: duplicateReasons.join(', ') || null,
    mappedHeaders: rowData.mappedCanonicalHeaders,
    additionalCustomHeaders: Object.values(rowData.customFieldLabels),
    preview,
    record,
  }
}

function buildImportContext(existingLeads, authUser, originalFileName) {
  const existingByEmail = new Map()
  const existingByPhone = new Map()
  const existingById = new Map()

  existingLeads.forEach((lead) => {
    existingById.set(lead.id, lead)
    if (lead.emailLower) existingByEmail.set(lead.emailLower, lead.id)
    if (lead.phoneNormalized) existingByPhone.set(lead.phoneNormalized, lead.id)
  })

  return {
    existingByEmail,
    existingByPhone,
    existingById,
    fileEmails: new Set(),
    filePhones: new Set(),
    authUser,
    originalFileName,
  }
}

function analyzeSpreadsheet(file, category, authUser) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new AppError('Select a valid Meta leads category.', 400)
  }

  const parsed = parseSpreadsheetFile(file)
  return {
    parsed,
    category,
    authUser,
    originalFileName: file.originalname,
  }
}

function collectEmptyHeaders(headers, rows) {
  return headers.filter((header) =>
    !rows.some((row) => String(row[header] || '').trim())
  )
}

async function previewImport(file, category, authUser) {
  const analysis = analyzeSpreadsheet(file, category, authUser)
  const existingLeads = await fetchCategoryLeads(category)
  const context = buildImportContext(
    existingLeads,
    authUser,
    analysis.originalFileName
  )

  const mappedHeaderSet = new Set()
  const additionalCustomHeaderSet = new Set()
  const previewRows = []
  let validRows = 0
  let invalidRows = 0
  let duplicateRows = 0
  const warnings = []

  analysis.parsed.rows.forEach((row) => {
    const result = normalizeImportedRow(
      row,
      category,
      context,
      analysis.parsed.headers
    )
    ;(result.mappedHeaders || []).forEach((header) => mappedHeaderSet.add(header))
    ;(result.additionalCustomHeaders || []).forEach((header) =>
      additionalCustomHeaderSet.add(header)
    )

    if (!result.preview && !result.valid && !result.duplicate) {
      invalidRows += 1
      return
    }

    if (result.duplicate) {
      duplicateRows += 1
      if (previewRows.length < 20) {
        previewRows.push({
          ...result.preview,
          rowStatus: 'duplicate',
          notes: result.duplicateReasons.join(', '),
        })
      }
      return
    }

    if (result.valid) {
      validRows += 1
      if (previewRows.length < 20) {
        previewRows.push({
          ...result.preview,
          rowStatus: 'valid',
          notes: '',
        })
      }
    } else {
      invalidRows += 1
    }
  })

  const emptyHeaders = collectEmptyHeaders(
    analysis.parsed.headers,
    analysis.parsed.rows
  )

  return {
    detectedHeaders: analysis.parsed.headers,
    mappedHeaders: Array.from(mappedHeaderSet),
    additionalCustomHeaders: Array.from(additionalCustomHeaderSet),
    emptyHeaders,
    previewRows,
    totalRows: analysis.parsed.rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    warnings,
    fileType: analysis.parsed.fileType,
  }
}

async function confirmImport(file, category, authUser, options = {}) {
  const enrichExistingDuplicates = options.enrichExistingDuplicates !== false
  const analysis = analyzeSpreadsheet(file, category, authUser)
  const existingLeads = await fetchCategoryLeads(category)

  const importableRecords = []
  const enrichments = []
  const additionalHeaderSet = new Set()
  let duplicateRows = 0
  let skippedRows = 0
  let errorRows = 0

  const confirmContext = buildImportContext(
    existingLeads,
    authUser,
    analysis.originalFileName
  )

  analysis.parsed.rows.forEach((row) => {
    const result = normalizeImportedRow(
      row,
      category,
      confirmContext,
      analysis.parsed.headers
    )
    ;(result.additionalCustomHeaders || []).forEach((header) =>
      additionalHeaderSet.add(header)
    )

    if (result.duplicate) {
      duplicateRows += 1
      if (enrichExistingDuplicates && result.existingLeadId && result.record) {
        const existing = confirmContext.existingById.get(result.existingLeadId)
        const updates = buildEnrichmentUpdates(existing, result.record)
        if (updates) {
          enrichments.push({ leadId: result.existingLeadId, updates })
        }
      }
      return
    }

    if (!result.valid || !result.record) {
      errorRows += 1
      skippedRows += 1
      return
    }

    importableRecords.push(result.record)
  })

  const batchRef = db.collection(BATCHES_COLLECTION).doc()
  const batchMetadata = {
    leadChannel: 'meta',
    leadCategory: category,
    originalFileName: analysis.originalFileName,
    fileType: analysis.parsed.fileType,
    totalRows: analysis.parsed.rows.length,
    validRows: importableRecords.length,
    importedRows: importableRecords.length,
    duplicateRows,
    enrichedRows: 0,
    skippedRows,
    errorRows,
    additionalHeaders: Array.from(additionalHeaderSet),
    importedBy: authUser.id,
    createdAt: FieldValue.serverTimestamp(),
  }

  const CHUNK_SIZE = 400
  if (importableRecords.length) {
    for (let index = 0; index < importableRecords.length; index += CHUNK_SIZE) {
      const chunk = importableRecords.slice(index, index + CHUNK_SIZE)
      const writeBatch = db.batch()

      if (index === 0) {
        writeBatch.set(batchRef, batchMetadata)
      }

      chunk.forEach((record) => {
        const leadRef = db.collection(LEADS_COLLECTION).doc()
        writeBatch.set(leadRef, {
          ...record,
          importBatchId: batchRef.id,
        })
      })

      await writeBatch.commit()
    }
  }

  let enrichedRows = 0
  if (enrichments.length) {
    for (let index = 0; index < enrichments.length; index += CHUNK_SIZE) {
      const chunk = enrichments.slice(index, index + CHUNK_SIZE)
      const writeBatch = db.batch()
      chunk.forEach(({ leadId, updates }) => {
        writeBatch.update(db.collection(LEADS_COLLECTION).doc(leadId), updates)
        enrichedRows += 1
      })
      await writeBatch.commit()
    }
  }

  if (!importableRecords.length) {
    await batchRef.set({
      ...batchMetadata,
      enrichedRows,
    })
  } else if (enrichedRows > 0) {
    await batchRef.update({ enrichedRows })
  }

  return {
    totalRows: analysis.parsed.rows.length,
    importedRows: importableRecords.length,
    duplicateRows,
    enrichedRows,
    skippedRows,
    errorRows,
    batchId: batchRef.id,
  }
}

function applyLeadFilters(leads, filters = {}, authUser) {
  let result = [...leads]

  if (!canViewAllMetaLeads(authUser)) {
    result = result.filter((lead) => lead.assignedTo === authUser.id)
  }

  const search = String(filters.search || '').trim().toLowerCase()
  if (search) {
    result = result.filter((lead) => {
      const standardValues = [
        lead.fullName,
        lead.email,
        lead.phone,
        lead.phoneNormalized,
        lead.companyName,
        lead.city,
        lead.formName,
        lead.estimatedProjectBudget,
        lead.websiteType,
      ]
      const customValues = Object.values(lead.customFields || {})
      return [...standardValues, ...customValues].some((value) =>
        String(value || '').toLowerCase().includes(search)
      )
    })
  }

  if (filters.temperature) {
    result = result.filter((lead) => lead.temperature === filters.temperature)
  }
  if (filters.stage) {
    result = result.filter((lead) => lead.stage === filters.stage)
  }
  if (filters.status) {
    result = result.filter((lead) => lead.status === filters.status)
  }
  if (filters.assignedTo === 'unassigned') {
    result = result.filter((lead) => !lead.assignedTo)
  } else if (filters.assignedTo) {
    result = result.filter((lead) => lead.assignedTo === filters.assignedTo)
  }

  result.sort((a, b) => {
    const aDate = a.importedAt?.toDate?.() || a.updatedAt?.toDate?.() || new Date(0)
    const bDate = b.importedAt?.toDate?.() || b.updatedAt?.toDate?.() || new Date(0)
    return bDate - aDate
  })

  return result
}

async function listMetaLeads(category, filters, authUser) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new AppError('Select a valid Meta leads category.', 400)
  }

  const leads = await fetchCategoryLeads(category)
  const filtered = applyLeadFilters(leads, filters, authUser)
  const assignedMemberMap = await getAssignedMemberMap()

  return filtered.map((lead) =>
    sanitizeMetaLead(
      lead,
      lead.assignedTo ? assignedMemberMap.get(lead.assignedTo) || null : null
    )
  )
}

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

async function getAssignedMemberName(assignedTo) {
  if (!assignedTo) return null
  const memberSnap = await db.collection(USERS_COLLECTION).doc(assignedTo).get()
  if (!memberSnap.exists) return null
  const member = memberSnap.data()
  return member.name || member.full_name || 'Team Member'
}

async function returnSanitizedLead(leadId) {
  const lead = await getMetaLeadRecord(leadId)
  const assignedMember = await getAssignedMemberName(lead.assignedTo)
  return sanitizeMetaLead(lead, assignedMember)
}

async function getMetaLeadById(leadId, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanViewMetaLead(lead, authUser)
  const assignedMember = await getAssignedMemberName(lead.assignedTo)
  return sanitizeMetaLead(lead, assignedMember)
}

async function findDuplicateContact(emailLower, phoneNormalized, category, excludeLeadId) {
  const leads = await fetchCategoryLeads(category)
  for (const lead of leads) {
    if (lead.id === excludeLeadId) continue
    if (emailLower && lead.emailLower === emailLower) {
      throw new AppError('A Meta lead with this email already exists.', 400)
    }
    if (phoneNormalized && lead.phoneNormalized === phoneNormalized) {
      throw new AppError('A Meta lead with this phone number already exists.', 400)
    }
  }
}

async function validateAssignableMember(assignedTo) {
  if (!assignedTo) return null

  const memberSnap = await db.collection(USERS_COLLECTION).doc(assignedTo).get()
  if (!memberSnap.exists) {
    throw new AppError('Selected team member was not found.', 400)
  }

  const member = memberSnap.data()
  if (
    member.authType !== 'custom' ||
    member.status !== 'active' ||
    !isAssignableRole(member.role)
  ) {
    throw new AppError('Selected team member cannot be assigned leads.', 400)
  }

  return assignedTo
}

async function updateMetaLeadProfile(leadId, payload, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  assertCanEditMetaLead(lead, authUser)

  const email = payload.email || ''
  const emailLower = email ? email.toLowerCase() : ''
  const { phone, phoneNormalized } = normalizePhone(payload.phone)
  const { firstName, lastName } = splitName(payload.fullName)

  await findDuplicateContact(emailLower, phoneNormalized, lead.leadCategory, leadId)

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    fullName: payload.fullName,
    firstName,
    lastName,
    email,
    emailLower,
    phone,
    phoneNormalized,
    companyName: payload.companyName || '',
    city: payload.city || '',
    formName: payload.formName || '',
    updatedAt: FieldValue.serverTimestamp(),
  })

  const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
  const changes = []
  if (payload.fullName !== lead.fullName) changes.push('name')
  if (email !== (lead.email || '')) changes.push('email')
  if (phone !== (lead.phone || '')) changes.push('phone')
  if ((payload.companyName || '') !== (lead.companyName || '')) changes.push('company')
  if ((payload.city || '') !== (lead.city || '')) changes.push('city')
  if ((payload.formName || '') !== (lead.formName || '')) changes.push('lead form')

  if (changes.length > 0) {
    void addMetaLeadHistoryEntry(
      leadId,
      {
        type: 'lead_updated',
        title: 'Lead details updated',
        description: `Updated ${changes.join(', ')}.`,
      },
      authUser
    )
  }

  return quickSanitizedLead(lead, {
    fullName: payload.fullName,
    firstName,
    lastName,
    email,
    emailLower,
    phone,
    phoneNormalized,
    companyName: payload.companyName || '',
    city: payload.city || '',
    formName: payload.formName || '',
  })
}

async function assignMetaLead(leadId, assignedTo, authUser) {
  assertCanAssignMetaLeads(authUser)
  const lead = await getMetaLeadRecord(leadId)
  const validatedAssignee = await validateAssignableMember(assignedTo)

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    assignedTo: validatedAssignee,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
  const assigneeName = validatedAssignee
    ? await getAssignedMemberName(validatedAssignee)
    : null

  void addMetaLeadHistoryEntry(
    leadId,
    {
      type: 'assignment_changed',
      title: validatedAssignee ? 'Lead assigned' : 'Lead unassigned',
      description: validatedAssignee
        ? `Assigned to ${assigneeName || 'team member'}.`
        : 'Lead is now unassigned.',
      metadata: {
        from: lead.assignedTo || null,
        to: validatedAssignee,
      },
    },
    authUser
  )

  return quickSanitizedLead(lead, { assignedTo: validatedAssignee }, assigneeName)
}

async function updateMetaLeadTemperature(leadId, temperature, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  if (!canMutateMetaLeadWorkflow(lead, authUser)) {
    throw new AppError('You are not authorized to update this lead.', 403)
  }

  const previousTemperature = lead.temperature

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    temperature,
    updatedAt: FieldValue.serverTimestamp(),
  })

  if (previousTemperature !== temperature) {
    const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
    const { formatTemperature } = require('../utils/metaLeadHistoryLabels')
    void addMetaLeadHistoryEntry(
      leadId,
      {
        type: 'temperature_changed',
        title: 'Temperature updated',
        description: `Changed from ${formatTemperature(previousTemperature)} to ${formatTemperature(temperature)}.`,
        metadata: { from: previousTemperature, to: temperature },
      },
      authUser
    )
  }

  return quickSanitizedLead(lead, { temperature })
}

async function updateMetaLeadStage(leadId, stage, authUser, options = {}) {
  const lead = await getMetaLeadRecord(leadId)
  if (!canMutateMetaLeadWorkflow(lead, authUser)) {
    throw new AppError('You are not authorized to update this lead.', 403)
  }

  const previousStage = lead.stage
  const updatePayload = {
    stage,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (stage === 'lost' && options.lostReason) {
    updatePayload.lostReason = options.lostReason
  } else if (stage !== 'lost') {
    updatePayload.lostReason = null
  }

  await db.collection(LEADS_COLLECTION).doc(leadId).update(updatePayload)

  if (previousStage !== stage) {
    const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
    const { formatStage } = require('../utils/metaLeadHistoryLabels')
    const historyType = stage === 'won' ? 'lead_won' : stage === 'lost' ? 'lead_lost' : 'stage_changed'
    const historyTitle = stage === 'won'
      ? 'Lead marked as Won'
      : stage === 'lost'
        ? 'Lead marked as Lost'
        : 'Stage updated'
    let description = `Changed from ${formatStage(previousStage)} to ${formatStage(stage)}.`
    if (stage === 'lost' && options.lostReason) {
      description = `Marked as Lost. Reason: ${options.lostReason}`
    } else if (stage === 'won') {
      description = 'Deal marked as Won.'
    }

    void addMetaLeadHistoryEntry(
      leadId,
      {
        type: historyType,
        title: historyTitle,
        description,
        metadata: {
          from: previousStage,
          to: stage,
          lostReason: options.lostReason || null,
        },
      },
      authUser
    )
  }

  return quickSanitizedLead(lead, {
    stage,
    lostReason: stage === 'lost' ? options.lostReason || null : null,
  })
}

async function updateMetaLeadFollowUp(leadId, nextFollowUpAt, authUser) {
  const lead = await getMetaLeadRecord(leadId)
  if (!canMutateMetaLeadWorkflow(lead, authUser)) {
    throw new AppError('You are not authorized to update this lead.', 403)
  }

  const followUpValue = nextFollowUpAt
    ? Timestamp.fromDate(new Date(nextFollowUpAt))
    : null

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    nextFollowUpAt: followUpValue,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const { syncMetaLeadFollowUpSchedule } = require('./metaLeadFollowUpService')
  void syncMetaLeadFollowUpSchedule(leadId, nextFollowUpAt, authUser).catch(() => {})

  return quickSanitizedLead(lead, { nextFollowUpAt: followUpValue })
}

async function archiveMetaLead(leadId, authUser) {
  assertCanArchiveMetaLeads(authUser)
  const lead = await getMetaLeadRecord(leadId)

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    status: 'archived',
    archivedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
  void addMetaLeadHistoryEntry(
    leadId,
    {
      type: 'lead_archived',
      title: 'Lead archived',
      description: `${lead.fullName || 'Lead'} was moved to archived.`,
    },
    authUser
  )

  return quickSanitizedLead(lead, { status: 'archived', archivedAt: new Date() })
}

async function restoreMetaLead(leadId, authUser) {
  assertCanArchiveMetaLeads(authUser)
  const lead = await getMetaLeadRecord(leadId)

  if (lead.status !== 'archived') {
    throw new AppError('Only archived leads can be restored.', 400)
  }

  await db.collection(LEADS_COLLECTION).doc(leadId).update({
    status: 'active',
    archivedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const { addMetaLeadHistoryEntry } = require('./metaLeadHistoryService')
  void addMetaLeadHistoryEntry(
    leadId,
    {
      type: 'lead_restored',
      title: 'Lead restored',
      description: `${lead.fullName || 'Lead'} was brought back to active leads.`,
    },
    authUser
  )

  return quickSanitizedLead(lead, { status: 'active', archivedAt: null })
}

async function getAssignableMembers(authUser) {
  assertCanAssignMetaLeads(authUser)

  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where('authType', '==', 'custom')
    .where('status', '==', 'active')
    .get()

  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        name: data.name || data.full_name || 'Team Member',
        email: data.email || null,
        role: data.role || null,
      }
    })
    .filter((member) => isAssignableRole(member.role))
    .sort((a, b) => a.name.localeCompare(b.name))
}

async function fetchLeadsForBulk(leadIds, authUser, { managerOnly = false } = {}) {
  if (managerOnly) {
    assertCanAssignMetaLeads(authUser)
  }

  const leads = []
  for (const leadId of leadIds) {
    const lead = await getMetaLeadRecord(leadId)
    if (managerOnly) {
      leads.push(lead)
      continue
    }
    if (!isMetaLeadManager(authUser) && lead.assignedTo !== authUser.id) {
      throw new AppError('You are not authorized to update one or more selected leads.', 403)
    }
    leads.push(lead)
  }
  return leads
}

async function bulkAssignMetaLeads(leadIds, assignedTo, authUser) {
  await fetchLeadsForBulk(leadIds, authUser, { managerOnly: true })
  const validatedAssignee = await validateAssignableMember(assignedTo)

  const batch = db.batch()
  leadIds.forEach((leadId) => {
    batch.update(db.collection(LEADS_COLLECTION).doc(leadId), {
      assignedTo: validatedAssignee,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  await batch.commit()

  return { affectedCount: leadIds.length, leadCategory: null }
}

async function bulkUpdateMetaLeadTemperature(leadIds, temperature, authUser) {
  await fetchLeadsForBulk(leadIds, authUser)

  const batch = db.batch()
  leadIds.forEach((leadId) => {
    batch.update(db.collection(LEADS_COLLECTION).doc(leadId), {
      temperature,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  await batch.commit()

  return { affectedCount: leadIds.length }
}

async function bulkUpdateMetaLeadStage(leadIds, stage, authUser) {
  await fetchLeadsForBulk(leadIds, authUser)

  const batch = db.batch()
  leadIds.forEach((leadId) => {
    batch.update(db.collection(LEADS_COLLECTION).doc(leadId), {
      stage,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  await batch.commit()

  return { affectedCount: leadIds.length }
}

async function bulkArchiveMetaLeads(leadIds, authUser) {
  assertCanArchiveMetaLeads(authUser)
  await fetchLeadsForBulk(leadIds, authUser, { managerOnly: true })

  const batch = db.batch()
  leadIds.forEach((leadId) => {
    batch.update(db.collection(LEADS_COLLECTION).doc(leadId), {
      status: 'archived',
      archivedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
  await batch.commit()

  return { affectedCount: leadIds.length }
}

function escapeCsvValue(value) {
  const text = value == null ? '' : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

function formatExportDate(value) {
  if (!value) return ''
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function collectExportCustomColumns(leads) {
  const columns = new Map()
  leads.forEach((lead) => {
    Object.entries(lead.customFieldLabels || {}).forEach(([key, label]) => {
      if (!columns.has(key)) {
        columns.set(key, label || key)
      }
    })
  })
  return columns
}

function buildExportRow(lead, assignedMemberMap, customColumns) {
  const assignedMember = lead.assignedTo
    ? assignedMemberMap.get(lead.assignedTo) || ''
    : ''

  const base = [
    lead.fullName || '',
    lead.email || '',
    lead.phone || '',
    lead.companyName || '',
    lead.city || '',
    lead.formName || '',
    lead.estimatedProjectBudget || '',
    lead.websiteType || '',
    'Meta',
    SERVICE_LABELS[lead.service] || lead.service || '',
    TEMPERATURE_LABELS[lead.temperature] || lead.temperature || '',
    STAGE_LABELS[lead.stage] || lead.stage || '',
    lead.status === 'archived' ? 'Archived' : 'Active',
    assignedMember,
    formatExportDate(lead.nextFollowUpAt),
    lead.importedFromFile || '',
    formatExportDate(lead.importedAt),
    lead.originalRowNumber ?? '',
  ]

  const customValues = Array.from(customColumns.keys()).map(
    (key) => lead.customFields?.[key] || ''
  )

  return [...base, ...customValues]
}

async function exportMetaLeads(category, filters, authUser) {
  assertCanExportMetaLeads(authUser)

  if (!VALID_CATEGORIES.has(category)) {
    throw new AppError('Select a valid Meta leads category.', 400)
  }

  const leads = await fetchCategoryLeads(category)
  const filtered = applyLeadFilters(leads, filters, authUser)
  const assignedMemberMap = await getAssignedMemberMap()
  const customColumns = collectExportCustomColumns(filtered)

  const headers = [
    'Full Name',
    'Email',
    'Phone',
    'Company Name',
    'City',
    'Form Name',
    'Estimated Project Budget',
    'Website Type',
    'Source',
    'Service',
    'Temperature',
    'Stage',
    'Status',
    'Assigned Member',
    'Next Follow-Up',
    'Imported File',
    'Imported At',
    'Original Row Number',
    ...Array.from(customColumns.values()),
  ]

  const rows = filtered.map((lead) =>
    buildExportRow(lead, assignedMemberMap, customColumns)
      .map(escapeCsvValue)
      .join(',')
  )

  const csv = [headers.map(escapeCsvValue).join(','), ...rows].join('\n')
  const datePart = new Date().toISOString().slice(0, 10)

  return {
    csv,
    filename: `meta-leads-${category}-${datePart}.csv`,
    rowCount: filtered.length,
    leadCategory: category,
  }
}

async function getMetaLeadOverviewStats(authUser) {
  const categories = ['mobile_app_development', 'web_development']
  const stats = {}

  for (const category of categories) {
    const leads = await fetchCategoryLeads(category)
    const visible = applyLeadFilters(leads, {}, authUser)
    stats[category] = {
      total: visible.length,
      active: visible.filter((lead) => lead.status === 'active').length,
      archived: visible.filter((lead) => lead.status === 'archived').length,
      unassigned: visible.filter((lead) => !lead.assignedTo).length,
    }
  }

  return stats
}

function sanitizeImportBatchRecord(doc, importedByName = null) {
  const data = doc.data()
  return {
    id: doc.id,
    originalFileName: data.originalFileName || null,
    totalRows: data.totalRows ?? 0,
    importedRows: data.importedRows ?? 0,
    duplicateRows: data.duplicateRows ?? 0,
    enrichedRows: data.enrichedRows ?? 0,
    skippedRows: data.skippedRows ?? 0,
    errorRows: data.errorRows ?? 0,
    importedByName,
    createdAt: formatExportDate(data.createdAt),
  }
}

async function getImportBatchHistory(category, authUser) {
  if (!isMetaLeadManager(authUser)) {
    throw new AppError('You are not authorized to view import history.', 403)
  }

  if (!VALID_CATEGORIES.has(category)) {
    throw new AppError('Select a valid Meta leads category.', 400)
  }

  const snapshot = await db
    .collection(BATCHES_COLLECTION)
    .where('leadCategory', '==', category)
    .get()

  const assignedMemberMap = await getAssignedMemberMap()

  return snapshot.docs
    .map((doc) => {
      const importedBy = doc.data().importedBy || null
      const importedByName = importedBy
        ? assignedMemberMap.get(importedBy) || 'Team Member'
        : null
      return sanitizeImportBatchRecord(doc, importedByName)
    })
    .sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return bDate - aDate
    })
}

module.exports = {
  previewImport,
  confirmImport,
  listMetaLeads,
  getMetaLeadById,
  returnSanitizedLead,
  getMetaLeadOverviewStats,
  getImportBatchHistory,
  updateMetaLeadProfile,
  assignMetaLead,
  updateMetaLeadTemperature,
  updateMetaLeadStage,
  updateMetaLeadFollowUp,
  archiveMetaLead,
  restoreMetaLead,
  getAssignableMembers,
  bulkAssignMetaLeads,
  bulkUpdateMetaLeadTemperature,
  bulkUpdateMetaLeadStage,
  bulkArchiveMetaLeads,
  exportMetaLeads,
  fetchCategoryLeads,
  applyLeadFilters,
}
