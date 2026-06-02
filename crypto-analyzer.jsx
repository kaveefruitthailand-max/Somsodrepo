import { useState, useEffect, useCallback } from "react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, BarChart, Bar, LineChart, Line, ReferenceLine
} from "recharts";

const C = {
  bg: "#060a0f", surface: "#0d1520", panel: "#111c2e", border: "#1e3050",
  accent: "#00d4ff", green: "#00ff88", red: "#ff3366", yellow: "#ffd600",
  muted: "#4a6080", text: "#c8daf0", textDim: "#6a8aaa",
};

const COINS = [
  { sym:"BTC",  name:"Bitcoin",   cc:"BTC"  },
  { sym:"ETH",  name:"Ethereum",  cc:"ETH"  },
  { sym:"SOL",  name:"Solana",    cc:"SOL"  },
  { sym:"BNB",  name:"BNB",       cc:"BNB"  },
  { sym:"XRP",  name:"XRP",       cc:"XRP"  },
  { sym:"ADA",  name:"Cardano",   cc:"ADA"  },
  { sym:"DOGE", name:"Dogecoin",  cc:"DOGE" },
  { sym:"AVAX", name:"Avalanche", cc:"AVAX" },
  { sym:"LINK", name:"Chainlink", cc:"LINK" },
  { sym:"DOT",  name:"Polkadot",  cc:"DOT"  },
  { sym:"TRX",  name:"Tron",      cc:"TRX"  },
  { sym:"TON",  name:"Toncoin",   cc:"TON"  },
  { sym:"SHIB", name:"Shiba Inu", cc:"SHIB" },
  { sym:"LTC",  name:"Litecoin",  cc:"LTC"  },
  { sym:"UNI",  name:"Uniswap",   cc:"UNI"  },
];

// ── Indicators ────────────────────────────────────────────────────────────────
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return prices.map(() => 50);
  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const result = Array(period).fill(null);
  let avgGain = changes.slice(0, period).filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  let avgLoss = changes.slice(0, period).filter(c => c < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.abs(Math.min(changes[i], 0))) / period;
    result.push(100 - 100 / (1 + avgGain / (avgLoss || 0.0001)));
  }
  return result;
}
function calcSMA(prices, period) {
  return prices.map((_, i) =>
    i < period - 1 ? null : prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period);
}
function calcBollinger(prices, period = 20, mult = 2) {
  const sma = calcSMA(prices, period);
  return prices.map((_, i) => {
    if (i < period - 1) return { mid: null, upper: null, lower: null };
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = sma[i];
    const std = Math.sqrt(slice.reduce((a, p) => a + (p - mean) ** 2, 0) / period);
    return { mid: mean, upper: mean + mult * std, lower: mean - mult * std };
  });
}
function calcMACD(prices) {
  const ema = (p, span) => {
    const k = 2 / (span + 1); let e = p[0];
    return p.map(v => { e = v * k + e * (1 - k); return e; });
  };
  const ema12 = ema(prices, 12), ema26 = ema(prices, 26);
  const macd = prices.map((_, i) => ema12[i] - ema26[i]);
  const signal = ema(macd, 9);
  return macd.map((m, i) => ({ macd: m, signal: signal[i], hist: m - signal[i] }));
}

const fmt = (n, d = 2) => n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = ts => new Date(ts * 1000).toLocaleDateString("th-TH", { month: "short", day: "numeric" });

