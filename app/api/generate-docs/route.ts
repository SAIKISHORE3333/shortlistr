import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

async function callGeminiWithFallback(ai: GoogleGenAI, contents: string, config: any) {
  const models = ["gemini-2.5-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of models) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`Model ${model} failed, attempting next fallback:`, err?.message || err);
      if (err?.message?.includes("503") || err?.status === 503) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  throw lastError;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in environment variables." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid JSON body provided." },
        { status: 400 }
      );
    }

    const { resumeText, jobDescription, docType } = body;

    if (!resumeText?.trim() || !jobDescription?.trim()) {
      return NextResponse.json(
        { error: "Both resume text and job description are required." },
        { status: 400 }
      );
    }

    if (docType !== "cv" && docType !== "cover") {
      return NextResponse.json(
        { error: 'docType must be either "cv" or "cover".' },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const isCv = docType === "cv";

    const systemInstruction = `You are Shortlistr's Lead Executive Career Strategist.
Your goal is absolute factual grounding, strict truth alignment, and natural, human writing.

=== THE STRICT TRUTH CONTRACT ===
1. You may ONLY use companies, credentials, projects, and achievements present in the Candidate's Resume.
2. DO NOT invent skills, certifications, or experiences the candidate does not have.
3. NEVER make up metrics, percentages, dollar amounts, or statistics. If a bullet point lacks quantifiable numbers, provide bracketed placeholders like "[Insert % or number]".

=== VOICE & BANNED BUZZWORDS ===
- Sound like a clear, direct, thoughtful human professional.
- STRICTLY BAN these buzzwords and clichés: "spearheaded", "synergy", "dynamic", "thrilled to apply", "delve", "harnessing", "proven track record", "deep passion for".

=== TASK ===
${
  isCv
    ? `Rewrite and tailor the candidate's full resume to highlight relevant qualifications for the target job description while strictly adhering to the Truth Contract. Output ONLY the complete tailored resume in clean, professional Markdown.`
    : `Write a compelling, focused 3-paragraph conversational cover letter tailored to the target job description while strictly adhering to the Truth Contract. Output ONLY the cover letter text.`
}`;

    const userPrompt = `=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

${
  isCv
    ? "Generate the full tailored Markdown resume."
    : "Draft the 3-paragraph grounded cover letter."
}`;

    const config = {
      systemInstruction,
      thinkingConfig: { thinkingBudget: 0 },
    };

    const response = await callGeminiWithFallback(ai, userPrompt, config);
    const content = response.text || "";

    return NextResponse.json({
      content,
      docType,
    });
  } catch (err: any) {
    console.error("API Error in /api/generate-docs:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate document." },
      { status: 500 }
    );
  }
}
