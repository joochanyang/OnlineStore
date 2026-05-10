export type NotificationChannel = "alimtalk" | "sms" | "email" | "push";

export type NotificationConsent = {
  transactional: boolean;
  marketing: boolean;
  push: boolean;
};

export function canSendNotification(
  channel: NotificationChannel,
  purpose: "transactional" | "marketing",
  consent: NotificationConsent,
): boolean {
  if (purpose === "transactional") {
    return consent.transactional;
  }

  if (channel === "push") {
    return consent.marketing && consent.push;
  }

  return consent.marketing;
}
