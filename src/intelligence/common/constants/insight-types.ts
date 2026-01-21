export const INSIGHT_TYPES = {
  ANOMALY: 'anomaly',
  TREND: 'trend',
  RECOMMENDATION: 'recommendation',
  ALERT: 'alert',
  MILESTONE: 'milestone',
  TAX_TIP: 'tax_tip'
} as const;

export const INSIGHT_SEVERITY = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  CRITICAL: 'critical'
} as const;

export type InsightType = typeof INSIGHT_TYPES[keyof typeof INSIGHT_TYPES];
export type InsightSeverity = typeof INSIGHT_SEVERITY[keyof typeof INSIGHT_SEVERITY];
