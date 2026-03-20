import { z } from 'zod';

const ratioIndexSchema = z.number().min(-1).max(1).nullable();
const eviSchema = z.number().nullable();
const laiSchema = z.number().nonnegative().nullable();
const isoDateSchema = z.string().min(1).nullable();

export const metricKeySchema = z.enum(['ndvi', 'ndwi', 'ndre', 'evi', 'lai']);
export const freshnessStatusSchema = z.enum(['fresh', 'stale', 'updating']);
export const sourceSchema = z.enum(['real', 'simulated']);
export const dataQualitySchema = z.enum(['good', 'degraded', 'no_data']);

export const interpretationSchema = z.object({
  value: z.number().nullable(),
  status: z.string().min(1)
});

export const satelliteAlertSchema = z.object({
  metric: metricKeySchema,
  code: z.string().min(1),
  severity: z.enum(['info', 'warning', 'critical']),
  message: z.string().min(1),
  value: z.number(),
  threshold: z.string().min(1)
});

export const interpretationsSchema = z.object({
  ndvi: interpretationSchema,
  ndwi: interpretationSchema,
  ndre: interpretationSchema,
  evi: interpretationSchema,
  lai: interpretationSchema
});

export const acquisitionMetadataSchema = z.object({
  image_count: z.number().int().nonnegative(),
  actual_dates: z.array(z.string().min(1))
});

export const satelliteContractSchema = z.object({
  block_id: z.string().min(1),
  source: sourceSchema.default('real'),
  freshness_status: freshnessStatusSchema.default('fresh'),
  composite_date_from: isoDateSchema.default(null),
  composite_date_to: isoDateSchema.default(null),
  last_satellite_update: isoDateSchema.default(null),
  ndvi: ratioIndexSchema.default(null),
  ndwi: ratioIndexSchema.default(null),
  ndre: ratioIndexSchema.default(null),
  evi: eviSchema.default(null),
  lai: laiSchema.default(null),
  cloud_cover_pct: z.number().min(0).max(100).nullable().default(null),
  pixel_count: z.number().int().nonnegative().default(0),
  map_tile_url: z.string().nullable().default(null),
  map_tile_type: z.enum(['ndvi']).nullable().default(null),
  data_quality: dataQualitySchema,
  acquisition_metadata: acquisitionMetadataSchema.default({ image_count: 0, actual_dates: [] }),
  interpretations: interpretationsSchema.default({
    ndvi: { value: null, status: 'No data' },
    ndwi: { value: null, status: 'No data' },
    ndre: { value: null, status: 'No data' },
    evi: { value: null, status: 'No data' },
    lai: { value: null, status: 'No data' }
  }),
  alerts: z.array(satelliteAlertSchema).default([]),
  limitations: z.array(z.string().min(1)).default([])
});

export const blockInsightsSchema = satelliteContractSchema.extend({
  status: freshnessStatusSchema.default('fresh'),
  latency_ms: z.number().nonnegative().default(0),
  error: z.string().nullable().default(null)
});

export const timeseriesPointSchema = z.object({
  date: z.string().min(1),
  observed_on: isoDateSchema.default(null),
  ndvi: ratioIndexSchema.default(null),
  ndwi: ratioIndexSchema.default(null),
  ndre: ratioIndexSchema.default(null),
  evi: eviSchema.default(null),
  lai: laiSchema.default(null)
});

export const timeseriesSchema = z.array(timeseriesPointSchema);

export const waterResponseSchema = satelliteContractSchema.extend({
  lanslu: z.string().min(1),
  date: isoDateSchema.default(null),
  status: z.enum(['Well-watered', 'Mild stress', 'Moderate stress', 'Severe stress', 'No data']),
  recommendation: z.string().min(1)
});

export const metricInsightSchema = z.object({
  metric: metricKeySchema,
  value: z.number().nullable(),
  status: z.string().min(1)
});

export const opportunitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  full_description: z.string().min(1),
  key_points: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  driver_indices: z.array(z.enum(['ndre', 'evi'])).default([])
});

export const opportunitiesResponseSchema = satelliteContractSchema.extend({
  crop: z.string().nullable().default(null),
  ndre_status: z.string().min(1).default('No data'),
  evi_status: z.string().min(1).default('No data'),
  warning: z.string().nullable().default(null),
  insights: z.array(metricInsightSchema).default([]),
  opportunities: z.array(opportunitySchema).default([])
});

export const growerGptBlockSummarySchema = satelliteContractSchema.extend({
  crop: z.string().nullable().default(null),
  date: isoDateSchema.default(null),
  data_age_days: z.number().int().nonnegative().default(0),
  confidence: z.string().min(1).default('low'),
  insights: z.array(metricInsightSchema).default([]),
  message: z.string().nullable().default(null)
});

export type SatelliteContract = z.infer<typeof satelliteContractSchema>;
export type BlockInsightsContract = z.infer<typeof blockInsightsSchema>;
export type SatelliteTimeseriesContract = z.infer<typeof timeseriesPointSchema>;
export type WaterResponseContract = z.infer<typeof waterResponseSchema>;
export type OpportunitiesResponseContract = z.infer<typeof opportunitiesResponseSchema>;
export type GrowerGptBlockSummaryContract = z.infer<typeof growerGptBlockSummarySchema>;
export type MetricInsightContract = z.infer<typeof metricInsightSchema>;
