import * as XLSX from 'xlsx'

export function exportRowsToExcel(
  rows: Record<string, string | number>[],
  sheetName: string,
  filename: string,
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, filename)
}
