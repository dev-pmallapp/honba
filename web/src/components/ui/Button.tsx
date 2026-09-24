import React from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "tab";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  isActive?: boolean;
  isLoading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[#2962ff] hover:bg-[#1e53e5] active:bg-[#1846c4] text-white border border-transparent shadow-sm",
  secondary:
    "bg-[#2a2e39] hover:bg-[#363a45] active:bg-[#404452] text-[#d1d4dc] hover:text-white border border-[#363a45]/60",
  danger:
    "bg-[#f23645]/20 hover:bg-[#f23645]/30 active:bg-[#f23645]/40 text-[#f23645] border border-[#f23645]/40",
  ghost:
    "bg-transparent hover:bg-[#2a2e39]/60 active:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] border border-transparent",
  outline:
    "bg-transparent hover:bg-[#2a2e39]/50 text-[#d1d4dc] border border-[#363a45] hover:border-[#4a5060]",
  tab:
    "bg-transparent text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/40 border border-transparent",
};

const activeVariantStyles: Partial<Record<ButtonVariant, string>> = {
  tab: "bg-[#2a2e39] text-white font-medium shadow-sm border-[#363a45]/40",
  secondary: "bg-[#363a45] text-white border-[#4a5060]",
  ghost: "bg-[#2a2e39] text-white",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "px-2 py-0.5 text-[11px] gap-1 rounded",
  sm: "px-2.5 py-1 text-xs gap-1.5 rounded",
  md: "px-3.5 py-1.5 text-xs gap-2 rounded-md font-medium",
  lg: "px-4 py-2 text-sm gap-2 rounded-md font-semibold",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "sm",
      icon,
      iconPosition = "left",
      isActive = false,
      isLoading = false,
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const baseStyle =
      "inline-flex items-center justify-center font-sans select-none transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none focus:outline-none";

    const variantClass =
      isActive && activeVariantStyles[variant]
        ? activeVariantStyles[variant]
        : variantStyles[variant];
    const sizeClass = sizeStyles[size];

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyle} ${variantClass} ${sizeClass} ${className}`}
        {...props}
      >
        {isLoading && (
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
        )}
        {!isLoading && icon && iconPosition === "left" && (
          <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
        )}
        {children && <span>{children}</span>}
        {!isLoading && icon && iconPosition === "right" && (
          <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
