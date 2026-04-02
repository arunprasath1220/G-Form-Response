import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import './ResponsePage.css'

const SHEET_ID = '1cAUk4LWtRc3_Ems2_oWUAqmLBy8JB72jhx_GalpUkkw'

function getCellValue(cell) {
  if (cell === null || cell === undefined) {
    return ''
  }

  return String(cell)
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
  const [sheetTables, setSheetTables] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  useEffect(() => {
    let isMounted = true

    async function loadSheetData() {
      try {
        setIsLoading(true)
        setError('')
        setWarning('')

        const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`
        const response = await fetch(url)

        if (!response.ok) {
          throw new Error(`Unable to fetch sheet data (HTTP ${response.status}).`)
        }

        const workbookBuffer = await response.arrayBuffer()
        const workbook = XLSX.read(workbookBuffer, { type: 'array' })
        const failedSheets = []
        const tables = workbook.SheetNames.reduce((acc, sheetName) => {
          try {
            const worksheet = workbook.Sheets[sheetName]

            if (!worksheet) {
              failedSheets.push(sheetName)
              return acc
            }

            const sheetRows = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              raw: false,
              defval: '',
              blankrows: false,
            })

            const normalizedRows = sheetRows
              .filter((row) => Array.isArray(row))
              .map((row) => row.map(getCellValue))

            const [headerRow = [], ...dataRows] = normalizedRows
            const maxColumnCount = Math.max(
              headerRow.length,
              ...dataRows.map((row) => row.length),
            )

            const columns = Array.from({ length: maxColumnCount }, (_, index) => {
              const value = getCellValue(headerRow[index]).trim()
              return value || `Column ${index + 1}`
            })

            acc.push({
              sheetName,
              columns,
              rows: dataRows,
            })

            return acc
          } catch {
            failedSheets.push(sheetName)
            return acc
          }
        }, [])

        if (isMounted) {
          setSheetTables(tables)

          if (failedSheets.length > 0) {
            setWarning(`Some worksheets could not be rendered: ${failedSheets.join(', ')}`)
          }
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

  const hasAnyRows = useMemo(() => {
    return sheetTables.some((table) => table.rows.length > 0)
  }, [sheetTables])

  const hasAnySheet = useMemo(() => {
    return sheetTables.length > 0
  }, [sheetTables])

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

        {!isLoading && !error && warning && <p className="status">{warning}</p>}

        {!isLoading && !error && !hasAnySheet && (
          <p className="status">No worksheets found in this spreadsheet.</p>
        )}

        {!isLoading && !error && hasAnySheet && !hasAnyRows && (
          <p className="status">No rows found in any worksheet.</p>
        )}

        {!isLoading && !error && hasAnySheet && (
          <div className="sheet-list">
            {sheetTables.map((sheetTable) => {
              const hasRows = sheetTable.rows.length > 0

              return (
                <article className="sheet-section" key={sheetTable.sheetName}>
                  <h2>{sheetTable.sheetName}</h2>
                  {!hasRows ? (
                    <p className="status">No rows in this worksheet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {sheetTable.columns.map((column, index) => (
                              <th key={`${sheetTable.sheetName}-${index}`}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sheetTable.rows.map((row, rowIndex) => (
                            <tr key={`${sheetTable.sheetName}-row-${rowIndex}`}>
                              {sheetTable.columns.map((_, cellIndex) => (
                                <td key={`${sheetTable.sheetName}-cell-${rowIndex}-${cellIndex}`}>
                                  <AttachmentList value={row[cellIndex] || ''} />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
