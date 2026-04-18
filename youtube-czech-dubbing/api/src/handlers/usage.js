import { json, error } from '../utils/response.js';
import { getRateLimitState } from '../middleware/rate-limit.js';

/**
 * GET /v1/usage?period=today|week|month|all&group_by=day|hour
 *
 * Vrací aggregované tenant statistiky z D1 `jobs` tabulky + KV rate-limit stav.
 * Scope: pouze data pro apiKey.tenant_id (ostatní tenanti nejsou viditelní).
 *
 * Response shape:
 * {
 *   period: 'today', range_from: ISO, range_to: ISO,
 *   summary: { requests_total, errors, requests_dub, requests_synthesize,
 *              characters_synthesized, audio_seconds },
 *   providers: { gemini: 12, deepl: 3, openai: 1 },
 *   buckets: [{ ts, requests, audio_seconds }, ...],
 *   rate_limit: { tier, limit_per_minute, current, remaining }
 * }
 */
export async function handleUsage(request, env, ctx, { apiKey }) {
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'today';
  const groupBy = url.searchParams.get('group_by') || 'day';

  const rangeFrom = periodFrom(period);
  const rangeTo = new Date().toISOString();

  const rlState = await getRateLimitState(apiKey, env);

  // Dev mode: žádná D1 → vrať prázdnou kostru, UI ji zobrazí jako "zatím žádná data".
  if (!env.JOBS_DB) {
    return json({
      period, range_from: rangeFrom, range_to: rangeTo,
      summary: emptySummary(),
      providers: {},
      buckets: [],
      rate_limit: {
        tier: rlState.tier,
        limit_per_minute: rlState.limit,
        current: rlState.current,
        remaining: rlState.remaining,
      },
    });
  }

  const fmt = groupBy === 'hour' ? '%Y-%m-%dT%H:00:00Z' : '%Y-%m-%dT00:00:00Z';

  try {
    const whereFrom = rangeFrom || '1970-01-01T00:00:00Z';
    const [summaryRes, providersRes, bucketsRes] = await Promise.all([
      env.JOBS_DB.prepare(
        `SELECT
          COUNT(*) AS requests_total,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS errors,
          SUM(CASE WHEN endpoint='dub' THEN 1 ELSE 0 END) AS requests_dub,
          SUM(CASE WHEN endpoint='synthesize' THEN 1 ELSE 0 END) AS requests_synthesize,
          SUM(CASE WHEN endpoint='translate' THEN 1 ELSE 0 END) AS requests_translate,
          COALESCE(SUM(characters_synthesized),0) AS characters_synthesized,
          COALESCE(SUM(duration_seconds),0) AS audio_seconds
        FROM jobs WHERE tenant_id=? AND created_at >= ?`
      ).bind(apiKey.tenant_id, whereFrom).first(),

      env.JOBS_DB.prepare(
        `SELECT translator_provider, COUNT(*) AS cnt FROM jobs
         WHERE tenant_id=? AND created_at>=? AND translator_provider IS NOT NULL
         GROUP BY translator_provider`
      ).bind(apiKey.tenant_id, whereFrom).all(),

      env.JOBS_DB.prepare(
        `SELECT strftime(?, created_at) AS ts, COUNT(*) AS requests,
                COALESCE(SUM(duration_seconds),0) AS audio_seconds
         FROM jobs WHERE tenant_id=? AND created_at>=?
         GROUP BY ts ORDER BY ts ASC`
      ).bind(fmt, apiKey.tenant_id, whereFrom).all(),
    ]);

    const providers = {};
    for (const row of providersRes.results || []) {
      providers[row.translator_provider] = row.cnt;
    }

    return json({
      period,
      range_from: rangeFrom,
      range_to: rangeTo,
      summary: summaryRes || emptySummary(),
      providers,
      buckets: bucketsRes.results || [],
      rate_limit: {
        tier: rlState.tier,
        limit_per_minute: rlState.limit,
        current: rlState.current,
        remaining: rlState.remaining,
      },
    });
  } catch (e) {
    return error(500, 'usage_query_failed', e.message);
  }
}

function periodFrom(period) {
  const now = Date.now();
  const ms = { today: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000 }[period];
  if (!ms) return null; // 'all'
  return new Date(now - ms).toISOString();
}

function emptySummary() {
  return {
    requests_total: 0, errors: 0,
    requests_dub: 0, requests_synthesize: 0, requests_translate: 0,
    characters_synthesized: 0, audio_seconds: 0,
  };
}
