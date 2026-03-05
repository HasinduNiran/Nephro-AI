/**
 * Background Sync Configuration
 * ──────────────────────────────
 * Controls how often the sync job runs, which collections it
 * reads from / writes to, and which metrics are aggregated.
 *
 * Override any value via environment variables (see inline comments).
 */

module.exports = {
  sync_service: {
    /** Master switch – set SYNC_ENABLED=false to disable */
    enabled: process.env.SYNC_ENABLED !== "false",

    // node-cron expression (default: every 60 s).
    // Override with SYNC_CRON env var, e.g. "0/5 * * * *" for every 5 min.
    cron_schedule: process.env.SYNC_CRON || "* * * * *",

    /** Mongoose model name for the deduplicated target */
    target_collection: "DailySummary",

    /** Mongoose model name for raw incoming watch data */
    source_collection: "HealthRecord",
  },

  logic_rules: {
    /**
     * Deduplication strategy.
     * "latest_per_day" → for every (userId + date), keep only the
     * document with the most recent `measuredAt` timestamp.
     */
    deduplication_method: "latest_per_day",

    /** Only these metric fields are aggregated into monthly averages */
    metrics_to_aggregate: ["systolic", "diastolic"],

    /** These fields are excluded from BP aggregation pipelines */
    metrics_to_exclude: ["hba1c"],
  },
};
