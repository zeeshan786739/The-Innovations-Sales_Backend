const express = require('express')
const notificationController = require('../controllers/notificationController')
const { requireCrmAuth } = require('../middleware/requireCrmAuth')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

router.use(requireCrmAuth)

router.get('/', asyncHandler(notificationController.listNotifications))
router.patch('/:notificationId/read', asyncHandler(notificationController.markNotificationRead))
router.post('/read-all', asyncHandler(notificationController.markAllNotificationsRead))

module.exports = router
