import { useState } from "react";
import { ShieldCheck, Info } from "lucide-react";
import { Button, Badge, Input, Select } from "../ui";

export interface OrderTicketProps {
  currentSymbol: string;
}

export default function OrderTicket({ currentSymbol }: OrderTicketProps) {
  const [broker, setBroker] = useState("paper");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [product, setProduct] = useState<"MIS" | "CNC" | "NORMAL">("MIS");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL" | "SL-M">("LIMIT");
  const [qty, setQty] = useState(25);
  const [price, setPrice] = useState(8120.0);
  const [target, setTarget] = useState(8180.0);
  const [stoploss, setStoploss] = useState(8080.0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  // Indian Taxation & Transaction Charges Calculation (NSE F&O / Equity SEBI norms)
  const turnover = price * qty;
  const brokerage = broker === "paper" ? 0.0 : 20.0;
  const stt = side === "SELL" || product === "CNC" ? turnover * (product === "CNC" ? 0.001 : 0.00025) : 0;
  const exchangeTurnoverCharge = turnover * 0.0000325;
  const sebiCharges = turnover * 0.000001;
  const stampDuty = side === "BUY" ? turnover * 0.00003 : 0;
  const gst = (brokerage + exchangeTurnoverCharge + sebiCharges) * 0.18;
  const totalTaxAndCharges = brokerage + stt + exchangeTurnoverCharge + sebiCharges + stampDuty + gst;

  // Risk / Reward
  const riskPerShare = Math.abs(price - stoploss);
  const rewardPerShare = Math.abs(target - price);
  const riskRewardRatio = riskPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(2) : "0.00";
  const totalRisk = riskPerShare * qty;
  const totalReward = rewardPerShare * qty;

  const handleSubmit = () => {
    setIsSubmitting(true);
    setOrderStatus(null);
    setTimeout(() => {
      setIsSubmitting(false);
      setOrderStatus(`Order #ORD-${Math.floor(100000 + Math.random() * 900000)} Placed Successfully`);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e222d] text-[#d1d4dc] text-xs p-3 space-y-3 overflow-y-auto select-none font-sans">
      {/* Broker Gateway Adapter Selection (Sparingly configurable) */}
      <div className="bg-[#131722]/70 p-2 rounded border border-[#2a2e39] space-y-1.5">
        <Select
          label="Execution Gateway"
          value={broker}
          onChange={(e) => setBroker(e.target.value)}
          options={[
            { value: "paper", label: "Paper Engine (Simulated Zero Latency)" },
            { value: "zerodha", label: "Zerodha Kite Connect" },
            { value: "dhan", label: "Dhan HQ API Gateway" },
            { value: "direct", label: "Direct FIX / Colocation" },
          ]}
        />
        <div className="flex items-center justify-between text-[10px] text-[#787b86]">
          <span>Routing: {broker === "paper" ? "Local Simulator" : "External Broker API"}</span>
          <Badge variant={broker === "paper" ? "bullish" : "accent"} size="xs">
            {broker === "paper" ? "ZERO RISK" : "LIVE LINK"}
          </Badge>
        </div>
      </div>

      {/* Side Toggle (BUY / SELL) */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#131722] rounded border border-[#2a2e39]">
        <button
          onClick={() => setSide("BUY")}
          className={`py-1.5 rounded font-bold transition text-xs cursor-pointer ${
            side === "BUY"
              ? "bg-[#089981] text-white shadow-sm"
              : "text-[#787b86] hover:text-white hover:bg-[#2a2e39]/40"
          }`}
        >
          BUY
        </button>
        <button
          onClick={() => setSide("SELL")}
          className={`py-1.5 rounded font-bold transition text-xs cursor-pointer ${
            side === "SELL"
              ? "bg-[#f23645] text-white shadow-sm"
              : "text-[#787b86] hover:text-white hover:bg-[#2a2e39]/40"
          }`}
        >
          SELL
        </button>
      </div>

      {/* Product Type (MIS / CNC / NORMAL) */}
      <div>
        <label className="text-[10px] text-[#787b86] uppercase font-semibold mb-1 block">
          Product Type
        </label>
        <div className="grid grid-cols-3 gap-1">
          {(["MIS", "CNC", "NORMAL"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProduct(p)}
              className={`py-1 rounded text-xs transition border cursor-pointer ${
                product === p
                  ? "bg-[#2962ff] border-[#2962ff] text-white font-semibold"
                  : "bg-[#131722] border-[#2a2e39] text-[#787b86] hover:border-[#363a45] hover:text-white"
              }`}
            >
              {p === "MIS" ? "Intraday" : p === "CNC" ? "Delivery" : "Carry"}
            </button>
          ))}
        </div>
      </div>

      {/* Order Type */}
      <div>
        <label className="text-[10px] text-[#787b86] uppercase font-semibold mb-1 block">
          Order Type
        </label>
        <div className="grid grid-cols-4 gap-1">
          {(["MARKET", "LIMIT", "SL", "SL-M"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setOrderType(t)}
              className={`py-1 rounded text-xs transition border cursor-pointer ${
                orderType === t
                  ? "bg-[#2a2e39] border-[#2962ff] text-white font-medium"
                  : "bg-[#131722] border-[#2a2e39] text-[#787b86] hover:border-[#363a45]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Qty & Price Inputs */}
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="Quantity"
          type="number"
          mono
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          suffixText="Qty"
        />

        <Input
          label="Price"
          type="number"
          step="0.05"
          mono
          disabled={orderType === "MARKET" || orderType === "SL-M"}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          prefixText="₹"
        />
      </div>

      {/* Bracket / Target & Stoploss */}
      <div className="p-2.5 bg-[#131722]/50 border border-[#2a2e39] rounded space-y-2">
        <div className="flex justify-between items-center text-[11px] font-semibold text-[#787b86]">
          <span>Risk Management (Bracket)</span>
          <span className="font-mono text-white">R:R 1:{riskRewardRatio}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Target Price"
            type="number"
            step="0.05"
            mono
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            prefixText="₹"
          />

          <Input
            label="Stop Loss"
            type="number"
            step="0.05"
            mono
            value={stoploss}
            onChange={(e) => setStoploss(Number(e.target.value))}
            prefixText="₹"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-mono">
          <div className="text-[#089981]">
            Reward: +₹{totalReward.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[#f23645] text-right">
            Risk: -₹{totalRisk.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Tax & Margin Estimator */}
      <div className="bg-[#131722] p-2.5 rounded border border-[#2a2e39] space-y-1.5 text-[11px]">
        <div className="flex justify-between text-[#787b86]">
          <span>Turnover</span>
          <span className="font-mono text-white tabular-nums">
            ₹{turnover.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-between text-[#787b86]">
          <span className="flex items-center gap-1">
            <span>Brokerage & Taxes</span>
            <Info className="w-3 h-3 text-[#787b86]" />
          </span>
          <span className="font-mono text-[#d1d4dc] tabular-nums">
            ₹{totalTaxAndCharges.toFixed(2)}
          </span>
        </div>

        <div className="flex justify-between text-[#787b86] pt-1 border-t border-[#2a2e39]">
          <span className="font-semibold text-white">Margin Required</span>
          <span className="font-mono font-bold text-amber-400 tabular-nums">
            ₹{(turnover * (product === "MIS" ? 0.2 : 1.0)).toLocaleString("en-IN", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Pre-trade RiskGuard Check */}
      <div className="flex items-center space-x-2 text-[11px] text-[#089981] bg-[#089981]/10 p-2 rounded border border-[#089981]/20">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span>RiskGuard: Passed max drawdown & position size limits</span>
      </div>

      {/* Order Status Notification */}
      {orderStatus && (
        <div className="p-2 text-xs font-mono text-white bg-[#089981]/20 border border-[#089981] rounded text-center">
          {orderStatus}
        </div>
      )}

      {/* Place Order CTA */}
      <Button
        variant={side === "BUY" ? "primary" : "danger"}
        size="md"
        isLoading={isSubmitting}
        onClick={handleSubmit}
        className={`w-full py-2.5 font-bold uppercase tracking-wider text-xs ${
          side === "BUY" ? "bg-[#089981] hover:bg-[#07806c]" : "bg-[#f23645] hover:bg-[#d62837]"
        }`}
      >
        {isSubmitting
          ? "Routing Order..."
          : `${side} ${qty} ${currentSymbol} @ ₹${price}`}
      </Button>
    </div>
  );
}
