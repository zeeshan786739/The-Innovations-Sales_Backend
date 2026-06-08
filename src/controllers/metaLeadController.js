const metaLeadService = require('../services/metaLeadService')
const metaLeadNoteService = require('../services/metaLeadNoteService')
const metaLeadFollowUpService = require('../services/metaLeadFollowUpService')
const metaLeadHistoryService = require('../services/metaLeadHistoryService')
const { writeAuditLog } = require('../utils/auditLog')
const AppError = require('../utils/AppError')

const VALID_CATEGORIES = new Set(['mobile_app_development', 'web_development'])

function parseCategory(value) {
  const category = String(value || '').trim()
  if (!VALID_CATEGORIES.has(category)) {
    throw new AppError('Select a valid Meta leads category.', 400)
  }
  return category
}

function parseListFilters(query) {
  return {
    search: query.search,
    temperature: query.temperature,
    stage: query.stage,
    status: query.status,
    assignedTo: query.assignedTo,
  }
}

async function getOverview(req, res) {
  const stats = await metaLeadService.getMetaLeadOverviewStats(req.crmUser)

  res.json({
    success: true,
    data: { stats },
  })
}

async function listMetaLeads(req, res) {
  const category = parseCategory(req.query.category)
  const leads = await metaLeadService.listMetaLeads(
    category,
    parseListFilters(req.query),
    req.crmUser
  )

  res.json({
    success: true,
    data: {
      leads,
      totalCount: leads.length,
    },
  })
}

async function getImportHistory(req, res) {
  const category = parseCategory(req.query.category)
  const batches = await metaLeadService.getImportBatchHistory(
    category,
    req.crmUser
  )

  res.json({
    success: true,
    data: { batches },
  })
}

async function exportMetaLeads(req, res) {
  const category = parseCategory(req.query.category)
  const result = await metaLeadService.exportMetaLeads(
    category,
    parseListFilters(req.query),
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_leads_exported',
    performedBy: req.crmUser.id,
    metadata: {
      leadCategory: result.leadCategory,
      affectedCount: result.rowCount,
      createdAt: new Date().toISOString(),
    },
  })

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
  res.send(result.csv)
}

async function getAssignableMembers(req, res) {
  const members = await metaLeadService.getAssignableMembers(req.crmUser)

  res.json({
    success: true,
    data: { members },
  })
}

async function getMetaLead(req, res) {
  const lead = await metaLeadService.getMetaLeadById(req.params.leadId, req.crmUser)

  res.json({
    success: true,
    data: { lead },
  })
}

async function updateMetaLead(req, res) {
  const lead = await metaLeadService.updateMetaLeadProfile(
    req.params.leadId,
    req.validatedBody,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_lead_updated',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Meta lead updated successfully.',
    data: { lead },
  })
}

async function assignMetaLead(req, res) {
  const lead = await metaLeadService.assignMetaLead(
    req.params.leadId,
    req.validatedBody.assignedTo,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_lead_assigned',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead assignment updated successfully.',
    data: { lead },
  })
}

async function updateTemperature(req, res) {
  const lead = await metaLeadService.updateMetaLeadTemperature(
    req.params.leadId,
    req.validatedBody.temperature,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_lead_temperature_updated',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead temperature updated successfully.',
    data: { lead },
  })
}

async function updateStage(req, res) {
  const lead = await metaLeadService.updateMetaLeadStage(
    req.params.leadId,
    req.validatedBody.stage,
    req.crmUser,
    { lostReason: req.validatedBody.lostReason || null }
  )

  void writeAuditLog({
    action: 'meta_lead_stage_updated',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead stage updated successfully.',
    data: { lead },
  })
}

async function updateFollowUp(req, res) {
  const lead = await metaLeadService.updateMetaLeadFollowUp(
    req.params.leadId,
    req.validatedBody.nextFollowUpAt,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_lead_follow_up_updated',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead follow-up updated successfully.',
    data: { lead },
  })
}

async function archiveMetaLead(req, res) {
  const lead = await metaLeadService.archiveMetaLead(req.params.leadId, req.crmUser)

  void writeAuditLog({
    action: 'meta_lead_archived',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Meta lead archived successfully.',
    data: { lead },
  })
}

