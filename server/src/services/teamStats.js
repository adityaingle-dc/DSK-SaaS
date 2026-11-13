import Valuation from '../models/Valuation.js';

const HOUR = 3600 * 1000;

// Per-evaluator performance from their valuations, optionally limited to a createdAt window.
export async function evaluatorStats({ evaluatorIds, from, to } = {}) {
  const match = {};
  if (evaluatorIds) match.evaluator = { $in: evaluatorIds };
  if (from || to) match.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

  const rows = await Valuation.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$evaluator',
        total: { $sum: 1 },
        draft: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
        submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        totalValue: { $sum: { $ifNull: ['$summary.fairMarketValue', 0] } },
        approvedValue: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, { $ifNull: ['$summary.fairMarketValue', 0] }, 0] } },
        avgSubmitMs: { $avg: { $cond: [{ $ifNull: ['$submittedAt', false] }, { $subtract: ['$submittedAt', '$createdAt'] }, null] } },
        avgReviewMs: { $avg: { $cond: [{ $and: [{ $ifNull: ['$reviewedAt', false] }, { $ifNull: ['$submittedAt', false] }] }, { $subtract: ['$reviewedAt', '$submittedAt'] }, null] } },
        lastValuationAt: { $max: '$updatedAt' },
      },
    },
  ]);

  return new Map(
    rows.map((r) => {
      const decided = r.approved + r.rejected;
      return [
        String(r._id),
        {
          total: r.total,
          draft: r.draft,
          submitted: r.submitted,
          approved: r.approved,
          rejected: r.rejected,
          totalValue: r.totalValue,
          approvedValue: r.approvedValue,
          approvalRate: decided ? Math.round((r.approved / decided) * 1000) / 10 : null,
          avgSubmitHours: r.avgSubmitMs == null ? null : Math.round((r.avgSubmitMs / HOUR) * 10) / 10,
          avgReviewHours: r.avgReviewMs == null ? null : Math.round((r.avgReviewMs / HOUR) * 10) / 10,
          lastValuationAt: r.lastValuationAt,
        },
      ];
    })
  );
}

export const EMPTY_STATS = { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0, totalValue: 0, approvedValue: 0, approvalRate: null, avgSubmitHours: null, avgReviewHours: null, lastValuationAt: null };
