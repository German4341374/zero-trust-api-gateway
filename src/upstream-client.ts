import { request } from 'undici';

import { buildSafeUpstreamUrl } from './proxy-security.js';

export interface ForwardRequest {
  readonly method: string;
  readonly pathAndQuery: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface ForwardResponse {
  readonly statusCode: number;
  readonly contentType: string;
  readonly body: string;
}

export interface UpstreamClient {
  forward(input: ForwardRequest): Promise<ForwardResponse>;
}

export class FixedUpstreamClient implements UpstreamClient {
  public constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
    private readonly maxResponseBytes: number,
  ) {}

  public async forward(input: ForwardRequest): Promise<ForwardResponse> {
    const target = buildSafeUpstreamUrl(this.baseUrl, input.pathAndQuery);
    const hasBody =
      input.body !== undefined && !['GET', 'HEAD'].includes(input.method);
    const response = await request(target, {
      method: input.method,
      headers: input.headers,
      body: hasBody ? JSON.stringify(input.body) : null,
      headersTimeout: this.timeoutMs,
      bodyTimeout: this.timeoutMs,
    });

    const contentTypeHeader = response.headers['content-type'];
    return {
      statusCode: response.statusCode,
      contentType: Array.isArray(contentTypeHeader)
        ? (contentTypeHeader[0] ?? 'application/octet-stream')
        : (contentTypeHeader ?? 'application/octet-stream'),
      body: await readBoundedBody(response.body, this.maxResponseBytes),
    };
  }
}

async function readBoundedBody(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error('Upstream response exceeded the configured size limit');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}
