export function createCanonicalUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

export type SeoMetadataInput = {
  title: string;
  description: string;
  baseUrl: string;
  path: string;
  imageUrl?: string;
};

export function createSeoMetadata(input: SeoMetadataInput) {
  const canonical = createCanonicalUrl(input.baseUrl, input.path);

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
    },
    openGraph: {
      title: input.title,
      description: input.description,
      url: canonical,
      images: input.imageUrl ? [{ url: input.imageUrl }] : [],
    },
  };
}
