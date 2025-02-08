import { type Restaurant, type InsertRestaurant, type Comparison, type InsertComparison, restaurants, comparisons, type TriedRestaurant, triedRestaurants, type PersonalRanking, personalRankings } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import { CrowdBT } from "@/lib/crowdbt";

const initialRestaurants: InsertRestaurant[] = [
  {
    name: "Rose's Luxury",
    area: "Capitol Hill",
    cuisineTypes: ["American", "Contemporary"],
  },
  {
    name: "Bad Saint",
    area: "Columbia Heights",
    cuisineTypes: ["Filipino", "Asian"],
  },
  {
    name: "Le Diplomate",
    area: "14th Street",
    cuisineTypes: ["French", "European"],
  },
  {
    name: "Maydan",
    area: "14th Street",
    cuisineTypes: ["Middle Eastern", "Mediterranean"],
  },
  {
    name: "Tail Up Goat",
    area: "Adams Morgan",
    cuisineTypes: ["Mediterranean", "Contemporary"],
  },
  {
    name: "Thip Khao",
    area: "Columbia Heights",
    cuisineTypes: ["Laotian", "Asian"],
  },
  {
    name: "Sushi Taro",
    area: "Dupont Circle",
    cuisineTypes: ["Japanese", "Sushi"],
  },
  {
    name: "Rasika",
    area: "Penn Quarter",
    cuisineTypes: ["Indian", "Contemporary"],
  },
  {
    name: "Compass Rose",
    area: "14th Street",
    cuisineTypes: ["International", "Small Plates"],
  },
  {
    name: "Fiola Mare",
    area: "Georgetown",
    cuisineTypes: ["Italian", "Seafood"],
  },
  {
    name: "Purple Patch",
    area: "Mount Pleasant",
    cuisineTypes: ["Filipino", "Asian"],
  },
  {
    name: "Chloe",
    area: "Navy Yard",
    cuisineTypes: ["Modern American", "Small Plates"],
  },
  {
    name: "Anju",
    area: "Dupont Circle",
    cuisineTypes: ["Korean", "Asian"],
  },
  {
    name: "El Secreto de Rosita",
    area: "U Street",
    cuisineTypes: ["Peruvian", "Latin American"],
  },
  {
    name: "Ethiopic",
    area: "H Street",
    cuisineTypes: ["Ethiopian", "African"],
  },
  {
    name: "Pineapple and Pearls",
    area: "Capitol Hill",
    cuisineTypes: ["American", "Fine Dining"],
  },
  {
    name: "Queen's English",
    area: "Columbia Heights",
    cuisineTypes: ["Hong Kong", "Asian"],
  },
  {
    name: "Albi",
    area: "Navy Yard",
    cuisineTypes: ["Middle Eastern", "Mediterranean"],
  },
  {
    name: "Imperfecto",
    area: "West End",
    cuisineTypes: ["Mediterranean", "Latin"],
  },
  {
    name: "L'Ardente",
    area: "East End",
    cuisineTypes: ["Italian", "Contemporary"],
  },
  {
    name: "Moon Rabbit",
    area: "Wharf",
    cuisineTypes: ["Vietnamese", "Asian"],
  },
  {
    name: "Reveler's Hour",
    area: "Adams Morgan",
    cuisineTypes: ["Italian", "Wine Bar"],
  },
  {
    name: "Daru",
    area: "H Street",
    cuisineTypes: ["Indian", "Contemporary"],
  },
  {
    name: "Oyster Oyster",
    area: "Shaw",
    cuisineTypes: ["Vegetarian", "Contemporary"],
  },
  {
    name: "Rooster & Owl",
    area: "14th Street",
    cuisineTypes: ["Contemporary", "American"],
  },
  {
    name: "Chercher Ethiopian",
    area: "Shaw",
    cuisineTypes: ["Ethiopian", "African"],
  },
  {
    name: "Caruso's Grocery",
    area: "Capitol Hill",
    cuisineTypes: ["Italian", "Traditional"],
  },
  {
    name: "Maketto",
    area: "H Street",
    cuisineTypes: ["Cambodian", "Taiwanese"],
  },
  {
    name: "Little Pearl",
    area: "Capitol Hill",
    cuisineTypes: ["American", "Cafe"],
  },
  {
    name: "The Duck & The Peach",
    area: "Capitol Hill",
    cuisineTypes: ["New American", "Mediterranean"],
  },
  {
    name: "Muchas Gracias",
    area: "Georgetown",
    cuisineTypes: ["Mexican", "Latin American"],
  },
  {
    name: "Yellow",
    area: "Georgetown",
    cuisineTypes: ["Mediterranean", "Middle Eastern"],
  },
  {
    name: "La Tejana",
    area: "Mount Pleasant",
    cuisineTypes: ["Mexican", "Breakfast"],
  },
  {
    name: "Makan",
    area: "Columbia Heights",
    cuisineTypes: ["Malaysian", "Asian"],
  },
  {
    name: "Elle",
    area: "Mount Pleasant",
    cuisineTypes: ["American", "Bakery"],
  },
  {
    name: "Daikaya",
    area: "Penn Quarter",
    cuisineTypes: ["Japanese", "Ramen"],
  },
  {
    name: "Bistro Bis",
    area: "Capitol Hill",
    cuisineTypes: ["French", "Traditional"],
  },
  {
    name: "St. Anselm",
    area: "Union Market",
    cuisineTypes: ["American", "Steakhouse"],
  },
  {
    name: "Fancy Radish",
    area: "H Street",
    cuisineTypes: ["Vegan", "Contemporary"],
  },
  {
    name: "Ambar",
    area: "Capitol Hill",
    cuisineTypes: ["Balkan", "European"],
  },
  {
    name: "Bantam King",
    area: "Penn Quarter",
    cuisineTypes: ["Japanese", "Chicken"],
  },
  {
    name: "The Salt Line",
    area: "Navy Yard",
    cuisineTypes: ["Seafood", "New England"],
  },
  {
    name: "All Purpose",
    area: "Shaw",
    cuisineTypes: ["Pizza", "Italian"],
  },
  {
    name: "Chiko",
    area: "Capitol Hill",
    cuisineTypes: ["Korean", "Chinese"],
  },
  {
    name: "Nina May",
    area: "Logan Circle",
    cuisineTypes: ["American", "Farm to Table"],
  },
  {
    name: "Lucky Danger",
    area: "Mount Vernon",
    cuisineTypes: ["Chinese", "American Chinese"],
  },
  {
    name: "Tonari",
    area: "Penn Quarter",
    cuisineTypes: ["Japanese", "Italian"],
  },
  {
    name: "Residents Cafe",
    area: "Dupont Circle",
    cuisineTypes: ["American", "Cafe"],
  },
  {
    name: "Estuary",
    area: "Downtown",
    cuisineTypes: ["Seafood", "American"],
  },
  {
    name: "Unconventional Diner",
    area: "Shaw",
    cuisineTypes: ["American", "Diner"],
  },
  {
    name: "La Collina",
    area: "Capitol Hill",
    cuisineTypes: ["Italian", "Traditional"],
  },
  {
    name: "Convivial",
    area: "Shaw",
    cuisineTypes: ["French", "Contemporary"],
  },
  {
    name: "Federalist Pig",
    area: "Adams Morgan",
    cuisineTypes: ["BBQ", "American"],
  }
];

