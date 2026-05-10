export type NotificationTemplate = {
  id: string;
  channel: "alimtalk" | "sms" | "email" | "push";
  purpose: "transactional" | "marketing";
  body: string;
};

export function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, string | number>,
): string {
  return template.body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];

    if (value === undefined) {
      throw new Error(`Missing template variable: ${key}`);
    }

    return String(value);
  });
}
