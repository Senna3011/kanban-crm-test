import { convert } from 'html-to-text';

/**
 * Sanitizes and cleans email body text.
 * Strips out raw CSS stylesheets, HTML tags, MIME garbage, and excessive whitespace.
 */
export function sanitizeEmailBody(rawText?: string | null, rawHtml?: string | null): string {
  let text = (rawText || '').trim();

  // If bodyText contains CSS/HTML artifacts (e.g. "@media", "body {", "<!--", "<style") or is empty,
  // extract clean text from rawHtml if available
  const looksLikeCssOrHtml = /@media|<\/?[a-z][\s\S]*>|style[\s\S]*\{|div[\s\S]*\{|<!--|<!doctype/i.test(text);

  if ((!text || looksLikeCssOrHtml) && rawHtml) {
    try {
      const converted = convert(rawHtml, {
        wordwrap: false,
        selectors: [
          { selector: 'style', format: 'skip' },
          { selector: 'script', format: 'skip' },
          { selector: 'head', format: 'skip' },
          { selector: 'noscript', format: 'skip' },
          { selector: 'img', format: 'skip' },
          { selector: 'a', options: { ignoreHref: true } },
        ],
      });
      if (converted && converted.trim().length > 0) {
        text = converted.trim();
      }
    } catch {
      // fallback to regex cleaning
    }
  }

  if (!text && rawHtml) {
    text = rawHtml;
  }

  // Regex cleaning for any remaining CSS or HTML tags
  text = text
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?[^>]+(>|$)/g, '')
    // Remove standalone CSS blocks like "@media only screen... { ... }" or "body { margin: 0; }"
    .replace(/@media[^{]+\{([\s\S]+?\}\s*\})+/gi, '')
    .replace(/[a-zA-Z0-9_.#-]+\s*\{[^}]*\}/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Replace multiple newlines / spaces with clean formatting
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return text;
}
