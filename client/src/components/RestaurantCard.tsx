import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { type Restaurant } from "@shared/schema";
import { MapPin } from "lucide-react";

interface RestaurantCardProps {
  restaurant: Restaurant;
  onClick?: () => void;
}

export function RestaurantCard({ restaurant, onClick }: RestaurantCardProps) {
  return (
    <Card 
      onClick={onClick}
      className={`${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
    >
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{restaurant.name}</span>
          <div className="flex items-center text-muted-foreground text-sm">
            <MapPin className="w-4 h-4 mr-1" />
            {restaurant.area}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {restaurant.cuisineTypes.map(cuisine => (
            <Badge key={cuisine} variant="secondary">
              {cuisine}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
