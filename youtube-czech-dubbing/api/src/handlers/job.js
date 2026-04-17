import { json, error } from '../utils/response.js';

export async function handleJob(request, env, ctx, { params, apiKey }) {
  const [jobId] = params;
  if (!env.JOBS_DB) {
    return json({
      job_id: jobId,
      status: 'not_found',
      message: 'JOBS_DB binding not configured (dev mode).',
    }, 404);
  }
  const row = await env.JOBS_DB.prepare(
    `SELECT id, tenant_id, status, payload, created_at FROM jobs WHERE id = ?`
  ).bind(jobId).first();
  if (!row) return error(404, 'job_not_found', `No job with id ${jobId}`);
  if (row.tenant_id !== apiKey.tenant_id) return error(403, 'forbidden', 'Job belongs to another tenant');
  return json({ job_id: row.id, status: row.status, created_at: row.created_at, ...JSON.parse(row.payload) });
}
