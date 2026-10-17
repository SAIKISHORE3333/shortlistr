import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export const maxDuration = 60;

async function callGeminiWithFallback(ai: GoogleGenAI, contents: string, config: any) {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-3.5-flash"];
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
      console.warn(`Model ${model} failed in generate-docs, trying next fallback:`, err?.message || err);
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

    // ==========================================
    // PASS 1: Meta-Architect Brief
    // ==========================================
    const pass1Instruction = `You are Shortlistr's Chief Career Strategist & Talent Architect.
Analyze the Candidate's Resume against the Target Job Description.
Extract a sharp, concise strategic brief:
1. Unique Technical Hook: The single most compelling, factually proven technical intersection between what the candidate has actually built and the team's top engineering need.
2. Top 3 Value Propositions: 3 concrete, truthful capabilities backed by resume evidence.
3. Tone & Positioning Guidelines: Practical vocabulary from the JD to emphasize truthfully without fluff.
Keep the brief under 150 words. Do not fabricate any background.`;

    const pass1Prompt = `=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Generate the Meta-Architect Brief.`;

    const pass1Config = {
      systemInstruction: pass1Instruction,
      temperature: 0.1,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 },
    };

    const pass1Response = await callGeminiWithFallback(ai, pass1Prompt, pass1Config);
    const architectBrief = pass1Response.text || "";

    // ==========================================
    // PASS 2: Human Drafter Engine
    // ==========================================
    if (docType === "cover") {
      const pass2CoverInstruction = `You are a high-level executive career ghostwriter renowned for natural human voice, punchy storytelling, and zero fluff.
Write a focused 3-paragraph conversational cover letter grounded strictly in the Candidate's Resume and guided by the Meta-Architect Brief.

=== STRICT HUMANIZATION & BURSTINESS RULES ===
1. HIGH BURSTINESS: Deliberately vary sentence rhythms. Mix short, punchy 4-8 word sentences with 22-30 word compound sentences.
2. STRICTLY FORBIDDEN PHRASES & CLICHÉS:
   - NEVER start with: "I am writing to express my enthusiasm", "I am excited to apply", "I am writing to apply", or similar pleasantries.
   - NEVER use: "Furthermore", "Moreover", "In conclusion", "spearheaded", "synergy", "thrilled", "dynamic", "delve", "harnessing", "proven track record", "deep passion for", "beacon".
3. OPENING PARAGRAPH: Open immediately with a concrete technical challenge, architecture trade-off, or shared mission relevant to the JD and candidate's proven experience.
4. MAXIMUM 250 WORDS: Exactly 3 crisp paragraphs.
5. STRICT TRUTH CONTRACT: Use only real companies, tech stacks, and experiences from the resume. Never invent accomplishments.`;

      const pass2CoverPrompt = `=== META-ARCHITECT BRIEF ===
${architectBrief}

=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Write the humanized 3-paragraph cover letter now (under 250 words, maximum burstiness, zero banned clichés). Output only the letter.`;

      const pass2CoverConfig = {
        systemInstruction: pass2CoverInstruction,
        temperature: 0.1,
        maxOutputTokens: 1000,
        thinkingConfig: { thinkingBudget: 0 },
      };

      const pass2Response = await callGeminiWithFallback(ai, pass2CoverPrompt, pass2CoverConfig);
      const letterContent = pass2Response.text || "";

      return NextResponse.json({
        content: letterContent,
        coverLetter: letterContent,
        architectBrief,
        docType: "cover",
      });
    }

    // docType === "cv"
    const pass2CvInstruction = `You are Shortlistr's Master Executive Resume Architect.
Using the Candidate Resume, Target Job Description, and Meta-Architect Brief, construct a fully tailored, ATS-optimized, truth-grounded resume.

=== THE STRICT TRUTH CONTRACT ===
1. Retain the candidate's real name, contact info, companies, dates, and degrees.
2. DO NOT invent tools, skills, or projects not present in the candidate's resume.
3. Quantify bullets wherever truthful. If an original resume bullet point lacks measurable metrics, insert bracketed placeholders like "[Insert % or number]" or "[Insert latency reduction]".
4. Banned buzzwords: "spearheaded", "synergy", "dynamic", "delve", "harnessing", "proven track record", "passionate".

=== STRUCTURED OUTPUT FORMAT ===
Produce structured JSON conforming to the requested schema. Group technical skills logically (e.g., Languages, Frameworks, Cloud & Data, Developer Tools).`;

    const pass2CvPrompt = `=== META-ARCHITECT BRIEF ===
${architectBrief}

=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Generate the structured tailored resume JSON.`;

    const pass2CvConfig = {
      systemInstruction: pass2CvInstruction,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Candidate's full name" },
          contactInfo: {
            type: Type.STRING,
            description: "Location, email, phone, and profile links formatted on one line",
          },
          summary: {
            type: Type.STRING,
            description: "Concise 2-3 sentence executive professional summary tailored to target role",
          },
          skills: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING, description: "Category name e.g. Languages & Frameworks" },
                items: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["category", "items"],
            },
          },
          experience: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                role: { type: Type.STRING },
                company: { type: Type.STRING },
                location: { type: Type.STRING },
                period: { type: Type.STRING },
                bullets: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Truth-grounded STAR bullets with bracketed placeholders if metrics missing",
                },
              },
              required: ["role", "company", "location", "period", "bullets"],
            },
          },
          education: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                degree: { type: Type.STRING },
                institution: { type: Type.STRING },
                location: { type: Type.STRING },
                period: { type: Type.STRING },
                details: { type: Type.STRING },
              },
              required: ["degree", "institution", "location", "period"],
            },
          },
          markdown: {
            type: Type.STRING,
            description: "Full clean markdown representation of the tailored resume",
          },
        },
        required: ["name", "contactInfo", "summary", "skills", "experience", "education", "markdown"],
      },
    };

    const pass2CvResponse = await callGeminiWithFallback(ai, pass2CvPrompt, pass2CvConfig);
    const parsedResume = JSON.parse(pass2CvResponse.text || "{}");

    return NextResponse.json({
      content: parsedResume.markdown || "",
      resumeData: parsedResume,
      architectBrief,
      docType: "cv",
    });
  } catch (err: any) {
    console.error("API Error in /api/generate-docs:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate document." },
      { status: 500 }
    );
  }
}
