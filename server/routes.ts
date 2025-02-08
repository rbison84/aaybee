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
    // Get or create personal rankings for both restaurants
    const winnerRanking = await storage.getPersonalRanking(userId, winnerId) ||
      await storage.createPersonalRanking(userId, winnerId);
    const loserRanking = await storage.getPersonalRanking(userId, loserId) ||
      await storage.createPersonalRanking(userId, loserId);

    // Use a separate CrowdBT instance for personal rankings
    const crowdBT = new CrowdBT();
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

  // Submit comparison
  app.post("/api/comparisons", async (req, res) => {
    const result = insertComparisonSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    try {
      const { winnerId, loserId, userId, context, notTried } = result.data;

      // Create comparison
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

        // Only update personal rankings if user is authenticated (not anonymous)
        if (userId !== 'anonymous') {
          await updatePersonalRankings(storage, winner.id, loser.id, userId);
        }

        // Recalculate all global rankings to ensure consistency
        await storage.updateGlobalRankings();
      }

      res.json(comparison);
    } catch (error) {
      console.error('Error processing comparison:', error);
      res.status(500).json({ error: 'Failed to process comparison' });
    }
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
      if (comparison.notTried) continue;

      const winner = await storage.getRestaurantById(comparison.winnerId);
      const loser = await storage.getRestaurantById(comparison.loserId);

      if (winner && loser) {
        winner.cuisineTypes.forEach(cuisine => {
          preferences.set(cuisine, (preferences.get(cuisine) || 0) + 1);
        });
        loser.cuisineTypes.forEach(cuisine => {
          preferences.set(cuisine, (preferences.get(cuisine) || 0) - 0.5);
        });
      }
    }

    // Get all restaurants and sort by preference score and personal rating
    const restaurants = await storage.getRestaurants();
    const recommendations = await Promise.all(
      restaurants.map(async (restaurant) => {
        const preferenceScore = restaurant.cuisineTypes.reduce(
          (score, cuisine) => score + (preferences.get(cuisine) || 0),
          0
        );
        const personalRanking = await storage.getPersonalRanking(userId, restaurant.id);
        return {
          ...restaurant,
          preferenceScore: preferenceScore + (personalRanking?.score || 0)
        };
      })
    );

    // Sort by combined score and return top 5
    recommendations.sort((a, b) => b.preferenceScore - a.preferenceScore);
    res.json(recommendations.slice(0, 5));
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
    try {
      const userId = req.query.userId as string || 'anonymous';

      // Get all user's valid comparisons (excluding 'not tried')
      const userComparisons = await storage.getComparisons(userId);
      const validComparisons = userComparisons.filter(c =>
        !c.notTried && c.winnerId && c.loserId
      );

      // Get all restaurants
      const restaurants = await storage.getRestaurants();

      // Initialize scores for all restaurants
      const scores = new Map<number, { score: number; total: number }>();
      restaurants.forEach(r => {
        scores.set(r.id, { score: 1400, total: 0 }); // Start with ELO base score
      });

      // Create CrowdBT instance for calculating scores
      const crowdBT = new CrowdBT(0.5, 0.5);

      // Process each comparison chronologically to update scores
      for (const comp of validComparisons) {
        const winner = scores.get(comp.winnerId);
        const loser = scores.get(comp.loserId);

        if (winner && loser) {
          const [newWinnerScore, , newLoserScore] = crowdBT.updateRatings(
            winner.score,
            1, // Fixed sigma for personal rankings
            loser.score,
            1
          );

          scores.set(comp.winnerId, {
            score: newWinnerScore,
            total: winner.total + 1
          });

          scores.set(comp.loserId, {
            score: newLoserScore,
            total: loser.total + 1
          });
        }
      }

      // Convert scores map to array of restaurants with their scores
      const rankings = restaurants.map(restaurant => {
        const score = scores.get(restaurant.id);
        return {
          ...restaurant,
          score: score?.score || 1400,
          totalChoices: score?.total || 0
        };
      });

      // Sort by score, then by name for ties
      rankings.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) < 0.0001) {
          return a.name.localeCompare(b.name);
        }
        return scoreDiff;
      });

      res.json(rankings);
    } catch (error) {
      console.error('Error getting personal rankings:', error);
      res.status(500).json({ error: 'Failed to get personal rankings' });
    }
  });

  // Add new endpoint for admin to view all choices
  app.get("/api/admin/choices", async (_req, res) => {
    try {
      // Get all comparisons
      const allComparisons = await storage.getAllComparisons();

      // Group comparisons by user
      const userChoices: Record<string, {
        comparisons: (Comparison & {
          winner: Restaurant;
          loser: Restaurant;
        })[];
      }> = {};

      // Process each comparison
      for (const comparison of allComparisons) {
        if (!userChoices[comparison.userId]) {
          userChoices[comparison.userId] = { comparisons: [] };
        }

        // Get restaurant details
        const winner = await storage.getRestaurantById(comparison.winnerId);
        const loser = await storage.getRestaurantById(comparison.loserId);

        if (winner && loser) {
          userChoices[comparison.userId].comparisons.push({
            ...comparison,
            winner,
            loser
          });
        }
      }

      // Sort comparisons by date
      for (const userId in userChoices) {
        userChoices[userId].comparisons.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }

      res.json(userChoices);
    } catch (error) {
      console.error('Error fetching admin choices:', error);
      res.status(500).json({ error: 'Failed to fetch choices' });
    }
  });


  // Add a new route to recalculate rankings
  app.post("/api/rankings/recalculate", async (_req, res) => {
    try {
      await storage.updateGlobalRankings();
      res.json({ message: "Rankings recalculated successfully" });
    } catch (error) {
      console.error('Error recalculating rankings:', error);
      res.status(500).json({ error: 'Failed to recalculate rankings' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}