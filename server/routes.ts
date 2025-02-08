import type { Express } from "express";
import { createServer } from "http";
import { storage, type IStorage } from "./storage";
import { CrowdBT } from "@/lib/crowdbt";
import { insertComparisonSchema } from "@shared/schema";
import { z } from "zod";

// Helper function to update personal rankings using CrowdBT
async function updatePersonalRankings(
  storage: IStorage,
  winnerId: number,
  loserId: number,
  userId: string,
): Promise<void> {
  try {
    console.log('Updating personal rankings for:', { userId, winnerId, loserId });

    // Get or create personal rankings for both restaurants
    const winnerRanking = await storage.getPersonalRanking(userId, winnerId) ||
      await storage.createPersonalRanking(userId, winnerId);
    const loserRanking = await storage.getPersonalRanking(userId, loserId) ||
      await storage.createPersonalRanking(userId, loserId);

    console.log('Current rankings:', {
      winner: { id: winnerId, score: winnerRanking.score },
      loser: { id: loserId, score: loserRanking.score }
    });

    // Use CrowdBT for personal rankings
    const crowdBT = new CrowdBT(0.5, 0.5);  // Explicit parameters for clarity
    const [newWinnerScore, , newLoserScore] = crowdBT.updateRatings(
      winnerRanking.score || 0,
      1, // Fixed sigma for personal rankings
      loserRanking.score || 0,
      1
    );

    // Update both rankings
    await Promise.all([
      storage.updatePersonalRanking(
        winnerRanking.id,
        newWinnerScore,
        (winnerRanking.totalChoices || 0) + 1
      ),
      storage.updatePersonalRanking(
        loserRanking.id,
        newLoserScore,
        (loserRanking.totalChoices || 0) + 1
      )
    ]);

    console.log('Personal rankings updated successfully', {
      winner: { id: winnerId, newScore: newWinnerScore },
      loser: { id: loserId, newScore: newLoserScore }
    });
  } catch (error) {
    console.error('Error updating personal rankings:', error);
    throw error;
  }
}

export function registerRoutes(app: Express) {
  // Get all restaurants
  app.get("/api/restaurants", async (_req, res) => {
    const restaurants = await storage.getRestaurants();
    res.json(restaurants);
  });

  // Get random pair for comparison
  app.get("/api/restaurants/pair", async (req, res) => {
    try {
      const userId = req.query.userId as string || 'anonymous';
      const pair = await storage.getRandomPair(userId);
      if (!pair || pair.length !== 2) {
        throw new Error("Could not get a valid pair of restaurants");
      }
      res.json(pair);
    } catch (error) {
      console.error("Error getting restaurant pair:", error);
      res.status(500).json({ error: "Failed to get restaurant pair" });
    }
  });

  // Get user's comparisons
  app.get("/api/comparisons", async (req, res) => {
    try {
      const userId = req.query.userId as string || 'anonymous';
      const comparisons = await storage.getComparisons(userId);
      res.json(comparisons);
    } catch (error) {
      console.error("Error getting comparisons:", error);
      res.status(500).json({ error: "Failed to get comparisons" });
    }
  });

  // Submit comparison
  app.post("/api/comparisons", async (req, res) => {
    const result = insertComparisonSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    try {
      const { winnerId, loserId, userId, context, notTried } = result.data;

      // Create comparison record
      const comparison = await storage.createComparison({
        winnerId: notTried ? null : winnerId,
        loserId: notTried ? null : loserId,
        userId,
        context,
        notTried
      });

      // Only update ratings if user made an actual choice
      if (!notTried && winnerId && loserId) {
        const winner = await storage.getRestaurantById(winnerId);
        const loser = await storage.getRestaurantById(loserId);

        if (!winner || !loser) {
          return res.status(404).json({ error: "Restaurant not found" });
        }

        // Update global rankings
        const crowdBT = new CrowdBT();
        const winnerRating = winner.rating ?? 0;
        const loserRating = loser.rating ?? 0;
        const winnerSigma = winner.sigma ?? 1;
        const loserSigma = loser.sigma ?? 1;

        const [newWinnerRating, newWinnerSigma, newLoserRating, newLoserSigma] =
          crowdBT.updateRatings(
            winnerRating,
            winnerSigma,
            loserRating,
            loserSigma
          );

        // Update global rankings
        await Promise.all([
          storage.updateRestaurantRating(winner.id, newWinnerRating, newWinnerSigma),
          storage.updateRestaurantRating(loser.id, newLoserRating, newLoserSigma)
        ]);

        // Update personal rankings for all choices
        await updatePersonalRankings(storage, winnerId, loserId, userId);
      }

      // Recalculate all global rankings to ensure consistency
      await storage.updateGlobalRankings();

      res.json(comparison);
    } catch (error) {
      console.error('Error processing comparison:', error);
      res.status(500).json({ error: 'Failed to process comparison' });
    }
  });

  // Add new endpoint for personal rankings
  app.get("/api/rankings/personal", async (req, res) => {
    const userId = req.query.userId as string || 'anonymous';
    try {
      const rankings = await storage.getPersonalRankings(userId);
      console.log(`Retrieved ${rankings.length} personal rankings for user ${userId}`);
      res.json(rankings);
    } catch (error) {
      console.error('Error fetching personal rankings:', error);
      res.status(500).json({ error: 'Failed to fetch personal rankings' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}