export type NotificationProviderResult = {
  providerMessageId: string;
  accepted: boolean;
  provider: string;
  error?: string;
};

export type NotificationProviderRequest = {
  idempotencyKey: string;
  recipient: string;
  body: string;
};

export type NotificationProvider = {
  name: string;
  send(request: NotificationProviderRequest): Promise<NotificationProviderResult>;
};

export function createMockProvider(name: string, fail = false): NotificationProvider {
  return {
    name,
    async send(request) {
      if (fail) {
        return {
          providerMessageId: `${name}:${request.idempotencyKey}`,
          accepted: false,
          provider: name,
          error: "mock provider failure",
        };
      }

      return {
        providerMessageId: `${name}:${request.idempotencyKey}`,
        accepted: true,
        provider: name,
      };
    },
  };
}

export async function sendWithFallback(
  providers: NotificationProvider[],
  request: NotificationProviderRequest,
): Promise<NotificationProviderResult> {
  if (providers.length === 0) {
    throw new Error("at least one notification provider is required");
  }

  const results: NotificationProviderResult[] = [];

  for (const provider of providers) {
    const result = await provider.send(request);
    results.push(result);

    if (result.accepted) {
      return result;
    }
  }

  return {
    providerMessageId: request.idempotencyKey,
    accepted: false,
    provider: results.at(-1)?.provider ?? "none",
    error: results.map((result) => result.error).filter(Boolean).join("; "),
  };
}
