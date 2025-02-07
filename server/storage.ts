import { type Restaurant, type InsertRestaurant, type Comparison, type InsertComparison, restaurants, comparisons, type TriedRestaurant, triedRestaurants } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

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
  },
  {
    name: "New Restaurant 1",
    area: "Shaw",
    cuisineTypes: ["Thai", "Asian"],
  },
  {
    name: "New Restaurant 2",
    area: "U Street",
    cuisineTypes: ["Mexican", "Tacos"],
  },
  {
    name: "New Restaurant 3",
    area: "Dupont Circle",
    cuisineTypes: ["Italian", "Pasta"],
  },
  {
    name: "New Restaurant 4",
    area: "Capitol Hill",
    cuisineTypes: ["American", "Burgers"],
  },
  {
    name: "New Restaurant 5",
    area: "Georgetown",
    cuisineTypes: ["Seafood", "Fine Dining"],
  },
  {
    name: "New Restaurant 6",
    area: "Adams Morgan",
    cuisineTypes: ["Ethiopian", "Vegetarian"],
  },
  {
    name: "New Restaurant 7",
    area: "14th Street",
    cuisineTypes: ["French", "Bistro"],
  },
  {
    name: "New Restaurant 8",
    area: "Columbia Heights",
    cuisineTypes: ["Pizza", "Neapolitan"],
  },
  {
    name: "New Restaurant 9",
    area: "Penn Quarter",
    cuisineTypes: ["Indian", "Curries"],
  },
  {
    name: "New Restaurant 10",
    area: "Navy Yard",
    cuisineTypes: ["American", "Brewery"],
  },
  {
    name: "New Restaurant 11",
    area: "H Street",
    cuisineTypes: ["Vietnamese", "Pho"],
  },
  {
    name: "New Restaurant 12",
    area: "Logan Circle",
    cuisineTypes: ["American", "Gastropub"],
  },
  {
    name: "New Restaurant 13",
    area: "Mount Vernon",
    cuisineTypes: ["Chinese", "Dim Sum"],
  },
  {
    name: "New Restaurant 14",
    area: "Mount Pleasant",
    cuisineTypes: ["Latin American", "Tapas"],
  },
  {
    name: "New Restaurant 15",
    area: "Union Market",
    cuisineTypes: ["American", "Comfort Food"],
  },
  {
    name: "New Restaurant 16",
    area: "West End",
    cuisineTypes: ["Mediterranean", "Lebanese"],
  },
  {
    name: "New Restaurant 17",
    area: "East End",
    cuisineTypes: ["Italian", "Pizza"],
  },
  {
    name: "New Restaurant 18",
    area: "Wharf",
    cuisineTypes: ["Seafood", "Oysters"],
  },
  {
    name: "New Restaurant 19",
    area: "Shaw",
    cuisineTypes: ["American", "Southern"],
  },
  {
    name: "New Restaurant 20",
    area: "Capitol Hill",
    cuisineTypes: ["American", "Bakery"],
  },
  {
    name: "New Restaurant 21",
    area: "Shaw",
    cuisineTypes: ["American", "Burgers"],
  },
  {
    name: "New Restaurant 22",
    area: "Capitol Hill",
    cuisineTypes: ["American", "Cafe"],
  },
  {
    name: "New Restaurant 23",
    area: "Georgetown",
    cuisineTypes: ["American", "Seafood"],
  },
  {
    name: "New Restaurant 24",
    area: "Adams Morgan",
    cuisineTypes: ["American", "Tapas"],
  },
  {
    name: "New Restaurant 25",
    area: "14th Street",
    cuisineTypes: ["American", "Gastropub"],
  },
  {
    name: "New Restaurant 26",
    area: "Columbia Heights",
    cuisineTypes: ["American", "Pizza"],
  },
  {
    name: "New Restaurant 27",
    area: "Penn Quarter",
    cuisineTypes: ["American", "Steakhouse"],
  },
  {
    name: "New Restaurant 28",
    area: "Navy Yard",
    cuisineTypes: ["American", "Brewery"],
  },
  {
    name: "New Restaurant 29",
    area: "H Street",
    cuisineTypes: ["American", "Fine Dining"],
  },
  {
    name: "New Restaurant 30",
    area: "Logan Circle",
    cuisineTypes: ["American", "Comfort Food"],
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

    // Simple random selection
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
}

// Create a singleton instance
export const storage = new DatabaseStorage();

// Seed the database with initial restaurants if empty
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