import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RestaurantCard } from "@/components/RestaurantCard";
import { Skeleton } from "@/components/ui/skeleton";
import { type Restaurant, type PersonalRanking, type Comparison } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const { data: userChoices, isLoading: isLoadingChoices } = useQuery<{
    [userId: string]: {
      comparisons: (Comparison & {
        winner: Restaurant;
        loser: Restaurant;
      })[];
    }
  }>({
    queryKey: ["/api/admin/choices"],
  });

  return (
    <Tabs defaultValue="global" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="global">Global Rankings</TabsTrigger>
        <TabsTrigger value="personal">My Rankings</TabsTrigger>
        <TabsTrigger value="admin">Admin</TabsTrigger>
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

      <TabsContent value="admin">
        {isLoadingChoices ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {userChoices && Object.entries(userChoices).map(([userId, data]) => (
              <Card key={userId}>
                <CardHeader>
                  <CardTitle>User: {userId}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.comparisons.map((comparison, index) => (
                      <div key={comparison.id} className="border p-2 rounded">
                        <div className="text-sm text-muted-foreground">
                          Choice {index + 1} - {new Date(comparison.createdAt).toLocaleString()}
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <div className="font-semibold">Winner:</div>
                            {comparison.winner.name}
                          </div>
                          <div>
                            <div className="font-semibold">Loser:</div>
                            {comparison.loser.name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}