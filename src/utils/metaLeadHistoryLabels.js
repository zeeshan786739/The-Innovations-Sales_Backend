const STAGE_LABELS = {
  new: 'New Lead',
  outreach_started: 'Outreach Started',
  engaged: 'Engaged',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
}

const TEMPERATURE_LABELS = {
  cold: 'Cold',
  warm: 'Warm',
  hot: 'Hot',
}

function formatStage(stage) {
  return STAGE_LABELS[stage] || stage || 'Unknown'
}

function formatTemperature(value) {
  return TEMPERATURE_LABELS[value] || value || 'Unknown'
}

module.exports = {
  STAGE_LABELS,
  TEMPERATURE_LABELS,
  formatStage,
  formatTemperature,
}
