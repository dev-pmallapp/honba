import React, { useEffect, useRef } from "react";
import { createChart, ColorType } from "lightweight-charts";

export default function TradingViewCanvas() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#787b86",
      },
      grid: {
        vertLines: { color: "#1e222d" },
        horzLines: { color: "#1e222d" },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        borderColor: "#2a2e39",
      },
      rightPriceScale: {
        borderColor: "#2a2e39",
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#089981",
      downColor: "#f23645",
      borderVisible: false,
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
    });

    // Sample data demonstrating NIFTY Alpha 50 momentum
    const initialData = [
      { time: "2024-01-01", open: 8000, high: 8050, low: 7980, close: 8040 },
      { time: "2024-01-02", open: 8040, high: 8090, low: 8020, close: 8075 },
      { time: "2024-01-03", open: 8075, high: 8120, low: 8050, close: 8110 },
      { time: "2024-01-04", open: 8110, high: 8150, low: 8080, close: 8090 },
      { time: "2024-01-05", open: 8090, high: 8140, low: 8080, close: 8130 },
      { time: "2024-01-08", open: 8130, high: 8180, low: 8120, close: 8165 },
    ];

    candleSeries.setData(initialData);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}
