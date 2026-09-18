/**
 * Pure zero-dependency email text sanitizer.
 * Strips out raw CSS stylesheets, HTML tags, MIME artifacts, and normalizes spacing without external dependencies.
 */

function stripHtmlAndCss(input: string): string {
  if (!input) return '';

  return input
    // 1. Remove style and script blocks completely
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

    // 2. Remove standalone CSS blocks like "@media only screen... { ... }" or "body { margin: 0; }"
    .replace(/@media[^{]+\{([\s\S]+?\}\s*\})+/gi, '')
    .replace(/[a-zA-Z0-9_.#-]+\s*\{[^}]*\}/g, '')

    // 3. Convert block level elements to linebreaks
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*[\/]?>/gi, '\n')

    // 4. Strip all remaining HTML tags
    .replace(/<\/?[^>]+(>|$)/g, '')

    // 5. Decode common HTML entities
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&bull;/gi, '•')

    // 6. Clean whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function sanitizeEmailBody(rawText?: string | null, rawHtml?: string | null): string {
  let text = (rawText || '').trim();

  // If plain text looks like CSS/HTML markup (e.g. contains "@media", "body {", "<!--", "<style") or is empty,
  // extract clean text from rawHtml if available
  const looksLikeCssOrHtml = /@media|<\/?[a-z][\s\S]*>|style[\s\S]*\{|div[\s\S]*\{|<!--|<!doctype/i.test(text);

  if ((!text || looksLikeCssOrHtml) && rawHtml) {
    const cleanedFromHtml = stripHtmlAndCss(rawHtml);
    if (cleanedFromHtml.length > 0) {
      return cleanedFromHtml;
    }
  }

  if (text) {
    return stripHtmlAndCss(text);
  }

  if (rawHtml) {
    return stripHtmlAndCss(rawHtml);
  }

  return '';
}
