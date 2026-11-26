import { round2 } from '../../utils/numbers';

export interface DailyCowOutput {
  date: string;
  totalLitres: number;
  sessionCount: number;
}

export interface ProductionDropAlert {
  animalId: string;
  animalName: string;
  tagNumber: string;
  baselineAvgLitres: number;
  recentAvgLitres: number;
  dropPercent: number;
  thresholdPercent: number;
  baselineDaysUsed: number;
  message: string;
}

const MIN_BASELINE_DAYS = 5;

/**
 * Detects a meaningful milk production drop for a cow without triggering false alarms
 * from a single unusual entry:
 * - Requires at least MIN_BASELINE_DAYS (5) prior recorded days before the evaluation window.
 * - Requires the last 2 consecutive recorded days to BOTH fall below the drop threshold
 *   compared with the rolling baseline average.
 */
export function evaluateCowDropAlert(params: {
  animalId: string;
  animalName: string;
  tagNumber: string;
  dailySeries: DailyCowOutput[]; // sorted ascending by date
  baselineDays: number;
  thresholdPercent: number;
}): ProductionDropAlert | null {
  const { animalId, animalName, tagNumber, dailySeries, baselineDays, thresholdPercent } = params;

  if (dailySeries.length < MIN_BASELINE_DAYS + 2) {
    return null;
  }

  const recentTwo = dailySeries.slice(-2);
  const priorHistory = dailySeries.slice(0, -2).slice(-baselineDays);

  if (priorHistory.length < MIN_BASELINE_DAYS) {
    return null;
  }

  const baselineSum = priorHistory.reduce((acc, d) => acc + d.totalLitres, 0);
  const baselineAvg = baselineSum / priorHistory.length;

  if (baselineAvg <= 0) {
    return null;
  }

  const cutoff = baselineAvg * (1 - thresholdPercent / 100);
  const bothBelowCutoff = recentTwo.every((d) => d.totalLitres <= cutoff);

  if (!bothBelowCutoff) {
    return null;
  }

  const recentAvg = (recentTwo[0].totalLitres + recentTwo[1].totalLitres) / 2;
  const dropPercent = round2(((baselineAvg - recentAvg) / baselineAvg) * 100);

  return {
    animalId,
    animalName,
    tagNumber,
    baselineAvgLitres: round2(baselineAvg),
    recentAvgLitres: round2(recentAvg),
    dropPercent,
    thresholdPercent: round2(thresholdPercent),
    baselineDaysUsed: priorHistory.length,
    message: `${animalName} (${tagNumber}) averaged ${round2(recentAvg)} L/day over the last 2 recorded days — down ${dropPercent}% from her ${priorHistory.length}-day baseline of ${round2(baselineAvg)} L/day.`,
  };
}
