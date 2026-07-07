import { loadVerifiedProducts } from "./verifiedProductRegistry";

const AMAZON_HOST_SUFFIXES = ["amazon.com", "amazon.co.uk", "amazon.ca", "amazon.de"];

export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isAmazonHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return AMAZON_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`),
  );
}

export function isHostnameAllowed(hostname: string, allowedHostnames: ReadonlySet<string>): boolean {
  const normalized = hostname.toLowerCase();
  if (isAmazonHostname(normalized)) return false;
  return allowedHostnames.has(normalized);
}

export interface VerifiedProductFetchAllowlist {
  verifiedProductId: string;
  urls: string[];
  allowedHostnames: Set<string>;
}

export function resolveVerifiedProductFetchAllowlist(
  verifiedProductId: string,
): VerifiedProductFetchAllowlist | null {
  const record = loadVerifiedProducts().find((product) => product.id === verifiedProductId);
  if (!record) return null;

  const urls = [record.officialUrl, ...(record.alternateUrls ?? [])].filter(
    (url): url is string => Boolean(url?.trim()),
  );

  const allowedHostnames = new Set<string>();
  const approvedUrls: string[] = [];

  for (const rawUrl of urls) {
    const hostname = hostnameFromUrl(rawUrl);
    if (!hostname || isAmazonHostname(hostname)) continue;
    allowedHostnames.add(hostname);
    approvedUrls.push(rawUrl);
  }

  return {
    verifiedProductId,
    urls: approvedUrls,
    allowedHostnames,
  };
}

export function isFetchUrlApproved(
  url: string,
  allowlist: VerifiedProductFetchAllowlist,
): boolean {
  const hostname = hostnameFromUrl(url);
  if (!hostname) return false;
  if (!isHostnameAllowed(hostname, allowlist.allowedHostnames)) return false;
  return allowlist.urls.some((approvedUrl) => {
    try {
      const approved = new URL(approvedUrl);
      const candidate = new URL(url);
      return approved.hostname.toLowerCase() === candidate.hostname.toLowerCase();
    } catch {
      return false;
    }
  });
}
