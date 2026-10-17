import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

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
      console.warn(`Model ${model} failed, attempting next model fallback:`, err?.message || err);
      // Brief pause if 503 high demand
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

    const { resumeText, jobDescription } = body;

    if (!resumeText?.trim() || !jobDescription?.trim()) {
      return NextResponse.json(
        { error: "Both resume text and job description are required." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `You are a high-speed, precision ATS skill and competency parser.
Your task is to analyze candidate resume text against a target job description and extract structured competency data.

=== RULES ===
1. Only count skills present in the resume as matched.
2. If a skill is in the JD but not found in the resume, it must be listed as missing.
3. Categorize into Hard/Technical Skills (languages, frameworks, tools, platforms) and Soft Skills (communication, leadership, cross-functional collaboration, problem-solving).
4. Evaluate yearsExperienceMatched: true if the candidate's duration and seniority level meet the JD requirement; false otherwise.
5. Evaluate educationMatched: true if candidate meets the baseline educational requirement (degree, relevant field, or equivalent experience); false otherwise.
6. Provide 2-4 truth-grounded tailored STAR bullet point recommendations based on real achievements in the resume. Insert bracketed placeholders like "[Insert % or number]" if metrics are missing. Banned buzzwords: "spearheaded", "synergy", "dynamic", "thrilled to apply", "delve", "harnessing", "proven track record", "deep passion for".`;

    const userPrompt = `=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Extract the matched and missing hard/soft skills, experience alignment, education alignment, and tailored bullet suggestions as structured JSON.`;

    const config = {
      systemInstruction,
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          matchedHardSkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Technical/hard skills present in both resume and job description",
          },
          missingHardSkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Technical/hard skills required by job description but missing in resume",
          },
          matchedSoftSkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Soft skills and interpersonal competencies present in both resume and JD",
          },
          missingSoftSkills: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Soft skills required by job description but missing in resume",
          },
          yearsExperienceMatched: {
            type: Type.BOOLEAN,
            description: "Whether candidate's experience length/seniority matches JD requirement",
          },
          educationMatched: {
            type: Type.BOOLEAN,
            description: "Whether candidate's education matches JD requirements",
          },
          tailoredBullets: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING, description: "Original resume bullet point" },
                improved: { type: Type.STRING, description: "Truthfully tailored STAR bullet" },
                skillTargeted: { type: Type.STRING, description: "Skill targeted" },
              },
              required: ["original", "improved", "skillTargeted"],
            },
          },
        },
        required: [
          "matchedHardSkills",
          "missingHardSkills",
          "matchedSoftSkills",
          "missingSoftSkills",
          "yearsExperienceMatched",
          "educationMatched",
          "tailoredBullets",
        ],
      },
    };

    const response = await callGeminiWithFallback(ai, userPrompt, config);

    const outputText = response.text || "{}";
    const parsed = JSON.parse(outputText);

    const matchedHardSkills: string[] = Array.isArray(parsed.matchedHardSkills)
      ? parsed.matchedHardSkills
      : [];
    const missingHardSkills: string[] = Array.isArray(parsed.missingHardSkills)
      ? parsed.missingHardSkills
      : [];
    const matchedSoftSkills: string[] = Array.isArray(parsed.matchedSoftSkills)
      ? parsed.matchedSoftSkills
      : [];
    const missingSoftSkills: string[] = Array.isArray(parsed.missingSoftSkills)
      ? parsed.missingSoftSkills
      : [];
    const yearsExperienceMatched: boolean = Boolean(parsed.yearsExperienceMatched);
    const educationMatched: boolean = Boolean(parsed.educationMatched);
    const tailoredBullets = Array.isArray(parsed.tailoredBullets) ? parsed.tailoredBullets : [];

    // Deterministic Scoring Engine
    const hardTotal = Math.max(matchedHardSkills.length + missingHardSkills.length, 1);
    const hardSkillScore = (matchedHardSkills.length / hardTotal) * 50;

    const softTotal = Math.max(matchedSoftSkills.length + missingSoftSkills.length, 1);
    const softSkillScore = (matchedSoftSkills.length / softTotal) * 15;

    const expScore = yearsExperienceMatched ? 20 : 10;
    const eduScore = educationMatched ? 15 : 8;

    const atsScore = Math.min(
      100,
      Math.round(hardSkillScore + softSkillScore + expScore + eduScore)
    );

    return NextResponse.json({
      atsScore,
      scoreBreakdown: {
        hardSkillScore: Math.round(hardSkillScore * 10) / 10,
        hardSkillMax: 50,
        softSkillScore: Math.round(softSkillScore * 10) / 10,
        softSkillMax: 15,
        expScore,
        expMax: 20,
        eduScore,
        eduMax: 15,
      },
      matchedHardSkills,
      missingHardSkills,
      matchedSoftSkills,
      missingSoftSkills,
      yearsExperienceMatched,
      educationMatched,
      tailoredBullets,
    });
  } catch (err: any) {
    console.error("API Error in /api/analyze:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to process application analysis." },
      { status: 500 }
    );
  }
}