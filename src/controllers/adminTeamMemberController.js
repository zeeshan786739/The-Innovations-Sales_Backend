const teamMemberService = require('../services/teamMemberService')
const { writeAuditLog } = require('../utils/auditLog')

async function createTeamMember(req, res) {
  const user = await teamMemberService.createTeamMember(
    req.validatedBody,
    req.superAdmin.id
  )

  await writeAuditLog({
    action: 'team_member_created',
    performedBy: req.superAdmin.id,
    targetUserId: user.id,
  })

  res.status(201).json({
    success: true,
    message: 'Team member created successfully.',
    data: { user },
  })
}

async function updateTeamMember(req, res) {
  const user = await teamMemberService.updateTeamMemberProfile(
    req.params.memberId,
    req.validatedBody
  )

  await writeAuditLog({
    action: 'team_member_updated',
    performedBy: req.superAdmin.id,
    targetUserId: user.id,
  })

  res.json({
    success: true,
    message: 'Team member updated successfully.',
    data: { user },
  })
}

async function updateTeamMemberStatus(req, res) {
  const user = await teamMemberService.updateTeamMemberStatus(
    req.params.memberId,
    req.validatedBody.status
  )

  await writeAuditLog({
    action: 'team_member_status_updated',
    performedBy: req.superAdmin.id,
    targetUserId: user.id,
  })

  res.json({
    success: true,
    message: 'Team member status updated successfully.',
    data: { user },
  })
}

async function resetTeamMemberPassword(req, res) {
  await teamMemberService.resetTeamMemberPassword(
    req.params.memberId,
    req.validatedBody.password
  )

  await writeAuditLog({
    action: 'team_member_password_reset',
    performedBy: req.superAdmin.id,
    targetUserId: req.params.memberId,
  })

  res.json({
    success: true,
    message: 'Team member password updated successfully.',
  })
}

async function archiveTeamMember(req, res) {
  const user = await teamMemberService.archiveTeamMember(req.params.memberId)

  await writeAuditLog({
    action: 'team_member_archived',
    performedBy: req.superAdmin.id,
    targetUserId: user.id,
  })

  res.json({
    success: true,
    message: 'Team member archived successfully.',
    data: { user },
  })
}

module.exports = {
  createTeamMember,
  updateTeamMember,
  updateTeamMemberStatus,
  resetTeamMemberPassword,
  archiveTeamMember,
}
