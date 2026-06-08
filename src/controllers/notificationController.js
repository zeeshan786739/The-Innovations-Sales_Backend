const notificationService = require('../services/notificationService')

async function listNotifications(req, res) {
  const notifications = await notificationService.listNotifications(req.crmUser)

  res.json({
    success: true,
    data: { notifications },
  })
}

async function markNotificationRead(req, res) {
  const notificationId = String(req.params.notificationId || '').trim()
  if (!notificationId) {
    return res.status(400).json({
      success: false,
      message: 'Notification id is required.',
    })
  }

  await notificationService.markNotificationRead(req.crmUser.id, notificationId)

  res.json({
    success: true,
    message: 'Notification marked as read.',
  })
}

async function markAllNotificationsRead(req, res) {
  const notificationIds = Array.isArray(req.body?.notificationIds)
    ? req.body.notificationIds.map((id) => String(id).trim()).filter(Boolean)
    : []

  await notificationService.markAllNotificationsRead(req.crmUser.id, notificationIds)

  res.json({
    success: true,
    message: 'Notifications marked as read.',
  })
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
}
