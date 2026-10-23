const countFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
export function formatCount(value: number) {
  return countFormat.format(Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0)
}
export function unitCount(value: number, singular: string, plural = `${singular}s`) {
  return `${formatCount(value)} ${value === 1 ? singular : plural}`
}
