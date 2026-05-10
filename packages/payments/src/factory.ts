import { TossPaymentsProvider, type TossProviderOptions } from "./toss/provider";
import type { PaymentMode, PaymentProvider } from "./types";

export interface PaymentFactoryEnv {
  PAYMENT_MODE: PaymentMode;
  TOSS_SECRET_KEY?: string;
  TOSS_WEBHOOK_SECRET?: string;
}

export function createPaymentProvider(
  env: PaymentFactoryEnv,
  overrides: Partial<TossProviderOptions> = {},
): PaymentProvider {
  return new TossPaymentsProvider({
    mode: env.PAYMENT_MODE,
    secretKey: env.TOSS_SECRET_KEY,
    webhookSecret: env.TOSS_WEBHOOK_SECRET,
    ...overrides,
  });
}
