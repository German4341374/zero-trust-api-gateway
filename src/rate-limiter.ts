export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string): Promise<RateLimitDecision>;
}

export interface RedisScriptClient {
  eval(
    script: string,
    options: {
      readonly keys: string[];
      readonly arguments: string[];
    },
  ): Promise<unknown>;
}

const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
local limit = tonumber(ARGV[2])
return {current <= limit and 1 or 0, math.max(limit - current, 0), ttl}
`;

export class RedisRateLimiter implements RateLimiter {
  public constructor(
    private readonly redis: RedisScriptClient,
    private readonly limit: number,
    private readonly windowSeconds: number,
  ) {}

  public async consume(key: string): Promise<RateLimitDecision> {
    const rawResult = await this.redis.eval(FIXED_WINDOW_SCRIPT, {
      keys: [`rate:${key}`],
      arguments: [String(this.windowSeconds), String(this.limit)],
    });
    if (!Array.isArray(rawResult) || rawResult.length !== 3) {
      throw new Error('Redis rate limit script returned an invalid result');
    }
    const result = rawResult.map(Number);

    return {
      allowed: result[0] === 1,
      remaining: result[1] ?? 0,
      retryAfterSeconds: Math.max(result[2] ?? 1, 1),
    };
  }
}
