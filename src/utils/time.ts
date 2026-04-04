export type TimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface TimeStep {
  unit: TimeUnit;
  value: number;
}

export interface TimeTick {
  timestamp: number;
  label: string;
}

const UNIT_SECONDS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000, // Approximate
  year: 31536000, // Approximate
};

const TIME_STEPS: TimeStep[] = [
  { unit: 'second', value: 1 },
  { unit: 'second', value: 2 },
  { unit: 'second', value: 5 },
  { unit: 'second', value: 10 },
  { unit: 'second', value: 15 },
  { unit: 'second', value: 30 },
  { unit: 'minute', value: 1 },
  { unit: 'minute', value: 2 },
  { unit: 'minute', value: 5 },
  { unit: 'minute', value: 10 },
  { unit: 'minute', value: 15 },
  { unit: 'minute', value: 30 },
  { unit: 'hour', value: 1 },
  { unit: 'hour', value: 2 },
  { unit: 'hour', value: 3 },
  { unit: 'hour', value: 4 },
  { unit: 'hour', value: 6 },
  { unit: 'hour', value: 12 },
  { unit: 'day', value: 1 },
  { unit: 'day', value: 2 },
  { unit: 'day', value: 3 },
  { unit: 'day', value: 5 },
  { unit: 'week', value: 1 },
  { unit: 'month', value: 1 },
  { unit: 'month', value: 2 },
  { unit: 'month', value: 3 },
  { unit: 'month', value: 4 },
  { unit: 'month', value: 6 },
  { unit: 'year', value: 1 },
  { unit: 'year', value: 2 },
  { unit: 'year', value: 5 },
  { unit: 'year', value: 10 },
  { unit: 'year', value: 20 },
  { unit: 'year', value: 50 },
  { unit: 'year', value: 100 },
];

export function getTimeStep(rangeSeconds: number, maxTicks: number): TimeStep {
  const idealStep = rangeSeconds / maxTicks;
  for (const step of TIME_STEPS) {
    const stepSeconds = step.unit === 'month' ? 2592000 * step.value :
                        step.unit === 'year' ? 31536000 * step.value :
                        UNIT_SECONDS[step.unit] * step.value;
    if (stepSeconds >= idealStep) return step;
  }
  return TIME_STEPS[TIME_STEPS.length - 1];
}

export function generateTimeTicks(min: number, max: number, step: TimeStep): TimeTick[] {
  const ticks: TimeTick[] = [];
  const { unit, value } = step;

  if (unit === 'second' || unit === 'minute' || unit === 'hour' || unit === 'day') {
    // For these units, we can start with a Date at 'min' and align it
    const d = new Date(min * 1000);
    if (unit === 'minute') d.setSeconds(0, 0);
    else if (unit === 'hour') d.setMinutes(0, 0, 0);
    else if (unit === 'day') d.setHours(0, 0, 0, 0);
    else d.setMilliseconds(0);

    let current = d.getTime() / 1000;
    if (current < min) {
        // Step forward until we hit or pass min
        if (unit === 'second') current += value;
        else if (unit === 'minute') current += 60 * value;
        else if (unit === 'hour') current += 3600 * value;
        else if (unit === 'day') {
            d.setDate(d.getDate() + value);
            current = d.getTime() / 1000;
        }
    }

    while (current <= max) {
      ticks.push({
        timestamp: current,
        label: formatPrimaryLabel(current, unit),
      });

      if (unit === 'day') {
        d.setDate(d.getDate() + value);
        current = d.getTime() / 1000;
      } else {
        current += UNIT_SECONDS[unit] * value;
      }
      if (ticks.length > 200) break;
    }
  } else if (unit === 'week') {
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const diff = (day === 0 ? -6 : 1 - day); // Move to previous Monday
    d.setDate(d.getDate() + diff);

    let current = d.getTime() / 1000;
    while (current <= max) {
      if (current >= min) {
        ticks.push({
          timestamp: current,
          label: formatPrimaryLabel(current, unit),
        });
      }
      d.setDate(d.getDate() + 7 * value);
      current = d.getTime() / 1000;
      if (ticks.length > 200) break;
    }
  } else if (unit === 'month') {
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    d.setUTCDate(1); // UTC to avoid DST issues when setting to 1st of month
    d.setHours(0, 0, 0, 0); // Back to local midnight
    d.setDate(1);

    let current = d.getTime() / 1000;
    while (current <= max) {
      if (current >= min) {
        ticks.push({
          timestamp: current,
          label: formatPrimaryLabel(current, unit),
        });
      }
      d.setMonth(d.getMonth() + value);
      current = d.getTime() / 1000;
      if (ticks.length > 200) break;
    }
  } else if (unit === 'year') {
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    d.setMonth(0, 1);

    let current = d.getTime() / 1000;
    while (current <= max) {
      if (current >= min) {
        ticks.push({
          timestamp: current,
          label: formatPrimaryLabel(current, unit),
        });
      }
      d.setFullYear(d.getFullYear() + value);
      current = d.getTime() / 1000;
      if (ticks.length > 200) break;
    }
  }

  return ticks;
}

function formatPrimaryLabel(ts: number, unit: TimeUnit): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  switch (unit) {
    case 'second':
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    case 'minute':
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'hour':
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case 'day':
      return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
    case 'week':
      return `${d.getDate()}.${d.getMonth() + 1}.`;
    case 'month':
      return d.toLocaleDateString('de-DE', { month: 'short' });
    case 'year':
      return String(d.getFullYear());
    default:
      return '';
  }
}

export interface SecondaryLabel {
  timestamp: number;
  label: string;
}

export function generateSecondaryLabels(min: number, max: number, step: TimeStep): SecondaryLabel[] {
  const labels: SecondaryLabel[] = [];
  const { unit } = step;

  if (unit === 'second' || unit === 'minute' || unit === 'hour') {
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    let current = d.getTime() / 1000;
    while (current <= max) {
      labels.push({
        timestamp: current,
        label: new Date(current * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });
      d.setDate(d.getDate() + 1);
      current = d.getTime() / 1000;
      if (labels.length > 100) break;
    }
  } else if (unit === 'day' || unit === 'week') {
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    d.setMonth(0, 1);
    let current = d.getTime() / 1000;
    while (current <= max) {
      labels.push({
        timestamp: current,
        label: String(new Date(current * 1000).getFullYear()),
      });
      d.setFullYear(d.getFullYear() + 1);
      current = d.getTime() / 1000;
      if (labels.length > 100) break;
    }
  } else if (unit === 'month') {
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    d.setMonth(0, 1);
    let current = d.getTime() / 1000;
    while (current <= max) {
      labels.push({
        timestamp: current,
        label: String(new Date(current * 1000).getFullYear()),
      });
      d.setFullYear(d.getFullYear() + 1);
      current = d.getTime() / 1000;
      if (labels.length > 100) break;
    }
  }

  return labels;
}

export function formatFullDate(ts: number): string {
    const s = new Date(ts * 1000).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });
    // Remove trailing zeros from fractional seconds, and the comma if all zeros
    return s.replace(/,(\d*?[1-9])0+$/, ',$1').replace(/,0+$/, '');
}
