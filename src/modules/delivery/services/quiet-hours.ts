import type { DeliveryTargetConfig } from '../../storage/types';

export interface QuietHoursWindow {
  endHour: number;
  startHour: number;
}

export const DEFAULT_QUIET_HOURS: QuietHoursWindow = {
  endHour: 8,
  startHour: 23,
};

export function resolveQuietHoursWindow(config: DeliveryTargetConfig): QuietHoursWindow | null {
  const quietHours = config.quietHours;

  if (quietHours === undefined || quietHours.enabled !== true) {
    return null;
  }

  return {
    endHour: normalizeHour(quietHours.endHour, DEFAULT_QUIET_HOURS.endHour),
    startHour: normalizeHour(quietHours.startHour, DEFAULT_QUIET_HOURS.startHour),
  };
}

export function isWithinQuietHours(date: Date, window: QuietHoursWindow): boolean {
  const hour = date.getHours();

  if (window.startHour === window.endHour) {
    return false;
  }

  if (window.startHour < window.endHour) {
    return hour >= window.startHour && hour < window.endHour;
  }

  return hour >= window.startHour || hour < window.endHour;
}

function normalizeHour(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isInteger(value) || value < 0 || value > 23) {
    return fallback;
  }

  return value;
}
