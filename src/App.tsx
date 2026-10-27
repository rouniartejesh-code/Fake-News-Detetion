import { useState } from "react";
import { Pie } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

type Result = {
  verdict?: "TRUE" | "FALSE" | "UNCERTAIN";
  confidence?: number;
  reason?: string;
  sources?: string[];
  error?: string;
};

export default function App() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 5) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: trimmed })
      });

      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setLoading(false);
    }
  };

  const confidence = Number(result?.confidence) || 0;

  const chartData = {
    labels: ["Confidence", "Uncertainty"],
    datasets: [
      {
        data: [confidence * 100, (1 - confidence) * 100]
      }
    ]
  };

  return (
    <div style={{ maxWidth: 700, margin: "50px auto", fontFamily: "Arial" }}>
      <h2>Fake News Checker</h2>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter headline..."
        style={{ width: "100%", padding: 10, boxSizing: "border-box" }}
      />

      <button onClick={verify} disabled={loading} style={{ marginTop: 10 }}>
        {loading ? "Checking..." : "Verify"}
      </button>

      {result && (
        <div style={{ marginTop: 20 }}>
          {result.error ? (
            <p>{result.error}</p>
          ) : (
            <>
              <h3>Verdict: {result.verdict}</h3>
              <p>Confidence: {Math.round(confidence * 100)}%</p>
              <p>{result.reason}</p>
              <div style={{ maxWidth: 420 }}>
                <Pie data={chartData} />
              </div>

              {result.sources?.length ? (
                <div style={{ marginTop: 20 }}>
                  <h4>Sources</h4>
                  <ul>
                    {result.sources.map((source, index) => (
                      <li key={index}>
                        <a href={source} target="_blank" rel="noreferrer">
                          Source {index + 1}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}