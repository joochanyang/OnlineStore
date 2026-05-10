export type SupplierConnector = {
  id: string;
  name: string;
  mode: "csv" | "api" | "scrape";
  endpoint?: string;
  active?: boolean;
};

export function assertSupplierConnector(connector: SupplierConnector): SupplierConnector {
  assertRequired(connector.id, "id");
  assertRequired(connector.name, "name");

  if (!["csv", "api", "scrape"].includes(connector.mode)) {
    throw new Error(`Unsupported supplier mode: ${connector.mode}`);
  }

  if (connector.mode === "api" && !connector.endpoint?.trim()) {
    throw new Error("api supplier requires endpoint");
  }

  return {
    ...connector,
    id: connector.id.trim(),
    name: connector.name.trim(),
    active: connector.active ?? true,
  };
}

function assertRequired(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}
