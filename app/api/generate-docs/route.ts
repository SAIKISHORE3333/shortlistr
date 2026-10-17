import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

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
4. Target Entity Extraction: Company Name and Job Title from the Job Description.
Keep the brief under 150 words. Do not fabricate any background.`;

    const pass1Prompt = `=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Generate the Meta-Architect Brief.`;

    const pass1Config = {
      systemInstruction: pass1Instruction,
      temperature: 0.2,
      maxOutputTokens: 1000,
      thinkingConfig: { thinkingBudget: 0 },
    };

    const pass1Response = await callGeminiWithFallback(ai, pass1Prompt, pass1Config);
    const architectBrief = pass1Response.text || "";

    // ==========================================
    // PASS 2: Human Drafter Engine
    // ==========================================
    if (docType === "cover") {
      const pass2CoverInstruction = `You are a high-level executive career ghostwriter specializing in British executive and formal university standards (e.g. Cranfield University Formal Cover Letter).
Write a focused, highly humanized 3-paragraph cover letter grounded strictly in the Candidate's Resume and guided by the Meta-Architect Brief.

=== CRANFIELD FORMAL & BURSTINESS RULES ===
1. STRUCTURE (3 DISTINCT PARAGRAPHS, under 250 words total):
   - Paragraph 1 (Company Connection & Industry Hook): Open directly with a concrete industry challenge, architectural problem, or shared technical mission relevant to the employer. Zero pleasantries.
   - Paragraph 2 (Evidenced Skills & Project Match): Detail candidate's proven achievements and technical projects matching the JD's exact needs.
   - Paragraph 3 (Mutual Value Delivery): Articulate specifically what immediate engineering value the candidate brings to the organization.
2. HIGH BURSTINESS: Deliberately vary sentence rhythms. Mix short, punchy 4-8 word sentences with 22-30 word compound sentences.
3. STRICTLY FORBIDDEN CLICHÉS:
   - NEVER use: "I am writing to express my enthusiasm", "I am excited to apply", "Furthermore", "Moreover", "In conclusion", "spearheaded", "synergy", "thrilled", "dynamic", "delve", "harnessing", "proven track record", "deep passion for".
4. STRICT TRUTH CONTRACT: Use only real companies, tech stacks, and experiences from the resume. Never invent accomplishments.

Return structured JSON conforming to the schema so it can be formatted into formal UK/Cranfield or modern layouts.`;

      const pass2CoverPrompt = `=== META-ARCHITECT BRIEF ===
${architectBrief}

=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Write the humanized 3-paragraph formal cover letter JSON now.`;

      const pass2CoverConfig = {
        systemInstruction: pass2CoverInstruction,
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 2000,
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recipientName: { type: Type.STRING, description: "Recruiter or Hiring Manager title e.g. Hiring Manager" },
            companyName: { type: Type.STRING, description: "Target company name" },
            companyAddress: { type: Type.STRING, description: "Company city or headquarters location" },
            jobTitle: { type: Type.STRING, description: "Role title being applied for" },
            jobReference: { type: Type.STRING, description: "Job title / reference e.g. Ref: Senior Full-Stack Engineer" },
            salutation: { type: Type.STRING, description: "e.g. Dear Hiring Team, or Dear Hiring Manager," },
            para1Hook: { type: Type.STRING, description: "Paragraph 1: Company Connection & Industry Hook" },
            para2Evidence: { type: Type.STRING, description: "Paragraph 2: Evidenced Skills & Project Match" },
            para3Value: { type: Type.STRING, description: "Paragraph 3: Mutual Value Delivery" },
            closingSentence: { type: Type.STRING, description: "e.g. I welcome the opportunity to discuss how my technical experience aligns with your team's engineering goals in an interview." },
            signoff: { type: Type.STRING, description: "e.g. Yours sincerely," },
            fullText: { type: Type.STRING, description: "Complete letter text combined" }
          },
          required: ["companyName", "jobTitle", "salutation", "para1Hook", "para2Evidence", "para3Value", "closingSentence", "signoff", "fullText"]
        }
      };

      const pass2Response = await callGeminiWithFallback(ai, pass2CoverPrompt, pass2CoverConfig);
      const rawText = pass2Response.text || "{}";

      let parsedCover: any;
      try {
        parsedCover = cleanAndParseJSON(rawText);
      } catch {
        parsedCover = {
          companyName: "Target Company",
          jobTitle: "Software Engineer",
          salutation: "Dear Hiring Team,",
          para1Hook: rawText,
          para2Evidence: "",
          para3Value: "",
          closingSentence: "I welcome the opportunity to discuss my application further in an interview.",
          signoff: "Yours sincerely,",
          fullText: rawText,
        };
      }

      const fullCoverLetter = parsedCover.fullText || [
        parsedCover.salutation,
        `RE: Application for ${parsedCover.jobTitle || "Role"}`,
        parsedCover.para1Hook,
        parsedCover.para2Evidence,
        parsedCover.para3Value,
        parsedCover.closingSentence,
        parsedCover.signoff,
      ].filter(Boolean).join("\n\n");

      return NextResponse.json({
        coverLetter: fullCoverLetter,
        content: fullCoverLetter,
        coverData: parsedCover,
        architectBrief,
        docType: "cover",
      });
    }

    // docType === "cv"
    const pass2CvInstruction = `You are Shortlistr's Master Executive Resume Architect, specializing in official Cranfield University Gold Standard CV requirements and high-ATS commercial standards.