// ── Claude AI ─────────────────────────────────────────────────────────────────
async function analyzeWithClaude(coin, priceData, indicators) {
  const last = priceData[priceData.length - 1];
  const lastRSI = last?.rsi;
  const lastBB = indicators.bb[indicators.bb.length - 1];
  const lastMACD = indicators.macd[indicators.macd.length - 1];
  const sma20 = indicators.sma20[indicators.sma20.length - 1];
  const sma50 = indicators.sma50[indicators.sma50.length - 1];

  const prompt = `คุณเป็น crypto analyst ผู้เชี่ยวชาญ วิเคราะห์ข้อมูล ${coin.name} (${coin.sym}):

ราคาปัจจุบัน: $${last?.close?.toFixed(4)}
RSI(14): ${lastRSI?.toFixed(1)}
MACD hist: ${lastMACD?.hist?.toFixed(6)}
BB Upper: $${lastBB?.upper?.toFixed(4)}, Lower: $${lastBB?.lower?.toFixed(4)}
SMA20: $${sma20?.toFixed(4)}, SMA50: $${sma50?.toFixed(4)}
วันปัจจุบัน: ${new Date().toLocaleDateString("th-TH",{year:"numeric",month:"long",day:"numeric",weekday:"long"})}

ราคา 10 วันล่าสุด: ${priceData.slice(-10).map(d=>d.close?.toFixed(4)).join(", ")}

ตอบเป็น JSON เท่านั้น ห้ามมี markdown:
{
  "trend": "BULLISH"|"BEARISH"|"SIDEWAYS",
  "signal": "STRONG_BUY"|"BUY"|"HOLD"|"SELL"|"STRONG_SELL",
  "signalScore": 1-100,
  "buyZones": [{"datetime":"วัน เวลา เช่น พฤ 5 มิ.ย. 09:00-13:00","priceRange":"$X - $Y","confidence":1-100,"reason":"เหตุผล"}],
  "sellTargets": [{"datetime":"วัน เวลา","priceTarget":"$X","confidence":1-100,"reason":"เหตุผล"}],
  "upPrediction": {"datetime":"วันเวลา","targetPrice":"$X","probability":1-100,"reason":"เหตุผล"},
  "downRisk": {"datetime":"วันเวลา","supportLevel":"$X","probability":1-100,"reason":"เหตุผล"},
  "summary": "สรุป 2-3 ประโยค",
  "stopLoss": "$X",
  "takeProfit": "$X",
  "riskLevel": "LOW"|"MEDIUM"|"HIGH"|"VERY_HIGH"
}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  try { return JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}

// ── UI Bits ───────────────────────────────────────────────────────────────────
const Tag = ({ children, color = C.accent }) => (
  <span style={{ background: color+"22", color, border:`1px solid ${color}55`, borderRadius:4, padding:"2px 8px", fontSize:11, fontFamily:"monospace", letterSpacing:1 }}>{children}</span>
);
const StatBox = ({ label, value, sub, color = C.text }) => (
  <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, padding:"12px 14px", flex:1, minWidth:110 }}>
    <div style={{ color:C.textDim, fontSize:10, letterSpacing:1, marginBottom:4 }}>{label}</div>
    <div style={{ color, fontSize:18, fontWeight:700, fontFamily:"monospace" }}>{value}</div>
    {sub && <div style={{ color:C.muted, fontSize:10, marginTop:2 }}>{sub}</div>}
  </div>
);
const SignalBadge = ({ signal }) => {
  const map = {
    STRONG_BUY:{ bg:C.green,  label:"STRONG BUY 🚀" },
    BUY:       { bg:"#00cc66",label:"BUY ↑" },
    HOLD:      { bg:C.yellow, label:"HOLD →" },
    SELL:      { bg:"#ff6633",label:"SELL ↓" },
    STRONG_SELL:{ bg:C.red,   label:"STRONG SELL 🔴" },
  };
  const m = map[signal] || map.HOLD;
  return <div style={{ background:m.bg+"22", color:m.bg, border:`2px solid ${m.bg}`, borderRadius:10, padding:"10px 24px", fontSize:20, fontWeight:900, fontFamily:"monospace", letterSpacing:2, textAlign:"center" }}>{m.label}</div>;
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CryptoAnalyzer() {
  const [coin, setCoin] = useState(COINS[0]);
  const [priceData, setPriceData] = useState([]);
  const [indicators, setIndicators] = useState({ bb:[], macd:[], sma20:[], sma50:[] });
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [tab, setTab] = useState("price");
  const [error, setError] = useState("");

  const fetchData = useCallback(async (c) => {
    setLoading(true); setError(""); setAnalysis(null);
    try {
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${c.cc}&tsym=USD&limit=89`
      );
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.Response !== "Success") throw new Error(json.Message || "API error");
      const rows = json.Data.Data;

      const closes  = rows.map(r => r.close);
      const rsiArr  = calcRSI(closes);
      const bb      = calcBollinger(closes);
      const macd    = calcMACD(closes);
      const sma20   = calcSMA(closes, 20);
      const sma50   = calcSMA(closes, 50);

      const data = rows.map((r, i) => ({
        ...r, rsi:rsiArr[i], bb:bb[i], macd:macd[i], sma20:sma20[i], sma50:sma50[i],
        label: fmtDate(r.time)
      }));

      setPriceData(data);
      setIndicators({ bb, macd, sma20, sma50 });
    } catch(e) { setError("โหลดข้อมูลไม่ได้: " + e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(coin); }, [coin]);

  const runAI = async () => {
    setAiLoading(true);
    const result = await analyzeWithClaude(coin, priceData, indicators);
    setAnalysis(result);
    setAiLoading(false);
  };

  const last = priceData[priceData.length - 1];
  const prev = priceData[priceData.length - 2];
  const chg  = last && prev ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const priceColor = chg >= 0 ? C.green : C.red;
  const riskColor  = { LOW:C.green, MEDIUM:C.yellow, HIGH:"#ff6633", VERY_HIGH:C.red };

  const bbPos = last?.bb?.upper
    ? (((last.close - last.bb.lower) / (last.bb.upper - last.bb.lower)) * 100).toFixed(0) + "%"
    : "—";

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'JetBrains Mono','Fira Code',monospace",
      backgroundImage:`radial-gradient(ellipse at 20% 0%,#001a3320,transparent 60%),radial-gradient(ellipse at 80% 100%,#00d4ff08,transparent 60%)` }}>

      {/* Header */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"10px 16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
          <div style={{ color:C.accent, fontSize:16, fontWeight:900, letterSpacing:3 }}>◈ CRYPTO<span style={{ color:C.green }}>SCAN</span></div>
          <div style={{ color:C.muted, fontSize:10 }}>AI Technical Analysis</div>
        </div>
        {/* Coin buttons — scrollable row */}
        <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }}>
          {COINS.map(c => (
            <button key={c.sym} onClick={() => setCoin(c)} style={{
              background: coin.sym===c.sym ? C.accent+"22" : "transparent",
              border:`1px solid ${coin.sym===c.sym ? C.accent : C.border}`,
              color: coin.sym===c.sym ? C.accent : C.textDim,
              borderRadius:6, padding:"5px 10px", cursor:"pointer",
              fontFamily:"monospace", fontWeight:700, fontSize:12,
              whiteSpace:"nowrap", flexShrink:0
            }}>{c.sym}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"16px", maxWidth:900, margin:"0 auto" }}>
        {error && (
          <div style={{ color:C.red, background:C.red+"11", border:`1px solid ${C.red}44`, borderRadius:8, padding:12, marginBottom:16, fontSize:13 }}>{error}</div>
        )}

        {/* Price row */}
        {last && (
          <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
            <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:10, padding:"14px 18px", flex:"0 0 auto" }}>
              <div style={{ color:C.textDim, fontSize:10, letterSpacing:1 }}>{coin.name} / USD</div>
              <div style={{ color:priceColor, fontSize:28, fontWeight:900 }}>${fmt(last.close, last.close < 1 ? 6 : 2)}</div>
              <div style={{ color:priceColor, fontSize:13 }}>{chg>=0?"▲":"▼"} {Math.abs(chg).toFixed(2)}%</div>
            </div>
            <StatBox label="RSI(14)" value={last.rsi?.toFixed(1)}
              sub={last.rsi<30?"Oversold 🟢":last.rsi>70?"Overbought 🔴":"Neutral"}
              color={last.rsi<30?C.green:last.rsi>70?C.red:C.yellow} />
            <StatBox label="MACD HIST" value={last.macd?.hist?.toFixed(4)}
              sub={last.macd?.hist>0?"Bullish":"Bearish"}
              color={last.macd?.hist>0?C.green:C.red} />
            <StatBox label="BB POSITION" value={bbPos} sub="Upper=100%" color={C.accent} />
            <StatBox label="SMA CROSS" value={last.sma20&&last.sma50?(last.sma20>last.sma50?"Golden ✦":"Death ✗"):"—"}
              sub={last.sma20>last.sma50?"Bullish":"Bearish"}
              color={last.sma20>last.sma50?C.green:C.red} />
          </div>
        )}

        {/* Chart */}
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:16 }}>
          <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, padding:"0 12px", flexWrap:"wrap" }}>
            {["price","rsi","macd","volume"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background:"none", border:"none", borderBottom:tab===t?`2px solid ${C.accent}`:"2px solid transparent",
                color:tab===t?C.accent:C.muted, padding:"10px 14px", cursor:"pointer",
                fontFamily:"monospace", fontWeight:700, fontSize:11, letterSpacing:1, textTransform:"uppercase"
              }}>{t}</button>
            ))}
            <button onClick={() => fetchData(coin)} style={{
              marginLeft:"auto", background:C.accent+"22", border:`1px solid ${C.accent}`,
              color:C.accent, borderRadius:6, padding:"5px 12px", cursor:"pointer",
              fontFamily:"monospace", fontSize:10, margin:"6px 0"
            }}>⟳ REFRESH</button>
          </div>
          <div style={{ padding:12, height:250 }}>
            {loading ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:C.accent, gap:10 }}>
                <div style={{ animation:"spin 1s linear infinite", fontSize:22 }}>◈</div> Loading...
              </div>
            ) : priceData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%">
                {tab === "price" ? (
                  <AreaChart data={priceData}>
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="label" stroke={C.muted} tick={{fontSize:9}} interval="preserveStartEnd"/>
                    <YAxis stroke={C.muted} tick={{fontSize:9}} tickFormatter={v=>v>=1?"$"+(v>=1000?(v/1000).toFixed(1)+"k":v.toFixed(0)):"$"+v.toFixed(4)} domain={["auto","auto"]} width={75}/>
                    <Tooltip contentStyle={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8}} formatter={v=>["$"+fmt(v, v<1?6:2),"Close"]}/>
                    <Area type="monotone" dataKey="close" stroke={C.accent} fill="url(#pg)" strokeWidth={2} dot={false}/>
                    <Line type="monotone" dataKey="sma20" stroke={C.yellow} strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                    <Line type="monotone" dataKey="sma50" stroke="#ff6633" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                  </AreaChart>
                ) : tab === "rsi" ? (
                  <LineChart data={priceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="label" stroke={C.muted} tick={{fontSize:9}} interval="preserveStartEnd"/>
                    <YAxis stroke={C.muted} tick={{fontSize:9}} domain={[0,100]}/>
                    <Tooltip contentStyle={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8}} formatter={v=>[v?.toFixed(1),"RSI"]}/>
                    <ReferenceLine y={70} stroke={C.red} strokeDasharray="4 2"/>
                    <ReferenceLine y={30} stroke={C.green} strokeDasharray="4 2"/>
                    <Line type="monotone" dataKey="rsi" stroke={C.accent} strokeWidth={2} dot={false}/>
                  </LineChart>
                ) : tab === "macd" ? (
                  <BarChart data={priceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="label" stroke={C.muted} tick={{fontSize:9}} interval="preserveStartEnd"/>
                    <YAxis stroke={C.muted} tick={{fontSize:9}}/>
                    <Tooltip contentStyle={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8}} formatter={v=>[v?.toFixed(5),"MACD Hist"]}/>
                    <ReferenceLine y={0} stroke={C.muted}/>
                    <Bar dataKey="macd.hist" name="MACD Hist" fill={C.green}
                      shape={(props) => {
                        const {x,y,width,height,value} = props;
                        return <rect x={x} y={y} width={width} height={height} fill={(value||0)>=0?C.green:C.red} fillOpacity={0.8}/>;
                      }}/>
                  </BarChart>
                ) : (
                  <BarChart data={priceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                    <XAxis dataKey="label" stroke={C.muted} tick={{fontSize:9}} interval="preserveStartEnd"/>
                    <YAxis stroke={C.muted} tick={{fontSize:9}} tickFormatter={v=>(v/1e9).toFixed(1)+"B"}/>
                    <Tooltip contentStyle={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:8}} formatter={v=>["$"+(v/1e9).toFixed(2)+"B","Volume"]}/>
                    <Bar dataKey="volumeto" fill={C.accent} fillOpacity={0.6}/>
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* AI Button */}
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <button onClick={runAI} disabled={aiLoading||loading||!priceData.length} style={{
            background: aiLoading?C.muted+"22":`linear-gradient(135deg,${C.accent}33,${C.green}22)`,
            border:`1px solid ${aiLoading?C.muted:C.accent}`,
            color:aiLoading?C.muted:C.accent,
            borderRadius:10, padding:"14px 32px", fontSize:15, fontWeight:900,
            fontFamily:"monospace", letterSpacing:2, cursor:aiLoading?"not-allowed":"pointer",
            width:"100%", maxWidth:500
          }}>
            {aiLoading?"◈ AI กำลังวิเคราะห์...":"◈ วิเคราะห์ด้วย AI · หาจังหวะซื้อขาย"}
          </button>
        </div>

        {/* AI Results */}
        {analysis && (
          <div style={{ display:"grid", gap:14 }}>
            {/* Signal row */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:14 }}>
              <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:16, display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ color:C.textDim, fontSize:10, letterSpacing:1 }}>AI SIGNAL</div>
                <SignalBadge signal={analysis.signal}/>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <Tag color={analysis.trend==="BULLISH"?C.green:analysis.trend==="BEARISH"?C.red:C.yellow}>{analysis.trend}</Tag>
                  <Tag color={riskColor[analysis.riskLevel]||C.yellow}>RISK: {analysis.riskLevel}</Tag>
                </div>
                <Tag color={C.accent}>SCORE: {analysis.signalScore}/100</Tag>
                <div style={{ display:"flex", gap:8 }}>
                  <div style={{ flex:1, background:C.surface, borderRadius:6, padding:"8px 10px" }}>
                    <div style={{ color:C.textDim, fontSize:9 }}>STOP LOSS</div>
                    <div style={{ color:C.red, fontWeight:700, fontSize:13 }}>{analysis.stopLoss}</div>
                  </div>
                  <div style={{ flex:1, background:C.surface, borderRadius:6, padding:"8px 10px" }}>
                    <div style={{ color:C.textDim, fontSize:9 }}>TAKE PROFIT</div>
                    <div style={{ color:C.green, fontWeight:700, fontSize:13 }}>{analysis.takeProfit}</div>
                  </div>
                </div>
              </div>
              <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
                <div style={{ color:C.textDim, fontSize:10, letterSpacing:1, marginBottom:10 }}>AI SUMMARY</div>
                <div style={{ color:C.text, fontSize:13, lineHeight:1.8, fontFamily:"sans-serif" }}>{analysis.summary}</div>
              </div>
            </div>

            {/* Buy Zones */}
            {analysis.buyZones?.length > 0 && (
              <div style={{ background:C.panel, border:`1px solid ${C.green}44`, borderRadius:12, padding:16 }}>
                <div style={{ color:C.green, fontSize:11, letterSpacing:2, marginBottom:10, fontWeight:700 }}>📅 วานช้อนซื้อ · BUY ZONES</div>
                {analysis.buyZones.map((z, i) => (
                  <div key={i} style={{ background:C.green+"0d", border:`1px solid ${C.green}33`, borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ color:C.green, fontSize:13, fontWeight:700 }}>🕐 {z.datetime}</div>
                      <div style={{ color:C.text, fontSize:12 }}>ราคา: <span style={{ color:C.accent }}>{z.priceRange}</span></div>
                      <Tag color={C.green}>{z.confidence}%</Tag>
                    </div>
                    <div style={{ color:C.textDim, fontSize:11, marginTop:6, fontFamily:"sans-serif" }}>→ {z.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Up/Down */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {analysis.upPrediction && (
                <div style={{ background:C.panel, border:`1px solid ${C.green}44`, borderRadius:12, padding:16 }}>
                  <div style={{ color:C.green, fontSize:11, letterSpacing:2, marginBottom:8, fontWeight:700 }}>📈 คาดการณ์ขาขึ้น</div>
                  <div style={{ color:C.text, fontSize:12 }}>🕐 {analysis.upPrediction.datetime}</div>
                  <div style={{ color:C.accent, fontSize:18, fontWeight:700, margin:"6px 0" }}>{analysis.upPrediction.targetPrice}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ flex:1, height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:analysis.upPrediction.probability+"%", height:"100%", background:C.green, borderRadius:3 }}/>
                    </div>
                    <span style={{ color:C.green, fontSize:11 }}>{analysis.upPrediction.probability}%</span>
                  </div>
                  <div style={{ color:C.textDim, fontSize:11, fontFamily:"sans-serif" }}>{analysis.upPrediction.reason}</div>
                </div>
              )}
              {analysis.downRisk && (
                <div style={{ background:C.panel, border:`1px solid ${C.red}44`, borderRadius:12, padding:16 }}>
                  <div style={{ color:C.red, fontSize:11, letterSpacing:2, marginBottom:8, fontWeight:700 }}>📉 ความเสี่ยงขาลง</div>
                  <div style={{ color:C.text, fontSize:12 }}>🕐 {analysis.downRisk.datetime}</div>
                  <div style={{ color:C.red, fontSize:18, fontWeight:700, margin:"6px 0" }}>{analysis.downRisk.supportLevel}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    <div style={{ flex:1, height:5, background:C.border, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:analysis.downRisk.probability+"%", height:"100%", background:C.red, borderRadius:3 }}/>
                    </div>
                    <span style={{ color:C.red, fontSize:11 }}>{analysis.downRisk.probability}%</span>
                  </div>
                  <div style={{ color:C.textDim, fontSize:11, fontFamily:"sans-serif" }}>{analysis.downRisk.reason}</div>
                </div>
              )}
            </div>

            {/* Sell Targets */}
            {analysis.sellTargets?.length > 0 && (
              <div style={{ background:C.panel, border:`1px solid ${C.red}44`, borderRadius:12, padding:16 }}>
                <div style={{ color:C.red, fontSize:11, letterSpacing:2, marginBottom:10, fontWeight:700 }}>🎯 เป้าหมายขาย · SELL TARGETS</div>
                {analysis.sellTargets.map((t, i) => (
                  <div key={i} style={{ background:C.red+"0d", border:`1px solid ${C.red}33`, borderRadius:8, padding:"10px 14px", marginBottom:8 }}>
                    <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"center" }}>
                      <div style={{ color:C.red, fontSize:13, fontWeight:700 }}>🕐 {t.datetime}</div>
                      <div style={{ color:C.text, fontSize:12 }}>เป้า: <span style={{ color:C.accent }}>{t.priceTarget}</span></div>
                      <Tag color={C.red}>{t.confidence}%</Tag>
                    </div>
                    <div style={{ color:C.textDim, fontSize:11, marginTop:6, fontFamily:"sans-serif" }}>→ {t.reason}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background:C.yellow+"11", border:`1px solid ${C.yellow}33`, borderRadius:8, padding:10, color:C.yellow, fontSize:10, fontFamily:"sans-serif" }}>
              ⚠️ เป็นเพียงการวิเคราะห์ทางเทคนิค ไม่ใช่คำแนะนำลงทุน ราคาคริปโทมีความผันผวนสูง
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}*{box-sizing:border-box}::-webkit-scrollbar{height:4px;width:4px}::-webkit-scrollbar-track{background:#060a0f}::-webkit-scrollbar-thumb{background:#1e3050;border-radius:3px}`}</style>
    </div>
  );
}
