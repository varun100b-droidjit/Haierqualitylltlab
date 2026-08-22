export function formatShortDateTime(dateStr?: string | null): string {
  if (!dateStr) return 'N/A';
  
  const trimmed = dateStr.trim();
  if (!trimmed) return 'N/A';

  // If already in clean format like "2026-08-02 18:36" or "2026-08-02"
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    let dateObj: Date;
    if (trimmed.includes('T')) {
      dateObj = new Date(trimmed);
    } else {
      dateObj = new Date(trimmed.replace(' ', 'T'));
    }

    if (isNaN(dateObj.getTime())) {
      // Return cleaned string up to seconds/timezone if invalid date
      return trimmed.replace(/T/, ' ').replace(/(\+\d{2}:\d{2}|\.000Z|Z)$/, '');
    }

    const yr = dateObj.getFullYear();
    const mo = String(dateObj.getMonth() + 1).padStart(2, '0');
    const da = String(dateObj.getDate()).padStart(2, '0');
    const hr = String(dateObj.getHours()).padStart(2, '0');
    const mi = String(dateObj.getMinutes()).padStart(2, '0');

    return `${yr}-${mo}-${da} ${hr}:${mi}`;
  } catch {
    return trimmed;
  }
}

/**
 * Extract Year and Month short name (Jan, Feb, etc.) from various date representations
 */
export function extractYearAndMonth(dateStr?: string | null): { year: number | null; monthShort: string | null; monthIndex: number | null } {
  if (!dateStr) return { year: null, monthShort: null, monthIndex: null };
  const trimmed = dateStr.trim();
  if (!trimmed) return { year: null, monthShort: null, monthIndex: null };

  try {
    let d: Date;
    if (trimmed.includes('T')) {
      d = new Date(trimmed);
    } else {
      d = new Date(trimmed.replace(' ', 'T'));
    }

    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const monthIndex = d.getMonth(); // 0-11
      const monthShort = d.toLocaleString('en-US', { month: 'short' });
      return { year, monthShort, monthIndex };
    }
  } catch {
    // ignore
  }

  // Fallback regex matching YYYY-MM
  const match = trimmed.match(/^(\d{4})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const monthIndex = parseInt(match[2], 10) - 1;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { year, monthShort: months[monthIndex] || null, monthIndex };
  }

  return { year: null, monthShort: null, monthIndex: null };
}
