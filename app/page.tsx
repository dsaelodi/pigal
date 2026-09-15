"use client";

import Image from "next/image";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  Image as ImageIcon,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  ACCEPTED_IMAGE_TYPES,
  AnalysisResponseSchema,
  MAX_FILE_SIZE,
  buildEvidenceContent,
  isValidHttpUrl,
  parseTextList,
  analyzeContent,
  getRiskTone,
  sampleEvidenceSets,
  type EvidenceInput,
  type UploadedScreenshot,
} from "@/lib/analysis";

const riskMeta = {
  LOW: { label: "Low risk", color: "text-emerald-700" },
  MEDIUM: { label: "Medium risk", color: "text-amber-700" },
  HIGH: { label: "High risk", color: "text-orange-700" },
  CRITICAL: { label: "Critical risk", color: "text-red-700" },
} as const;

const severityMeta = {
  LOW: "border-emerald-200 bg-emerald-50 text-emerald-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  CRITICAL: "border-red-200 bg-red-50 text-red-700",
} as const;

const initialEvidence: EvidenceInput = {
  companyName: "",
  website: "",
  bankAccountNumber: "",
  investmentProposal: "",
  salesChat: "",
  links: [],
  socialMedia: [],
  screenshots: [],
};

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HomePage() {
  const [evidence, setEvidence] = useState<EvidenceInput>(initialEvidence);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof analyzeContent>> | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);

  const evidenceSummary = useMemo(
    () => [
      { label: "Screenshot", present: (evidence.screenshots ?? []).length > 0 },
      { label: "Company name", present: !!evidence.companyName?.trim() },
      { label: "Website", present: !!evidence.website?.trim() },
      { label: "Bank account", present: !!evidence.bankAccountNumber?.trim() },
      { label: "Investment proposal", present: !!evidence.investmentProposal?.trim() },
      { label: "Sales chat", present: !!evidence.salesChat?.trim() },
      { label: "Link / URL", present: (evidence.links ?? []).length > 0 },
      { label: "Social media", present: (evidence.socialMedia ?? []).length > 0 },
    ],
    [evidence],
  );

  const hasAnyEvidence =
    !!evidence.companyName?.trim() ||
    !!evidence.website?.trim() ||
    !!evidence.bankAccountNumber?.trim() ||
    !!evidence.investmentProposal?.trim() ||
    !!evidence.salesChat?.trim() ||
    (evidence.links ?? []).length > 0 ||
    (evidence.socialMedia ?? []).length > 0 ||
    (evidence.screenshots ?? []).length > 0;

  const resultToneClass = useMemo(
    () => (result ? getRiskTone(result.riskLevel) : "risk-medium"),
    [result],
  );

  function updateEvidence<K extends keyof EvidenceInput>(field: K, value: EvidenceInput[K]) {
    setEvidence((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  function handleScreenshot(selection: ChangeEvent<HTMLInputElement>) {
    const files = selection.target.files ? Array.from(selection.target.files) : [];

    if (files.length === 0) {
      return;
    }

    const validFiles: UploadedScreenshot[] = [];

    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setError("Screenshots must be PNG, JPG, JPEG, or WEBP files.");
        if (screenshotInputRef.current) {
          screenshotInputRef.current.value = "";
        }
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("Each screenshot must be smaller than 5 MB.");
        if (screenshotInputRef.current) {
          screenshotInputRef.current.value = "";
        }
        return;
      }

      validFiles.push({
        id: `${file.name}-${file.size}-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: URL.createObjectURL(file),
        file,
      });
    }

    setEvidence((current) => ({
      ...current,
      screenshots: [...(current.screenshots ?? []), ...validFiles],
    }));
    setError(null);

    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = "";
    }
  }

  function removeScreenshot(id: string) {
    setEvidence((current) => {
      const next = (current.screenshots ?? []).filter((item) => item.id !== id);
      return { ...current, screenshots: next };
    });
  }

  function handleReset() {
    setEvidence(initialEvidence);
    setError(null);
    setResult(null);
  }

  async function handleSubmit() {
    const trimmedWebsite = evidence.website?.trim() ?? "";
    const trimmedLinkList = parseTextList((evidence.links ?? []).join(", "));
    const trimmedSocialMedia = parseTextList((evidence.socialMedia ?? []).join(", "));

    if (trimmedWebsite && !isValidHttpUrl(trimmedWebsite)) {
      setError("Please provide a valid website URL beginning with http:// or https://");
      return;
    }

    if (trimmedLinkList.some((item) => !isValidHttpUrl(item))) {
      setError("Please provide valid URL values in the link field.");
      return;
    }

    if (trimmedSocialMedia.some((item) => !isValidHttpUrl(item))) {
      setError("Please provide valid social media URLs beginning with http:// or https://");
      return;
    }

    if (!hasAnyEvidence) {
      setError("Please add at least one evidence item before submitting for review.");
      return;
    }

    const composedContent = buildEvidenceContent({
      companyName: evidence.companyName,
      website: evidence.website,
      bankAccountNumber: evidence.bankAccountNumber,
      investmentProposal: evidence.investmentProposal,
      salesChat: evidence.salesChat,
      links: trimmedLinkList,
      socialMedia: trimmedSocialMedia,
    });

    setLoading(true);
    setError(null);

    try {
      const files = (evidence.screenshots ?? [])
        .map((item) => item.file)
        .filter((file): file is File => Boolean(file));

      const payload = await analyzeContent(
        composedContent,
        {
          ...evidence,
          links: trimmedLinkList,
          socialMedia: trimmedSocialMedia,
        },
        files,
      );

      const parsed = AnalysisResponseSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error("invalid-analysis-response");
      }

      setResult(parsed.data);
    } catch {
      setError("The analysis service is temporarily unavailable. Please try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fafaf8] text-[#171717]">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3 shadow-[0_1px_0_rgba(17,24,39,0.02)] sm:px-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6b7280]">Scam Risk Detector</p>
              <h1 className="mt-1 text-lg font-semibold text-[#171717]">Investment risk analysis</h1>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-3 py-1.5 text-xs font-medium text-[#525252] sm:flex">
              <ShieldAlert size={14} />
              Evidence-based review
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
          <section className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6b7280]">Analyzer</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#171717] sm:text-3xl">Analyze potential risk</h2>
              </div>
              {hasAnyEvidence && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm font-medium text-[#525252] transition hover:border-[#d1d5db] hover:bg-[#f3f4f6]"
                >
                  <Trash2 size={14} />
                  Reset
                </button>
              )}
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-[#171717]">
                  <Upload size={16} className="text-[#2563eb]" />
                  Screenshot evidence
                </div>

                <div className="mt-4">
                  <label className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#cbd5e1] bg-white px-4 py-5 text-center transition hover:border-[#93c5fd]">
                    <ImageIcon size={20} className="mb-2 text-[#6b7280]" />
                    <span className="text-sm font-medium text-[#171717]">Upload screenshot</span>
                    <span className="mt-1 text-xs text-[#6b7280]">PNG, JPG, JPEG, WEBP • Max size: 5 MB</span>
                    <input
                      ref={screenshotInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                      multiple
                      className="hidden"
                      onChange={handleScreenshot}
                    />
                  </label>
                </div>

                {(evidence.screenshots ?? []).length > 0 && (
                  <div className="mt-4 space-y-3">
                    {(evidence.screenshots ?? []).map((item) => (
                      <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white p-2">
                        <div className="h-14 w-14 overflow-hidden rounded-md border border-[#e5e7eb] bg-[#f3f4f6]">
                          <Image
                            src={item.previewUrl}
                            alt={item.name}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#171717]">{item.name}</p>
                          <p className="text-xs text-[#6b7280]">{formatFileSize(item.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeScreenshot(item.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white text-[#525252] transition hover:border-[#d1d5db] hover:bg-[#f3f4f6]"
                          aria-label={`Remove ${item.name}`}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-[#374151]">
                    Company name
                  </label>
                  <input
                    id="companyName"
                    value={evidence.companyName ?? ""}
                    onChange={(event) => updateEvidence("companyName", event.target.value)}
                    placeholder="PT Example Investasi"
                    className="w-full rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>

                <div>
                  <label htmlFor="website" className="mb-2 block text-sm font-medium text-[#374151]">
                    Website / URL
                  </label>
                  <input
                    id="website"
                    type="url"
                    value={evidence.website ?? ""}
                    onChange={(event) => updateEvidence("website", event.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="bankAccountNumber" className="mb-2 block text-sm font-medium text-[#374151]">
                  Bank account number
                </label>
                <input
                  id="bankAccountNumber"
                  type="text"
                  inputMode="numeric"
                  value={evidence.bankAccountNumber ?? ""}
                  onChange={(event) => updateEvidence("bankAccountNumber", event.target.value)}
                  placeholder="Account or bank identifier"
                  className="w-full rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div>
                <label htmlFor="investmentProposal" className="mb-2 block text-sm font-medium text-[#374151]">
                  Investment proposal
                </label>
                <textarea
                  id="investmentProposal"
                  value={evidence.investmentProposal ?? ""}
                  onChange={(event) => updateEvidence("investmentProposal", event.target.value)}
                  placeholder="Paste the investment proposal or offer details..."
                  className="min-h-[180px] w-full resize-y rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] leading-6 text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div>
                <label htmlFor="salesChat" className="mb-2 block text-sm font-medium text-[#374151]">
                  Sales chat
                </label>
                <textarea
                  id="salesChat"
                  value={evidence.salesChat ?? ""}
                  onChange={(event) => updateEvidence("salesChat", event.target.value)}
                  placeholder="Paste the conversation with the sales representative..."
                  className="min-h-[180px] w-full resize-y rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] leading-6 text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="links" className="mb-2 block text-sm font-medium text-[#374151]">
                    Link / URL
                  </label>
                  <textarea
                    id="links"
                    value={(evidence.links ?? []).join("\n")}
                    onChange={(event) => updateEvidence("links", parseTextList(event.target.value))}
                    placeholder="https://example.com\nhttps://example.org"
                    className="min-h-[110px] w-full resize-y rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] leading-6 text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>

                <div>
                  <label htmlFor="socialMedia" className="mb-2 block text-sm font-medium text-[#374151]">
                    Social media
                  </label>
                  <textarea
                    id="socialMedia"
                    value={(evidence.socialMedia ?? []).join("\n")}
                    onChange={(event) => updateEvidence("socialMedia", parseTextList(event.target.value))}
                    placeholder="https://instagram.com/brand\nhttps://tiktok.com/@brand"
                    className="min-h-[110px] w-full resize-y rounded-xl border border-[#d1d5db] bg-[#fafaf8] px-3 py-2.5 text-[15px] leading-6 text-[#171717] outline-none transition focus:border-[#2563eb] focus:ring-4 focus:ring-[#dbeafe]"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-[#171717]">
                    <BadgeCheck size={16} className="text-[#2563eb]" />
                    Evidence summary
                  </div>
                  <div className="text-xs text-[#6b7280]">{evidenceSummary.filter((item) => item.present).length} provided</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {evidenceSummary.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-sm">
                      <span className={`inline-flex h-2.5 w-2.5 rounded-full ${item.present ? "bg-emerald-600" : "bg-[#d1d5db]"}`} />
                      <span className={item.present ? "text-[#171717]" : "text-[#6b7280]"}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-3 rounded-xl border border-[#fecaca] bg-[#fff1f2] px-3 py-3 text-sm text-[#991b1b]" role="alert">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading || !hasAnyEvidence}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-[#93c5fd]"
                >
                  {loading ? "Analyzing…" : "Analyze"}
                  {!loading && <ArrowRight size={16} />}
                </button>

                <button
                  type="button"
                  onClick={() => setEvidence(sampleEvidenceSets.exampleA as EvidenceInput)}
                  className="inline-flex items-center justify-center rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm font-medium text-[#374151] transition hover:border-[#cbd5e1] hover:bg-[#f3f4f6]"
                >
                  Example A
                </button>

                <button
                  type="button"
                  onClick={() => setEvidence(sampleEvidenceSets.exampleB as EvidenceInput)}
                  className="inline-flex items-center justify-center rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm font-medium text-[#374151] transition hover:border-[#cbd5e1] hover:bg-[#f3f4f6]"
                >
                  Example B
                </button>

                <button
                  type="button"
                  onClick={() => setEvidence(sampleEvidenceSets.exampleC as EvidenceInput)}
                  className="inline-flex items-center justify-center rounded-xl border border-[#d1d5db] bg-white px-4 py-3 text-sm font-medium text-[#374151] transition hover:border-[#cbd5e1] hover:bg-[#f3f4f6]"
                >
                  Screenshot only
                </button>
              </div>
            </div>
          </section>

          <aside className="rounded-[20px] border border-[#e5e7eb] bg-white p-5 sm:p-7">
            {!result && !loading && !error && (
              <div className="flex h-full min-h-[260px] flex-col justify-center rounded-2xl border border-dashed border-[#d1d5db] bg-[#f8fafc] p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-[#e5e7eb] bg-white">
                  <ShieldAlert size={20} className="text-[#4b5563]" />
                </div>
                <h3 className="text-lg font-semibold text-[#171717]">No analysis yet</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">
                  Add any available evidence and submit it for a structured risk review.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex h-full min-h-[260px] flex-col justify-center rounded-2xl border border-[#e5e7eb] bg-[#fafaf8] p-6">
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-[#2563eb]" />
                  <div className="h-3 w-28 rounded-full bg-[#e5e7eb]" />
                </div>
                <div className="space-y-3">
                  <div className="h-4 w-full rounded-full bg-[#e5e7eb]" />
                  <div className="h-4 w-4/5 rounded-full bg-[#e5e7eb]" />
                  <div className="h-4 w-3/5 rounded-full bg-[#e5e7eb]" />
                </div>
                <p className="mt-5 text-sm text-[#6b7280]">Reviewing the submitted evidence for urgency, payment patterns, and credibility signals.</p>
              </div>
            )}

            {result && (
              <div className="space-y-6">
                <div className={`rounded-2xl border p-4 ${resultToneClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6b7280]">Risk level</p>
                      <h3 className={`mt-2 text-2xl font-semibold ${riskMeta[result.riskLevel].color}`}>
                        {riskMeta[result.riskLevel].label}
                      </h3>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6b7280]">Score</p>
                      <div className="mt-2 text-3xl font-semibold text-[#171717]">{result.riskScore}<span className="text-lg text-[#6b7280]"> / 100</span></div>
                    </div>
                  </div>

                  <div className="mt-4 h-2.5 rounded-full bg-[#e5e7eb]">
                    <div
                      className={`h-full rounded-full ${
                        result.riskLevel === "LOW"
                          ? "bg-emerald-600"
                          : result.riskLevel === "MEDIUM"
                            ? "bg-amber-500"
                            : result.riskLevel === "HIGH"
                              ? "bg-orange-600"
                              : "bg-red-600"
                      }`}
                      style={{ width: `${result.riskScore}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-[#f8fafc] p-4">
                  <p className="text-sm leading-6 text-[#374151]">{result.summary}</p>
                </div>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle size={18} className="text-[#374151]" />
                    <h3 className="text-lg font-semibold text-[#171717]">Red flags</h3>
                  </div>

                  {result.redFlags.length === 0 ? (
                    <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-sm text-[#6b7280]">
                      No red flags were identified in the submitted content.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {result.redFlags.map((flag) => (
                        <article key={flag.type} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h4 className="text-base font-semibold text-[#171717]">{flag.title}</h4>
                            <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] ${severityMeta[flag.severity]}`}>
                              {flag.severity}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">Evidence</p>
                              <p className="mt-1 text-sm leading-6 text-[#171717]">“{flag.evidence}”</p>
                            </div>
                            <div>
                              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6b7280]">Why it matters</p>
                              <p className="mt-1 text-sm leading-6 text-[#374151]">{flag.explanation}</p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-[#2563eb]" />
                    <h3 className="text-lg font-semibold text-[#171717]">Recommendations</h3>
                  </div>
                  {result.recommendations && result.recommendations.length > 1 ? (
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-[#374151]">
                      {result.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-[#374151]">{result.recommendation}</p>
                  )}
                </div>

                {result.limitations && result.limitations.length > 0 && (
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3.5 text-xs leading-5 text-[#6b7280]">
                    <span className="font-medium text-[#4b5563]">Catatan Analitis: </span>
                    {result.limitations.join(" ")}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
