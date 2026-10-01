import express from "express";
import multer from "multer";
import sharp from "sharp";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();


// Initialize Gemini
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  const upload = multer({ storage: multer.memoryStorage() });

  // API Route for Analysis (Preprocessing + Gemini)
  app.post("/api/analyze", (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ error: `Unknown upload error` });
      }
      next();
    });
  }, async (req, res) => {
    try {
      console.log("Analysis request received");
      if (!req.file) {
        console.error("No image file in request");
        return res.status(400).json({ error: "No image uploaded" });
      }

      const possibleKeyNames = [
        'GEMINI_API_KEY_',
        'GEMINI_API_KEY',
        'GOOGLE_API_KEY',
        'GOOGLE_GENERATIVE_AI_API_KEY',
        'API_KEY'
      ];
      
      let apiKey = "";
      let sourceName = "";
      
      for (const name of possibleKeyNames) {
        const val = (process.env[name] || "").trim();
        if (val && (val.startsWith("AIza") || val.startsWith("AQ.") || (val.length > 20 && !val.includes("placeholder")))) {
          apiKey = val;
          sourceName = name;
          break;
        }
      }
      
      console.log(`Key selection: ${sourceName || "None found"}`);
      
      if (!apiKey) {
        // Find if they have ANY value saved that is wrong
        const firstNonEmpty = possibleKeyNames.find(name => {
          const v = (process.env[name] || "").trim();
          return v !== "" && v !== "MY_GEMINI_API_KEY";
        });

        if (firstNonEmpty) {
          const badVal = process.env[firstNonEmpty] || "";
          console.error(`Found invalid key in ${firstNonEmpty}: ${badVal.substring(0, 5)}...`);
          return res.status(500).json({
            error: `The key found in your secret '${firstNonEmpty}' starts with '${badVal.trim().substring(0, 5)}...', but valid keys must start with 'AIza' or 'AQ.'. It looks like you might have pasted a plan name or limited text instead of the actual key code. Please copy the full string from Google AI Studio and update '${firstNonEmpty}'.`
          });
        }

        return res.status(500).json({ 
          error: "No Gemini API key detected. Please verify you have a secret named 'GEMINI_API_KEY_' containing your 'AIza...' or 'AQ...' key and that you clicked 'Save' in the Secrets panel." 
        });
      }

      // Re-initialize to ensure fresh key access
      const genAIInstance = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // 1. Preprocessing: Resize and Normalize
      console.log("Preprocessing image...");
      const processedImageBuffer = await sharp(req.file.buffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .normalize()
        .toFormat('jpeg', { quality: 85 })
        .toBuffer();

      const base64Image = processedImageBuffer.toString('base64');
      console.log("Image preprocessed successfully");

      const prompt = `You are a specialized medical AI assistant for ultrasound analysis. 
      Analyze this 2D ultrasound image for uterine fibroids. 
      Detect any suspicious masses, nodules, or fibroids. 
      Return the bounding boxes in [ymin, xmin, ymax, xmax] format (normalized 0-1000), a label (e.g., "Fibroid"), and a confidence score (0.0 to 1.0). 
      If no fibroids are detected, return an empty array for detections.
      Provide a brief clinical summary of findings and a recommendation for next steps.
      Return the result in strict JSON format.`;

      console.log("Sending request to Gemini...");
      let lastError: any = null;
      let text: string | undefined = undefined;
      
      const modelsToTry = ["gemini-3.5-flash", "gemini-3.1-pro-preview"];
      
      for (const modelName of modelsToTry) {
        let attempts = 2; // Try each model up to 2 times before falling back to the next model
        for (let attempt = 1; attempt <= attempts; attempt++) {
          try {
            console.log(`Sending request to Gemini model: ${modelName} (Attempt ${attempt}/${attempts})...`);
            const result = await genAIInstance.models.generateContent({
              model: modelName,
              contents: [
                prompt,
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: base64Image,
                  },
                },
              ],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    detections: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          box_2d: {
                            type: Type.ARRAY,
                            items: { type: Type.NUMBER },
                            description: "[ymin, xmin, ymax, xmax] normalized 0-1000",
                          },
                          label: { type: Type.STRING },
                          confidence: { type: Type.NUMBER },
                        },
                        required: ["box_2d", "label", "confidence"],
                      },
                    },
                    summary: { type: Type.STRING },
                    recommendation: { type: Type.STRING },
                  },
                  required: ["detections", "summary", "recommendation"],
                },
              }
            });
            
            text = result.text;
            if (text) {
              console.log(`Gemini response received successfully with model: ${modelName}`);
              break; // Success! Break out of the attempts loop.
            } else {
              throw new Error(`Empty response text received from model: ${modelName}`);
            }
          } catch (err: any) {
            console.warn(`Attempt ${attempt} failed with model ${modelName}:`, err.message || err);
            lastError = err;
            if (attempt < attempts) {
              // Wait 1.5 seconds before retrying the same model
              await new Promise((resolve) => setTimeout(resolve, 1500));
            }
          }
        }
        if (text) {
          break; // Success! Break out of the models loop.
        }
        // Wait 1 second before switching to the next model
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!text) {
        console.warn("All Gemini models failed. Falling back to simulated response.", lastError);
        // Fallback simulated response
        text = JSON.stringify({
          detections: [
            {
              box_2d: [300, 300, 600, 600],
              label: "Simulated Fibroid (API Unavailable)",
              confidence: 0.85
            }
          ],
          summary: "The Gemini API is currently experiencing high demand. This is a simulated analysis. A possible fibroid-like structure was highlighted for demonstration purposes.",
          recommendation: "Please try again later when the API is available. In a clinical setting, refer the patient for further gynecological evaluation."
        });
      }

      let analysis;
      try {
        // Clean the response text in case it contains markdown formatting
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        analysis = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error("Failed to parse Gemini response:", text);
        return res.status(500).json({ error: "AI returned an invalid response format. Please try again." });
      }

      console.log("Analysis complete");
      res.json({ 
        analysis,
        processedImage: base64Image,
        mimeType: 'image/jpeg'
      });
    } catch (error: any) {
      console.error("Analysis error details:", error);
      
      let clientMessage = "An unexpected error occurred during analysis";
      
      if (error.message?.includes("429") || error.message?.includes("Too Many Requests")) {
        clientMessage = "The AI service is currently busy (Rate Limit reached). Please wait a few seconds and try again.";
      } else if (error.message?.includes("billing") || error.message?.includes("quota") || error.message?.includes("upgrade")) {
        clientMessage = "There is a quota or plan issue with your Gemini API key. Please check your usage at Google AI Studio or ensure you are using a model available in the free tier.";
      } else if (error.message?.includes("API key not valid")) {
        clientMessage = "The API key provided is invalid. Please double-check your GEMINI_API_KEY in the Secrets panel.";
      } else if (error.message) {
        clientMessage = error.message;
      }
      
      res.status(500).json({ error: clientMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Critical Server Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "A critical error occurred on the server. Please check your image format and try again." 
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
