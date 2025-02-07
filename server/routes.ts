import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { CrowdBT } from "@/lib/crowdbt";
import { insertComparisonSchema } from "@shared/schema";
import { z } from "zod";

export function registerRoutes(app: Express) {
  // Get all restaurants
  app.get("/api/restaurants", async (_req, res) => {
    const restaurants = await storage.getRestaurants();
    res.json(restaurants);
  });

  // Get random pair for comparison
  app.get("/api/restaurants/pair", async (req, res) => {
    const userId = req.query.userId as string || 'anonymous';
    const pair = await storage.getRandomPair(userId);
    res.json(pair);
  });

  // Submit comparison
  app.post("/api/comparisons", async (req, res) => {
    const result = insertComparisonSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const { winnerId, loserId, userId, context, notTried } = result.data;

    // For "Haven't tried both" case, we'll just record the comparison
    // using the first restaurant as winner and second as loser
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

      const crowdBT = new CrowdBT();
      const [newWinnerRating, newWinnerSigma, newLoserRating, newLoserSigma] =
        crowdBT.updateRatings(winner.rating ?? 0, winner.sigma ?? 1, loser.rating ?? 0, loser.sigma ?? 1);

      await Promise.all([
        storage.updateRestaurantRating(winner.id, newWinnerRating, newWinnerSigma),
        storage.updateRestaurantRating(loser.id, newLoserRating, newLoserSigma)
      ]);
    }

    res.json(comparison);
  });

  // Filter restaurants
  app.get("/api/restaurants/filter", async (req, res) => {
    const { area, cuisine } = req.query;
    let restaurants;

    if (area) {
      restaurants = await storage.getRestaurantsByArea(area as string);
    } else if (cuisine) {
      restaurants = await storage.getRestaurantsByCuisine(cuisine as string);
    } else {
      restaurants = await storage.getRestaurants();
    }

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

  const httpServer = createServer(app);
  return httpServer;
}