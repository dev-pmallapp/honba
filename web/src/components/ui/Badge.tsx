import React from "react";

export type BadgeVariant =
  | "bullish"
  | "bearish"
  | "accent"
  | "neutral"
  | "warning"
  | "atm"
  | "outline";

export type BadgeSize = "xs" | "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  mono?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  bullish: "bg-[#089981]/15 text-[#089981] border border-[#089981]/30",
  bearish: "bg-[#f23645]/15 text-[#f23645] border border-[#f23645]/30",
  accent: "bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30",
  warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  neutral: "bg-[#2a2e39] text-[#787b86] border border-[#363a45]/50",
  atm: "bg-[#2962ff] text-white font-bold shadow-sm border border-[#2962ff]",
  outline: "bg-transparent text-[#787b86] border border-[#363a45]",
};

const sizeStyles: Record<BadgeSize, string> = {
  xs: "px-1.5 py-0.2 text-[10px] rounded",
  sm: "px-2 py-0.5 text-[11px] rounded",
  md: "px-2.5 py-1 text-xs rounded-md",
};

export const Badge: React.FC<BadgeProps> = ({
  variant = "neutral",
  size = "sm",
  mono = false,
  className = "",
  children,
  ...props
}) => {
  return (
    <span
      className={`inline-flex items-center justify-center font-medium leading-none select-none ${
        mono ? "font-mono tabular-nums" : "font-sans"
      } ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
