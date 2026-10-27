import express, { Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const NEWS_API_KEY = process.env.NEWS_API_KEY || "";
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || "";

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const MODEL = "gemini-2.5-flash";

type Verdict = "TRUE" | "FALSE" | "UNCERTAIN";

function clamp(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// 🔥 MULTI-SOURCE NEWS FETCH
async function fetchNews(headline: string) {
  const results: any[] = [];

  // 🟢 NewsAPI
  if (NEWS_API_KEY) {
    try {
      const url =
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(headline)}` +
        `&searchIn=title,description&language=en&pageSize=3` +
        `&apiKey=${NEWS_API_KEY}`;

      const res = await fetch(url);
      const data: any = await res.json();

      if (data?.articles) {
        results.push(...data.articles);
      }
    } catch {
      console.log("NewsAPI failed");
    }
  }

  // 🟢 NewsData.io (India-focused)
  if (NEWSDATA_API_KEY) {
    try {
      const url =
        `https://newsdata.io/api/1/news?q=${encodeURIComponent(headline)}` +
        `&country=in&language=en&apikey=${NEWSDATA_API_KEY}`;

      const res = await fetch(url);
      const data: any = await res.json();

      if (data?.results) {
        const mapped = data.results.map((a: any) => ({
          title: a.title,
          description: a.description,
          url: a.link
        }));
        results.push(...mapped);
      }
    } catch {
      console.log("NewsData failed");
    }
  }

  return results.slice(0, 5);
}

app.post("/api/verify", async (req: Request, res: Response) => {
  try {
    const headline = String(req.body?.text || "").trim();
    if (headline.length < 5) {
      return res.status(400).json({ error: "Invalid headline" });
    }

    const articles = await fetchNews(headline);
    const hasNews = articles.length > 0;

    const evidence = hasNews
      ? articles
          .map((a: any, i: number) => {
            const t = a?.title || "Untitled";
            const d = a?.description ? ` — ${a.description}` : "";
            return `${i + 1}. ${t}${d}`;
          })
          .join("\n")
      : "No news articles found. Use general knowledge.";

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `
You are a fact verification system.

Headline:
"${headline}"

Evidence:
${evidence}

Rules:

IF evidence exists:
- TRUE → supported by articles
- FALSE → contradicted
- UNCERTAIN → unclear

IF NO evidence:
- Use general knowledge
- TRUE → known fact
- FALSE → clearly wrong
- UNCERTAIN → only if genuinely unknown

IMPORTANT:
- Avoid defaulting to UNCERTAIN
- Make a decision when possible

Return JSON:
{
  "verdict": "TRUE" | "FALSE" | "UNCERTAIN",
  "confidence": number,
  "reason": string
}
`,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["TRUE", "FALSE", "UNCERTAIN"]
            },
            confidence: { type: "number" },
            reason: { type: "string" }
          },
          required: ["verdict", "confidence", "reason"]
        }
      }
    });

    let parsed = {
      verdict: "UNCERTAIN" as Verdict,
      confidence: 0,
      reason: "No response"
    };

    try {
      const raw =
        response?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (typeof raw === "string") {
        const temp = JSON.parse(raw);

        parsed.verdict =
          temp.verdict === "TRUE" ||
          temp.verdict === "FALSE" ||
          temp.verdict === "UNCERTAIN"
            ? temp.verdict
            : "UNCERTAIN";

        parsed.confidence = clamp(Number(temp.confidence));
        parsed.reason =
          typeof temp.reason === "string" ? temp.reason : "";
      }
    } catch (err) {
      console.log("Parse error:", err);
    }

    res.json({
      ...parsed,
      sources: articles.map((a: any) => a.url).filter(Boolean)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});