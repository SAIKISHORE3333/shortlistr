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
      console.warn(`Groq model ${model} failed in generate-docs, attempting next model:`, err?.message || err);
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

    const groq = new Groq({ apiKey });

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

Generate the Meta-Architect Brief as plain text.`;

    const pass1Response = await callGroqWithFallback(groq, {
      messages: [
        { role: "system", content: pass1Instruction },
        { role: "user", content: pass1Prompt },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    });

    const architectBrief = pass1Response.choices[0]?.message?.content || "";

    // ==========================================
    // PASS 2: Cover Letter Engine (Cranfield 3-Paragraph)
    // ==========================================
    if (docType === "cover") {
      const pass2CoverInstruction = `You are an elite executive career ghostwriter specializing in official Cranfield University Formal Cover Letter standards.
Write a focused, highly humanized 3-paragraph cover letter grounded strictly in the Candidate's Resume and guided by the Meta-Architect Brief.

=== CRANFIELD 3-PARAGRAPH RULES ===
1. STRUCTURE (3 DISTINCT PARAGRAPHS, under 250 words total):
   - Para 1 (Direct Company Hook): Open directly with a concrete industry challenge, architectural problem, or shared technical mission relevant to the employer. Zero pleasantries or clichés like "I am writing to express my enthusiasm" or "I am excited to apply".
   - Para 2 (Evidenced Skills & Project Match): Detail candidate's proven achievements and technical projects matching the JD's exact needs.
   - Para 3 (Mutual Value Delivery): Clear statement of value delivered to the employer.
2. HIGH BURSTINESS: Deliberately vary sentence rhythms. Mix short, punchy 4-8 word sentences with 22-30 word compound sentences.
3. STRICTLY FORBIDDEN CLICHÉS:
   - NEVER use: "I am writing to express my enthusiasm", "I am excited to apply", "Furthermore", "Moreover", "In conclusion", "spearheaded", "synergy", "thrilled", "dynamic", "delve", "harnessing", "proven track record", "deep passion for".
4. STRICT TRUTH CONTRACT: Use only real companies, tech stacks, and experiences from the resume. Never invent accomplishments.

Return clean JSON matching this schema:
{
  "coverLetter": "Full formatted cover letter text with all paragraphs and signoff separated by double newlines",
  "recipientName": "The Hiring Manager",
  "companyName": "Target company name",
  "companyAddress": "Company location e.g. London, United Kingdom",
  "jobTitle": "Target role title",
  "jobReference": "Ref: [Role Title]",
  "salutation": "Dear Hiring Team,",
  "para1Hook": "Paragraph 1 company hook",
  "para2Evidence": "Paragraph 2 evidenced skills and project match",
  "para3Value": "Paragraph 3 mutual value delivery",
  "closingSentence": "I welcome the opportunity to discuss my technical experience in an interview.",
  "signoff": "Yours sincerely,"
}`;

      const pass2CoverPrompt = `=== META-ARCHITECT BRIEF ===
${architectBrief}

=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Generate the clean JSON Cranfield Formal cover letter now.`;

      const pass2CoverResponse = await callGroqWithFallback(groq, {
        messages: [
          { role: "system", content: pass2CoverInstruction },
          { role: "user", content: pass2CoverPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 4096,
      });

      const rawText = pass2CoverResponse.choices[0]?.message?.content || "{}";
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

      const fullCoverLetter =
        parsedCover.coverLetter ||
        parsedCover.fullText ||
        [
          parsedCover.salutation,
          `RE: Application for ${parsedCover.jobTitle || "Role"}`,
          parsedCover.para1Hook,
          parsedCover.para2Evidence,
          parsedCover.para3Value,
          parsedCover.closingSentence,
          parsedCover.signoff,
        ]
          .filter(Boolean)
          .join("\n\n");

      return NextResponse.json({
        coverLetter: fullCoverLetter,
        content: fullCoverLetter,
        coverData: {
          ...parsedCover,
          fullText: fullCoverLetter,
        },
        architectBrief,
        docType: "cover",
      });
    }

    // ==========================================
    // PASS 2: CV Engine (Cranfield University Gold Standard)
    // ==========================================
    const pass2CvInstruction = `You are Shortlistr's Master Executive Resume Architect, specializing in official Cranfield University Gold Standard CV requirements and high-ATS commercial standards.

=== CRANFIELD UNIVERSITY GOLD STANDARD CV REQUIREMENTS ===
1. PERSONAL STATEMENT / SUMMARY:
   - Must be strictly third-person. Absolutely NO personal pronouns (I, my, me, we, our).
2. KEY ACHIEVEMENTS:
   - 3-4 bullet points highlighting candidate's top commercial or technical achievements.
   - Each bullet MUST strictly end with bracketed organization and year: "(Organisation, Year)".
3. CAREER HISTORY / EXPERIENCE:
   - Role, Company, Location, and right-aligned Dates.
   - Company Overview: A distinct 1-2 sentence italicized line describing the company's industry, scale, and turnover (e.g., "CloudScale Labs is a high-growth cloud infrastructure SaaS provider serving 80,000+ active users across North America with an annual turnover of $15M.").
   - 4-5 bullet points strictly formatted in Cranfield's "Role, How, Outcome" model starting with past-tense action verbs. If metrics are unmentioned in original, use bracketed placeholders like "[Insert % or number]".
4. EDUCATION:
   - Degree title, institution, reverse-chronological dates, relevant modules list ("Key Modules: ..."), and thesis topic ("Thesis: ...").
