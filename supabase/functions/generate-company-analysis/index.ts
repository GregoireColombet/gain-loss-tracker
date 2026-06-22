import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function normalizeGenerationConfig(config: unknown) {
  const source = config && typeof config === "object" ? config as Record<string, unknown> : {};

  return {
    temperature: clampNumber(source.temperature, 0.3, 0, 2),
    topP: clampNumber(source.topP, 0.8, 0, 1),
    maxOutputTokens: Math.round(clampNumber(source.maxOutputTokens, 4096, 512, 8192)),
  };
}

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(Math.max(numericValue, minimum), maximum);
}


serve(async (req) => {
  console.log("[generate-company-analysis] method:", req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    console.log("[generate-company-analysis] env:", {
      hasGeminiApiKey: Boolean(geminiApiKey),
    });

    if (!geminiApiKey) {
      return jsonResponse(
        {
          success: false,
          message: "Missing required env var: GEMINI_API_KEY",
          details: {
            error: {
              code: 401,
              status: "UNAUTHENTICATED",
              message: "Missing required env var: GEMINI_API_KEY",
            },
          },
        },
        500,
      );
    }

    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch (e) {
      console.error("[generate-company-analysis] body parse error:", e);
      return jsonResponse(
        {
          success: false,
          message: "Invalid JSON body",
          details: {
            error: {
              code: 400,
              status: "INVALID_ARGUMENT",
              message: String(e),
            },
          },
        },
        400,
      );
    }

    console.log("[generate-company-analysis] body keys:", Object.keys(body));

    const promptText = body.promptText;
    const parameters = body.parameters;
    const generationConfig = normalizeGenerationConfig(body.generationConfig);

    if (typeof promptText !== "string" || !promptText.trim()) {
      return jsonResponse(
        {
          success: false,
          message: "Missing or invalid required field: promptText",
          receivedKeys: Object.keys(body),
          details: {
            error: {
              code: 400,
              status: "INVALID_ARGUMENT",
              message: "Missing or invalid required field: promptText",
            },
          },
        },
        400,
      );
    }

    let finalPrompt = promptText;

    if (parameters && typeof parameters === "object" && !Array.isArray(parameters)) {
      for (const [key, value] of Object.entries(parameters as Record<string, unknown>)) {
        finalPrompt = finalPrompt.replaceAll(`{{${key}}}`, String(value ?? ""));
      }
    }

    const modelName = "gemini-2.5-flash";
    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    console.log("[generate-company-analysis] calling Gemini", {
      model: modelName,
      promptLength: finalPrompt.length,
      generationConfig,
    });

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: finalPrompt }],
          },
        ],
        generationConfig,
      }),
    });

    const geminiData = await geminiResponse.json();

    console.log("[generate-company-analysis] Gemini status:", {
      ok: geminiResponse.ok,
      status: geminiResponse.status,
    });

    if (!geminiResponse.ok) {
      console.error("[generate-company-analysis] Gemini API error:", geminiData);
      return jsonResponse(
        {
          success: false,
          message: "Gemini API error",
          details: geminiData,
        },
        geminiResponse.status,
      );
    }

    const result = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return jsonResponse({
      success: true,
      result,
    });
  } catch (e) {
    console.error("[generate-company-analysis] unhandled error:", e);

    return jsonResponse(
      {
        success: false,
        message: String(e),
        details: {
          error: {
            code: 500,
            status: "INTERNAL",
            message: String(e),
          },
        },
      },
      500,
    );
  }
});
