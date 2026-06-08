const XLSX = require('xlsx')
const { XMLParser } = require('fast-xml-parser')
const AppError = require('../utils/AppError')

const MAX_ROWS = 5000

function isPhoneLikeValue(text) {
  const digits = String(text || '').replace(/[^\d+]/g, '')
  return /^\+?\d{6,}$/.test(digits)
}

function sanitizeCellValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && value instanceof Date) {
    return value.toISOString()
  }
  const text = String(value).trim()
  if (/^[=+\-@]/.test(text)) {
    if (text.startsWith('+') && isPhoneLikeValue(text)) {
      return text
    }
    return `'${text}`
  }
  return text
}

function trimHeader(header) {
  return String(header || '').trim()
}

function isXmlSpreadsheet(buffer) {
  const sample = buffer.toString('utf8', 0, Math.min(buffer.length, 2000)).trim()
  return (
    sample.startsWith('<?xml') &&
    (sample.includes('schemas-microsoft-com:office:spreadsheet') ||
      sample.includes('<Workbook'))
  )
}

function parseXmlSpreadsheet(buffer) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
  })

  const parsed = parser.parse(buffer.toString('utf8'))
  const workbook = parsed?.Workbook || parsed?.workbook
  const worksheet = workbook?.Worksheet || workbook?.worksheet
  const worksheetNode = Array.isArray(worksheet) ? worksheet[0] : worksheet
  const table = worksheetNode?.Table || worksheetNode?.table
  const rows = table?.Row || table?.row || []
  const rowList = Array.isArray(rows) ? rows : [rows]

  if (!rowList.length) {
    throw new AppError('The uploaded file does not contain any lead records.', 400)
  }

  const matrix = rowList.map((row) => {
    const cells = row?.Cell || row?.cell || []
    const cellList = Array.isArray(cells) ? cells : [cells]
    return cellList.map((cell) => {
      const data = cell?.Data ?? cell?.data ?? ''
      if (typeof data === 'object' && data !== null) {
        return sanitizeCellValue(data['#text'] ?? data._ ?? '')
      }
      return sanitizeCellValue(data)
    })
  })

  const headers = (matrix[0] || []).map(trimHeader).filter(Boolean)
  const dataRows = matrix.slice(1).map((cells, index) => {
    const rowObject = {}
    headers.forEach((header, headerIndex) => {
      rowObject[header] = sanitizeCellValue(cells[headerIndex] ?? '')
    })
    rowObject.__rowNumber = index + 2
    return rowObject
  })

  return {
    headers,
    rows: dataRows,
    fileType: 'xml-spreadsheet',
  }
}

function rowsFromSheet(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  })

  if (!matrix.length) {
    throw new AppError('The uploaded file does not contain any lead records.', 400)
  }

  const headers = (matrix[0] || []).map(trimHeader).filter(Boolean)
  const rows = matrix.slice(1).map((cells, index) => {
    const rowObject = {}
    const sheetRowIndex = index + 1
    headers.forEach((header, headerIndex) => {
      const cellRef = XLSX.utils.encode_cell({ r: sheetRowIndex, c: headerIndex })
      const cell = sheet[cellRef]
      let value = cell?.w ?? cells[headerIndex] ?? ''
      if (!value && cell?.v != null) {
        value = String(cell.v)
      }
      rowObject[header] = sanitizeCellValue(value)
    })
    rowObject.__rowNumber = index + 2
    return rowObject
  })

  return {
    headers,
    rows,
  }
}

function parseSpreadsheetFile(file) {
  if (!file?.buffer?.length) {
    throw new AppError('The uploaded file does not contain any lead records.', 400)
  }

  const extension = String(file.originalname || '')
    .slice(file.originalname.lastIndexOf('.'))
    .toLowerCase()

  if (!['.csv', '.xls', '.xlsx'].includes(extension)) {
    throw new AppError('Upload a CSV, XLS, or XLSX file.', 400)
  }

  if (extension === '.xls' && isXmlSpreadsheet(file.buffer)) {
    const parsed = parseXmlSpreadsheet(file.buffer)
    if (parsed.rows.length > MAX_ROWS) {
      throw new AppError(
        'The file contains too many records. Upload a file with no more than 5000 rows.',
        400
      )
    }
    return parsed
  }

  let workbook
  try {
    workbook = XLSX.read(file.buffer, {
      type: 'buffer',
      cellText: true,
      cellDates: false,
      raw: false,
    })
  } catch {
    if (extension === '.xls' && isXmlSpreadsheet(file.buffer)) {
      const parsed = parseXmlSpreadsheet(file.buffer)
      if (parsed.rows.length > MAX_ROWS) {
        throw new AppError(
          'The file contains too many records. Upload a file with no more than 5000 rows.',
          400
        )
      }
      return parsed
    }
    throw new AppError(
      'Unable to read this spreadsheet. Please confirm the file format and try again.',
      400
    )
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new AppError('The uploaded file does not contain any lead records.', 400)
  }

  const parsed = rowsFromSheet(workbook.Sheets[sheetName])
  const nonEmptyRows = parsed.rows.filter((row) =>
    Object.entries(row).some(
      ([key, value]) => key !== '__rowNumber' && String(value || '').trim()
    )
  )

  if (!nonEmptyRows.length) {
    throw new AppError('The uploaded file does not contain any lead records.', 400)
  }

  if (nonEmptyRows.length > MAX_ROWS) {
    throw new AppError(
      'The file contains too many records. Upload a file with no more than 5000 rows.',
      400
    )
  }

  return {
    headers: parsed.headers,
    rows: nonEmptyRows,
    fileType: extension.replace('.', ''),
  }
}

module.exports = {
  parseSpreadsheetFile,
  MAX_ROWS,
}
