import CanvasGame from "./game/CanvasGame";

export default function App() {
  return (
    <div className="frame">
      <header>
        <h1>Inner Mainframe • Shape Bank</h1>
        <div className="actions">
          <button
            title="Pause/Resume (P)"
            onClick={() => {
              // just dispatch 'p' programmatically so it hits the same handler
              const evt = new KeyboardEvent("keydown", { key: "p" });
              window.dispatchEvent(evt);
            }}
          >
            ⏯ Pause
          </button>
        </div>
      </header>

      <CanvasGame />
    </div>
  );
}
