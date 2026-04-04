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

  const d = new Date(min * 1000);
  if (unit === 'second') {
    d.setMilliseconds(0);
    d.setSeconds(Math.floor(d.getSeconds() / value) * value);
  } else if (unit === 'minute') {
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / value) * value);
  } else if (unit === 'hour') {
    d.setMinutes(0, 0, 0);
    d.setHours(Math.floor(d.getHours() / value) * value);
  } else if (unit === 'day') {
    d.setHours(0, 0, 0, 0);
    // For multiple days, we align to the start of the month to be stable
    if (value > 1) {
      d.setDate(1);
    }
  } else if (unit === 'week') {
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
  } else if (unit === 'month') {
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    d.setMonth(Math.floor(d.getMonth() / value) * value);
  } else if (unit === 'year') {
    d.setHours(0, 0, 0, 0);
    d.setMonth(0, 1);
    d.setFullYear(Math.floor(d.getFullYear() / value) * value);
  }

  // Move back one step for margin
  if (unit === 'second') d.setSeconds(d.getSeconds() - value);
  else if (unit === 'minute') d.setMinutes(d.getMinutes() - value);
  else if (unit === 'hour') d.setHours(d.getHours() - value);
  else if (unit === 'day') d.setDate(d.getDate() - value);
  else if (unit === 'week') d.setDate(d.getDate() - 7 * value);
  else if (unit === 'month') d.setMonth(d.getMonth() - value);
  else if (unit === 'year') d.setFullYear(d.getFullYear() - value);

  let current = d.getTime() / 1000;
  // Use a slightly larger max for margin (approx 1 step)
  const marginSeconds = (unit === 'month' ? 31 * 86400 : unit === 'year' ? 366 * 86400 : UNIT_SECONDS[unit]) * value;
  const extendedMax = max + marginSeconds;

  while (current <= extendedMax) {
    ticks.push({
      timestamp: current,
      label: formatPrimaryLabel(current, unit),
    });

    if (unit === 'second') d.setSeconds(d.getSeconds() + value);
    else if (unit === 'minute') d.setMinutes(d.getMinutes() + value);
    else if (unit === 'hour') d.setHours(d.getHours() + value);
    else if (unit === 'day') d.setDate(d.getDate() + value);
    else if (unit === 'week') d.setDate(d.getDate() + 7 * value);
    else if (unit === 'month') d.setMonth(d.getMonth() + value);
    else if (unit === 'year') d.setFullYear(d.getFullYear() + value);

    current = d.getTime() / 1000;
    if (ticks.length > 500) break;
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
    d.setDate(d.getDate() - 1); // margin
    let current = d.getTime() / 1000;
    while (current <= max + 86400) {
      labels.push({
        timestamp: current,
        label: new Date(current * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      });
      d.setDate(d.getDate() + 1);
      current = d.getTime() / 1000;
      if (labels.length > 100) break;
    }
  } else {
    // day, week, month, year
    const d = new Date(min * 1000);
    d.setHours(0, 0, 0, 0);
    d.setMonth(0, 1);
    d.setFullYear(d.getFullYear() - 1); // margin
    let current = d.getTime() / 1000;
    while (current <= max + 31536000) {
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
    return new Date(ts * 1000).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
    });
}
