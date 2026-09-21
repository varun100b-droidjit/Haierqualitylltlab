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

/**
 * Automatically returns the machine's actual End Date & Time.
 * Sourced strictly from machine timestamps (endDateTime, completedAt, updatedAt, createdAt) when finished or stopped.
 * NOTE: NEVER reads from testCompleted, to prevent backwards/circular data flow.
 */
export function getMachineEndDateTime(unit?: {
  status?: string;
  endDateTime?: string;
  completedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  requiredHour?: number;
  doneHour?: number;
} | null): string {
  if (!unit) return 'N/A';

  // 1. Explicit endDateTime property recorded by the machine
  if (unit.endDateTime && typeof unit.endDateTime === 'string' && unit.endDateTime.trim() !== '' && unit.endDateTime !== 'NA') {
    return formatShortDateTime(unit.endDateTime);
  }

  // 2. Finished or stopped unit - take machine completion timestamp
  if (unit.status === 'finished' || unit.status === 'stopped' || (Number(unit.doneHour) >= 1045)) {
    if (unit.completedAt && typeof unit.completedAt === 'string' && unit.completedAt.trim() !== '' && unit.completedAt !== 'NA') {
      return formatShortDateTime(unit.completedAt);
    }
    if (unit.updatedAt && typeof unit.updatedAt === 'string' && unit.updatedAt.trim() !== '' && unit.updatedAt !== 'NA') {
      return formatShortDateTime(unit.updatedAt);
    }
    return formatShortDateTime(unit.createdAt);
  }

  return 'In Progress';
}

/**
 * Returns the machine's actual Start Date & Time.
 * Sourced strictly from machine startDateTime or createdAt.
 */
export function getMachineStartDateTime(unit?: {
  startDateTime?: string;
  createdAt?: string;
} | null): string {
  if (!unit) return 'N/A';
  if ((unit as any).startDateTime && typeof (unit as any).startDateTime === 'string' && (unit as any).startDateTime.trim() !== '' && (unit as any).startDateTime !== 'NA') {
    return formatShortDateTime((unit as any).startDateTime);
  }
  return formatShortDateTime(unit.createdAt);
}

/**
 * Returns the data for "Test Completed" strictly derived from the Machine's End Date & Time.
 * "Jis Machine ka End Date End Time me jo data rahega wo hi Test Completed me bhi hoga Automatic"
 */
export function getTestCompletedDate(unit?: {
  status?: string;
  endDateTime?: string;
  completedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  requiredHour?: number;
  doneHour?: number;
  reportDetails?: { testCompleted?: string };
} | null): string {
  if (!unit) return 'N/A';

  // If machine is finished or stopped, its Test Completed date is ALWAYS its exact End Date & Time!
  if (unit.status === 'finished' || unit.status === 'stopped' || (Number(unit.doneHour) >= 1045)) {
    const machineEnd = getMachineEndDateTime(unit);
    if (machineEnd && machineEnd !== 'N/A' && machineEnd !== 'In Progress') {
      return machineEnd;
    }
  }

  // If already specified in reportDetails
  if (unit.reportDetails?.testCompleted && unit.reportDetails.testCompleted !== 'In Progress' && unit.reportDetails.testCompleted !== 'NA') {
    return formatShortDateTime(unit.reportDetails.testCompleted);
  }

  return 'In Progress';
}

/**
 * Returns the data for "Test Commenced" strictly derived from the Machine's Start Date & Time.
 */
export function getTestCommencedDate(unit?: {
  startDateTime?: string;
  createdAt?: string;
  reportDetails?: { testCommenced?: string };
} | null): string {
  if (!unit) return 'N/A';
  const machineStart = getMachineStartDateTime(unit);
  if (machineStart && machineStart !== 'N/A') {
    return machineStart;
  }
  if (unit.reportDetails?.testCommenced && unit.reportDetails.testCommenced !== 'NA') {
    return formatShortDateTime(unit.reportDetails.testCommenced);
  }
  return formatShortDateTime(unit.createdAt);
}

