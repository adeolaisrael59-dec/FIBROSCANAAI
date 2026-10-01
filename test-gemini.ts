import { GoogleGenAI, Type } from "@google/genai";
import fs from "fs";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No API key");
    return;
  }
  const ai = new GoogleGenAI({ apiKey });
  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "hello",
    });
    console.log("Success:", result.text);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
run();
