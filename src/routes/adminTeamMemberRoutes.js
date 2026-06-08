const express = require('express')
const adminTeamMemberController = require('../controllers/adminTeamMemberController')
const requireFirebaseSuperAdmin = require('../middleware/requireFirebaseSuperAdmin')
const {
  validateRequest,
  createTeamMemberSchema,
  editTeamMemberSchema,
  updateTeamMemberStatusSchema,
  resetTeamMemberPasswordSchema,
} = require('../middleware/validateRequest')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

router.post(
  '/',
  requireFirebaseSuperAdmin,
  validateRequest(createTeamMemberSchema),
  asyncHandler(adminTeamMemberController.createTeamMember)
)

router.patch(
  '/:memberId/status',
  requireFirebaseSuperAdmin,
  validateRequest(updateTeamMemberStatusSchema),
  asyncHandler(adminTeamMemberController.updateTeamMemberStatus)
)

router.patch(
  '/:memberId/password',
  requireFirebaseSuperAdmin,
  validateRequest(resetTeamMemberPasswordSchema),
  asyncHandler(adminTeamMemberController.resetTeamMemberPassword)
)

router.patch(
  '/:memberId',
  requireFirebaseSuperAdmin,
  validateRequest(editTeamMemberSchema),
  asyncHandler(adminTeamMemberController.updateTeamMember)
)

router.delete(
  '/:memberId',
  requireFirebaseSuperAdmin,
  asyncHandler(adminTeamMemberController.archiveTeamMember)
)

module.exports = router
