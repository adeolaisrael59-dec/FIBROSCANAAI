import { GoogleGenAI } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = ["gemini-flash-latest", "gemini-pro-latest", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview"];
  for (const m of models) {
    try {
      await ai.models.generateContent({ model: m, contents: "test" });
      console.log(m, "WORKS");
    } catch (e: any) {
      console.log(m, "FAILED", e.message);
    }
  }
}
run();
