import {
  buildSafeUpstreamUrl,
  redactHeaders,
  sanitizeRequestHeaders,
  subjectFingerprint,
} from '../src/proxy-security.js';
import type { IncomingHttpHeaders } from 'node:http';

describe('proxy request security', () => {
  it('keeps only explicitly allowed request headers', () => {
    expect(
      sanitizeRequestHeaders({
        accept: 'application/json',
        authorization: 'Bearer secret',
        cookie: 'session=secret',
        host: 'attacker.example',
        'x-correlation-id': 'corr-1',
      }),
    ).toEqual({ accept: 'application/json', 'x-correlation-id': 'corr-1' });
  });

  it('joins repeated safe headers', () => {
    expect(
      sanitizeRequestHeaders({
        'accept-language': ['en', 'de'],
      } as unknown as IncomingHttpHeaders),
    ).toEqual({
      'accept-language': 'en, de',
    });
  });

  it('redacts security-sensitive headers from diagnostic output', () => {
    expect(
      redactHeaders({
        authorization: 'Bearer secret',
        cookie: 'a=b',
        'x-api-key': 'secret',
        accept: '*/*',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'x-api-key': '[REDACTED]',
      accept: '*/*',
    });
  });

  it('preserves non-sensitive repeated headers in diagnostic output', () => {
    expect(
      redactHeaders({
        accept: ['application/json', 'text/plain'],
      } as unknown as IncomingHttpHeaders),
    ).toEqual({ accept: 'application/json, text/plain' });
  });

  it('builds a URL only on the configured upstream origin', () => {
    expect(
      buildSafeUpstreamUrl('http://upstream:8090', '/api/profile?view=short')
        .href,
    ).toBe('http://upstream:8090/api/profile?view=short');
  });

  it.each([
    '//attacker.test/path',
    'https://attacker.test/path',
    '/api\\admin',
  ])('rejects unsafe path %s', (path) => {
    expect(() => buildSafeUpstreamUrl('http://upstream:8090', path)).toThrow();
  });

  it('rejects unsupported upstream schemes', () => {
    expect(() => buildSafeUpstreamUrl('file:///etc', '/passwd')).toThrow(
      'scheme',
    );
  });

  it('creates a stable non-reversible subject fingerprint', () => {
    expect(subjectFingerprint('user-123')).toMatch(/^[a-f0-9]{16}$/);
    expect(subjectFingerprint('user-123')).toBe(subjectFingerprint('user-123'));
    expect(subjectFingerprint('user-123')).not.toBe(
      subjectFingerprint('user-456'),
    );
  });
});
