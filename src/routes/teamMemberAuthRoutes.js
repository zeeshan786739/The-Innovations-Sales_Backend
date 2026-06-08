const express = require('express')
const rateLimit = require('express-rate-limit')
const teamMemberAuthController = require('../controllers/teamMemberAuthController')
const requireTeamMemberSession = require('../middleware/requireTeamMemberSession')
const {
  validateRequest,
  teamMemberLoginSchema,
} = require('../middleware/validateRequest')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again later.',
    })
  },
})

router.post(
  '/login',
  loginLimiter,
  validateRequest(teamMemberLoginSchema),
  asyncHandler(teamMemberAuthController.loginTeamMember)
)

router.get(
  '/me',
  requireTeamMemberSession,
  asyncHandler(teamMemberAuthController.getCurrentTeamMember)
)

router.post(
  '/logout',
  asyncHandler(teamMemberAuthController.logoutTeamMember)
)

module.exports = router
