import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { CrowdBT } from "@/lib/crowdbt";
import { insertComparisonSchema } from "@shared/schema";
import { z } from "zod";
import type { IStorage } from "@/lib/storage";

// Helper function to update personal rankings using CrowdBT
async function updatePersonalRankings(
  storage: IStorage,
  winnerId: number,
  loserId: number,
  userId: string,
  winnerRating: number,
  loserRating: number,
  winnerSigma: number,
  loserSigma: number,
  crowdBT: CrowdBT
): Promise<void> {
  try {
    // Get or create personal rankings for both restaurants
    const winnerRanking = await storage.getPersonalRanking(userId, winnerId) ||
      await storage.createPersonalRanking(userId, winnerId);
    const loserRanking = await storage.getPersonalRanking(userId, loserId) ||
      await storage.createPersonalRanking(userId, loserId);

    console.log(`Updating personal rankings for user ${userId}:`, {
      winner: { id: winnerId, currentScore: winnerRating },
      loser: { id: loserId, currentScore: loserRating }
    });

    // Use the same CrowdBT instance and ratings as global
    const [newWinnerScore, newWinnerSigma, newLoserScore, newLoserSigma] =
      crowdBT.updateRatings(
        winnerRating,
        winnerSigma,
        loserRating,
        loserSigma
      );

    // Update both rankings
    await Promise.all([
      storage.updatePersonalRanking(
        winnerRanking.id,
        newWinnerScore,
        winnerRanking.totalChoices + 1
      ),
      storage.updatePersonalRanking(
        loserRanking.id,
        newLoserScore,
        loserRanking.totalChoices + 1
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

  // Submit comparison
  app.post("/api/comparisons", async (req, res) => {
    const result = insertComparisonSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const { winnerId, loserId, userId, context, notTried } = result.data;

    // For "I don't know" case, we'll just record the comparison
    const comparison = await storage.createComparison({
      winnerId: notTried ? req.body.restaurantIds[0] : winnerId,
      loserId: notTried ? req.body.restaurantIds[1] : loserId,
      userId,
      context,
      notTried: notTried ?? false
    });

    // Only update ratings if the user made an actual choice
    if (!notTried) {
      const winner = await storage.getRestaurantById(comparison.winnerId);
      const loser = await storage.getRestaurantById(comparison.loserId);

      if (!winner || !loser) {
        return res.status(404).json({ error: "Restaurant not found" });
      }

      // Use a single CrowdBT instance for both updates
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

      console.log('Updating rankings:', {
        winner: { id: winner.id, oldRating: winnerRating, newRating: newWinnerRating },
        loser: { id: loser.id, oldRating: loserRating, newRating: newLoserRating }
      });

      // Update both global and personal rankings using the same parameters
      await Promise.all([
        storage.updateRestaurantRating(winner.id, newWinnerRating, newWinnerSigma),
        storage.updateRestaurantRating(loser.id, newLoserRating, newLoserSigma),
        // Update personal rankings with the same ratings
        updatePersonalRankings(
          storage,
          winner.id,
          loser.id,
          userId,
          winnerRating,
          loserRating,
          winnerSigma,
          loserSigma,
          crowdBT
        )
      ]);
    }

    res.json(comparison);
  });

  // Filter restaurants
  app.get("/api/restaurants/filter", async (req, res) => {
    const { area, cuisine } = req.query;
    let restaurants;

    if (area && area !== 'all') {
      restaurants = await storage.getRestaurantsByArea(area as string);
    } else if (cuisine && cuisine !== 'all') {
      restaurants = await storage.getRestaurantsByCuisine(cuisine as string);
    } else {
      restaurants = await storage.getRestaurants();
    }

    // Sort by rating
    restaurants.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    res.json(restaurants);
  });

  // Get recommendations
  app.get("/api/restaurants/recommendations", async (req, res) => {
    const userId = req.query.userId as string || 'anonymous';

    // Get user's comparison history
    const comparisons = await storage.getComparisons(userId);

    // Calculate cuisine preferences
    const preferences = new Map<string, number>();
    for (const comparison of comparisons) {
      if (comparison.notTried) continue; // Skip comparisons where user hasn't tried the restaurants

      const winner = await storage.getRestaurantById(comparison.winnerId);
      const loser = await storage.getRestaurantById(comparison.loserId);

      if (winner && loser) {
        // Increase score for winner's cuisines
        winner.cuisineTypes.forEach(cuisine => {
          preferences.set(cuisine, (preferences.get(cuisine) || 0) + 1);
        });
        // Slightly decrease score for loser's cuisines
        loser.cuisineTypes.forEach(cuisine => {
          preferences.set(cuisine, (preferences.get(cuisine) || 0) - 0.5);
        });
      }
    }

    // Get all restaurants and sort by preference score and rating
    const restaurants = await storage.getRestaurants();
    const recommendations = restaurants
      .map(restaurant => {
        const preferenceScore = restaurant.cuisineTypes.reduce(
          (score, cuisine) => score + (preferences.get(cuisine) || 0),
          0
        );
        return { ...restaurant, preferenceScore };
      })
      .sort((a, b) =>
        // Combine preference score with rating for final ranking
        (b.preferenceScore + (b.rating || 0)) - (a.preferenceScore + (a.rating || 0))
      )
      .slice(0, 5); // Return top 5 recommendations

    res.json(recommendations);
  });

  // Mark restaurants as tried
  app.post("/api/restaurants/tried", async (req, res) => {
    const { userId = 'anonymous', restaurantIds } = req.body;

    if (!Array.isArray(restaurantIds)) {
      return res.status(400).json({ error: "restaurantIds must be an array" });
    }

    await Promise.all(
      restaurantIds.map(id => storage.markRestaurantAsTried(userId, id))
    );

    res.json({ success: true });
  });

  // Add new endpoint for personal rankings
  app.get("/api/rankings/personal", async (req, res) => {
    const userId = req.query.userId as string || 'anonymous';
    const rankings = await storage.getPersonalRankings(userId);
    res.json(rankings);
  });

  const httpServer = createServer(app);
  return httpServer;
}