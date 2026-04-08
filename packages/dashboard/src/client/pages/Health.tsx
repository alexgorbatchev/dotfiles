import { type JSX } from "preact";
import { AlertTriangle, CircleCheck, CircleX, HeartPulse } from "../icons";

import type { IHealthCheckResult, IHealthStatus } from "../../shared/types";
import { Card, CardContent } from "../components/ui/Card";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";

function getStatusIcon(status: string): JSX.Element {
  switch (status) {
    case "pass":
      return <CircleCheck class="h-4 w-4" />;
    case "warn":
      return <AlertTriangle class="h-4 w-4" />;
    case "fail":
      return <CircleX class="h-4 w-4" />;
    default:
      return <CircleCheck class="h-4 w-4" />;
  }
}

function HealthCheckCard({ check }: { check: IHealthCheckResult }): JSX.Element {
  return (
    <TitledCard title={check.name} icon={getStatusIcon(check.status)}>
      {check.message && <p class="text-sm font-bold text-foreground">{check.message}</p>}
      {(check.details?.length || 0) > 0 && (
        <ul class="text-xs text-muted-foreground/70 mt-2 ml-4 space-y-1 list-disc">
          {check.details?.map((d, j) => (
            <li key={j}>{d}</li>
          ))}
        </ul>
      )}
    </TitledCard>
  );
}

export function Health(): JSX.Element {
  const { data: health, loading } = useFetch<IHealthStatus>("/health");

  if (loading) {
    return (
      <div class="flex items-center justify-center h-64">
        <div class="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    healthy: "bg-green-500",
    warning: "bg-amber-500",
    unhealthy: "bg-red-500",
  };

  return (
    <div class="space-y-6">
      {/* Page title */}
      <div class="flex items-center space-x-2">
        <HeartPulse class="h-6 w-6" />
        <h1 class="text-2xl font-bold">Health Checks</h1>
      </div>

      {/* Overall status */}
      <Card class="text-center">
        <CardContent class="pt-6">
          <div class={`w-4 h-4 rounded-full mx-auto mb-4 ${statusColors[health?.overall || "healthy"]}`} />
          <h2 class="text-2xl font-bold capitalize">{health?.overall || "Unknown"}</h2>
          <p class="text-muted-foreground text-sm mt-2">
            Last check: {health?.lastCheck ? new Date(health.lastCheck).toLocaleString() : "Never"}
          </p>
        </CardContent>
      </Card>

      {/* Individual check cards - stacked vertically */}
      <div class="space-y-4">
        {health?.checks?.map((check, i) => <HealthCheckCard key={i} check={check} />) || (
          <div class="text-muted-foreground">No checks available</div>
        )}
      </div>
    </div>
  );
}
