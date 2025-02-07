import { type Restaurant, type InsertRestaurant, type Comparison, type InsertComparison, restaurants, comparisons, type TriedRestaurant, triedRestaurants } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  async getRestaurants(): Promise<Restaurant[]> {
    return await db.select().from(restaurants);
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
    const triedIds = await this.getTriedRestaurants(userId);
    const allRestaurants = await this.getRestaurants();

    // If user hasn't tried any restaurants, return a random pair
    if (triedIds.length === 0) {
      const idx1 = Math.floor(Math.random() * allRestaurants.length);
      let idx2 = Math.floor(Math.random() * (allRestaurants.length - 1));
      if (idx2 >= idx1) idx2++;
      return [allRestaurants[idx1], allRestaurants[idx2]];
    }

    // Otherwise, ensure at least one restaurant has been tried
    const triedRestaurants = allRestaurants.filter(r => triedIds.includes(r.id));
    const untriedRestaurants = allRestaurants.filter(r => !triedIds.includes(r.id));

    // Randomly decide whether to show two tried restaurants or one tried and one untried
    if (Math.random() < 0.3 && triedRestaurants.length >= 2) {
      // Show two tried restaurants
      const idx1 = Math.floor(Math.random() * triedRestaurants.length);
      let idx2 = Math.floor(Math.random() * (triedRestaurants.length - 1));
      if (idx2 >= idx1) idx2++;
      return [triedRestaurants[idx1], triedRestaurants[idx2]];
    } else {
      // Show one tried and one untried restaurant
      const triedIdx = Math.floor(Math.random() * triedRestaurants.length);
      const untriedIdx = Math.floor(Math.random() * untriedRestaurants.length);
      return [triedRestaurants[triedIdx], untriedRestaurants[untriedIdx]];
    }
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
}

// Initialize with seed data
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
  }
];

// Create a singleton instance
export const storage = new DatabaseStorage();

// Seed the database with initial restaurants if empty
(async () => {
  const existingRestaurants = await storage.getRestaurants();
  if (existingRestaurants.length === 0) {
    await Promise.all(initialRestaurants.map(r => storage.createRestaurant(r)));
  }
})();