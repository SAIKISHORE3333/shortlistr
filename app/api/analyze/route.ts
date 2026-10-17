import { NextResponse } from "next/server";
import Groq from "groq-sdk";

export const maxDuration = 60;

function cleanAndParseJSON<T = any>(rawText: string): T {
  if (!rawText) throw new Error("Empty response from AI engine");

  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
    cleaned = cleaned.replace(/\n?```\s*$/i, "");
    cleaned = cleaned.trim();
  }

  // Extract JSON object substring
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // First attempt standard JSON.parse
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // Attempt structural repair for unclosed quotes, brackets, or braces
    try {
      let repaired = cleaned;
      let inString = false;
      let escaped = false;
      const stack: string[] = [];

      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "[") stack.push("]");
          else if (char === "{") stack.push("}");
          else if (char === "]" || char === "}") {
            if (stack.length > 0 && stack[stack.length - 1] === char) {
              stack.pop();
            }
          }
        }
      }

      if (inString) repaired += '"';
      while (stack.length > 0) {
        repaired += stack.pop();
      }

      return JSON.parse(repaired);
    } catch {
      throw new Error(
        `Failed to parse model output as JSON: ${err?.message || "Invalid JSON structure"}`
      );
    }
  }
}

async function callGroqWithFallback(groq: Groq, params: any) {
  const models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"];
  let lastError: any = null;

  for (const model of models) {
    try {
      return await groq.chat.completions.create({
        ...params,
        model,
      });
    } catch (err: any) {
      lastError = err;
      console.warn(`Groq model ${model} failed, attempting next model:`, err?.message || err);
    }
  }

  throw lastError;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GROQ_API_KEY in environment variables. Please add GROQ_API_KEY to your .env.local file." },
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

    const groq = new Groq({ apiKey });

    const systemInstruction = `You are a high-speed, precision ATS skill and competency parser.
Your task is to analyze candidate resume text against a target job description and extract structured competency data.

=== RULES ===
1. Only count skills present in the resume as matched.
2. If a skill is in the JD but not found in the resume, it must be listed as missing.
3. Categorize into Hard/Technical Skills (languages, frameworks, tools, platforms) and Soft Skills (communication, leadership, cross-functional collaboration, problem-solving).
4. Evaluate yearsExperienceMatched: true if the candidate's duration and seniority level meet the JD requirement; false otherwise.
5. Evaluate educationMatched: true if candidate meets the baseline educational requirement (degree, relevant field, or equivalent experience); false otherwise.
6. Provide 2-4 truth-grounded tailored STAR bullet point recommendations based on real achievements in the resume. Insert bracketed placeholders like "[Insert % or number]" if metrics are missing. Banned buzzwords: "spearheaded", "synergy", "dynamic", "thrilled to apply", "delve", "harnessing", "proven track record", "deep passion for".

Return clean JSON matching this schema:
{
  "matchedHardSkills": ["string"],
  "missingHardSkills": ["string"],
  "matchedSoftSkills": ["string"],
  "missingSoftSkills": ["string"],
  "yearsExperienceMatched": boolean,
  "educationMatched": boolean,
  "tailoredBullets": [
    {
      "original": "Original resume bullet point",
      "improved": "Truthfully tailored STAR bullet",
      "skillTargeted": "Skill targeted"
    }
  ]
}`;

    const userPrompt = `=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Extract the matched and missing hard/soft skills, experience alignment, education alignment, and tailored bullet suggestions as structured JSON now.`;

    const completion = await callGroqWithFallback(groq, {
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });

    const outputText = completion.choices[0]?.message?.content || "{}";
    const parsed = cleanAndParseJSON(outputText);

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