import React from "react";
import { Badge, BadgeVariant } from "./Badge";

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  badge?: {
    text: string;
    variant: BadgeVariant;
  };
  icon?: React.ReactNode;
  valueColor?: string;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  badge,
  icon,
  valueColor,
  className = "",
}) => {
  return (
    <div
      className={`bg-[#1e222d] border border-[#2a2e39] rounded p-2.5 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center justify-between text-[#787b86] text-[11px] font-sans">
        <span className="font-medium truncate">{title}</span>
        {icon && <span className="text-[#787b86]">{icon}</span>}
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-1.5">
        <span
          className={`font-mono font-bold text-sm tracking-tight tabular-nums ${
            valueColor || "text-white"
          }`}
        >
          {value}
        </span>
        {badge && (
          <Badge variant={badge.variant} size="xs" mono>
            {badge.text}
          </Badge>
        )}
      </div>

      {subtitle && (
        <span className="mt-0.5 text-[10px] text-[#787b86] font-sans truncate">
          {subtitle}
        </span>
      )}
    </div>
  );
};
