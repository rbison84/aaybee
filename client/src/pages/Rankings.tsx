import { useQuery } from "@tanstack/react-query";
import { FilterBar } from "@/components/FilterBar";
import { RankingTabs } from "@/components/RankingTabs";
import { Skeleton } from "@/components/ui/skeleton";
import { type Restaurant } from "@shared/schema";
import { useState } from "react";

export default function Rankings() {
  const [selectedArea, setSelectedArea] = useState<string | undefined>(undefined);
  const [selectedCuisine, setSelectedCuisine] = useState<string | undefined>(undefined);

  const { data: restaurants, isLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants/filter", selectedArea, selectedCuisine],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedArea && selectedArea !== 'all') params.append("area", selectedArea);
      if (selectedCuisine && selectedCuisine !== 'all') params.append("cuisine", selectedCuisine);
      const res = await fetch(`/api/restaurants/filter?${params}`);
      if (!res.ok) throw new Error('Failed to fetch restaurants');
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
        {[1, 2, 3, 4, 5].map(i => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  const sortedRestaurants = restaurants
    ?.sort((a, b) => {
      // First sort by rating
      const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
      // If ratings are equal (e.g., both 0), sort alphabetically
      if (ratingDiff === 0) {
        return a.name.localeCompare(b.name);
      }
      return ratingDiff;
    }) || [];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold p-4">DC Restaurant Rankings</h1>

      <FilterBar
        areas={areas}
        cuisines={cuisines}
        selectedArea={selectedArea}
        selectedCuisine={selectedCuisine}
        onAreaChange={value => setSelectedArea(value === 'all' ? undefined : value)}
        onCuisineChange={value => setSelectedCuisine(value === 'all' ? undefined : value)}
      />

      <div className="p-4">
        <RankingTabs
          globalRankings={sortedRestaurants}
          selectedArea={selectedArea}
          selectedCuisine={selectedCuisine}
        />
      </div>
    </div>
  );
}