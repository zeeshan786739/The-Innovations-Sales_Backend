const { z } = require('zod')
const AppError = require('../utils/AppError')

const createTeamMemberSchema = z.object({
  name: z
    .string({ required_error: 'Name is required.' })
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(100, 'Name must be at most 100 characters.'),
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .email('A valid email address is required.')
    .transform((value) => value.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone must be at most 30 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
  password: z
    .string({ required_error: 'Password is required.' })
    .min(8, 'Password must contain at least 8 characters.')
    .max(128, 'Password must be at most 128 characters.'),
  role: z.enum(['member', 'sales_member', 'sales_manager'], {
    errorMap: () => ({ message: 'Select a valid team-member role.' }),
  }),
  status: z.enum(['active', 'inactive'], {
    errorMap: () => ({ message: 'Status must be active or inactive.' }),
  }),
})

const editTeamMemberSchema = z.object({
  name: z
    .string({ required_error: 'Name is required.' })
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(100, 'Name must be at most 100 characters.'),
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .email('A valid email address is required.')
    .transform((value) => value.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone must be at most 30 characters.')
    .optional()
    .or(z.literal(''))
    .transform((value) => value || ''),
  role: z.enum(['member', 'sales_member', 'sales_manager'], {
    errorMap: () => ({ message: 'Select a valid team-member role.' }),
  }),
})

const updateTeamMemberStatusSchema = z.object({
  status: z.enum(['active', 'inactive'], {
    errorMap: () => ({ message: 'Status must be active or inactive.' }),
  }),
})

const resetTeamMemberPasswordSchema = z.object({
  password: z
    .string({ required_error: 'Password is required.' })
    .min(8, 'Password must contain at least 8 characters.')
    .max(128, 'Password must be at most 128 characters.'),
})

const teamMemberLoginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required.' })
    .trim()
    .email('A valid email address is required.')
    .transform((value) => value.toLowerCase()),
  password: z.string({ required_error: 'Password is required.' }).min(1, 'Password is required.'),
})

function validateRequest(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const firstError = result.error.errors[0]?.message || 'Invalid request data.'
      return next(new AppError(firstError, 400))
    }

    req.validatedBody = result.data
    return next()
  }
}

module.exports = {
  validateRequest,
  createTeamMemberSchema,
  editTeamMemberSchema,
  updateTeamMemberStatusSchema,
  resetTeamMemberPasswordSchema,
  teamMemberLoginSchema,
}
