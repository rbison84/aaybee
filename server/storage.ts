import { type Restaurant, type InsertRestaurant, type Comparison, type InsertComparison } from "@shared/schema";

export interface IStorage {
  getRestaurants(): Promise<Restaurant[]>;
  getRestaurantById(id: number): Promise<Restaurant | undefined>;
  getRestaurantsByArea(area: string): Promise<Restaurant[]>;
  getRestaurantsByCuisine(cuisine: string): Promise<Restaurant[]>;
  createRestaurant(restaurant: InsertRestaurant): Promise<Restaurant>;
  updateRestaurantRating(id: number, rating: number, sigma: number): Promise<Restaurant>;
  getRandomPair(): Promise<[Restaurant, Restaurant]>;
  createComparison(comparison: InsertComparison): Promise<Comparison>;
  getComparisons(userId: string): Promise<Comparison[]>;
}

export class MemStorage implements IStorage {
  private restaurants: Map<number, Restaurant>;
  private comparisons: Map<number, Comparison>;
  private currentRestaurantId: number;
  private currentComparisonId: number;

  constructor() {
    this.restaurants = new Map();
    this.comparisons = new Map();
    this.currentRestaurantId = 1;
    this.currentComparisonId = 1;
    this.initializeData();
  }

  private initializeData() {
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
      }
    ];

    initialRestaurants.forEach(r => this.createRestaurant(r));
  }

  async getRestaurants(): Promise<Restaurant[]> {
    return Array.from(this.restaurants.values());
  }

  async getRestaurantById(id: number): Promise<Restaurant | undefined> {
    return this.restaurants.get(id);
  }

  async getRestaurantsByArea(area: string): Promise<Restaurant[]> {
    return Array.from(this.restaurants.values()).filter(r => r.area === area);
  }

  async getRestaurantsByCuisine(cuisine: string): Promise<Restaurant[]> {
    return Array.from(this.restaurants.values()).filter(r => 
      r.cuisineTypes.includes(cuisine)
    );
  }

  async createRestaurant(data: InsertRestaurant): Promise<Restaurant> {
    const id = this.currentRestaurantId++;
    const restaurant: Restaurant = {
      ...data,
      id,
      rating: 0,
      sigma: 1,
      createdAt: new Date(),
    };
    this.restaurants.set(id, restaurant);
    return restaurant;
  }

  async updateRestaurantRating(id: number, rating: number, sigma: number): Promise<Restaurant> {
    const restaurant = await this.getRestaurantById(id);
    if (!restaurant) throw new Error("Restaurant not found");
    
    const updated = { ...restaurant, rating, sigma };
    this.restaurants.set(id, updated);
    return updated;
  }

  async getRandomPair(): Promise<[Restaurant, Restaurant]> {
    const restaurants = Array.from(this.restaurants.values());
    const idx1 = Math.floor(Math.random() * restaurants.length);
    let idx2 = Math.floor(Math.random() * (restaurants.length - 1));
    if (idx2 >= idx1) idx2++;
    return [restaurants[idx1], restaurants[idx2]];
  }

  async createComparison(data: InsertComparison): Promise<Comparison> {
    const id = this.currentComparisonId++;
    const comparison: Comparison = {
      ...data,
      id,
      createdAt: new Date(),
    };
    this.comparisons.set(id, comparison);
    return comparison;
  }

  async getComparisons(userId: string): Promise<Comparison[]> {
    return Array.from(this.comparisons.values()).filter(c => c.userId === userId);
  }
}

export const storage = new MemStorage();
