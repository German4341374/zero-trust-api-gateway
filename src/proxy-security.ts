import type { IncomingHttpHeaders } from 'node:http';
import { createHash } from 'node:crypto';

const REQUEST_HEADER_ALLOWLIST = new Set([
  'accept',
  'accept-language',
  'content-type',
  'if-match',
  'if-none-match',
  'user-agent',
  'x-correlation-id',
]);

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
]);

export function sanitizeRequestHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    const lowerName = name.toLowerCase();
    if (!REQUEST_HEADER_ALLOWLIST.has(lowerName) || value === undefined) {
      continue;
    }
    sanitized[lowerName] = Array.isArray(value) ? value.join(', ') : value;
  }

  return sanitized;
}

export function redactHeaders(
  headers: IncomingHttpHeaders,
): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    redacted[name.toLowerCase()] = SENSITIVE_HEADERS.has(name.toLowerCase())
      ? '[REDACTED]'
      : Array.isArray(value)
        ? value.join(', ')
        : value;
  }

  return redacted;
}

export function buildSafeUpstreamUrl(
  baseUrl: string,
  pathAndQuery: string,
): URL {
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error('Upstream scheme is not supported');
  }
  if (
    !pathAndQuery.startsWith('/') ||
    pathAndQuery.startsWith('//') ||
    pathAndQuery.includes('\\')
  ) {
    throw new Error('Proxy path is not safe');
  }

  const target = new URL(pathAndQuery, base);
  if (
    target.origin !== base.origin ||
    target.username !== '' ||
    target.password !== ''
  ) {
    throw new Error('Proxy target must stay on the configured upstream origin');
  }

  return target;
}

export function subjectFingerprint(subject: string): string {
  return createHash('sha256').update(subject).digest('hex').slice(0, 16);
}
