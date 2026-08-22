import { useState, useEffect } from 'react';
import { addShiftActivityLog } from './unitStore';

export type LabShift = 'GENERAL' | 'SHIFT_A' | 'SHIFT_AB' | 'SHIFT_ABC';

export interface ShiftInfo {
  id: LabShift;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  description: string;
  dailyHours: number;
  startMinute: number;
  endMinute: number;
}

export const LAB_SHIFTS: Record<LabShift, ShiftInfo> = {
  GENERAL: {
    id: 'GENERAL',
    name: 'General Shift',
    code: '09:00 - 17:30',
    startTime: '09:00',
    endTime: '17:30',
    description: 'General Shift: 09:00 AM to 05:30 PM (8.5 Hours/Day)',
    dailyHours: 8.5,
    startMinute: 9 * 60,        // 540
    endMinute: 17 * 60 + 30,    // 1050
  },
  SHIFT_A: {
    id: 'SHIFT_A',
    name: 'A Shift',
    code: '07:00 - 15:30',
    startTime: '07:00',
    endTime: '15:30',
    description: 'A Shift: 07:00 AM to 03:30 PM (8.5 Hours/Day)',
    dailyHours: 8.5,
    startMinute: 7 * 60,        // 420
    endMinute: 15 * 60 + 30,    // 930
  },
  SHIFT_AB: {
    id: 'SHIFT_AB',
    name: 'A+B Shift',
    code: '07:00 - 24:00',
    startTime: '07:00',
    endTime: '24:00',
    description: 'A+B Shift: 07:00 AM to 12:00 AM Midnight (17 Hours/Day)',
    dailyHours: 17,
    startMinute: 7 * 60,        // 420
    endMinute: 24 * 60,         // 1440
  },
  SHIFT_ABC: {
    id: 'SHIFT_ABC',
    name: 'A+B+C Shift',
    code: '07:00 - 07:00 (24h)',
    startTime: '07:00',
    endTime: '07:00',
    description: 'A+B+C Shift: 24 Hours Continuous Operation (07:00 AM to 07:00 AM Next Day)',
    dailyHours: 24,
    startMinute: 0,
    endMinute: 24 * 60,
  }
};

const STORAGE_KEY = 'llt_active_lab_shift';

let currentShift: LabShift = 'GENERAL';

// Load stored shift on init
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && saved in LAB_SHIFTS) {
    currentShift = saved as LabShift;
  }
}

type ShiftChangeListener = (shift: LabShift) => void;
const listeners = new Set<ShiftChangeListener>();

export function getActiveLabShift(): LabShift {
  return currentShift;
}

export function setActiveLabShift(shift: LabShift, operatorName: string = 'Shift Manager'): void {
  if (!(shift in LAB_SHIFTS)) return;
  const oldShift = currentShift;
  currentShift = shift;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, shift);
  }
  listeners.forEach(fn => fn(shift));

  if (oldShift !== shift) {
    const shiftDetails = LAB_SHIFTS[shift];
    addShiftActivityLog(
      `Lab Shift Switched to ${shiftDetails.name} (${shiftDetails.code})`,
      'shift_change',
      shiftDetails.name,
      operatorName
    );
  }
}

