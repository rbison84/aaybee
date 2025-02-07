import type { Express } from "express";
import { createServer } from "http";
import { storage } from "./storage";
import { CrowdBT } from "@/lib/crowdbt";
import { insertComparisonSchema, insertRestaurantSchema } from "@shared/schema";

export function registerRoutes(app: Express) {
  // Get all restaurants
  app.get("/api/restaurants", async (_req, res) => {
    const restaurants = await storage.getRestaurants();
    res.json(restaurants);
  });

  // Get random pair for comparison
  app.get("/api/restaurants/pair", async (_req, res) => {
    const pair = await storage.getRandomPair();
    res.json(pair);
  });

  // Submit comparison
  app.post("/api/comparisons", async (req, res) => {
    const result = insertComparisonSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const comparison = await storage.createComparison(result.data);

    // Update ratings using CrowdBT
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

  const httpServer = createServer(app);
  return httpServer;
}