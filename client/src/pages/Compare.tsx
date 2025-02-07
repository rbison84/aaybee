import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RestaurantCard } from "@/components/RestaurantCard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { type Restaurant } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export default function Compare() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: pair, isLoading, refetch } = useQuery<[Restaurant, Restaurant]>({
    queryKey: ["/api/restaurants/pair"],
  });

  const submitMutation = useMutation({
    mutationFn: async (winnerId: number) => {
      if (!pair) return;
      const loserId = pair.find(r => r.id !== winnerId)?.id;
      if (!loserId) return;

      await apiRequest("POST", "/api/comparisons", {
        winnerId,
        loserId,
        userId: "anonymous",
        context: { timeOfDay: new Date().getHours() }
      });
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
    await submitMutation.mutateAsync(id);
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
    </div>
  );
}
