const path = require('path')
const dotenv = require('dotenv')

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const REQUIRED_ENV_VARS = [
  'PORT',
  'FRONTEND_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'JWT_SECRET',
  'COOKIE_NAME',
]

const PLACEHOLDER_VALUES = new Set([
  'PASTE_FIREBASE_PROJECT_ID_HERE',
  'PASTE_FIREBASE_CLIENT_EMAIL_HERE',
  'PASTE_FIREBASE_PRIVATE_KEY_HERE',
  'PASTE_A_LONG_RANDOM_SECRET_HERE',
  'GENERATE_A_SECURE_LOCAL_SECRET',
])

function normalizeValue(value) {
  return String(value || '').trim().replace(/^"|"$/g, '')
}

function isMissingOrPlaceholder(key) {
  const rawValue = process.env[key]
  const value = normalizeValue(rawValue)
  return !value || PLACEHOLDER_VALUES.has(value)
}

function validateEnv() {
  for (const key of REQUIRED_ENV_VARS) {
    if (isMissingOrPlaceholder(key)) {
      console.error(`Environment configuration error: ${key} must be configured.`)
      process.exit(1)
    }
  }
}

validateEnv()

const env = {
  PORT: Number(process.env.PORT),
  NODE_ENV: process.env.NODE_ENV || 'development',
  FRONTEND_URL: process.env.FRONTEND_URL.trim(),
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID.trim(),
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL.trim(),
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY.trim(),
  JWT_SECRET: process.env.JWT_SECRET.trim(),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN?.trim() || '8h',
  COOKIE_NAME: process.env.COOKIE_NAME.trim(),
}

if (Number.isNaN(env.PORT)) {
  console.error('Environment configuration error: PORT must be configured.')
  process.exit(1)
}

module.exports = env
