import pino from 'pino';

export function createLogger(level: string): pino.Logger {
  return pino({
    level,
    base: { service: 'zero-trust-api-gateway' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.token',
        '*.password',
      ],
      censor: '[REDACTED]',
    },
  });
}
