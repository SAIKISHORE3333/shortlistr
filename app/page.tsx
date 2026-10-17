"use client";

import React, { useState } from "react";
import {
  Sparkles,
  FileText,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Printer,
  ShieldCheck,
  RefreshCw,
  Sliders,
  ChevronRight,
  TrendingUp,
  FileCode,
  Mail,
  Zap,
  RotateCcw,
  BookOpen
} from "lucide-react";

interface TailoredBullet {
  original: string;
  improved: string;
  skillTargeted: string;
}

interface AnalysisResult {
  atsScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  tailoredBullets: TailoredBullet[];
  fullTailoredResumeMarkdown: string;
  coverLetter: string;
}

const SAMPLE_RESUME = `Jane Doe
Senior Full-Stack Engineer | Austin, TX | jane.doe@email.com | (512) 555-0199

SUMMARY
Full-Stack Software Engineer with 6+ years of experience building scalable web applications, microservices, and distributed cloud systems using TypeScript, React, Next.js, and Node.js.

SKILLS
- Languages: TypeScript, JavaScript, Python, SQL, HTML5, CSS3
- Frameworks & Libs: React, Next.js, Node.js, Express, Tailwind CSS, Redux
- Cloud & Infrastructure: AWS (S3, Lambda, ECS), Docker, PostgreSQL, Redis, REST APIs, GraphQL
- Tools: Git, GitHub Actions, Jest, Vitest, CI/CD, Agile/Scrum

EXPERIENCE
Staff Software Engineer | CloudScale Labs (2022 - Present)
- Developed and maintained core Next.js client-facing dashboard serving 80,000 monthly active users.
- Migrated legacy REST endpoints to GraphQL, decreasing average client request latency.
- Built reusable component library using React, TypeScript, and Tailwind CSS adopted across 4 internal squads.
- Implemented automated CI/CD pipelines with GitHub Actions and Jest tests.

Full-Stack Developer | Apex Digital Solutions (2019 - 2022)
- Built enterprise web applications using Node.js, PostgreSQL, and React.
- Optimized slow SQL queries on PostgreSQL database containing 5M+ records, improving query execution time.
- Integrated Stripe payment processing and webhook handling for SaaS subscription billing.
- Mentored 3 junior software engineers through weekly pair programming sessions and code reviews.

EDUCATION
B.S. in Computer Science | University of Texas at Austin (2015 - 2019)`;

const SAMPLE_JOB = `Senior Full-Stack Engineer (Next.js & Cloud)
Vanguard Tech Solutions - Remote

About the Role:
We are seeking an experienced Senior Full-Stack Engineer to lead the architecture and development of our next-generation AI analytics platform. You will design resilient distributed systems, optimize frontend performance with Next.js App Router, and collaborate directly with product and design teams.

Responsibilities:
- Architect and ship high-performance web applications using TypeScript, Next.js, and React.
- Design resilient microservices with Node.js and PostgreSQL.
- Build event-driven streaming pipelines with Apache Kafka and Redis.
- Collaborate with AI/ML engineers to integrate LLM endpoints and structured outputs.
- Write robust unit and end-to-end test suites using Playwright and Vitest.
- Drive engineering excellence, code review standards, and CI/CD automation on AWS.

Requirements:
- 5+ years of production experience in TypeScript, React, and Node.js.
- Strong expertise with Next.js (App Router, Server Actions, SSR/SSG).
- Experience with relational databases (PostgreSQL) and caching (Redis).
- Familiarity with event streaming platforms (Kafka, RabbitMQ) is a strong plus.
- Hands-on experience with AWS cloud deployments and containerization (Docker, Kubernetes).
- Proven track record of shipping clean, maintainable, production-ready code.`;