5. SKILLS, INTERESTS & EXTRACURRICULAR ACTIVITIES:
   - Categorized technical competencies and extracurricular activities (Languages, IT Skills, Individual Interests, Memberships, Volunteering).

=== THE STRICT TRUTH CONTRACT ===
- Retain candidate's real name, contact info, companies, dates, and degrees.
- Never invent skills or projects not grounded in the resume.
- Ban buzzwords: "spearheaded", "synergy", "dynamic", "delve", "harnessing", "proven track record", "passionate".

Return clean JSON matching this exact schema:
{
  "name": "CANDIDATE FULL NAME IN UPPERCASE",
  "contact": "Location | Phone | Email | LinkedIn separated by pipes",
  "summary": "Strictly third-person personal statement with zero personal pronouns (no I, my, me, we, our)",
  "achievements": [
    "Delivered enterprise software architecture improvements cutting latency by 40% (Organisation, Year)",
    "Optimized high-volume database systems cutting query overhead by 35% (Organisation, Year)",
    "Engineered microservices pipeline achieving 99.99% uptime (Organisation, Year)"
  ],
  "experience": [
    {
      "role": "Role Title",
      "company": "Company Name",
      "location": "City, Country",
      "period": "Start Year - End Year",
      "companyOverview": "1-2 sentence overview of company industry, scale, and turnover.",
      "bullets": [
        "Architected scalable REST microservices using TypeScript and Docker, reducing deployment cycle times by 45%.",
        "Refactored relational database schemas using PostgreSQL, improving query execution latency by [Insert %].",
        "Mentored cross-functional engineering pods in CI/CD pipeline automation, decreasing production regressions."
      ]
    }
  ],
  "education": [
    {
      "degree": "Degree Title",
      "institution": "University Name",
      "location": "City, Country",
      "period": "Graduation Year",
      "modules": "Key Modules: Software Engineering, Distributed Systems, Cloud Computing",
      "thesis": "Thesis: Scalable Systems Architecture and High-Throughput Processing"
    }
  ],
  "skills": [
    {
      "category": "Languages & Core",
      "items": ["TypeScript", "JavaScript", "Python", "SQL"]
    },
    {
      "category": "Frameworks & Backend",
      "items": ["React", "Next.js", "Node.js", "Express", "Tailwind CSS"]
    },
    {
      "category": "Cloud & Infrastructure",
      "items": ["AWS", "Docker", "PostgreSQL", "Redis", "CI/CD", "Git"]
    }
  ],
  "extracurricular": {
    "languages": "English (Full Professional)",
    "itSkills": "TypeScript, React, Next.js, Node.js, PostgreSQL, Docker, AWS, Git",
    "interests": "Open-source development, competitive cycling, technical writing",
    "memberships": "British Computer Society (BCS), IEEE Computer Society",
    "volunteering": "STEM Ambassador and CodeClub technical mentor"
  },
  "markdown": "Complete markdown representation of the CV"
}`;

    const pass2CvPrompt = `=== META-ARCHITECT BRIEF ===
${architectBrief}

=== CANDIDATE RESUME ===
${resumeText}

=== TARGET JOB DESCRIPTION ===
${jobDescription}

Generate the complete structured tailored resume JSON conforming to Cranfield University Gold Standard and ATS guidelines now.`;

    const pass2CvResponse = await callGroqWithFallback(groq, {
      messages: [
        { role: "system", content: pass2CvInstruction },
        { role: "user", content: pass2CvPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 4096,
    });

    const rawText = pass2CvResponse.choices[0]?.message?.content || "{}";
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

    const achievements: string[] = Array.isArray(parsedResume.achievements)
      ? parsedResume.achievements
      : Array.isArray(parsedResume.keyAchievements)
      ? parsedResume.keyAchievements
      : [
          "Delivered enterprise software architecture improvements with quantifiable latency reduction (Organisation, 2023)",
          "Optimized high-volume database systems cutting query execution overhead by 35% (Organisation, 2021)",
        ];

    const normalizedResume = {
      name: parsedResume.name || "Candidate Name",
      contact: parsedResume.contact || parsedResume.contactInfo || "",
      contactInfo: parsedResume.contact || parsedResume.contactInfo || "",
      summary:
        parsedResume.summary ||
        parsedResume.personalStatement ||
        "Accomplished professional with proven technical expertise.",
      personalStatement:
        parsedResume.summary ||
        parsedResume.personalStatement ||
        "Accomplished professional with proven technical expertise.",
      achievements,
      keyAchievements: achievements,
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
              "Key Modules: Software Engineering, Distributed Systems, Cloud Computing",
            thesis: edu.thesis || "Thesis: Scalable Systems Architecture and High-Throughput Processing",
          }))
        : [],
      extracurricular: parsedResume.extracurricular || {
        languages: "English (Full Professional)",
        itSkills: "TypeScript, React, Next.js, Node.js, PostgreSQL, Docker, AWS, Git",
        interests: "Open-source development, competitive cycling, technical writing",
        memberships: "British Computer Society (BCS), IEEE Computer Society",
        volunteering: "STEM Ambassador and CodeClub technical mentor",
      },
      markdown: parsedResume.markdown || "",
    };

    return NextResponse.json({
      name: normalizedResume.name,
      contact: normalizedResume.contact,
      summary: normalizedResume.summary,
      achievements: normalizedResume.achievements,
      experience: normalizedResume.experience,
      education: normalizedResume.education,
      skills: normalizedResume.skills,
      personalStatement: normalizedResume.personalStatement,
      keyAchievements: normalizedResume.keyAchievements,
      extracurricular: normalizedResume.extracurricular,
      resumeData: normalizedResume,
      content: normalizedResume.markdown,
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
