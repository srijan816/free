import { query } from '../../database/db.js';
import { createMagicLink } from '../../integrations/part4.js';
import { config } from '../../config/index.js';

export class ExportsService {
  async createExport(organizationId: string, payload: any) {
    const id = `export_${Date.now()}`;
    await query(
      `INSERT INTO data_exports (
        id,
        organization_id,
        export_type,
        format,
        date_range_start,
        date_range_end,
        filters,
        status,
        requested_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8)`,
      [
        id,
        organizationId,
        payload.export_type,
        payload.format,
        payload.date_range_start || null,
        payload.date_range_end || null,
        payload.filters || {},
        payload.requested_by_user_id || null
      ]
    );

    const magicLink = await createMagicLink({
      organization_id: organizationId,
      entity_type: 'report_export',
      entity_id: id,
      expires_in_days: 7,
      metadata: { export_type: payload.export_type }
    });

    const baseUrl = config.integrations.part4Url.replace(/\/api\/v1$/, '');

    return {
      export_id: id,
      status: 'queued',
      share_token: magicLink.token,
      share_url: magicLink.token ? `${baseUrl}/api/v1/magic-links/${magicLink.token}` : null
    };
  }

  async getExport(organizationId: string, exportId: string) {
    const result = await query<any>(
      `SELECT * FROM data_exports WHERE id = $1 AND organization_id = $2`,
      [exportId, organizationId]
    );

    return result.rows[0] || null;
  }

  async listExports(organizationId: string, limit: number, offset: number) {
    const totalResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM data_exports WHERE organization_id = $1`,
      [organizationId]
    );

    const result = await query<any>(
      `SELECT * FROM data_exports
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );

    return {
      total: Number(totalResult.rows[0]?.count || 0),
      items: result.rows
    };
  }
}
