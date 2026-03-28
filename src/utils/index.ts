// Status management
export {
  getNextStatus,
  updateMovieStatus,
  processComparison,
  STATUS_PRIORITY,
  shouldShowMovie,
  getStatusEmoji,
  getStatusDescription,
  getConfidenceMultiplier,
  CONFIDENCE_LEVELS,
  type ConfidenceLevel,
} from './statusManager';

// Weight calculations & matchmaking utilities
export {
  calculateMovieWeight,
  getWeightBreakdown,
  getMatchupQuality,
  getStarterMovies,
  debugWeightDistribution,
} from './matchmaking';

// Smart correlation
export {
  calculateSmartCorrelation,
  calculateSmartCorrelationLocal,
  calculateRankWeight,
  getUserTopMovies,
  type SmartCorrelationResult,
  type TopMovieData,
} from './correlationUtils';

// Pair selection (main algorithm)
export {
  selectPair,
  selectPairAsync,
  createSession,
  updateSession,
  updateSessionWithPairType,
  explainSelection,
  getPoolStats,
  type UserSession,
  type PairSelectionResult,
  type PairType,
} from './pairSelector';
