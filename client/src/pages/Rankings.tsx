import { useQuery } from "@tanstack/react-query";
import { RestaurantCard } from "@/components/RestaurantCard";
import { FilterBar } from "@/components/FilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import { type Restaurant } from "@shared/schema";
import { useState } from "react";

export default function Rankings() {
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState("");

  const { data: restaurants, isLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants/filter", selectedArea, selectedCuisine],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedArea) params.append("area", selectedArea);
      if (selectedCuisine) params.append("cuisine", selectedCuisine);
      const res = await fetch(`/api/restaurants/filter?${params}`);
      return res.json();
    }
  });

  const areas = Array.from(new Set(restaurants?.map(r => r.area) || []));
  const cuisines = Array.from(new Set(
    restaurants?.flatMap(r => r.cuisineTypes) || []
  ));

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold p-4">DC Restaurant Rankings</h1>
      
      <FilterBar
        areas={areas}
        cuisines={cuisines}
        selectedArea={selectedArea}
        selectedCuisine={selectedCuisine}
        onAreaChange={setSelectedArea}
        onCuisineChange={setSelectedCuisine}
      />

      <div className="space-y-4 p-4">
        {restaurants?.sort((a, b) => b.rating - a.rating).map(restaurant => (
          <RestaurantCard key={restaurant.id} restaurant={restaurant} />
        ))}
      </div>
    </div>
  );
}
