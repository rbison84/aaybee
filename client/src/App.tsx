import { Switch, Route, Link } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import Home from "@/pages/Home";
import Compare from "@/pages/Compare";
import Rankings from "@/pages/Rankings";
import Recommendations from "@/pages/Recommendations";
import NotFound from "@/pages/not-found";

function Navigation() {
  return (
    <nav className="border-b">
      <div className="max-w-4xl mx-auto px-4 py-3 flex gap-4">
        <Button variant="ghost" asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/compare">Compare</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/rankings">Rankings</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/recommendations">For You</Link>
        </Button>
      </div>
    </nav>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/compare" component={Compare} />
      <Route path="/rankings" component={Rankings} />
      <Route path="/recommendations" component={Recommendations} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Navigation />
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;