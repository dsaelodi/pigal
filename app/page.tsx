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
  LOW: { label: "Low risk", color: "text-green-700", bar: "bg-green-600" },
  MEDIUM: { label: "Medium risk", color: "text-yellow-700", bar: "bg-yellow-500" },
  HIGH: { label: "High risk", color: "text-red-700", bar: "bg-red-600" },
  CRITICAL: { label: "Critical risk", color: "text-red-800", bar: "bg-red-800" },
} as const;

const severityMeta = {
  LOW: "border-green-600 text-green-700",
  MEDIUM: "border-yellow-600 text-yellow-700",
  HIGH: "border-red-600 text-red-700",
  CRITICAL: "border-red-800 bg-red-800 text-white",
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
    <main className="min-h-screen bg-[#f4f5f7] text-[#111827]">
      <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b-2 border-[#111827] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center bg-[#111827] text-white"><ShieldAlert size={19} /></div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4b5563]">PIGAL / RISK INTELLIGENCE</p>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight">Financial evidence assessment</h1>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <p className="mono-data text-[10px] uppercase tracking-[0.12em] text-[#6b7280]">CASE WORKSPACE</p>
            <p className="text-xs font-medium text-[#111827]">Evidence-based review</p>
          </div>
        </header>

        <div className="grid gap-6 py-6 lg:grid-cols-[minmax(0,0.88fr)_minmax(480px,1.12fr)]">
          <section className="min-w-0">
            <div className="mb-5 flex items-end justify-between border-b border-[#9ca3af] pb-3">
              <div>
                <p className="mono-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2563eb]">01 / INPUT EVIDENCE</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Start a review</h2>
                <p className="mt-1 max-w-xl text-sm text-[#4b5563]">Upload a screenshot or provide the source details. Every field is optional; submit what you have.</p>
              </div>
              {hasAnyEvidence && <button type="button" onClick={handleReset} className="inline-flex items-center gap-2 border border-[#9ca3af] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide hover:border-[#111827] hover:bg-[#111827] hover:text-white"><Trash2 size={14} /> Reset</button>}
            </div>

            <div className="space-y-5">
              <div className="border border-[#9ca3af] bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><Upload size={16} className="text-[#2563eb]" /> Screenshot evidence</div>
                  <span className="mono-data text-[10px] text-[#6b7280]">PNG / JPG / WEBP · 5 MB</span>
                </div>
                <label className="mt-4 flex min-h-[92px] cursor-pointer items-center gap-4 border border-dashed border-[#6b7280] bg-[#f9fafb] px-4 py-4 hover:border-[#2563eb] hover:bg-white">
                  <ImageIcon size={24} className="shrink-0 text-[#2563eb]" />
                  <span><strong className="block text-sm">Upload a screenshot</strong><span className="mt-1 block text-xs text-[#6b7280]">Chats, offers, payment instructions, or account details.</span></span>
                  <input ref={screenshotInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" multiple className="hidden" onChange={handleScreenshot} />
                </label>
                {(evidence.screenshots ?? []).length > 0 && <div className="mt-3 divide-y divide-[#e5e7eb] border border-[#e5e7eb]">{(evidence.screenshots ?? []).map((item) => <div key={item.id} className="flex items-center gap-3 p-2"><Image src={item.previewUrl} alt={item.name} width={42} height={42} unoptimized className="h-[42px] w-[42px] object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.name}</p><p className="mono-data text-[10px] text-[#6b7280]">{formatFileSize(item.size)}</p></div><button type="button" onClick={() => removeScreenshot(item.id)} className="p-2 text-[#6b7280] hover:bg-[#111827] hover:text-white" aria-label={`Remove ${item.name}`}><X size={15} /></button></div>)}</div>}
              </div>

              <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151]">Company name<input id="companyName" value={evidence.companyName ?? ""} onChange={(event) => updateEvidence("companyName", event.target.value)} placeholder="PT Example Investasi" className="mt-2 w-full border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151]">Website / URL<input id="website" type="url" value={evidence.website ?? ""} onChange={(event) => updateEvidence("website", event.target.value)} placeholder="https://example.com" className="mt-2 w-full border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151] sm:col-span-2">Bank account number<input id="bankAccountNumber" type="text" inputMode="numeric" value={evidence.bankAccountNumber ?? ""} onChange={(event) => updateEvidence("bankAccountNumber", event.target.value)} placeholder="Account or bank identifier" className="mono-data mt-2 w-full border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151] sm:col-span-2">Investment proposal<textarea id="investmentProposal" value={evidence.investmentProposal ?? ""} onChange={(event) => updateEvidence("investmentProposal", event.target.value)} placeholder="Paste the offer, return claim, or terms..." className="mt-2 min-h-[108px] w-full resize-y border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151] sm:col-span-2">Sales chat<textarea id="salesChat" value={evidence.salesChat ?? ""} onChange={(event) => updateEvidence("salesChat", event.target.value)} placeholder="Paste the conversation with the sales representative..." className="mt-2 min-h-[108px] w-full resize-y border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151]">Links<textarea id="links" value={(evidence.links ?? []).join("\n")} onChange={(event) => updateEvidence("links", parseTextList(event.target.value))} placeholder="https://example.com" className="mt-2 min-h-[76px] w-full resize-y border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#374151]">Social media<textarea id="socialMedia" value={(evidence.socialMedia ?? []).join("\n")} onChange={(event) => updateEvidence("socialMedia", parseTextList(event.target.value))} placeholder="https://instagram.com/brand" className="mt-2 min-h-[76px] w-full resize-y border border-[#9ca3af] bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]" /></label>
              </div>

              <div className="border-y border-[#9ca3af] py-3"><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"><BadgeCheck size={15} className="text-green-700" /> Evidence checklist</div><span className="mono-data text-[10px] text-[#6b7280]">{evidenceSummary.filter((item) => item.present).length} / {evidenceSummary.length} present</span></div><div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">{evidenceSummary.map((item) => <div key={item.label} className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 ${item.present ? "bg-green-600" : "bg-[#d1d5db]"}`} /><span className={item.present ? "text-[#111827]" : "text-[#6b7280]"}>{item.label}</span></div>)}</div></div>

              {error && <div className="flex items-start gap-3 border border-red-600 bg-white px-3 py-3 text-sm text-red-700" role="alert"><CircleAlert size={16} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
              <div className="flex flex-wrap gap-2"><button type="button" onClick={handleSubmit} disabled={loading || !hasAnyEvidence} className="inline-flex items-center gap-2 bg-[#111827] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:bg-[#9ca3af]">{loading ? "Analyzing..." : "Analyze evidence"}{!loading && <ArrowRight size={16} />}</button><button type="button" onClick={() => setEvidence(sampleEvidenceSets.exampleA as EvidenceInput)} className="border border-[#9ca3af] bg-white px-3 py-3 text-xs font-semibold uppercase tracking-wide hover:border-[#111827]">Load example A</button><button type="button" onClick={() => setEvidence(sampleEvidenceSets.exampleB as EvidenceInput)} className="border border-[#9ca3af] bg-white px-3 py-3 text-xs font-semibold uppercase tracking-wide hover:border-[#111827]">Load example B</button><button type="button" onClick={() => setEvidence(sampleEvidenceSets.exampleC as EvidenceInput)} className="border border-[#9ca3af] bg-white px-3 py-3 text-xs font-semibold uppercase tracking-wide hover:border-[#111827]">Screenshot only</button></div>
            </div>
          </section>

          <section className="min-w-0 lg:border-l lg:border-[#d1d5db] lg:pl-6">
            <div className="mb-5 border-b border-[#9ca3af] pb-3"><p className="mono-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2563eb]">02 / ASSESSMENT OUTPUT</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Risk assessment</h2><p className="mt-1 text-sm text-[#4b5563]">A concise view of the evidence, indicators, and recommended action.</p></div>
            {!result && !loading && !error && <div className="border border-dashed border-[#9ca3af] bg-white px-6 py-12 text-center"><ShieldAlert size={25} className="mx-auto text-[#2563eb]" /><h3 className="mt-4 text-base font-semibold">No assessment yet</h3><p className="mx-auto mt-2 max-w-sm text-sm text-[#6b7280]">Submit evidence to generate a structured risk assessment.</p></div>}
            {loading && <div className="border border-[#9ca3af] bg-white p-6"><div className="flex items-center gap-3"><span className="h-2 w-2 animate-pulse bg-[#2563eb]" /><span className="mono-data text-xs uppercase tracking-wide">Processing evidence</span></div><div className="mt-5 space-y-2"><div className="h-2 w-full animate-pulse bg-[#e5e7eb]" /><div className="h-2 w-4/5 animate-pulse bg-[#e5e7eb]" /><div className="h-2 w-3/5 animate-pulse bg-[#e5e7eb]" /></div></div>}
            {result && <div className="space-y-5">
              <div className={`border-l-4 border-t border-r border-b p-5 ${resultToneClass}`}><div className="flex items-start justify-between gap-4"><div><p className="mono-data text-[10px] font-semibold uppercase tracking-[0.14em]">Risk level</p><h3 className={`mt-1 text-3xl font-bold uppercase tracking-tight ${riskMeta[result.riskLevel].color}`}>{riskMeta[result.riskLevel].label}</h3></div><div className="text-right"><p className="mono-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4b5563]">Score</p><p className="mono-data mt-1 text-3xl font-semibold">{result.riskScore}<span className="text-base text-[#6b7280]"> / 100</span></p></div></div><div className="mt-5"><div className="relative h-1 bg-[#d1d5db]"><div className={`h-1 ${riskMeta[result.riskLevel].bar}`} style={{ width: `${result.riskScore}%` }} /><span className="absolute -top-1.5 h-4 w-px bg-[#111827]" style={{ left: `${result.riskScore}%` }} /></div><div className="mt-2 flex justify-between mono-data text-[9px] text-[#4b5563]"><span>0 LOW</span><span>25 MEDIUM</span><span>50 HIGH</span><span>75 CRITICAL</span><span>100</span></div></div></div>
              <div className="border-b border-[#9ca3af] pb-4"><p className="mono-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#6b7280]">Assessment summary</p><p className="mt-2 text-base font-medium leading-7 text-[#111827]">{result.summary}</p></div>
              <div><div className="mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-red-700" /><h3 className="text-sm font-semibold uppercase tracking-wide">Top risk factors</h3></div>{result.redFlags.length === 0 ? <p className="border border-[#9ca3af] bg-white p-4 text-sm text-[#4b5563]">No red flags were identified in the submitted content.</p> : <div className="divide-y divide-[#d1d5db] border-y border-[#9ca3af]">{result.redFlags.map((flag) => <article key={flag.type} className="grid gap-2 py-4 sm:grid-cols-[92px_1fr]"><span className={`h-fit w-fit border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${severityMeta[flag.severity]}`}>{flag.severity}</span><div><h4 className="font-semibold">{flag.title}</h4><p className="mt-1 text-sm text-[#111827]">&quot;{flag.evidence}&quot;</p><p className="mt-2 text-sm leading-6 text-[#4b5563]">{flag.explanation}</p></div></article>)}</div>}</div>
              <div><div className="mb-3 flex items-center gap-2"><CheckCircle2 size={16} className="text-green-700" /><h3 className="text-sm font-semibold uppercase tracking-wide">Recommended action</h3></div><div className="border-l-4 border-green-600 bg-white p-4 text-sm leading-6 text-[#111827]">{result.recommendations && result.recommendations.length > 1 ? <ul className="space-y-2">{result.recommendations.map((rec, idx) => <li key={idx} className="flex gap-2"><span className="text-green-700">{idx + 1}.</span><span>{rec}</span></li>)}</ul> : result.recommendation}</div></div>
              {result.verification && <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide">Evidence verification</h3><div className="divide-y divide-[#e5e7eb] border-y border-[#9ca3af] bg-white text-sm">{Object.entries(result.verification).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 py-3"><span className="font-medium capitalize text-[#374151]">{key.replaceAll("_", " ")}</span><span className="max-w-[65%] text-right text-[#111827]">{typeof value === "object" && value !== null ? String((value as { status?: string; reachable?: boolean; found?: boolean }).status ?? ((value as { reachable?: boolean }).reachable === true ? "Reachable" : (value as { found?: boolean }).found === false ? "Not found" : "Recorded")) : String(value)}</span></div>)}</div></div>}
              {result.limitations && result.limitations.length > 0 && <p className="border-t border-[#d1d5db] pt-3 text-xs leading-5 text-[#6b7280]">{result.limitations.join(" ")}</p>}
            </div>}
          </section>
        </div>
        <footer className="border-t border-[#9ca3af] pt-3 text-[10px] uppercase tracking-[0.12em] text-[#6b7280]">PIGAL · Evidence-based financial risk assessment · Not a legal determination</footer>
      </div>
    </main>
  );
}
