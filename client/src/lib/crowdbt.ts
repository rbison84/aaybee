export class CrowdBT {
  private beta: number;
  private gamma: number;

  constructor(beta = 0.5, gamma = 0.5) {
    this.beta = beta;
    this.gamma = gamma;
  }

  updateRatings(
    winnerRating: number,
    winnerSigma: number,
    loserRating: number,
    loserSigma: number
  ): [number, number, number, number] {
    const expectedWin = this.probability(winnerRating, loserRating);
    const k = this.beta * (1 - expectedWin);

    const newWinnerRating = winnerRating + k * winnerSigma;
    const newLoserRating = loserRating - k * loserSigma;

    const newWinnerSigma = winnerSigma * Math.max(1 - this.gamma * k * winnerSigma, 0.1);
    const newLoserSigma = loserSigma * Math.max(1 - this.gamma * k * loserSigma, 0.1);

    return [newWinnerRating, newWinnerSigma, newLoserRating, newLoserSigma];
  }

  private probability(rating1: number, rating2: number): number {
    return 1 / (1 + Math.exp(rating2 - rating1));
  }
}
