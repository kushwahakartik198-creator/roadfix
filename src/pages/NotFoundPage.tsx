import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { AlertTriangle, Home } from "lucide-react";

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
      <Card className="p-8">
        <CardHeader className="p-0">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-8 w-8" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Page not found
          </h1>
        </CardHeader>
        <CardContent className="mt-4 p-0">
          <p className="text-sm text-muted-foreground sm:text-base">
            The road you are looking for does not exist or has been relocated.
          </p>
          <div className="mt-6 flex justify-center">
            <Button asChild size="default" className="min-h-[44px]">
              <Link to="/" className="inline-flex items-center gap-2">
                <Home className="h-4 w-4" aria-hidden="true" />
                <span>Return to Home</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
