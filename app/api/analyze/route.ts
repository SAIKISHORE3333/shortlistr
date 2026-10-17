import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

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

    const { resumeText, jobDescription } = body;

    if (!resumeText?.trim() || !jobDescription?.trim()) {
      return NextResponse.json(
        { error: "Both resume text and job description are required." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are Shortlistr's Lead ATS Engineer and Executive Career Strategist.
Your goal is absolute factual grounding, strict truth alignment, and natural, human writing.

=== THE STRICT TRUTH CONTRACT ===
1. You may ONLY use companies, credentials, projects, and achievements present in the Candidate's Resume.
2. DO NOT invent skills, certifications, or experiences the candidate does not have. If the Job Description requires a skill not found in the resume, NEVER inject it into the CV or Cover Letter. List it inside "missingKeywords" instead.
3. NEVER make up metrics, percentages, dollar amounts, or statistics. If an original resume bullet point lacks measurable numbers, provide bracketed placeholders like "[Insert % or number]" or "[Insert team size]".

=== VOICE & BANNED BUZZWORDS ===
- Sound like a clear, direct, thoughtful human professional.
- STRICTLY BAN these buzzwords and clichés: "spearheaded", "synergy", "dynamic", "thrilled to apply", "delve", "harnessing", "proven track record", "deep passion for".

=== OUTPUT FORMAT ===
Produce structured JSON conforming to this schema:
{
  "atsScore": number (0 to 100),
  "matchedKeywords": string[] (skills and competencies present in both resume and JD),
  "missingKeywords": string[] (skills and competencies required by JD but missing in resume),
  "tailoredBullets": [
    {
      "original": string (original bullet point from candidate resume),
      "improved": string (truthfully improved STAR bullet aligned with JD, with bracketed placeholders if metrics are missing),
      "skillTargeted": string (the targeted skill or keyword)
    }
  ],
  "fullTailoredResumeMarkdown": string (the complete tailored resume in clean markdown formatting),
  "coverLetter": string (focused 3-paragraph conversational cover letter strictly adhering to the truth contract)
}`;

    const userPrompt = `=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Perform the ATS match audit, keyword extraction, truthful STAR bullet tailoring, complete resume markdown rewrite, and write a focused 3-paragraph natural cover letter. Return pure structured JSON conforming to the schema.`;

    const config = {
      systemInstruction,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          atsScore: {
            type: Type.NUMBER,
            description: "ATS compatibility score between 0 and 100",
          },
          matchedKeywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Keywords and skills matched between resume and job description",
          },
          missingKeywords: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Keywords and skills required by job description but missing in resume",
          },
          tailoredBullets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING, description: "Original resume bullet point" },
                improved: { type: Type.STRING, description: "Improved bullet point with truth grounding" },
                skillTargeted: { type: Type.STRING, description: "The skill or keyword targeted" },
              },
              required: ["original", "improved", "skillTargeted"],
            },
          },
          fullTailoredResumeMarkdown: {
            type: Type.STRING,
            description: "Complete tailored resume formatted in markdown",
          },
          coverLetter: {
            type: Type.STRING,
            description: "Tailored 3-paragraph human-sounding cover letter",
          },
        },
        required: [
          "atsScore",
          "matchedKeywords",
          "missingKeywords",
          "tailoredBullets",
          "fullTailoredResumeMarkdown",
          "coverLetter",
        ],
      },
    };

    let response;
    try {
      response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPrompt,
        config,
      });
    } catch (modelErr: any) {
      console.warn(
        "Model gemini-2.5-flash failed or unavailable, falling back to gemini-3.8-flash:",
        modelErr?.message
      );
      response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: userPrompt,
        config,
      });
    }

    const outputText = response.text || "{}";
    const parsedData = JSON.parse(outputText);

    return NextResponse.json(parsedData);
  } catch (err: any) {
    console.error("API Error in /api/analyze:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to process application analysis." },
      { status: 500 }
    );
  }
}