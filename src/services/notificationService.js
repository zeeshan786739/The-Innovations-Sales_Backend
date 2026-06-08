const { FieldValue } = require('firebase-admin/firestore')
const { db } = require('../config/firebaseAdmin')
const {
  fetchCategoryLeads,
  applyLeadFilters,
} = require('./metaLeadService')

const CATEGORIES = ['mobile_app_development', 'web_development']
const WON_LOOKBACK_DAYS = 14

function toDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function daysBetween(from, to) {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime()
  return Math.floor(ms / (24 * 60 * 60 * 1000))
}

async function getReadNotificationIds(userId) {
  const snap = await db.collection('users').doc(userId).get()
  if (!snap.exists) return new Set()
  const ids = snap.data().readNotificationIds
  return new Set(Array.isArray(ids) ? ids : [])
}

async function listNotifications(authUser) {
  const readIds = await getReadNotificationIds(authUser.id)
  const notifications = []
  const now = new Date()
  const todayStart = startOfDay(now)
  const todayEnd = endOfDay(now)
  const wonCutoff = new Date(now)
  wonCutoff.setDate(wonCutoff.getDate() - WON_LOOKBACK_DAYS)

  for (const category of CATEGORIES) {
    const leads = await fetchCategoryLeads(category)
    const visible = applyLeadFilters(leads, { status: 'active' }, authUser)

    for (const lead of visible) {
      const followUpAt = toDate(lead.nextFollowUpAt)
      if (followUpAt) {
        if (followUpAt < todayStart) {
          const days = daysBetween(followUpAt, now)
          notifications.push({
            id: `overdue:${lead.id}`,
            type: 'follow_up_overdue',
            title: 'Overdue Follow-up',
            message: `Overdue follow-up with ${lead.fullName || 'lead'}${lead.companyName ? ` (${lead.companyName})` : ''}${days > 0 ? ` — ${days} day${days === 1 ? '' : 's'} overdue` : ''}`,
            leadId: lead.id,
            leadCategory: category,
            createdAt: followUpAt.toISOString(),
            isRead: readIds.has(`overdue:${lead.id}`),
          })
        } else if (followUpAt >= todayStart && followUpAt <= todayEnd) {
          notifications.push({
            id: `due:${lead.id}`,
            type: 'follow_up_due',
            title: 'Follow-up Due',
            message: `You have a follow-up due with ${lead.fullName || 'lead'}${lead.companyName ? ` (${lead.companyName})` : ''}`,
            leadId: lead.id,
            leadCategory: category,
            createdAt: followUpAt.toISOString(),
            isRead: readIds.has(`due:${lead.id}`),
          })
        }
      }

      if (lead.stage === 'won') {
        const updatedAt = toDate(lead.updatedAt) || toDate(lead.importedAt)
        if (updatedAt && updatedAt >= wonCutoff) {
          notifications.push({
            id: `won:${lead.id}`,
            type: 'deal_won',
            title: 'Deal Won!',
            message: `Congratulations! ${lead.fullName || 'Lead'}${lead.companyName ? ` (${lead.companyName})` : ''} marked as Won.`,
            leadId: lead.id,
            leadCategory: category,
            createdAt: updatedAt.toISOString(),
            isRead: readIds.has(`won:${lead.id}`),
          })
        }
      }
    }
  }

  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  return notifications.slice(0, 30)
}

async function markNotificationRead(userId, notificationId) {
  await db.collection('users').doc(userId).set(
    {
      readNotificationIds: FieldValue.arrayUnion(notificationId),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

async function markAllNotificationsRead(userId, notificationIds) {
  if (!notificationIds.length) return
  await db.collection('users').doc(userId).set(
    {
      readNotificationIds: FieldValue.arrayUnion(...notificationIds),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
}