async function restoreMetaLead(req, res) {
  const lead = await metaLeadService.restoreMetaLead(req.params.leadId, req.crmUser)

  void writeAuditLog({
    action: 'meta_lead_restored',
    performedBy: req.crmUser.id,
    targetUserId: req.params.leadId,
    metadata: {
      targetLeadId: req.params.leadId,
      leadCategory: lead.leadCategory,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Meta lead restored successfully.',
    data: { lead },
  })
}

async function getActiveMetaLeadFollowUp(req, res) {
  const followUp = await metaLeadFollowUpService.getActiveMetaLeadFollowUp(
    req.params.leadId,
    req.crmUser
  )

  res.json({
    success: true,
    data: { followUp },
  })
}

async function completeMetaLeadFollowUp(req, res) {
  const result = await metaLeadFollowUpService.completeMetaLeadFollowUp(
    req.params.leadId,
    req.validatedBody,
    req.crmUser
  )

  res.json({
    success: true,
    message: 'Follow-up updated successfully.',
    data: result,
  })
}

async function listMetaLeadHistory(req, res) {
  const history = await metaLeadHistoryService.listMetaLeadHistory(
    req.params.leadId,
    req.crmUser
  )

  res.json({
    success: true,
    data: { history },
  })
}

async function bulkAssign(req, res) {
  const summary = await metaLeadService.bulkAssignMetaLeads(
    req.validatedBody.leadIds,
    req.validatedBody.assignedTo,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_leads_bulk_assigned',
    performedBy: req.crmUser.id,
    metadata: {
      affectedCount: summary.affectedCount,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead assignments updated successfully.',
    data: { summary },
  })
}

async function bulkTemperature(req, res) {
  const summary = await metaLeadService.bulkUpdateMetaLeadTemperature(
    req.validatedBody.leadIds,
    req.validatedBody.temperature,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_leads_bulk_temperature_updated',
    performedBy: req.crmUser.id,
    metadata: {
      affectedCount: summary.affectedCount,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead temperatures updated successfully.',
    data: { summary },
  })
}

async function bulkStage(req, res) {
  const summary = await metaLeadService.bulkUpdateMetaLeadStage(
    req.validatedBody.leadIds,
    req.validatedBody.stage,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_leads_bulk_stage_updated',
    performedBy: req.crmUser.id,
    metadata: {
      affectedCount: summary.affectedCount,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Lead stages updated successfully.',
    data: { summary },
  })
}

async function bulkArchive(req, res) {
  const summary = await metaLeadService.bulkArchiveMetaLeads(
    req.validatedBody.leadIds,
    req.crmUser
  )

  void writeAuditLog({
    action: 'meta_leads_bulk_archived',
    performedBy: req.crmUser.id,
    metadata: {
      affectedCount: summary.affectedCount,
      createdAt: new Date().toISOString(),
    },
  })

  res.json({
    success: true,
    message: 'Meta leads archived successfully.',
    data: { summary },
  })
}

async function previewImport(req, res) {
  if (!req.file) {
    throw new AppError('Upload a CSV, XLS, or XLSX file.', 400)
  }

  const category = parseCategory(req.body.category)
  const preview = await metaLeadService.previewImport(
    req.file,
    category,
    req.crmUser
  )

  res.json({
    success: true,
    data: { preview },
  })
}

async function confirmImport(req, res) {
  if (!req.file) {
    throw new AppError('Upload a CSV, XLS, or XLSX file.', 400)
  }

  const category = parseCategory(req.body.category)
  const enrichExistingDuplicates = String(req.body.enrichExistingDuplicates || 'true').toLowerCase() !== 'false'
  const summary = await metaLeadService.confirmImport(
    req.file,
    category,
    req.crmUser,
    { enrichExistingDuplicates }
  )

  if (summary.importedRows > 0 || summary.enrichedRows > 0) {
    void writeAuditLog({
      action: 'meta_leads_imported',
      performedBy: req.crmUser.id,
      metadata: {
        importBatchId: summary.batchId,
        leadCategory: category,
        importedRows: summary.importedRows,
        duplicateRows: summary.duplicateRows,
        enrichedRows: summary.enrichedRows,
        skippedRows: summary.skippedRows,
        createdAt: new Date().toISOString(),
      },
    })
  }

  res.json({
    success: true,
    message: 'Meta leads imported successfully.',
    data: { summary },
  })
}

async function listMetaLeadNotes(req, res) {
  const notes = await metaLeadNoteService.listMetaLeadNotes(
    req.params.leadId,
    req.crmUser
  )

  res.json({
    success: true,
    data: { notes },
  })
}

async function createMetaLeadNote(req, res) {
  const note = await metaLeadNoteService.createMetaLeadNote(
    req.params.leadId,
    req.validatedBody.content,
    req.crmUser
  )

  res.status(201).json({
    success: true,
    message: 'Note added successfully.',
    data: { note },
  })
}

async function updateMetaLeadNote(req, res) {
  const note = await metaLeadNoteService.updateMetaLeadNote(
    req.params.leadId,
    req.params.noteId,
    req.validatedBody.content,
    req.crmUser
  )

  res.json({
    success: true,
    message: 'Note updated successfully.',
    data: { note },
  })
}

async function deleteMetaLeadNote(req, res) {
  await metaLeadNoteService.deleteMetaLeadNote(
    req.params.leadId,
    req.params.noteId,
    req.crmUser
  )

  res.json({
    success: true,
    message: 'Note deleted successfully.',
  })
}

module.exports = {
  getOverview,
  listMetaLeads,
  getImportHistory,
  exportMetaLeads,
  getAssignableMembers,
  getMetaLead,
  updateMetaLead,
  assignMetaLead,
  updateTemperature,
  updateStage,
  updateFollowUp,
  archiveMetaLead,
  restoreMetaLead,
  getActiveMetaLeadFollowUp,
  completeMetaLeadFollowUp,
  listMetaLeadHistory,
  bulkAssign,
  bulkTemperature,
  bulkStage,
  bulkArchive,
  previewImport,
  confirmImport,
  listMetaLeadNotes,
  createMetaLeadNote,
  updateMetaLeadNote,
  deleteMetaLeadNote,
}
