import ActivityLog from '../models/ActivityLog.js';

const clientIp = (req) => (req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req?.ip || req?.socket?.remoteAddress || '').replace('::ffff:', '');

// Never let audit logging break the request: failures are reported to the console only.
export async function logActivity(req, action, { actor = req?.user, entityType, entityId, summary, meta } = {}) {
  try {
    await ActivityLog.create({
      actor: actor?._id,
      actorName: actor?.name,
      actorRole: actor?.role,
      action,
      entityType,
      entityId,
      summary: summary?.slice(0, 300),
      meta,
      ip: clientIp(req),
      userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 250),
    });
  } catch (err) {
    console.error('activity log failed:', action, err.message);
  }
}

export const valuationMeta = (v) => ({
  referenceNo: v.referenceNo,
  applicantName: v.summary?.applicantName,
  bankName: v.summary?.bankName,
  branch: v.summary?.branch,
  reportTemplate: v.summary?.reportTemplate,
  fairMarketValue: v.summary?.fairMarketValue,
  status: v.status,
});
