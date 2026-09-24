/**
 * Clean and parse human full name into standardized first, middle, and last name components.
 */
export function parseNameComponents(fullName: string): {
  firstName: string;
  lastName: string;
  firstInitial: string;
  lastInitial: string;
} {
  const clean = (fullName || '')
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
    .replace(/,\s*(PhD|MBA|MSc|MD|CPA|PMP|BSc|BA|MA|BEng|MEng|Dr|Ir|SE|MM|ST|SH|S\.Kom|M\.Kom).*$/i, '') // Remove titles & degrees
    .replace(/\b(Dr\.?|Prof\.?|Mr\.?|Mrs\.?|Ms\.?|Ir\.?|H\.)\s+/gi, '') // Remove prefixes
    .trim();

  const parts = clean.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: 'prospect', lastName: '', firstInitial: 'p', lastInitial: '' };
  }

  const firstName = parts[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const lastName = (parts.length > 1 ? parts[parts.length - 1] : '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const firstInitial = firstName.charAt(0);
  const lastInitial = lastName ? lastName.charAt(0) : '';

  return {
    firstName: firstName || 'prospect',
    lastName,
    firstInitial,
    lastInitial,
  };
}

/**
 * Generate 5-6 standard corporate B2B email permutations from prospect name & company domain.
 * Example for "Iwan Setiawan" at "strategic.com":
 * 1. first.last@domain.com   -> iwan.setiawan@strategic.com
 * 2. first@domain.com        -> iwan@strategic.com
 * 3. flast@domain.com        -> isetiawan@strategic.com
 * 4. first_last@domain.com   -> iwan_setiawan@strategic.com
 * 5. firstl@domain.com       -> iwans@strategic.com
 * 6. last.first@domain.com   -> setiawan.iwan@strategic.com (optional/enterprise)
 */
export function generateEmailPermutations(fullName: string, domain: string): string[] {
  if (!domain || typeof domain !== 'string' || !domain.includes('.')) {
    return [];
  }

  const cleanDomain = domain.toLowerCase().trim().replace(/^@+/, '');
  const { firstName, lastName, firstInitial, lastInitial } = parseNameComponents(fullName);

  if (!firstName) return [];

  const candidates: string[] = [];

  if (lastName) {
    // 1. first.last@domain (Most common enterprise pattern, ~45%)
    candidates.push(`${firstName}.${lastName}@${cleanDomain}`);

    // 2. first@domain (Common in small/mid startups, ~20%)
    candidates.push(`${firstName}@${cleanDomain}`);

    // 3. flast@domain (First initial + last name, ~18%)
    candidates.push(`${firstInitial}${lastName}@${cleanDomain}`);

    // 4. first_last@domain (Underscore separator, ~8%)
    candidates.push(`${firstName}_${lastName}@${cleanDomain}`);

    // 5. firstl@domain (First name + last initial, ~5%)
    candidates.push(`${firstName}${lastInitial}@${cleanDomain}`);

    // 6. last.first@domain (Government / Traditional corporate, ~4%)
    candidates.push(`${lastName}.${firstName}@${cleanDomain}`);
  } else {
    // Single-name prospect
    candidates.push(`${firstName}@${cleanDomain}`);
    candidates.push(`contact@${cleanDomain}`);
    candidates.push(`hello@${cleanDomain}`);
  }

  // Deduplicate and return clean array (max 6 patterns)
  return Array.from(new Set(candidates)).slice(0, 6);
}
