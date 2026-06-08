const multer = require('multer')
const AppError = require('../utils/AppError')

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.csv', '.xls', '.xlsx'])

const storage = multer.memoryStorage()

function getExtension(filename = '') {
  const index = filename.lastIndexOf('.')
  if (index === -1) return ''
  return filename.slice(index).toLowerCase()
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = getExtension(file.originalname)
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return cb(new AppError('Upload a CSV, XLS, or XLSX file.', 400))
    }
    return cb(null, true)
  },
})

function handleUploadError(error, req, res, next) {
  if (error instanceof AppError) {
    return next(error)
  }
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return next(
      new AppError(
        'The selected file is too large. Upload a file smaller than 5 MB.',
        400
      )
    )
  }
  return next(error)
}

const uploadLeadFile = upload.single('file')

module.exports = {
  uploadLeadFile,
  handleUploadError,
  MAX_FILE_SIZE,
}
