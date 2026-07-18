const AIRTABLE_API_BASE = 'https://api.airtable.com/v0'

export class AirtableConfigError extends Error {}

function getConfig(): { apiKey: string; baseId: string } {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!apiKey || !baseId) {
    throw new AirtableConfigError(
      "Variables d'environnement manquantes : AIRTABLE_API_KEY et/ou AIRTABLE_BASE_ID ne sont pas définies sur Vercel.",
    )
  }
  return { apiKey, baseId }
}

export interface AirtableRecord {
  id: string
  createdTime: string
  fields: Record<string, unknown>
}

interface AirtableListResponse {
  records: AirtableRecord[]
  offset?: string
}

export async function airtableList(tableId: string): Promise<AirtableRecord[]> {
  const { apiKey, baseId } = getConfig()
  const records: AirtableRecord[] = []
  let offset: string | undefined

  do {
    const url = new URL(`${AIRTABLE_API_BASE}/${baseId}/${tableId}`)
    if (offset) url.searchParams.set('offset', offset)

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Airtable a répondu ${response.status} : ${body}`)
    }

    const data = (await response.json()) as AirtableListResponse
    records.push(...data.records)
    offset = data.offset
  } while (offset)

  return records
}

export async function airtableGetRecord(
  tableId: string,
  recordId: string,
): Promise<AirtableRecord | null> {
  const { apiKey, baseId } = getConfig()
  const url = `${AIRTABLE_API_BASE}/${baseId}/${tableId}/${recordId}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable a répondu ${response.status} : ${body}`)
  }

  return (await response.json()) as AirtableRecord
}

export async function airtableCreate(
  tableId: string,
  fields: Record<string, unknown>,
  options?: { typecast?: boolean },
): Promise<AirtableRecord> {
  const { apiKey, baseId } = getConfig()
  const url = `${AIRTABLE_API_BASE}/${baseId}/${tableId}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: options?.typecast ?? false }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable a répondu ${response.status} : ${body}`)
  }

  return (await response.json()) as AirtableRecord
}

export async function airtableUpdate(
  tableId: string,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<AirtableRecord> {
  const { apiKey, baseId } = getConfig()
  const url = `${AIRTABLE_API_BASE}/${baseId}/${tableId}/${recordId}`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable a répondu ${response.status} : ${body}`)
  }

  return (await response.json()) as AirtableRecord
}

export async function airtableUploadAttachment(
  recordId: string,
  fieldName: string,
  filename: string,
  contentType: string,
  base64Data: string,
): Promise<AirtableRecord> {
  const { apiKey, baseId } = getConfig()
  const url = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contentType, filename, file: base64Data }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable a répondu ${response.status} : ${body}`)
  }

  return (await response.json()) as AirtableRecord
}

export async function airtableGetByIds(
  tableId: string,
  ids: string[],
): Promise<AirtableRecord[]> {
  if (ids.length === 0) return []
  const { apiKey, baseId } = getConfig()
  const formula = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(',')})`
  const url = new URL(`${AIRTABLE_API_BASE}/${baseId}/${tableId}`)
  url.searchParams.set('filterByFormula', formula)

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Airtable a répondu ${response.status} : ${body}`)
  }

  const data = (await response.json()) as AirtableListResponse
  return data.records
}
