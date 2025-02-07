import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold text-center mb-4 bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text">
        DC Restaurant Ranker
      </h1>
      <p className="text-xl text-center text-muted-foreground mb-8 max-w-lg">
        Help us find the best restaurants in DC by comparing them head-to-head
      </p>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <Button asChild size="lg">
          <Link href="/compare">Start Comparing</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/rankings">View Rankings</Link>
        </Button>
      </div>
    </div>
  );
}
