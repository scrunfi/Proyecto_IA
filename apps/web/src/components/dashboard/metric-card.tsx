"use client";

import { useEffect, useRef, useState } from "react";

import { InfoTooltip } from "@/components/ui/info-tooltip";

type MetricCardProps = {
  label: string;
  value?: string;
  numericValue?: number;
  suffix?: string;
  toneClassName?: string;
  tooltip?: string;
  tooltipAlign?: "left" | "right";
};

export function MetricCard({
  label,
  value,
  numericValue,
  suffix,
  toneClassName,
  tooltip,
  tooltipAlign,
}: MetricCardProps) {
  const [animatedValue, setAnimatedValue] = useState(0);
  const [trend, setTrend] = useState<"up" | "down" | "same">("same");
  const previousValueRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (numericValue === undefined) {
      return;
    }

    const previous = previousValueRef.current;
    if (previous !== undefined) {
      if (numericValue > previous) {
        setTrend("up");
      } else if (numericValue < previous) {
        setTrend("down");
      } else {
        setTrend("same");
      }
    }
    previousValueRef.current = numericValue;

    const target = Math.max(0, numericValue);
    const duration = 500;
    const frameMs = 16;
    const steps = Math.max(1, Math.round(duration / frameMs));
    const step = target / steps;
    let currentStep = 0;

    const interval = window.setInterval(() => {
      currentStep += 1;
      const nextValue = Math.round(Math.min(target, step * currentStep));
      setAnimatedValue(nextValue);

      if (currentStep >= steps) {
        window.clearInterval(interval);
      }
    }, frameMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [numericValue]);

  useEffect(() => {
    if (trend === "same") {
      return;
    }

    const timer = window.setTimeout(() => {
      setTrend("same");
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [trend]);

  const displayValue =
    numericValue !== undefined
      ? `${animatedValue}${suffix ? suffix : ""}`
      : (value ?? "-");

  return (
    <article className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <p className={`text-xs text-zinc-600 ${toneClassName ?? ""}`}>{label}</p>
        {tooltip ? (
          <InfoTooltip text={tooltip} label={`Ayuda sobre ${label}`} align={tooltipAlign} />
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <p
          className={`text-2xl font-semibold transition-colors duration-500 ${
            trend === "up"
              ? "text-emerald-700"
              : trend === "down"
                ? "text-amber-700"
                : "text-foreground"
          }`}
        >
          {displayValue}
        </p>
        {trend !== "same" && (
          <span
            className={`text-sm font-bold transition-opacity duration-500 ${
              trend === "up" ? "text-emerald-700" : "text-amber-700"
            }`}
            aria-hidden="true"
          >
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
    </article>
  );
}
