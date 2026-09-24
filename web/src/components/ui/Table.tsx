import React from "react";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  compact?: boolean;
}

export const Table: React.FC<TableProps> = ({
  compact = false,
  className = "",
  children,
  ...props
}) => {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={`w-full border-collapse font-sans text-xs ${
          compact ? "text-[11px]" : "text-xs"
        } ${className}`}
        {...props}
      >
        {children}
      </table>
    </div>
  );
};

export const TableHeader: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className = "",
  children,
  ...props
}) => {
  return (
    <thead
      className={`bg-[#131722] text-[#787b86] font-semibold uppercase text-[10px] tracking-wider border-b border-[#2a2e39] sticky top-0 z-10 select-none ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
};

export const TableBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className = "",
  children,
  ...props
}) => {
  return (
    <tbody className={`divide-y divide-[#2a2e39]/30 text-[#d1d4dc] ${className}`} {...props}>
      {children}
    </tbody>
  );
};

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  isHighlight?: boolean;
  isAtm?: boolean;
}

export const TableRow: React.FC<TableRowProps> = ({
  isHighlight = false,
  isAtm = false,
  className = "",
  children,
  ...props
}) => {
  const rowStyle = isAtm
    ? "bg-[#2962ff]/15 hover:bg-[#2962ff]/25 border-y border-[#2962ff]/40 font-semibold"
    : isHighlight
    ? "bg-[#2a2e39]/40"
    : "hover:bg-[#2a2e39]/30 transition-colors";

  return (
    <tr className={`${rowStyle} ${className}`} {...props}>
      {children}
    </tr>
  );
};

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  color?: string;
}

export const TableHead: React.FC<TableHeadProps> = ({
  align = "left",
  color,
  className = "",
  children,
  style,
  ...props
}) => {
  const alignClass =
    align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

  return (
    <th
      className={`py-2 px-2.5 font-semibold text-[10px] whitespace-nowrap ${alignClass} ${
        color || "text-[#787b86]"
      } ${className}`}
      style={style}
      {...props}
    >
      {children}
    </th>
  );
};

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "center" | "right";
  mono?: boolean;
  color?: string;
}

export const TableCell: React.FC<TableCellProps> = ({
  align = "left",
  mono = true,
  color,
  className = "",
  children,
  style,
  ...props
}) => {
  const alignClass =
    align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  const fontClass = mono ? "font-mono tabular-nums text-[11px]" : "font-sans";

  return (
    <td
      className={`py-1.5 px-2.5 whitespace-nowrap ${alignClass} ${fontClass} ${
        color || "text-[#d1d4dc]"
      } ${className}`}
      style={style}
      {...props}
    >
      {children}
    </td>
  );
};
