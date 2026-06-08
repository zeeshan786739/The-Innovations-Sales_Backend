const env = require('../config/env')
const AppError = require('../utils/AppError')

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err)
  }

  const statusCode = err.statusCode || 500
  const message =
    err instanceof AppError
      ? err.message
      : env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message || 'An unexpected error occurred.'

  if (statusCode >= 500 && env.NODE_ENV !== 'production') {
    console.error(err)
  }

  res.status(statusCode).json({
    success: false,
    message,
  })
}

module.exports = errorHandler
