import { GoogleGenAI } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
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
