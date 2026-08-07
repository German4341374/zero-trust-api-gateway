import { RedisRateLimiter } from '../src/rate-limiter.js';

describe('RedisRateLimiter', () => {
  it('maps the atomic Lua result to an allow decision', async () => {
    const redis = { eval: vi.fn().mockResolvedValue([1, 4, 60]) };
    const limiter = new RedisRateLimiter(redis, 5, 60);

    await expect(limiter.consume('subject')).resolves.toEqual({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 60,
    });
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), {
      keys: ['rate:subject'],
      arguments: ['60', '5'],
    });
  });

  it('clamps missing TTL values to one second', async () => {
    const redis = { eval: vi.fn().mockResolvedValue([0, 0, -1]) };
    const limiter = new RedisRateLimiter(redis, 5, 60);

    await expect(limiter.consume('subject')).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
  });
});