export function subscribeLabShift(listener: ShiftChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActiveLabShift(): [LabShift, (shift: LabShift) => void] {
  const [shift, setShift] = useState<LabShift>(currentShift);

  useEffect(() => {
    const unsubscribe = subscribeLabShift((newShift) => {
      setShift(newShift);
    });
    return unsubscribe;
  }, []);

  return [shift, setActiveLabShift];
}

/**
 * Calculates operational elapsed hours between start and end timestamps
 * based on selected Lab Shift schedule.
 */
export function calculateShiftElapsedHours(
  startMs: number, 
  endMs: number = Date.now(), 
  shiftId: LabShift = currentShift
): number {
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 0;

  const shift = LAB_SHIFTS[shiftId] || LAB_SHIFTS.GENERAL;

  // A+B+C is full 24/7 continuous operation
  if (shiftId === 'SHIFT_ABC') {
    return Math.round(((endMs - startMs) / (1000 * 60 * 60)) * 10) / 10;
  }

  let totalMs = 0;

  const startDate = new Date(startMs);
  const endDate = new Date(endMs);

  // Set startOfDay for loop
  const curDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const lastDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (curDay.getTime() <= lastDay.getTime()) {
    const dayStartMs = curDay.getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    // Shift window on this day
    const shiftStartMs = dayStartMs + shift.startMinute * 60 * 1000;
    const shiftEndMs = dayStartMs + shift.endMinute * 60 * 1000;

    // Unit active window on this day
    const unitStartMs = Math.max(startMs, dayStartMs);
    const unitEndMs = Math.min(endMs, dayEndMs);

    if (unitStartMs < unitEndMs) {
      const overlapStart = Math.max(unitStartMs, shiftStartMs);
      const overlapEnd = Math.min(unitEndMs, shiftEndMs);

      if (overlapStart < overlapEnd) {
        totalMs += (overlapEnd - overlapStart);
      }
    }

    // Move to next day
    curDay.setDate(curDay.getDate() + 1);
  }

  const hours = totalMs / (1000 * 60 * 60);
  return Math.round(hours * 10) / 10;
}

/**
 * Calculates exact operational elapsed hours without 1-decimal rounding
 */
export function calculateShiftElapsedExactHours(
  startMs: number, 
  endMs: number = Date.now(), 
  shiftId: LabShift = currentShift
): number {
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return 0;

  const shift = LAB_SHIFTS[shiftId] || LAB_SHIFTS.GENERAL;

  if (shiftId === 'SHIFT_ABC') {
    return (endMs - startMs) / (1000 * 60 * 60);
  }

  let totalMs = 0;
  const startDate = new Date(startMs);
  const endDate = new Date(endMs);

  const curDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const lastDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  while (curDay.getTime() <= lastDay.getTime()) {
    const dayStartMs = curDay.getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

    const shiftStartMs = dayStartMs + shift.startMinute * 60 * 1000;
    const shiftEndMs = dayStartMs + shift.endMinute * 60 * 1000;

    const unitStartMs = Math.max(startMs, dayStartMs);
    const unitEndMs = Math.min(endMs, dayEndMs);

    if (unitStartMs < unitEndMs) {
      const overlapStart = Math.max(unitStartMs, shiftStartMs);
      const overlapEnd = Math.min(unitEndMs, shiftEndMs);

      if (overlapStart < overlapEnd) {
        totalMs += (overlapEnd - overlapStart);
      }
    }

    curDay.setDate(curDay.getDate() + 1);
  }

  return totalMs / (1000 * 60 * 60);
}

/**
 * Formats decimal hours into HH:MM string format (e.g. 24.4 -> "24:24", 1.5 -> "01:30")
 */
export function formatHoursToHHMM(decimalHours: number): string {
  if (isNaN(decimalHours) || decimalHours <= 0) return '00:00';
  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * Checks if the lab shift is currently active at the present moment.
 */
export function isShiftActiveNow(shiftId: LabShift = currentShift): boolean {
  const shift = LAB_SHIFTS[shiftId] || LAB_SHIFTS.GENERAL;
  if (shift.id === 'SHIFT_ABC') return true; // 24-hour continuous operation

  const now = new Date();
  const currentMinute = now.getHours() * 60 + now.getMinutes();

  if (shift.startMinute <= shift.endMinute) {
    return currentMinute >= shift.startMinute && currentMinute < shift.endMinute;
  } else {
    // Overnight shift
    return currentMinute >= shift.startMinute || currentMinute < shift.endMinute;
  }
}

/**
 * Hook that returns true if the current active shift is operational right now.
 * Automatically re-checks every 10 seconds.
 */
export function useIsShiftActiveNow(): boolean {
  const [activeShift] = useActiveLabShift();
  const [isActive, setIsActive] = useState<boolean>(() => isShiftActiveNow(activeShift));

  useEffect(() => {
    const check = () => {
      setIsActive(isShiftActiveNow(activeShift));
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [activeShift]);

  return isActive;
}

