export const apiVersion = "v1";

export function createApiPath(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `/api/${apiVersion}${normalizedPath}`;
}