export interface IStorage {
  getRestaurants(): Promise<Restaurant[]>;
  getRestaurantById(id: number): Promise<Restaurant | undefined>;
  getRestaurantsByArea(area: string): Promise<Restaurant[]>;
  getRestaurantsByCuisine(cuisine: string): Promise<Restaurant[]>;
  createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant>;
  updateRestaurantRating(id: number, rating: number, sigma: number): Promise<Restaurant>;
  getRandomPair(userId: string): Promise<[Restaurant, Restaurant]>;
  createComparison(comparison: InsertComparison): Promise<Comparison>;
  getComparisons(userId: string): Promise<Comparison[]>;
  markRestaurantAsTried(userId: string, restaurantId: number): Promise<void>;
  getTriedRestaurants(userId: string): Promise<number[]>;

  getPersonalRanking(userId: string, restaurantId: number): Promise<PersonalRanking | undefined>;
  createPersonalRanking(userId: string, restaurantId: number): Promise<PersonalRanking>;
  updatePersonalRanking(id: number, score: number, totalChoices: number): Promise<PersonalRanking>;
  getPersonalRankings(userId: string): Promise<(PersonalRanking & { restaurant: Restaurant })[]>;
  getAllComparisons(): Promise<Comparison[]>;
  updateGlobalRankings(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getRestaurants(): Promise<Restaurant[]> {
    const results = await db.select().from(restaurants);
    console.log(`Fetched ${results.length} restaurants from database`);
    return results;
  }

  async getRestaurantById(id: number): Promise<Restaurant | undefined> {
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    return restaurant;
  }

  async getRestaurantsByArea(area: string): Promise<Restaurant[]> {
    return await db.select().from(restaurants).where(eq(restaurants.area, area));
  }

  async getRestaurantsByCuisine(cuisine: string): Promise<Restaurant[]> {
    const allRestaurants = await this.getRestaurants();
    return allRestaurants.filter(r => r.cuisineTypes.includes(cuisine));
  }

  async createRestaurant(data: InsertRestaurant): Promise<Restaurant> {
    const [restaurant] = await db.insert(restaurants).values(data).returning();
    return restaurant;
  }

  async updateRestaurantRating(id: number, rating: number, sigma: number): Promise<Restaurant> {
    const [restaurant] = await db
      .update(restaurants)
      .set({ rating, sigma })
      .where(eq(restaurants.id, id))
      .returning();

    if (!restaurant) throw new Error("Restaurant not found");
    return restaurant;
  }

  async getRandomPair(userId: string): Promise<[Restaurant, Restaurant]> {
    const allRestaurants = await this.getRestaurants();

    if (allRestaurants.length < 2) {
      throw new Error("Not enough restaurants for comparison");
    }

    const availableRestaurants = [...allRestaurants];
    const idx1 = Math.floor(Math.random() * availableRestaurants.length);
    const first = availableRestaurants[idx1];

    availableRestaurants.splice(idx1, 1);
    const idx2 = Math.floor(Math.random() * availableRestaurants.length);
    const second = availableRestaurants[idx2];

    if (!first || !second) {
      throw new Error("Could not get a valid pair of restaurants");
    }

    return [first, second];
  }

  async createComparison(data: InsertComparison): Promise<Comparison> {
    const [comparison] = await db.insert(comparisons).values(data).returning();
    return comparison;
  }

  async getComparisons(userId: string): Promise<Comparison[]> {
    return await db
      .select()
      .from(comparisons)
      .where(eq(comparisons.userId, userId));
  }

  async markRestaurantAsTried(userId: string, restaurantId: number): Promise<void> {
    await db.insert(triedRestaurants)
      .values({ userId, restaurantId })
      .onConflictDoNothing();
  }

  async getTriedRestaurants(userId: string): Promise<number[]> {
    const tried = await db
      .select({ restaurantId: triedRestaurants.restaurantId })
      .from(triedRestaurants)
      .where(eq(triedRestaurants.userId, userId));
    return tried.map(t => t.restaurantId);
  }

  async getPersonalRanking(
    userId: string,
    restaurantId: number
  ): Promise<PersonalRanking | undefined> {
    try {
      const [ranking] = await db
        .select()
        .from(personalRankings)
        .where(
          and(
            eq(personalRankings.userId, userId),
            eq(personalRankings.restaurantId, restaurantId)
          )
        );
      return ranking;
    } catch (error) {
      console.error('Error fetching personal ranking:', error);
      return undefined;
    }
  }

  async createPersonalRanking(
    userId: string,
    restaurantId: number
  ): Promise<PersonalRanking> {
    try {
      const [ranking] = await db
        .insert(personalRankings)
        .values({
          userId,
          restaurantId,
          score: 0,
          totalChoices: 0,
        })
        .returning();
      return ranking;
    } catch (error) {
      console.error('Error creating personal ranking:', error);
      throw new Error('Failed to create personal ranking');
    }
  }

  async updatePersonalRanking(
    id: number,
    score: number,
    totalChoices: number
  ): Promise<PersonalRanking> {
    try {
      const [ranking] = await db
        .update(personalRankings)
        .set({
          score,
          totalChoices,
          updatedAt: new Date(),
        })
        .where(eq(personalRankings.id, id))
        .returning();
      return ranking;
    } catch (error) {
      console.error('Error updating personal ranking:', error);
      throw new Error('Failed to update personal ranking');
    }
  }

  async getPersonalRankings(
    userId: string
  ): Promise<(PersonalRanking & { restaurant: Restaurant })[]> {
    try {
      // Get all valid comparisons for this specific user
      const userComparisons = await db
        .select()
        .from(comparisons)
        .where(
          and(
            eq(comparisons.userId, userId),
            eq(comparisons.notTried, false)
          )
        )
        .orderBy(asc(comparisons.createdAt));

      // Get all restaurants
      const allRestaurants = await this.getRestaurants();

      // Initialize CrowdBT
      const crowdBT = new CrowdBT(0.5, 0.5);

      // Initialize scores for all restaurants
      const restaurantScores = new Map<number, { 
        score: number; 
        sigma: number;
        totalChoices: number;
      }>();

      allRestaurants.forEach(r => {
        restaurantScores.set(r.id, { 
          score: 1400, // Starting ELO score
          sigma: 1,
          totalChoices: 0
        });
      });

      // Process all user's comparisons chronologically
      for (const comparison of userComparisons) {
        if (!comparison.winnerId || !comparison.loserId) continue;

        const winner = restaurantScores.get(comparison.winnerId);
        const loser = restaurantScores.get(comparison.loserId);

        if (winner && loser) {
          const [newWinnerScore, newWinnerSigma, newLoserScore, newLoserSigma] =
            crowdBT.updateRatings(
              winner.score,
              winner.sigma,
              loser.score,
              loser.sigma
            );

          restaurantScores.set(comparison.winnerId, {
            score: newWinnerScore,
            sigma: newWinnerSigma,
            totalChoices: winner.totalChoices + 1
          });

          restaurantScores.set(comparison.loserId, {
            score: newLoserScore,
            sigma: newLoserSigma,
            totalChoices: loser.totalChoices + 1
          });
        }
      }

      // Create personal rankings array with restaurants and their scores
      const rankings = await Promise.all(
        allRestaurants.map(async restaurant => {
          const scores = restaurantScores.get(restaurant.id);
          const ranking = await this.getPersonalRanking(userId, restaurant.id) ||
            await this.createPersonalRanking(userId, restaurant.id);

          // Update the ranking in the database
          await this.updatePersonalRanking(
            ranking.id,
            scores?.score || 1400,
            scores?.totalChoices || 0
          );

          return {
            ...ranking,
            score: scores?.score || 1400,
            totalChoices: scores?.totalChoices || 0,
            restaurant
          };
        })
      );

      // Sort by score (descending), then by name for ties
      return rankings.sort((a, b) => {
        const scoreDiff = (b.score || 0) - (a.score || 0);
        if (Math.abs(scoreDiff) < 0.0001) {
          return a.restaurant.name.localeCompare(b.restaurant.name);
        }
        return scoreDiff;
      });

    } catch (error) {
      console.error('Error fetching personal rankings:', error);
      throw error;
    }
  }

  async getAllComparisons(): Promise<Comparison[]> {
    return await db
      .select()
      .from(comparisons)
      .orderBy(desc(comparisons.createdAt));
  }

  async updateGlobalRankings(): Promise<void> {
    try {
      // Get all valid comparisons and sort by creation date
      const validComparisons = await db
        .select()
        .from(comparisons)
        .where(eq(comparisons.notTried, false))
        .orderBy(asc(comparisons.createdAt));

      // Get all restaurants
      const allRestaurants = await this.getRestaurants();

      // Initialize CrowdBT and restaurant scores
      const crowdBT = new CrowdBT();
      const restaurantScores = new Map<number, { rating: number; sigma: number }>();

      // Initialize all restaurants with default scores
      allRestaurants.forEach(r => {
        restaurantScores.set(r.id, { rating: 0, sigma: 1 });
      });

      // Process all comparisons chronologically
      for (const comparison of validComparisons) {
        if (!comparison.winnerId || !comparison.loserId) continue;

        const winner = restaurantScores.get(comparison.winnerId);
        const loser = restaurantScores.get(comparison.loserId);

        if (winner && loser) {
          const [newWinnerRating, newWinnerSigma, newLoserRating, newLoserSigma] =
            crowdBT.updateRatings(
              winner.rating,
              winner.sigma,
              loser.rating,
              loser.sigma
            );

          restaurantScores.set(comparison.winnerId, {
            rating: newWinnerRating,
            sigma: newWinnerSigma
          });
          restaurantScores.set(comparison.loserId, {
            rating: newLoserRating,
            sigma: newLoserSigma
          });
        }
      }

      // Update all restaurant ratings in the database
      await Promise.all(
        Array.from(restaurantScores.entries()).map(([id, scores]) =>
          this.updateRestaurantRating(id, scores.rating, scores.sigma)
        )
      );

      console.log('Global rankings updated successfully');
    } catch (error) {
      console.error('Error updating global rankings:', error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();

// Initialize database with restaurants if empty
(async () => {
  try {
    const existingRestaurants = await storage.getRestaurants();
    console.log(`Found ${existingRestaurants.length} existing restaurants`);
    if (existingRestaurants.length === 0) {
      console.log(`Seeding ${initialRestaurants.length} restaurants...`);
      for (const restaurant of initialRestaurants) {
        await storage.createRestaurant(restaurant);
      }
      console.log('Seeding complete');
    }
  } catch (error) {
    console.error('Error during seeding:', error);
  }
})();