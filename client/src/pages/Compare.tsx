import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RestaurantCard } from "@/components/RestaurantCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { type Restaurant } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Compare() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: pair, isLoading, refetch } = useQuery<[Restaurant, Restaurant]>({
    queryKey: ["/api/restaurants/pair"],
  });

  const submitMutation = useMutation({
    mutationFn: async ({ winnerId, notTried }: { winnerId?: number, notTried?: boolean }) => {
      if (!pair) return;

      if (notTried) {
        await apiRequest("POST", "/api/comparisons", {
          restaurantIds: pair.map(r => r.id),
          userId: "anonymous",
          context: { timeOfDay: new Date().getHours() },
          notTried: true
        });
      } else if (winnerId) {
        const loserId = pair.find(r => r.id !== winnerId)?.id;
        if (!loserId) return;

        await apiRequest("POST", "/api/comparisons", {
          winnerId,
          loserId,
          userId: "anonymous",
          context: { timeOfDay: new Date().getHours() },
          notTried: false
        });

        // If the user made a choice, mark both restaurants as tried
        await apiRequest("POST", "/api/restaurants/tried", {
          restaurantIds: pair.map(r => r.id)
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "Choice recorded!",
        description: "Loading next comparison...",
      });
      setSelectedId(null);
      refetch();
    }
  });

  const handleChoice = async (id: number) => {
    setSelectedId(id);
    await submitMutation.mutateAsync({ winnerId: id });
  };

  const handleNotTried = async () => {
    await submitMutation.mutateAsync({ notTried: true });
  };

  if (isLoading || !pair) {
    return (
      <div className="grid md:grid-cols-2 gap-6 p-4">
        <Card className="p-6">
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
        <Card className="p-6">
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-4 w-1/2" />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-center mb-8">
        Which restaurant do you prefer?
      </h1>
      <div className="grid md:grid-cols-2 gap-6">
        {pair.map(restaurant => (
          <RestaurantCard
            key={restaurant.id}
            restaurant={restaurant}
            onClick={() => handleChoice(restaurant.id)}
          />
        ))}
      </div>
      <div className="flex justify-center mt-6">
        <Button 
          variant="outline" 
          onClick={handleNotTried}
          className="text-muted-foreground"
        >
          I don't know
        </Button>
      </div>
    </div>
  );
}