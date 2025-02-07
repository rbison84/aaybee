import { Switch, Route, Link } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, UserButton, useUser } from "@clerk/clerk-react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import Home from "@/pages/Home";
import Compare from "@/pages/Compare";
import Rankings from "@/pages/Rankings";
import Recommendations from "@/pages/Recommendations";
import NotFound from "@/pages/not-found";

if (!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key");
}

function Navigation() {
  const { isSignedIn } = useUser();

  return (
    <nav className="border-b">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex gap-4">
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
        <div>
          {isSignedIn ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" asChild>
                <Link href="/sign-in">Sign In</Link>
              </Button>
              <Button variant="default" asChild>
                <Link href="/sign-up">Sign Up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function Router() {
  const { isLoaded, isSignedIn } = useUser();

  // Show loading state while Clerk loads
  if (!isLoaded) return null;

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/compare" component={Compare} />
      <Route path="/rankings" component={Rankings} />
      <Route path="/recommendations" component={
        () => isSignedIn ? <Recommendations /> : <SignIn routing="path" signUpUrl="/sign-up" />
      } />
      <Route path="/sign-in/:path*" component={() => (
        <div className="flex justify-center items-center min-h-[80vh]">
          <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
        </div>
      )} />
      <Route path="/sign-up/:path*" component={() => (
        <div className="flex justify-center items-center min-h-[80vh]">
          <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
        </div>
      )} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <Navigation />
        <Router />
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;