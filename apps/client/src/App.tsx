// src/App.tsx
import React, { useEffect, useState } from "react";
import CanvasGame from "./game/CanvasGame";
import LocalMultiplayer from "./game/LocalMultiplayer";
import appleFontUrl from "./game/apple-ii.ttf?url";

type Route = "menu" | "single" | "local";

export default function App() {
  const [route, setRoute] = useState<Route>("menu");

  // Load Apple II once (so menu uses same font)
  useEffect(() => {
    try {
      const ff = new FontFace("Apple II", `url(${appleFontUrl})`, {
        style: "normal",
        weight: "400",
        display: "swap",
      });
      ff.load().then((f) => (document as any).fonts.add(f));
    } catch {}
  }, []);

  return (
    <div className="frame" style={{ fontFamily: "Apple II, ui-sans-serif, system-ui" }}>
      <header style={header}>
        <h1 style={{ margin: 0, color: "#00ff7f", textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}>
          Inner Mainframe • Shape Bank
        </h1>

        {route === "single" && (
          <div className="actions">
            <button
              title="Pause/Resume (P)"
              onClick={() => {
                const evt = new KeyboardEvent("keydown", { key: "p" });
                window.dispatchEvent(evt);
              }}
              style={btn}
            >
              ⏯ Pause
            </button>
          </div>
        )}

        {route !== "menu" && (
          <button onClick={() => setRoute("menu")} style={{ ...btn, marginLeft: 12 }}>
            ⟵ Menu
          </button>
        )}
      </header>

      {route === "menu" && (
        <div style={menuWrap}>
          <div style={menuCard}>
            <button style={menuBtn} onClick={() => setRoute("single")}>▶ Single Player</button>
            <button style={menuBtn} onClick={() => setRoute("local")}>⧉ Local Multiplayer</button>
            <p style={hint}>
              ↑/Q/E rotate • ←/→ move • ↓ soft drop • Space hard drop • R restart • P pause
            </p>
            <p style={{ ...hint, marginTop: 0 }}>
              P2 (local): W/A/S/D move • F/G rotate • Shift hard drop • R restart
            </p>
          </div>
        </div>
      )}

      {route === "single" && <CanvasGame />}
      {route === "local" && <LocalMultiplayer />}
    </div>
  );
}

const header: React.CSSProperties = {
  position: "relative",
  padding: "12px 16px",
  background: "#0a0f1a",
  borderBottom: "1px solid #1f2937",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const btn: React.CSSProperties = {
  background: "#0e1626",
  border: "1px solid #1f2937",
  color: "#00ff7f",
  padding: "8px 10px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 14,
};

const menuWrap: React.CSSProperties = {
  height: "calc(100vh - 60px)",
  background: "#0a0f1a",
  display: "grid",
  placeItems: "center",
};

const menuCard: React.CSSProperties = {
  display: "grid",
  gap: 16,
  minWidth: 320,
  padding: 16,
  background: "#0e1626",
  border: "1px solid #1f2937",
  borderRadius: 12,
  boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
};

const menuBtn: React.CSSProperties = {
  background: "#0e1626",
  border: "1px solid #1f2937",
  color: "#00ff7f",
  padding: "12px 14px",
  borderRadius: 10,
  cursor: "pointer",
  fontSize: 16,
};

const hint: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  margin: 0,
  textShadow: "0 1px 2px rgba(0,0,0,0.7)",
};
