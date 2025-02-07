import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { Link } from "wouter";
import { RestaurantCard } from "@/components/RestaurantCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { type Restaurant } from "@shared/schema";

export default function Recommendations() {
  const { user, isLoaded } = useUser();

  const { data: recommendations, isLoading } = useQuery<(Restaurant & { preferenceScore: number })[]>({
    queryKey: ["/api/restaurants/recommendations", user?.id],
    enabled: !!user,
  });

  // Show loading state while Clerk loads
  if (!isLoaded) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  // Show sign in prompt if user is not authenticated
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h1 className="text-2xl font-bold">Sign in to see recommendations</h1>
        <p className="text-muted-foreground">
          Get personalized restaurant recommendations based on your choices
        </p>
        <Button asChild>
          <Link href="/sign-in">Sign In</Link>
        </Button>
      </div>
    );
  }

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