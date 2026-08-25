"use client";
import { useEffect, useState } from "react";

export default function NumberTicker({
  value,
  duration = 800,
  formatter = (v: number) => String(Math.floor(v)),
}: {
  value: number;
  duration?: number;
  formatter?: (v: number) => string;
}) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      setDisplayValue(progress * value);
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span className="font-mono tabular-nums">{formatter(displayValue)}</span>;
}
