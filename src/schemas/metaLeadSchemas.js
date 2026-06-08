const { z } = require('zod')

const editMetaLeadSchema = z.object({
  fullName: z
    .string({ required_error: 'Full name is required.' })
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(150, 'Full name must be at most 150 characters.'),
  email: z
    .string()
    .trim()
    .email('A valid email address is required.')
    .max(254)
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
  phone: z
    .string()
    .trim()
    .max(40, 'Phone must be at most 40 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
  companyName: z
    .string()
    .trim()
    .max(200, 'Company name must be at most 200 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
  city: z
    .string()
    .trim()
    .max(120, 'City must be at most 120 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
  formName: z
    .string()
    .trim()
    .max(200, 'Form name must be at most 200 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
})

const assignMetaLeadSchema = z.object({
  assignedTo: z.union([z.string().trim().min(1), z.null()]),
})

const temperatureSchema = z.object({
  temperature: z.enum(['cold', 'warm', 'hot'], {
    errorMap: () => ({ message: 'Select a valid temperature.' }),
  }),
})

const stageSchema = z.object({
  stage: z.enum(
    ['new', 'outreach_started', 'engaged', 'qualified', 'proposal_sent', 'won', 'lost'],
    { errorMap: () => ({ message: 'Select a valid stage.' }) }
  ),
  lostReason: z
    .string()
    .trim()
    .max(200, 'Lost reason must be at most 200 characters.')
    .optional()
    .nullable(),
})

const followUpSchema = z.object({
  nextFollowUpAt: z.union([
    z.string().datetime({ message: 'Provide a valid follow-up date and time.' }),
    z.null(),
  ]),
})

const bulkLeadIdsSchema = z.object({
  leadIds: z
    .array(z.string().trim().min(1))
    .min(1, 'Select at least one lead.')
    .max(200, 'Select no more than 200 leads at a time.')
    .transform((ids) => [...new Set(ids)]),
})

const bulkAssignSchema = bulkLeadIdsSchema.extend({
  assignedTo: z.union([z.string().trim().min(1), z.null()]),
})

const bulkTemperatureSchema = bulkLeadIdsSchema.merge(temperatureSchema)
const bulkStageSchema = bulkLeadIdsSchema.merge(stageSchema)

const createMetaLeadNoteSchema = z.object({
  content: z
    .string({ required_error: 'Note content is required.' })
    .trim()
    .min(1, 'Note content cannot be empty.')
    .max(5000, 'Note must be at most 5000 characters.'),
})

const updateMetaLeadNoteSchema = createMetaLeadNoteSchema

const completeMetaLeadFollowUpSchema = z.object({
  status: z.enum(['completed', 'missed'], {
    required_error: 'Select a follow-up outcome.',
  }),
  note: z.string().trim().max(2000, 'Note must be at most 2000 characters.').optional().nullable(),
})

module.exports = {
  editMetaLeadSchema,
  assignMetaLeadSchema,
  temperatureSchema,
  stageSchema,
  followUpSchema,
  bulkLeadIdsSchema,
  bulkAssignSchema,
  bulkTemperatureSchema,
  bulkStageSchema,
  createMetaLeadNoteSchema,
  updateMetaLeadNoteSchema,
  completeMetaLeadFollowUpSchema,
}
