import { pgTable, text, serial, timestamp, jsonb, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const restaurants = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  area: text("area").notNull(),
  cuisineTypes: text("cuisine_types").array().notNull(),
  rating: real("rating").default(0),
  sigma: real("sigma").default(1),
  createdAt: timestamp("created_at").defaultNow(),
});

export const comparisons = pgTable("comparisons", {
  id: serial("id").primaryKey(),
  winnerId: serial("winner_id").references(() => restaurants.id),
  loserId: serial("loser_id").references(() => restaurants.id),
  userId: text("user_id").notNull(),
  context: jsonb("context").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  notTried: boolean("not_tried").default(false),
});

export const triedRestaurants = pgTable("tried_restaurants", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  restaurantId: serial("restaurant_id").references(() => restaurants.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRestaurantSchema = createInsertSchema(restaurants).omit({
  id: true,
  rating: true,
  sigma: true,
  createdAt: true,
});

export const insertComparisonSchema = createInsertSchema(comparisons).omit({
  id: true,
  createdAt: true,
});

export const insertTriedRestaurantSchema = createInsertSchema(triedRestaurants).omit({
  id: true,
  createdAt: true,
});

export type Restaurant = typeof restaurants.$inferSelect;
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type Comparison = typeof comparisons.$inferSelect;
export type InsertComparison = z.infer<typeof insertComparisonSchema>;
export type TriedRestaurant = typeof triedRestaurants.$inferSelect;
export type InsertTriedRestaurant = z.infer<typeof insertTriedRestaurantSchema>;