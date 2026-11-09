export interface UpdateCheckResult {
  available: boolean
  version?: string
  notes?: string
  ok: boolean
}

export function shouldWriteCheckMarker(result: UpdateCheckResult | null | undefined): boolean {
  return result?.ok === true
}