const AppError = require('./AppError')

const ASSIGNABLE_ROLES = new Set(['member', 'sales_member', 'sales_manager'])

function isMetaLeadManager(authUser) {
  return authUser?.role === 'super_admin' || authUser?.role === 'sales_manager'
}

function canViewAllMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function canImportMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function canAssignMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function canArchiveMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function canExportMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function canBulkAssignMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function canBulkArchiveMetaLeads(authUser) {
  return isMetaLeadManager(authUser)
}

function ownsMetaLead(lead, authUser) {
  return lead?.assignedTo === authUser?.id
}

function canEditMetaLead(lead, authUser) {
  if (isMetaLeadManager(authUser)) return true
  if (authUser?.role === 'member' || authUser?.role === 'sales_member') {
    return ownsMetaLead(lead, authUser)
  }
  return false
}

function canMutateMetaLeadWorkflow(lead, authUser) {
  return canEditMetaLead(lead, authUser)
}

function assertCanViewMetaLead(lead, authUser) {
  if (canViewAllMetaLeads(authUser)) return
  if (!ownsMetaLead(lead, authUser)) {
    throw new AppError('You are not authorized to view this lead.', 403)
  }
}

function assertCanEditMetaLead(lead, authUser) {
  if (!canEditMetaLead(lead, authUser)) {
    throw new AppError('You are not authorized to edit this lead.', 403)
  }
}

function assertCanAssignMetaLeads(authUser) {
  if (!canAssignMetaLeads(authUser)) {
    throw new AppError('You are not authorized to assign Meta leads.', 403)
  }
}

function assertCanArchiveMetaLeads(authUser) {
  if (!canArchiveMetaLeads(authUser)) {
    throw new AppError('You are not authorized to archive Meta leads.', 403)
  }
}

function assertCanExportMetaLeads(authUser) {
  if (!canExportMetaLeads(authUser)) {
    throw new AppError('You are not authorized to export Meta leads.', 403)
  }
}

function isAssignableRole(role) {
  return ASSIGNABLE_ROLES.has(role)
}

module.exports = {
  ASSIGNABLE_ROLES,
  isMetaLeadManager,
  canViewAllMetaLeads,
  canImportMetaLeads,
  canAssignMetaLeads,
  canArchiveMetaLeads,
  canExportMetaLeads,
  canBulkAssignMetaLeads,
  canBulkArchiveMetaLeads,
  ownsMetaLead,
  canEditMetaLead,
  canMutateMetaLeadWorkflow,
  assertCanViewMetaLead,
  assertCanEditMetaLead,
  assertCanAssignMetaLeads,
  assertCanArchiveMetaLeads,
  assertCanExportMetaLeads,
  isAssignableRole,
}
