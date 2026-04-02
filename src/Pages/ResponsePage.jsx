import { useEffect, useMemo, useState } from 'react'
import './ResponsePage.css'

const SHEET_ID = '1cAUk4LWtRc3_Ems2_oWUAqmLBy8JB72jhx_GalpUkkw'
const SHEET_GID = '0'

function parseGoogleVisualizationResponse(rawText) {
  const start = rawText.indexOf('{')
  const end = rawText.lastIndexOf('}')

  if (start === -1 || end === -1 || start >= end) {
    throw new Error('Invalid response format from Google Sheet.')
  }

  const json = rawText.slice(start, end + 1)
  return JSON.parse(json)
}

function getCellValue(cell) {
  if (!cell) {
    return ''
  }

  if (cell.f) {
    return cell.f
  }

  if (cell.v === null || cell.v === undefined) {
    return ''
  }

  return String(cell.v)
}

function isValidUrl(value) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function getGoogleDriveFileId(url) {
  const pathMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
  if (pathMatch) {
    return pathMatch[1]
  }

  const queryMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (queryMatch) {
    return queryMatch[1]
  }

  return ''
}

function getFileNameFromUrl(url, fallbackName) {
  try {
    const parsed = new URL(url)
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()
    if (lastSegment) {
      return decodeURIComponent(lastSegment)
    }
  } catch {
    return fallbackName
  }

  return fallbackName
}

function parseCellAttachments(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return []
  }

  const candidates = rawValue
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)

  return candidates
    .filter((candidate) => isValidUrl(candidate))
    .map((url, index) => {
      const driveId = getGoogleDriveFileId(url)
      const openUrl = driveId ? `https://drive.google.com/file/d/${driveId}/view` : url
      const lowerUrl = url.toLowerCase()
      const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(lowerUrl)
      const previewUrl = driveId
        ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w600`
        : isImage
          ? url
          : ''
      const label = driveId
        ? `Attachment ${index + 1}`
        : getFileNameFromUrl(url, `Attachment ${index + 1}`)

      return {
        key: `${openUrl}-${index}`,
        openUrl,
        previewUrl,
        label,
      }
    })
}

function AttachmentList({ value }) {
  const attachments = parseCellAttachments(value)

  if (attachments.length === 0) {
    return <span>{value || '-'}</span>
  }

  return (
    <div className="attachment-list">
      {attachments.map((item) => (
        <div className="attachment-item" key={item.key}>
          <a href={item.openUrl} target="_blank" rel="noreferrer" className="file-link">
            {item.label}
          </a>
          {item.previewUrl && (
            <img
              className="file-preview"
              src={item.previewUrl}
              alt={item.label}
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function ResponsePage() {
  const [sheetData, setSheetData] = useState({ columns: [], rows: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadSheetData() {
      try {
        setIsLoading(true)
        setError('')

        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&headers=1&tqx=out:json`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`Unable to fetch sheet data (HTTP ${response.status}).`)
        }

        const rawText = await response.text()
        const parsed = parseGoogleVisualizationResponse(rawText)
        const table = parsed.table || { cols: [], rows: [] }

        const columns = (table.cols || []).map((col, index) => {
          return col.label || col.id || `Column ${index + 1}`
        })

        const rows = (table.rows || []).map((row) => {
          return (row.c || []).map(getCellValue)
        })

        if (isMounted) {
          setSheetData({ columns, rows })
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || 'Unable to load sheet data.')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadSheetData()

    return () => {
      isMounted = false
    }
  }, [])

  const hasRows = useMemo(() => sheetData.rows.length > 0, [sheetData.rows.length])

  return (
    <main className="response-page">
      <section className="hero-panel">
        <p className="eyebrow">Google Sheet Response</p>
        <h1>Response Page</h1>
        <p className="subtitle">Showing live content from your Google Sheet.</p>
      </section>

      <section className="data-panel" aria-live="polite">
        {isLoading && <p className="status">Loading sheet data...</p>}

        {!isLoading && error && (
          <p className="status error">
            {error} Make sure the Google Sheet is shared publicly as Viewer.
          </p>
        )}

        {!isLoading && !error && !hasRows && (
          <p className="status">No rows found in this sheet.</p>
        )}

        {!isLoading && !error && hasRows && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {sheetData.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheetData.rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {row.map((cellValue, cellIndex) => (
                      <td key={`cell-${rowIndex}-${cellIndex}`}>
                        <AttachmentList value={cellValue} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