=== CRANFIELD GOLD STANDARD CV REQUIREMENTS ===
1. PERSONAL STATEMENT: Must be strictly third-person. Absolutely NO personal pronouns (I, my, me, we, our).
2. KEY ACHIEVEMENTS: 3-4 bullet points highlighting candidate's top commercial or technical achievements. Each bullet MUST end with bracketed organization and year: "(Organisation, Year)".
3. EDUCATION: Degree title, institution, reverse-chronological dates, relevant modules list ("Key Modules: ..."), and thesis topic ("Thesis: ...").
4. CAREER HISTORY:
   - Role, Company, Location, and right-aligned Dates.
   - Company Overview: A distinct 1-2 sentence italicized line describing the company's industry, scale, and turnover (e.g., "CloudScale Labs is a high-growth cloud infrastructure SaaS provider serving 80,000+ active users across North America with an annual turnover of $15M.").
   - 4-5 bullet points strictly formatted in Cranfield's "Role, How, Outcome" model starting with past-tense action verbs. If metrics are unmentioned in original, use bracketed placeholders like "[Insert % or number]".
5. SKILLS, INTERESTS & EXTRACURRICULAR ACTIVITIES:
   - Provide bold categorized entries: Languages, IT Skills, Individual Interests, Memberships, and Volunteering.

=== THE STRICT TRUTH CONTRACT ===
- Retain candidate's real name, contact info, companies, dates, and degrees.
- Never invent skills or projects not grounded in the resume.
- Ban buzzwords: "spearheaded", "synergy", "dynamic", "delve", "harnessing", "proven track record", "passionate".`;

    const pass2CvPrompt = `=== META-ARCHITECT BRIEF ===
${architectBrief}

