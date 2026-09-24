import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  prefixText?: string;
  suffixText?: string;
  error?: string;
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      prefixText,
      suffixText,
      error,
      mono = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col space-y-1 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[11px] font-sans font-medium text-[#787b86] flex items-center justify-between"
          >
            <span>{label}</span>
          </label>
        )}
        <div
          className={`flex items-center bg-[#131722] border rounded transition-colors ${
            error
              ? "border-[#f23645] focus-within:border-[#f23645]"
              : "border-[#2a2e39] focus-within:border-[#2962ff]"
          }`}
        >
          {prefixText && (
            <span className="pl-2.5 pr-1 text-xs text-[#787b86] select-none font-mono">
              {prefixText}
            </span>
          )}
          <input
            id={inputId}
            ref={ref}
            className={`w-full bg-transparent px-2.5 py-1.5 text-xs text-[#d1d4dc] placeholder-[#787b86]/60 focus:outline-none ${
              mono ? "font-mono tabular-nums" : "font-sans"
            } ${className}`}
            {...props}
          />
          {suffixText && (
            <span className="pr-2.5 pl-1 text-[11px] text-[#787b86] select-none font-mono">
              {suffixText}
            </span>
          )}
        </div>
        {error && <span className="text-[10px] text-[#f23645]">{error}</span>}
      </div>
    );
  }
);

Input.displayName = "Input";
