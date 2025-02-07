import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RestaurantCard } from "@/components/RestaurantCard";
import { Skeleton } from "@/components/ui/skeleton";
import { type Restaurant, type PersonalRanking } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface RankingTabsProps {
  globalRankings: Restaurant[];
  selectedArea?: string;
  selectedCuisine?: string;
}

export function RankingTabs({
  globalRankings,
  selectedArea,
  selectedCuisine
}: RankingTabsProps) {
  const { data: personalRankings, isLoading: isLoadingPersonal } = useQuery<
    (PersonalRanking & { restaurant: Restaurant })[]
  >({
    queryKey: ["/api/rankings/personal", selectedArea, selectedCuisine],
  });

  return (
    <Tabs defaultValue="global" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="global">Global Rankings</TabsTrigger>
        <TabsTrigger value="personal">My Rankings</TabsTrigger>
      </TabsList>

      <TabsContent value="global">
        <div className="space-y-4">
          {globalRankings.map((restaurant, index) => (
            <div key={restaurant.id} className="relative">
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 font-bold text-xl text-muted-foreground">
                {index + 1}
              </div>
              <RestaurantCard restaurant={restaurant} />
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="personal">
        {isLoadingPersonal ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {personalRankings?.map((ranking, index) => (
              <div key={ranking.id} className="relative">
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 font-bold text-xl text-muted-foreground">
                  {index + 1}
                </div>
                <RestaurantCard restaurant={ranking.restaurant} />
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
