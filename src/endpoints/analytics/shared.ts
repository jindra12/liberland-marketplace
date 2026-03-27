export const analyticsTemporaryFailureResponse = () =>
  Response.json({ error: 'Analytics is temporarily unavailable.' }, { status: 503 })

export const jsonBodyRequiredResponse = () =>
  Response.json({ error: 'JSON request body is required.' }, { status: 400 })
