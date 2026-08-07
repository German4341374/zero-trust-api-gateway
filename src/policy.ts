import { request } from 'undici';

import type { AccessIdentity } from './auth.js';

export interface PolicyInput {
  readonly method: string;
  readonly path: string;
  readonly identity: {
    readonly subject: string;
    readonly roles: readonly string[];
    readonly tenant: string | undefined;
  };
}

export interface PolicyDecision {
  readonly allow: boolean;
  readonly reason: string;
}

export interface Authorizer {
  authorize(input: PolicyInput): Promise<PolicyDecision>;
}

export function buildPolicyInput(
  method: string,
  path: string,
  identity: AccessIdentity,
): PolicyInput {
  return {
    method: method.toUpperCase(),
    path,
    identity: {
      subject: identity.subject,
      roles: [...identity.roles],
      tenant: identity.tenant,
    },
  };
}

function parseDecision(value: unknown): PolicyDecision {
  if (typeof value !== 'object' || value === null) {
    throw new Error('OPA returned an invalid response');
  }
  const result = (value as Record<string, unknown>)['result'];
  if (typeof result !== 'object' || result === null) {
    throw new Error('OPA returned no decision');
  }
  const allow = (result as Record<string, unknown>)['allow'];
  const reason = (result as Record<string, unknown>)['reason'];
  if (typeof allow !== 'boolean' || typeof reason !== 'string') {
    throw new Error('OPA decision has an invalid shape');
  }

  return { allow, reason };
}

export class OpaAuthorizer implements Authorizer {
  public constructor(
    private readonly endpoint: string,
    private readonly timeoutMs: number,
  ) {}

  public async authorize(input: PolicyInput): Promise<PolicyDecision> {
    const response = await request(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input }),
      headersTimeout: this.timeoutMs,
      bodyTimeout: this.timeoutMs,
    });

    if (response.statusCode !== 200) {
      await response.body.dump();
      throw new Error(`OPA returned status ${response.statusCode}`);
    }

    return parseDecision(await response.body.json());
  }
}

export { parseDecision };
