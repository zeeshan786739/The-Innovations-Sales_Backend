const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const env = require('./config/env')
const healthRoutes = require('./routes/healthRoutes')
const adminTeamMemberRoutes = require('./routes/adminTeamMemberRoutes')
const teamMemberAuthRoutes = require('./routes/teamMemberAuthRoutes')
const metaLeadRoutes = require('./routes/metaLeadRoutes')
const notificationRoutes = require('./routes/notificationRoutes')
const notFoundHandler = require('./middleware/notFoundHandler')
const errorHandler = require('./middleware/errorHandler')

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
)
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.use('/api/health', healthRoutes)
app.use('/api/admin/team-members', adminTeamMemberRoutes)
app.use('/api/auth/team-members', teamMemberAuthRoutes)
app.use('/api/meta-leads', metaLeadRoutes)
app.use('/api/notifications', notificationRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
