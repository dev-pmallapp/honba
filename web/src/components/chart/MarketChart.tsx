import { useEffect, useRef, useState } from "react";
import {
  createChart,
  darkTheme,
  type Chart,
  type SeriesApi,
  type Bar,
  type IndicatorApi,
} from "openalgo-charts";

export interface MarketChartProps {
  symbol: string;
  timeframe: string;
  indicators: {
    ema9: boolean;
    ema21: boolean;
    volume: boolean;
    supertrend: boolean;
  };
}

interface LegendData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
}

// Generate realistic Indian market OHLCV bars in UTC seconds for OpenAlgo Charts
function generateSampleBars(symbol: string): Bar[] {
  let basePrice = 8000;
  if (symbol === "NIFTY 50") basePrice = 24600;
  else if (symbol === "BANKNIFTY") basePrice = 51000;
  else if (symbol === "NIFTY200 A30") basePrice = 4850;
  else if (symbol === "RELIANCE") basePrice = 2920;

  const bars: Bar[] = [];
  let currentPrice = basePrice;
  const nowSec = Math.floor(Date.now() / 1000);
  const startSec = nowSec - 80 * 86400;

  for (let i = 0; i < 80; i++) {
    const time = startSec + i * 86400;
    const date = new Date(time * 1000);
    // skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    const volatility = basePrice * 0.008;
    const change = (Math.random() - 0.48) * volatility;
    const open = Math.round((currentPrice + (Math.random() - 0.5) * 5) * 100) / 100;
    const close = Math.round((open + change) * 100) / 100;
    const high = Math.round((Math.max(open, close) + Math.random() * volatility * 0.6) * 100) / 100;
    const low = Math.round((Math.min(open, close) - Math.random() * volatility * 0.6) * 100) / 100;
    const volume = Math.floor(Math.random() * 450000 + 150000);

    bars.push({
      time,
      open,
      high,
      low,
      close,
      volume,
    });

    currentPrice = close;
  }

  return bars;
}

