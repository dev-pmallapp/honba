import React from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, children, className = "", id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="flex flex-col space-y-1 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="text-[11px] font-sans font-medium text-[#787b86]"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            className={`w-full appearance-none bg-[#2a2e39] border border-[#363a45] rounded px-2.5 py-1.5 pr-8 text-xs font-sans text-white focus:outline-none focus:border-[#2962ff] transition-colors cursor-pointer ${className}`}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#1e222d] text-white">
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-[#787b86] absolute right-2.5 pointer-events-none" />
        </div>
      </div>
    );
  }
);

Select.displayName = "Select";
