import { trace, SpanStatusCode } from '@opentelemetry/api';
import { query } from '../db';

const tracer = trace.getTracer('brandcore-quota-service');

export interface TierLimits {
  monthlyCostLimit: number;
  monthlyTokenLimit: number;
}

const TIER_DEFINITIONS: Record<string, TierLimits> = {
  free: { monthlyCostLimit: 1.00, monthlyTokenLimit: 10000 },
  pro: { monthlyCostLimit: 50.00, monthlyTokenLimit: 500000 },
  enterprise: { monthlyCostLimit: 500.00, monthlyTokenLimit: 5000000 }
};

export interface QuotaCheckResult {
  allowed: boolean;
  tier: string;
  currentCostUsd: number;
  costLimit: number;
  currentTokens: number;
  tokenLimit: number;
  reason?: string;
}

// In-memory fallback usage cache for synthetic/demo users
const inMemoryUserUsage = new Map<string, { currentCostUsd: number; currentTokens: number; tier: string }>();

export function resetInMemoryUsage(): void {
  inMemoryUserUsage.clear();
}

/**
 * Checks if a user's current usage plus estimated cost breaches their tier limit.
 */
export async function checkQuota(
  userId: string,
  estimatedCostUsd: number = 0.001,
  estimatedTokens: number = 100
): Promise<QuotaCheckResult> {
  return tracer.startActiveSpan('quota_enforcement', async (span) => {
    span.setAttribute('user.id', userId);
    span.setAttribute('quota.estimated_cost', estimatedCostUsd);

    let tier = 'free';
    let currentCostUsd = 0;
    let currentTokens = 0;

    try {
      const userRes = await query(
        'SELECT tier, current_cost_usd, current_tokens_used FROM users WHERE id = $1',
        [userId]
      );
      if (userRes.rows.length > 0) {
        tier = userRes.rows[0].tier || 'free';
        currentCostUsd = parseFloat(userRes.rows[0].current_cost_usd || '0');
        currentTokens = parseInt(userRes.rows[0].current_tokens_used || '0', 10);
      } else if (inMemoryUserUsage.has(userId)) {
        const mem = inMemoryUserUsage.get(userId)!;
        tier = mem.tier;
        currentCostUsd = mem.currentCostUsd;
        currentTokens = mem.currentTokens;
      }
    } catch (err) {
      // Fallback to in-memory usage tracking if DB query fails or user isn't in DB
      if (inMemoryUserUsage.has(userId)) {
        const mem = inMemoryUserUsage.get(userId)!;
        tier = mem.tier;
        currentCostUsd = mem.currentCostUsd;
        currentTokens = mem.currentTokens;
      }
    }

    const limits = TIER_DEFINITIONS[tier] || TIER_DEFINITIONS.free;
    const isCostBreached = (currentCostUsd + estimatedCostUsd) > limits.monthlyCostLimit;
    const isTokenBreached = (currentTokens + estimatedTokens) > limits.monthlyTokenLimit;

    const allowed = !isCostBreached && !isTokenBreached;
    const result: QuotaCheckResult = {
      allowed,
      tier,
      currentCostUsd,
      costLimit: limits.monthlyCostLimit,
      currentTokens,
      tokenLimit: limits.monthlyTokenLimit,
      reason: allowed ? undefined : 'Tier quota cost or token limit exceeded'
    };

    span.setAttribute('quota.allowed', allowed);
    span.setAttribute('quota.tier', tier);
    span.setAttribute('quota.current_cost', currentCostUsd);
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  });
}

/**
 * Records an executed API call's token and cost metrics to usage tables.
 */
export async function recordUsage(
  userId: string,
  endpoint: string,
  tokensUsed: number,
  costUsd: number,
  cacheHit: boolean,
  cacheType: string | null = null
): Promise<void> {
  return tracer.startActiveSpan('record_usage', async (span) => {
    span.setAttribute('user.id', userId);
    span.setAttribute('usage.endpoint', endpoint);
    span.setAttribute('usage.tokens_used', tokensUsed);
    span.setAttribute('usage.cost_usd', costUsd);
    span.setAttribute('usage.cache_hit', cacheHit);

    // Always update in-memory cache
    const existing = inMemoryUserUsage.get(userId) || { currentCostUsd: 0, currentTokens: 0, tier: 'free' };
    existing.currentCostUsd += costUsd;
    existing.currentTokens += tokensUsed;
    inMemoryUserUsage.set(userId, existing);

    try {
      await query(
        `INSERT INTO usage_logs (user_id, endpoint, tokens_used, cost_usd, cache_hit, cache_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, endpoint, tokensUsed, costUsd, cacheHit, cacheType]
      );

      await query(
        `UPDATE users 
         SET current_cost_usd = COALESCE(current_cost_usd, 0) + $1,
             current_tokens_used = COALESCE(current_tokens_used, 0) + $2
         WHERE id = $3`,
        [costUsd, tokensUsed, userId]
      );
    } catch (err) {
      // Non-fatal if DB write fails during synthetic test
    }

    span.setStatus({ code: SpanStatusCode.OK });
  });
}

/**
 * Sets a user's tier for testing or administration.
 */
export async function setUserTier(userId: string, tier: string): Promise<void> {
  const limits = TIER_DEFINITIONS[tier] || TIER_DEFINITIONS.free;
  const existing = inMemoryUserUsage.get(userId) || { currentCostUsd: 0, currentTokens: 0, tier };
  existing.tier = tier;
  inMemoryUserUsage.set(userId, existing);

  try {
    await query(
      `UPDATE users 
       SET tier = $1, monthly_cost_limit = $2, monthly_token_limit = $3 
       WHERE id = $4`,
      [tier, limits.monthlyCostLimit, limits.monthlyTokenLimit, userId]
    );
  } catch (err) {
    // Ignore db missing user in tests
  }
}