export default function MarketChart({
  symbol,
  indicators,
}: MarketChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const candleSeriesRef = useRef<SeriesApi | null>(null);
  const indicatorInstancesRef = useRef<{
    ema9?: IndicatorApi;
    ema21?: IndicatorApi;
    volume?: IndicatorApi;
    supertrend?: IndicatorApi;
  }>({});

  const [legend, setLegend] = useState<LegendData | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up any previous chart instance
    if (chartRef.current) {
      try {
        chartRef.current.destroy();
      } catch {
        // ignore
      }
      chartRef.current = null;
    }

    const container = containerRef.current;
    container.innerHTML = "";

    // 1. Initialize OpenAlgo Canvas Chart with dark theme
    const chart = createChart(container, {
      theme: darkTheme,
      crosshairMode: "normal",
      animZoom: true,
      animAutoscale: true,
    });

    chartRef.current = chart;

    // 2. Add Primary Candlestick Series
    const candleSeries = chart.addSeries("candlestick", {
      style: {
        upColor: "#089981",
        downColor: "#f23645",
        borderUpColor: "#089981",
        borderDownColor: "#f23645",
        wickUpColor: "#089981",
        wickDownColor: "#f23645",
      },
    });
    candleSeriesRef.current = candleSeries;

    // 3. Load Sample Indian Market Data
    const bars = generateSampleBars(symbol);
    candleSeries.setData(bars);

    // 4. Attach Built-in OpenAlgo Technical Indicators
    try {
      const ema9 = chart.addIndicator("ema", {
        length: 9,
        color: "#2962ff",
      });
      ema9.setVisible(indicators.ema9);
      indicatorInstancesRef.current.ema9 = ema9;

      const ema21 = chart.addIndicator("ema", {
        length: 21,
        color: "#f59e0b",
      });
      ema21.setVisible(indicators.ema21);
      indicatorInstancesRef.current.ema21 = ema21;

      const vol = chart.addIndicator("volume", {
        color: "#3a4666",
        colorByDirection: true,
        upColor: "#089981",
        downColor: "#f23645",
      });
      vol.setVisible(indicators.volume);
      indicatorInstancesRef.current.volume = vol;

      const st = chart.addIndicator("supertrend", {
        period: 10,
        multiplier: 3,
        upColor: "#089981",
        downColor: "#f23645",
      });
      st.setVisible(indicators.supertrend);
      indicatorInstancesRef.current.supertrend = st;
    } catch {
      // ignore indicator init errors
    }

    // 5. Add Strategy Trade Signal Markers
    if (bars.length > 25) {
      try {
        const markers = candleSeries.createMarkers();
        const buyBar = bars[bars.length - 20];
        const sellBar = bars[bars.length - 8];
        markers.setMarkers([
          {
            time: buyBar.time,
            position: "belowBar",
            shape: "arrowUp",
            size: "small",
            color: "#089981",
            text: `BUY (EMA cross) @ ₹${buyBar.close}`,
          },
          {
            time: sellBar.time,
            position: "aboveBar",
            shape: "arrowDown",
            size: "small",
            color: "#f23645",
            text: `SELL (Exit) @ ₹${sellBar.close}`,
          },
        ]);
      } catch {
        // ignore markers errors
      }
    }

    // 6. Set Initial Legend from Latest Bar
    if (bars.length > 0) {
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2] || last;
      const change = last.close - prev.close;
      setLegend({
        time: new Date(last.time * 1000).toISOString().split("T")[0],
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
        volume: last.volume || 0,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(((last.close - prev.close) / prev.close) * 10000) / 100,
      });
    }

    // 7. Subscribe to Interactive Crosshair Move
    chart.subscribeCrosshairMove((param) => {
      if (param && param.bar) {
        const bar = param.bar;
        const change = bar.close - bar.open;
        const changePercent = (change / bar.open) * 100;
        setLegend({
          time: new Date(bar.time * 1000).toISOString().split("T")[0],
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume || 0,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
        });
      }
    });

    // 8. Auto Fit Content to Viewport
    chart.fitContent();

    return () => {
      if (chartRef.current) {
        try {
          chartRef.current.destroy();
        } catch {
          // ignore cleanup errors
        }
        chartRef.current = null;
      }
    };
  }, [symbol]);

  // Handle Dynamic Indicator Visibility Toggles
  useEffect(() => {
    const instances = indicatorInstancesRef.current;
    if (instances.ema9) instances.ema9.setVisible(indicators.ema9);
    if (instances.ema21) instances.ema21.setVisible(indicators.ema21);
    if (instances.volume) instances.volume.setVisible(indicators.volume);
    if (instances.supertrend) instances.supertrend.setVisible(indicators.supertrend);
  }, [indicators]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden font-sans">
      {/* Legend & OHLCV crosshair readout */}
      {legend && (
        <div className="absolute top-3 left-4 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono bg-[#131722]/85 backdrop-blur-sm px-3 py-1.5 rounded border border-[#2a2e39]/60 shadow-lg pointer-events-none">
          <div className="flex items-center space-x-1.5 font-bold text-white font-sans">
            <span>{symbol}</span>
            <span className="text-[10px] text-[#787b86]">D</span>
            <span className="text-[10px] px-1 py-0.2 bg-[#2a2e39] text-[#2962ff] font-mono rounded">
              OPENALGO
            </span>
          </div>

          <div className="flex items-center space-x-2 text-[#787b86]">
            <span>O <span className="text-white tabular-nums">{legend.open.toFixed(2)}</span></span>
            <span>H <span className="text-white tabular-nums">{legend.high.toFixed(2)}</span></span>
            <span>L <span className="text-white tabular-nums">{legend.low.toFixed(2)}</span></span>
            <span>C <span className={`tabular-nums ${legend.change >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>{legend.close.toFixed(2)}</span></span>
          </div>

          <div className={`font-semibold tabular-nums ${legend.change >= 0 ? "text-[#089981]" : "text-[#f23645]"}`}>
            {legend.change >= 0 ? "+" : ""}{legend.change.toFixed(2)} ({legend.changePercent >= 0 ? "+" : ""}{legend.changePercent.toFixed(2)}%)
          </div>

          {indicators.volume && (
            <div className="text-[#787b86]">
              Vol: <span className="text-white font-mono tabular-nums">{(legend.volume / 1000).toFixed(1)}k</span>
            </div>
          )}

          {indicators.ema9 && (
            <div className="flex items-center space-x-1 text-[#2962ff] font-sans">
              <span className="w-2 h-0.5 bg-[#2962ff]" />
              <span>EMA 9</span>
            </div>
          )}

          {indicators.ema21 && (
            <div className="flex items-center space-x-1 text-[#f59e0b] font-sans">
              <span className="w-2 h-0.5 bg-[#f59e0b]" />
              <span>EMA 21</span>
            </div>
          )}

          {indicators.supertrend && (
            <div className="flex items-center space-x-1 text-[#10b981] font-sans">
              <span className="w-2 h-0.5 bg-[#10b981]" />
              <span>SuperTrend</span>
            </div>
          )}
        </div>
      )}

      {/* Main OpenAlgo Canvas Chart Container */}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
