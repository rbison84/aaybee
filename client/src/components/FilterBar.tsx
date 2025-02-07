import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterBarProps {
  areas: string[];
  cuisines: string[];
  selectedArea: string | undefined;
  selectedCuisine: string | undefined;
  onAreaChange: (value: string | undefined) => void;
  onCuisineChange: (value: string | undefined) => void;
}

export function FilterBar({
  areas,
  cuisines,
  selectedArea,
  selectedCuisine,
  onAreaChange,
  onCuisineChange
}: FilterBarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 p-4">
      <Select value={selectedArea} onValueChange={onAreaChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Select area" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Areas</SelectItem>
          {areas.map(area => (
            <SelectItem key={area} value={area}>
              {area}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedCuisine} onValueChange={onCuisineChange}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="Select cuisine" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Cuisines</SelectItem>
          {cuisines.map(cuisine => (
            <SelectItem key={cuisine} value={cuisine}>
              {cuisine}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}