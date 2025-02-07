import { useQuery } from "@tanstack/react-query";
import { RestaurantCard } from "@/components/RestaurantCard";
import { Skeleton } from "@/components/ui/skeleton";
import { type Restaurant } from "@shared/schema";

export default function Recommendations() {
  const { data: recommendations, isLoading } = useQuery<(Restaurant & { preferenceScore: number })[]>({
    queryKey: ["/api/restaurants/recommendations"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold p-4">Recommended for You</h1>
      <p className="px-4 text-muted-foreground">
        Based on your previous choices, we think you'll like these restaurants:
      </p>

      <div className="space-y-4 p-4">
        {recommendations?.map(restaurant => (
          <RestaurantCard key={restaurant.id} restaurant={restaurant} />
        ))}
      </div>
    </div>
  );
}
