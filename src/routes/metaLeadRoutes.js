const express = require('express')
const metaLeadController = require('../controllers/metaLeadController')
const { requireCrmAuth, requireCrmImporter } = require('../middleware/requireCrmAuth')
const { uploadLeadFile, handleUploadError } = require('../middleware/uploadLeadFile')
const { validateRequest } = require('../middleware/validateRequest')
const {
  editMetaLeadSchema,
  assignMetaLeadSchema,
  temperatureSchema,
  stageSchema,
  followUpSchema,
  bulkAssignSchema,
  bulkTemperatureSchema,
  bulkStageSchema,
  bulkLeadIdsSchema,
  createMetaLeadNoteSchema,
  updateMetaLeadNoteSchema,
  completeMetaLeadFollowUpSchema,
} = require('../schemas/metaLeadSchemas')
const asyncHandler = require('../utils/asyncHandler')

const router = express.Router()

router.use(requireCrmAuth)

router.get('/overview', asyncHandler(metaLeadController.getOverview))
router.get('/export', asyncHandler(metaLeadController.exportMetaLeads))
router.get('/import/history', asyncHandler(metaLeadController.getImportHistory))
router.get('/assignable-members', asyncHandler(metaLeadController.getAssignableMembers))

router.post(
  '/import/preview',
  requireCrmImporter,
  uploadLeadFile,
  handleUploadError,
  asyncHandler(metaLeadController.previewImport)
)

router.post(
  '/import/confirm',
  requireCrmImporter,
  uploadLeadFile,
  handleUploadError,
  asyncHandler(metaLeadController.confirmImport)
)

router.post(
  '/bulk/assignment',
  validateRequest(bulkAssignSchema),
  asyncHandler(metaLeadController.bulkAssign)
)

router.post(
  '/bulk/temperature',
  validateRequest(bulkTemperatureSchema),
  asyncHandler(metaLeadController.bulkTemperature)
)

router.post(
  '/bulk/stage',
  validateRequest(bulkStageSchema),
  asyncHandler(metaLeadController.bulkStage)
)

router.post(
  '/bulk/archive',
  validateRequest(bulkLeadIdsSchema),
  asyncHandler(metaLeadController.bulkArchive)
)

router.get('/', asyncHandler(metaLeadController.listMetaLeads))

router.patch(
  '/:leadId',
  validateRequest(editMetaLeadSchema),
  asyncHandler(metaLeadController.updateMetaLead)
)

router.patch(
  '/:leadId/assignment',
  validateRequest(assignMetaLeadSchema),
  asyncHandler(metaLeadController.assignMetaLead)
)

router.patch(
  '/:leadId/temperature',
  validateRequest(temperatureSchema),
  asyncHandler(metaLeadController.updateTemperature)
)

router.patch(
  '/:leadId/stage',
  validateRequest(stageSchema),
  asyncHandler(metaLeadController.updateStage)
)

router.patch(
  '/:leadId/follow-up',
  validateRequest(followUpSchema),
  asyncHandler(metaLeadController.updateFollowUp)
)

router.delete('/:leadId', asyncHandler(metaLeadController.archiveMetaLead))

router.patch('/:leadId/restore', asyncHandler(metaLeadController.restoreMetaLead))

router.get('/:leadId/history', asyncHandler(metaLeadController.listMetaLeadHistory))

router.get('/:leadId/follow-ups/active', asyncHandler(metaLeadController.getActiveMetaLeadFollowUp))

router.post(
  '/:leadId/follow-ups/complete',
  validateRequest(completeMetaLeadFollowUpSchema),
  asyncHandler(metaLeadController.completeMetaLeadFollowUp)
)

router.get('/:leadId/notes', asyncHandler(metaLeadController.listMetaLeadNotes))

router.post(
  '/:leadId/notes',
  validateRequest(createMetaLeadNoteSchema),
  asyncHandler(metaLeadController.createMetaLeadNote)
)

router.patch(
  '/:leadId/notes/:noteId',
  validateRequest(updateMetaLeadNoteSchema),
  asyncHandler(metaLeadController.updateMetaLeadNote)
)

router.delete(
  '/:leadId/notes/:noteId',
  asyncHandler(metaLeadController.deleteMetaLeadNote)
)

router.get('/:leadId', asyncHandler(metaLeadController.getMetaLead))

module.exports = router
