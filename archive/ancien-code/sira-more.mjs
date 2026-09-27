export function normalizeTransportMode({ rawMode, operator, network, name }) {
  const raw = String(rawMode ?? '').trim();
  const combined = `${raw} ${operator ?? ''} ${network ?? ''} ${name ?? ''}`.toLowerCase();

  const rules = [
    { pattern: /(sotra|bus|autobus|city bus)/i, mode: 'SOTRA_BUS' },
    { pattern: /(gbaka|gbaka.*bus|informel.*bus)/i, mode: 'GBAKA' },
    { pattern: /(wibus|wibus.*bus)/i, mode: 'WIBUS' },
    { pattern: /(woro|wôrô|woro-woro|woro woro)/i, mode: 'WORO_WORO' },
    { pattern: /(taxi|cab|taxis)/i, mode: 'TAXI' },
    { pattern: /(ferry|bateau|boat|navette)/i, mode: 'FERRY' },
    { pattern: /(marche|walk|on foot|piéton)/i, mode: 'WALK' },
  ];

  const match = rules.find((rule) => rule.pattern.test(combined));
  if (match) {
    return { rawMode: raw || 'UNKNOWN', siraMode: match.mode, ambiguous: false, reason: `Mapped from source raw mode: ${raw || 'unknown'}` };
  }

  return { rawMode: raw || 'UNKNOWN', siraMode: 'UNKNOWN', ambiguous: true, reason: 'Uncertain mapping; requires manual validation' };
}

export function countCorrespondences(segments = []) {
  const motorized = segments.filter((segment) => segment && segment.mode && segment.mode !== 'WALK').length;
  return Math.max(0, motorized - 1);
}

export function buildMultimodalJourney(segments = []) {
  const total_duration = segments.reduce((sum, segment) => sum + Number(segment.movement_duration ?? 0) + Number(segment.waiting_duration ?? 0) + Number(segment.boarding_duration ?? 0) + Number(segment.transfer_duration ?? 0), 0);
  const total_cost = segments.reduce((sum, segment) => sum + Number(segment.fare ?? 0), 0);
  const total_walking = segments.filter((segment) => segment.mode === 'WALK').reduce((sum, segment) => sum + Number(segment.distance ?? 0), 0);
  const total_risk = segments.reduce((sum, segment) => sum + Number(segment.incident_risk ?? 0), 0) / Math.max(segments.length, 1);
  const total_uncertainty = segments.reduce((sum, segment) => sum + Number(segment.uncertainty ?? 0), 0) / Math.max(segments.length, 1);

  return {
    total_duration,
    total_cost,
    total_walking,
    correspondences: countCorrespondences(segments),
    total_risk: Number(total_risk.toFixed(3)),
    average_uncertainty: Number(total_uncertainty.toFixed(3)),
    segments: segments.map((segment, index) => ({ ...segment, index })),
  };
}

export function paretoFilter(candidates = []) {
  return candidates.filter((candidate) => {
    const dominated = candidates.some((other) => {
      if (other.id === candidate.id) return false;
      const betterOrEqual =
        other.total_duration <= candidate.total_duration &&
        other.total_cost <= candidate.total_cost &&
        other.total_walking <= candidate.total_walking &&
        other.correspondences <= candidate.correspondences &&
        other.risk <= candidate.risk &&
        other.uncertainty <= candidate.uncertainty;
      const strictlyBetter =
        other.total_duration < candidate.total_duration ||
        other.total_cost < candidate.total_cost ||
        other.total_walking < candidate.total_walking ||
        other.correspondences < candidate.correspondences ||
        other.risk < candidate.risk ||
        other.uncertainty < candidate.uncertainty;
      return betterOrEqual && strictlyBetter;
    });
    return !dominated;
  });
}

export function rankCandidates(candidates = [], options = {}) {
  const { maxBudget = 1500, maxWalking = 12, maxConnections = 3, preference = 'balanced' } = options;
  const viable = paretoFilter(candidates);

  const scored = viable.map((candidate) => {
    const durationScore = 1 - Math.min(candidate.total_duration / 90, 1);
    const costScore = 1 - Math.min(candidate.total_cost / Math.max(maxBudget, 1), 1);
    const walkScore = 1 - Math.min(candidate.total_walking / Math.max(maxWalking, 1), 1);
    const comfortScore = Math.min(candidate.comfort ?? 3, 5) / 5;
    const reliabilityScore = 1 - Math.min(candidate.risk ?? 0.3, 1);

    let score = durationScore * 0.32 + costScore * 0.28 + walkScore * 0.12 + comfortScore * 0.18 + reliabilityScore * 0.10;

    if (preference === 'fast') score = durationScore * 0.6 + costScore * 0.12 + walkScore * 0.08 + comfortScore * 0.12 + reliabilityScore * 0.08;
    if (preference === 'cheap') score = durationScore * 0.14 + costScore * 0.6 + walkScore * 0.08 + comfortScore * 0.08 + reliabilityScore * 0.10;
    if (candidate.total_cost > maxBudget) score -= 0.2;
    if (candidate.total_walking > maxWalking) score -= 0.15;
    if (candidate.correspondences > maxConnections) score -= 0.1;

    return { ...candidate, score: Number(Math.max(0, score).toFixed(4)) };
  });

  return scored.sort((left, right) => right.score - left.score).map((item) => {
    const candidate = { ...item };
    delete candidate.score;
    return candidate;
  });
}
