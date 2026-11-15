import { type JSX } from "preact";
import { AlertTriangle, CircleCheck, CircleX, HeartPulse } from "../icons";

import type { IHealthCheckResult, IHealthStatus } from "../../shared/types";
import { RequestStateNotice } from "../components/RequestStateNotice";
import { Button } from "../components/ui/Button";
import { TitledCard } from "../components/ui/TitledCard";
import { useFetch } from "../hooks/useFetch";

function getStatusIcon(status: string): JSX.Element {
  switch (status) {
    case "pass":
      return <CircleCheck class="h-4 w-4" aria-hidden="true" />;
    case "warn":
      return <AlertTriangle class="h-4 w-4" aria-hidden="true" />;
    case "fail":
      return <CircleX class="h-4 w-4" aria-hidden="true" />;
    default:
      return <HeartPulse class="h-4 w-4" aria-hidden="true" />;
  }
}

const statusLabels = { pass: "Pass", warn: "Warning", fail: "Failure" };

type HealthCheckCardProps = {
  check: IHealthCheckResult;
};

function HealthCheckCard({ check }: HealthCheckCardProps): JSX.Element {
  return (
    <TitledCard title={check.name} icon={getStatusIcon(check.status)}>
      <p class="mb-2 text-sm font-semibold">{statusLabels[check.status]}</p>
      {check.message && <p class="text-sm text-foreground">{check.message}</p>}
      {(check.details?.length || 0) > 0 && (
        <details class="mt-3">
          <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium">Diagnostic details</summary>
          <ul class="text-sm text-muted-foreground mt-2 ml-4 space-y-2 list-disc break-words [overflow-wrap:anywhere]">
            {check.details?.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        </details>
      )}
    </TitledCard>
  );
}

export function Health(): JSX.Element {
  const { data: health, loading, error, refetch } = useFetch<IHealthStatus>("/health");

  if (health === null) {
    return (
      <div data-testid="Health">
        <RequestStateNotice label="Health checks" loading={loading} error={error} hasData={false} onRetry={refetch} />
      </div>
    );
  }

  const issues = health.checks.filter((check) => check.status !== "pass");
  issues.sort((left, right) => Number(right.status === "fail") - Number(left.status === "fail"));
  const passing = health.checks.filter((check) => check.status === "pass");

  return (
    <div data-testid="Health" class="space-y-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-2">
          <h1 class="flex items-center gap-2 text-2xl font-bold">
            <HeartPulse class="h-6 w-6 shrink-0" aria-hidden="true" /> Health Checks
          </h1>
          <h2 class="font-semibold capitalize">{error ? `Last known: ${health.overall}` : health.overall}</h2>
          <p class="text-sm" role="status">
            {loading
              ? "Checking…"
              : `${issues.length} ${issues.length === 1 ? "check needs" : "checks need"} attention.`}
          </p>
          <p class="text-sm text-muted-foreground">
            Last completed check: <time dateTime={health.lastCheck}>{new Date(health.lastCheck).toLocaleString()}</time>
          </p>
        </div>
        <Button variant="outline" onClick={refetch} disabled={loading}>
          {loading ? "Checking…" : "Recheck health"}
        </Button>
      </header>
      <RequestStateNotice label="Health checks" loading={loading} error={error} hasData onRetry={refetch} />
      <div class="space-y-4">
        {issues.map((check) => (
          <HealthCheckCard key={check.name} check={check} />
        ))}
      </div>
      {passing.length > 0 && (
        <details class="rounded-lg border border-border p-4">
          <summary class="min-h-11 cursor-pointer py-2 font-medium">Passing checks ({passing.length})</summary>
          <div class="mt-3 space-y-3">
            {passing.map((check) => (
              <HealthCheckCard key={check.name} check={check} />
            ))}
          </div>
        </details>
      )}
      {health.checks.length === 0 && <p class="text-sm text-muted-foreground">No checks available</p>}
    </div>
  );
}
