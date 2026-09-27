/**
 * Normalizes text for comparison by removing diacritics (accents),
 * converting to lower case, and trimming whitespace.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Checks if an address string ends with the specified country name,
 * ignoring case and accents, ensuring it matches on a word/punctuation boundary.
 */
export function addressEndsWithCountry(
  address: string,
  country: string,
): boolean {
  const normAddress = normalizeText(address);
  const normCountry = normalizeText(country);
  if (!normCountry || !normAddress) return false;
  if (normAddress === normCountry) return true;
  if (normAddress.endsWith(normCountry)) {
    const charBefore = normAddress[normAddress.length - normCountry.length - 1];
    return !charBefore || /[\s,;:.(\-\/]/.test(charBefore);
  }
  return false;
}

/**
 * Cleans punctuation and trailing whitespace from a legal string.
 */
export function cleanLegalText(text?: string | null): string {
  if (!text) return "";
  return text.trim().replace(/[.,;:\s]+$/, "");
}

/**
 * Formats the legal address and country for display in legal notices (e.g. Legal.astro),
 * stripping trailing punctuation from address, avoiding duplicate country if already
 * present at the end of the address (case and accent insensitive), and ensuring no double dots.
 */
export function formatLegalAddress(
  rawAddress?: string | null,
  rawCountry?: string | null,
  pendingPlaceholder = "[Pendiente]",
): string {
  const cleanAddress = cleanLegalText(rawAddress);
  const cleanCountry = cleanLegalText(rawCountry);

  if (!cleanAddress) {
    if (cleanCountry) {
      return `${pendingPlaceholder}. ${cleanCountry}.`;
    }
    return `${pendingPlaceholder}.`;
  }

  if (cleanCountry && !addressEndsWithCountry(cleanAddress, cleanCountry)) {
    return `${cleanAddress}. ${cleanCountry}.`;
  }

  return `${cleanAddress}.`;
}

/**
 * Formats the jurisdiction (country) for Terms of Service (Legal.astro line 176),
 * cleaning trailing punctuation and spaces so that appending a period never produces double dots.
 */
export function formatJurisdiction(
  rawCountry?: string | null,
  pendingPlaceholder = "[Jurisdicción pendiente]",
): string {
  const clean = cleanLegalText(rawCountry);
  return clean || pendingPlaceholder;
}
