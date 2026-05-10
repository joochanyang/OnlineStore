export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

export function createSitemapEntry(
  baseUrl: string,
  path: string,
  options: Omit<SitemapEntry, "url"> = {},
): SitemapEntry {
  if (options.priority !== undefined && (options.priority < 0 || options.priority > 1)) {
    throw new Error("sitemap priority must be between 0 and 1");
  }

  return {
    url: new URL(path, baseUrl).toString(),
    ...options,
  };
}

export function createRobotsTxt(baseUrl: string): string {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString();

  return [`User-agent: *`, `Allow: /`, `Sitemap: ${sitemapUrl}`].join("\n");
}