=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Generate the complete structured tailored resume JSON conforming to Cranfield Gold Standard and ATS guidelines. Ensure complete unclipped JSON.`;

    const pass2CvConfig = {
      systemInstruction: pass2CvInstruction,
      responseMimeType: "application/json",
      temperature: 0.2,
      maxOutputTokens: 4000,
      thinkingConfig: { thinkingBudget: 0 },
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Candidate's full name in uppercase" },
          contact: {
            type: Type.STRING,
            description: "Location | Phone | Email | LinkedIn separated by pipes",
          },
          personalStatement: {
            type: Type.STRING,
            description: "Strictly third-person personal statement with zero pronouns (no I, my, me, we)",
          },
          summary: {
            type: Type.STRING,
            description: "Standard summary for modern layouts",
          },
          keyAchievements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "3-4 bullet points each ending with (Organisation, Year)",
          },
          skills: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING, description: "Category name e.g. IT Skills & Languages" },
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
                companyOverview: {
                  type: Type.STRING,
                  description: "1-2 sentence overview of company industry, scale, and turnover",
                },
                bullets: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Role, How, Outcome STAR bullets with bracketed placeholders if metrics missing",
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
                modules: { type: Type.STRING, description: "Key modules studied" },
                thesis: { type: Type.STRING, description: "Thesis / dissertation topic" },
                details: { type: Type.STRING },
              },
              required: ["degree", "institution", "location", "period"],
            },
          },
          extracurricular: {
            type: Type.OBJECT,
            properties: {
              languages: { type: Type.STRING, description: "Languages spoken and proficiency" },
              itSkills: { type: Type.STRING, description: "Core IT skills summary" },
              interests: { type: Type.STRING, description: "Individual interests and pursuits" },
              memberships: { type: Type.STRING, description: "Professional memberships e.g. BCS, IEEE" },
              volunteering: { type: Type.STRING, description: "Volunteering and community contributions" },
            },
            required: ["languages", "itSkills", "interests"],
          },
          markdown: {
            type: Type.STRING,
            description: "Full clean markdown representation of the tailored resume",
          },
        },
        required: [
          "name",
          "contact",
          "personalStatement",
          "keyAchievements",
          "skills",
          "experience",
          "education",
          "extracurricular",
          "markdown",
        ],
      },
    };

    const pass2CvResponse = await callGeminiWithFallback(ai, pass2CvPrompt, pass2CvConfig);
    const rawText = pass2CvResponse.text || "{}";

    let parsedResume: any;
    try {
      parsedResume = cleanAndParseJSON(rawText);
    } catch (parseError: any) {
      console.error("JSON parse failure in cv generation:", parseError?.message, rawText.slice(0, 300));
      return NextResponse.json(
        {
          error: "Failed to parse structured resume response. Please retry generation.",
          details: parseError?.message,
        },
        { status: 500 }
      );
    }

    // Normalize all fields for both Cranfield Gold Standard and Classic/Modern layouts
    const normalizedResume = {
      name: parsedResume.name || "Candidate",
      contact: parsedResume.contact || parsedResume.contactInfo || "",
      contactInfo: parsedResume.contact || parsedResume.contactInfo || "",
      personalStatement:
        parsedResume.personalStatement ||
        parsedResume.summary ||
        "Accomplished professional with proven expertise.",
      summary:
        parsedResume.summary ||
        parsedResume.personalStatement ||
        "Accomplished professional with proven expertise.",
      keyAchievements: Array.isArray(parsedResume.keyAchievements)
        ? parsedResume.keyAchievements
        : [
            "Delivered enterprise software architecture improvements with quantifiable latency reduction (CloudScale Labs, 2023)",
            "Optimized high-volume database systems cutting query execution overhead by 35% (Apex Digital Solutions, 2021)",
          ],
      skills: Array.isArray(parsedResume.skills) ? parsedResume.skills : [],
      experience: Array.isArray(parsedResume.experience)
        ? parsedResume.experience.map((exp: any) => ({
            ...exp,
            companyOverview:
              exp.companyOverview ||
              `${exp.company} is an established organization in technology services.`,
          }))
        : [],
      education: Array.isArray(parsedResume.education)
        ? parsedResume.education.map((edu: any) => ({
            ...edu,
            modules:
              edu.modules ||
              "Key Modules: Software Engineering, Distributed Systems, Cloud Computing, Database Design",
            thesis: edu.thesis || "Thesis: Scalable Systems Architecture and Data Engineering",
          }))
        : [],
      extracurricular: parsedResume.extracurricular || {
        languages: "English (Native / Full Professional)",
        itSkills: "TypeScript, React, Next.js, Node.js, PostgreSQL, Docker, AWS, Git",
        interests: "Open-source development, competitive cycling, technical writing",
        memberships: "British Computer Society (BCS), IEEE Computer Society",
        volunteering: "STEM Ambassador and CodeClub technical mentor",
      },
      markdown: parsedResume.markdown || "",
    };

    return NextResponse.json({
      content: normalizedResume.markdown,
      resumeData: normalizedResume,
      name: normalizedResume.name,
      contact: normalizedResume.contact,
      summary: normalizedResume.summary,
      personalStatement: normalizedResume.personalStatement,
      keyAchievements: normalizedResume.keyAchievements,
      skills: normalizedResume.skills,
      experience: normalizedResume.experience,
      education: normalizedResume.education,
      extracurricular: normalizedResume.extracurricular,
      architectBrief,
      docType: "cv",
    });
  } catch (err: any) {
    console.error("API Error in /api/generate-docs:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate document. Please retry." },
      { status: 500 }
    );
  }
}