export default function ShortlistrPortal() {
  const [resumeText, setResumeText] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<"ats" | "cv" | "cover">("ats");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!resumeText.trim() || !jobDescription.trim()) {
      setError("Please provide both your resume and the target job description.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobDescription }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Analysis failed. Please verify API configuration.");
      }

      setResult(data);
      setActiveTab("ats");
    } catch (err: any) {
      setError(err?.message || "Failed to communicate with analysis engine.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = () => {
    setResumeText(SAMPLE_RESUME);
    setJobDescription(SAMPLE_JOB);
    setError(null);
  };

  const handleReset = () => {
    setResumeText("");
    setJobDescription("");
    setResult(null);
    setError(null);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400 border-emerald-500/50 bg-emerald-500/10";
    if (score >= 60) return "text-amber-400 border-amber-500/50 bg-amber-500/10";
    return "text-rose-400 border-rose-500/50 bg-rose-500/10";
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 80) return "#10b981";
    if (score >= 60) return "#f59e0b";
    return "#f43f5e";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600/30">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-20 px-4 sm:px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-indigo-600 to-violet-500 p-2 rounded-xl text-white shadow-lg shadow-indigo-600/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Shortlistr<span className="text-indigo-400">.ai</span>
              </h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v2.5
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Factual ATS Compatibility & Executive Resume Tailoring
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Strict Truth Grounded</span>
          </div>

          <button
            onClick={handleLoadSample}
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition cursor-pointer"
            title="Load sample engineer resume and job description"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Load Sample</span>
          </button>

          {(resumeText || jobDescription || result) && (
            <button
              onClick={handleReset}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
              title="Reset form"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}

          {result && (
            <button
              onClick={() => window.print()}
              type="button"
              className="flex items-center gap-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Input Form (5 cols on large screens) */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold">Notice:</span> {error}
              </div>
            </div>
          )}

          {/* Resume Text Input */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col shadow-sm backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="resume-input"
                className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-indigo-400" />
                1. Candidate Resume / Experience
              </label>
              <span className="text-[11px] text-slate-500">
                {resumeText.trim() ? `${resumeText.trim().split(/\s+/).length} words` : "Required"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-2.5">
              Paste work history, credentials, and achievements. No fabrications will be made.
            </p>
            <textarea
              id="resume-input"
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste existing CV, employment history, bullet points, skills..."
              rows={8}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono transition resize-y min-h-[160px]"
            />
          </div>

          {/* Job Description Input */}
          <div className="bg-slate-900/70 border border-slate-800/90 rounded-2xl p-4 sm:p-5 flex flex-col shadow-sm backdrop-blur">
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="job-input"
                className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2"
              >
                <Briefcase className="w-4 h-4 text-emerald-400" />
                2. Target Job Description (JD)
              </label>
              <span className="text-[11px] text-slate-500">
                {jobDescription.trim() ? `${jobDescription.trim().split(/\s+/).length} words` : "Required"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-2.5">
              Paste the job posting requirements, responsibilities, and target competencies.
            </p>
            <textarea
              id="job-input"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste job title, qualifications, responsibilities, tech stack..."
              rows={8}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono transition resize-y min-h-[160px]"
            />
          </div>

          {/* Action Button */}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            id="analyze-button"
            type="button"
            className="w-full py-3.5 px-5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2.5 transition cursor-pointer active:scale-[0.99]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-white" />
                <span>Auditing ATS & Tailoring Application...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 text-indigo-200" />
                <span>Analyze & Match Application</span>
                <ChevronRight className="w-4 h-4 text-indigo-200" />
              </>
            )}
          </button>

          {/* Truth Contract Notice */}
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3 text-[11px] text-slate-400 flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Zero-Hallucination Policy:</strong> Experiences and metrics never exist out of thin air. Missing numbers use bracketed placeholders like <code className="text-indigo-300 font-mono">[Insert %]</code>.
            </span>
          </div>
        </section>

        {/* Right Column: Output Tabs & Insights (7 cols on large screens) */}
        <section className="lg:col-span-7 bg-slate-900/70 border border-slate-800/90 rounded-2xl flex flex-col overflow-hidden shadow-sm backdrop-blur">
          {/* Tab Navigation */}
          <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 pt-3 gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("ats")}
              type="button"
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition border-b-2 cursor-pointer ${
                activeTab === "ats"
                  ? "border-indigo-500 text-white bg-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>ATS Diagnostics</span>
              {result && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    result.atsScore >= 75
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {result.atsScore}%
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("cv")}
              type="button"
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition border-b-2 cursor-pointer ${
                activeTab === "cv"
                  ? "border-indigo-500 text-white bg-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <FileCode className="w-4 h-4 text-emerald-400" />
              <span>Tailored CV</span>
            </button>

            <button
              onClick={() => setActiveTab("cover")}
              type="button"
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition border-b-2 cursor-pointer ${
                activeTab === "cover"
                  ? "border-indigo-500 text-white bg-slate-900"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
              }`}
            >
              <Mail className="w-4 h-4 text-violet-400" />
              <span>Cover Letter</span>
            </button>
          </div>

          {/* Results Container */}
          <div className="flex-1 p-5 sm:p-6 overflow-y-auto max-h-[820px]">
            {/* Empty State */}
            {!result && !loading && (
              <div className="h-full min-h-[460px] flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
                  <FileText className="w-8 h-8 stroke-[1.5]" />
                </div>
                <h3 className="text-base font-semibold text-white">Application Ready for Audit</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mt-1.5 leading-relaxed">
                  Provide your resume and target job description on the left, then click{" "}
                  <strong className="text-indigo-300">Analyze & Match Application</strong> to unlock keyword diagnostics, tailored STAR achievements, and an aligned cover letter.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                  <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-800">
                    ATS Keyword Score
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-800">
                    Truth-Tailored STAR Bullets
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-800">
                    3-Paragraph Human Cover Letter
                  </span>
                </div>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="h-full min-h-[460px] flex flex-col items-center justify-center text-center p-8">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-indigo-400 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-base font-semibold text-white">Analyzing Qualifications & Fit</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
                  Extracting JD keywords, cross-referencing your experience, and crafting truth-grounded improvements...
                </p>
              </div>
            )}

            {/* TAB 1: ATS Diagnostics */}
            {result && !loading && activeTab === "ats" && (
              <div className="space-y-6">
                {/* Score & Health Banner */}
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        ATS Match Rating
                      </span>
                    </div>
                    <div className="flex items-baseline gap-3">
                      <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                        {result.atsScore}%
                      </span>
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${getScoreColor(
                          result.atsScore
                        )}`}
                      >
                        {result.atsScore >= 75
                          ? "High Compatibility"
                          : result.atsScore >= 50
                          ? "Moderate Alignment"
                          : "Low Alignment"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 max-w-md">
                      {result.atsScore >= 75
                        ? "Your background strongly addresses key competencies specified in the job posting."
                        : "Key competencies from the job description are absent from your resume. Review missing skills below."}
                    </p>
                  </div>

                  {/* Radial Gauge */}
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center shrink-0 self-center sm:self-auto">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        className="stroke-slate-800"
                        strokeWidth="8"
                        fill="transparent"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        stroke={getScoreRingColor(result.atsScore)}
                        strokeWidth="8"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * result.atsScore) / 100}
                        strokeLinecap="round"
                        fill="transparent"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold text-white">{result.atsScore}</span>
                      <span className="text-[10px] uppercase font-semibold text-slate-400">Score</span>
                    </div>
                  </div>
                </div>

                {/* Keyword Pills: Matched & Missing */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Matched Keywords */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Matched Competencies ({result.matchedKeywords.length})
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.matchedKeywords.length > 0 ? (
                        result.matchedKeywords.map((kw, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                          >
                            <Check className="w-3 h-3 text-emerald-400" />
                            {kw}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 italic">No direct keyword overlap found.</span>
                      )}
                    </div>
                  </div>

                  {/* Missing Keywords */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        Skill Gaps ({result.missingKeywords.length})
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.missingKeywords.length > 0 ? (
                        result.missingKeywords.map((kw, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20"
                          >
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            {kw}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium">All key JD requirements addressed!</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tailored STAR Bullets Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Truth-Tailored STAR Bullets ({result.tailoredBullets?.length || 0})
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Truth Contract Verified
                    </span>
                  </div>

                  <div className="space-y-3">
                    {result.tailoredBullets && result.tailoredBullets.length > 0 ? (
                      result.tailoredBullets.map((bullet, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              Target: {bullet.skillTargeted}
                            </span>
                            <button
                              onClick={() => copyToClipboard(bullet.improved, `bullet-${idx}`)}
                              type="button"
                              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition cursor-pointer"
                              title="Copy improved bullet"
                            >
                              {copiedKey === `bullet-${idx}` ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-1.5 text-xs">
                            <div className="text-slate-400">
                              <span className="text-slate-500 font-medium mr-1.5 uppercase text-[10px]">Original:</span>
                              <span className="line-through decoration-slate-600 text-slate-400">
                                {bullet.original}
                              </span>
                            </div>
                            <div className="text-slate-100 font-medium bg-indigo-950/20 border border-indigo-900/40 p-2.5 rounded-lg">
                              <span className="text-emerald-400 font-semibold mr-1.5 uppercase text-[10px]">Improved:</span>
                              {bullet.improved}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 italic">No specific bullet rewrites required.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Tailored CV */}
            {result && !loading && activeTab === "cv" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Full tailored resume markdown. Grounded in your real experience.
                  </div>
                  <button
                    onClick={() => copyToClipboard(result.fullTailoredResumeMarkdown, "cv")}
                    type="button"
                    className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition font-medium cursor-pointer shadow-sm"
                  >
                    {copiedKey === "cv" ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied Markdown!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Markdown</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 sm:p-6 text-slate-200 font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap selection:bg-indigo-600/40 overflow-x-auto shadow-inner">
                  {result.fullTailoredResumeMarkdown}
                </div>
              </div>
            )}

            {/* TAB 3: Cover Letter */}
            {result && !loading && activeTab === "cover" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    Concise 3-paragraph letter written with natural human tone and zero banned buzzwords.
                  </div>
                  <button
                    onClick={() => copyToClipboard(result.coverLetter, "cover")}
                    type="button"
                    className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition font-medium cursor-pointer shadow-sm"
                  >
                    {copiedKey === "cover" ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copied Letter!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Letter</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-6 sm:p-8 text-slate-100 text-sm leading-relaxed whitespace-pre-line font-sans shadow-inner">
                  {result.coverLetter}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}