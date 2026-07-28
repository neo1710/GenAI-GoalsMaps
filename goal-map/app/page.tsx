"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import * as mammoth from "mammoth";
import { FiBookOpen, FiChevronDown, FiFileText, FiFolder, FiLoader, FiMoon, FiPlus, FiSearch, FiSun, FiTrash2, FiUpload, FiX, FiZap } from "react-icons/fi";

type Status = "uploaded" | "processing" | "ready" | "failed" | string;
type Document = { documentId: string; title: string; originalFilename: string; status: Status; storedChunks?: number; createdAt?: string };
type SearchResult = { doc_id: string; text: string; score: number; document?: Document | null };
type S3Upload = { url: string; method: "PUT"; headers: Record<string, string> };

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const endpoint = (path: string) => `${API}${path}`;
const ownerId = process.env.NEXT_PUBLIC_KNOWLEDGE_BASE_OWNER_ID ?? "default-owner";

const dateLabel = (date?: string) => date ? new Date(date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "Recently added";
const statusClasses = (status: Status, dark: boolean) => status === "ready"
  ? dark ? "bg-emerald-950 text-emerald-300" : "bg-emerald-50 text-emerald-700"
  : status === "failed" ? dark ? "bg-rose-950 text-rose-300" : "bg-rose-50 text-rose-700"
  : dark ? "bg-amber-950 text-amber-300" : "bg-amber-50 text-amber-700";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const readyCount = useMemo(() => documents.filter((document) => document.status === "ready").length, [documents]);

  const loadDocuments = async () => {
    if (!API) { setLoading(false); return; }
    try {
      const response = await fetch(endpoint(`/knowledge-base/documents?ownerId=${encodeURIComponent(ownerId)}`));
      if (!response.ok) throw new Error("Could not load your documents");
      setDocuments(await response.json() as Document[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load documents"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadDocuments(); }, []);

  const chooseFile = (file?: File) => {
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["txt", "md", "docx"].includes(extension)) {
      toast.error("Choose a TXT, Markdown, or DOCX file.");
      return;
    }
    setPendingFile(file);
  };
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { chooseFile(event.target.files?.[0]); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); };

  const uploadPendingFile = async () => {
    const file = pendingFile;
    if (!file) return;
    if (!API) { toast.error("Add NEXT_PUBLIC_API_URL to connect the knowledge-base API."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    const contentType = file.type || "application/octet-stream";
    const toastId = toast.loading(`Uploading ${file.name}...`);
    setUploading(true);
    try {
      const createResponse = await fetch(endpoint("/knowledge-base/documents/upload-url"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType, ownerId, title: file.name }),
      });
      if (!createResponse.ok) throw new Error("Could not create an upload URL");
      const { document, upload } = await createResponse.json() as { document: Document; upload: S3Upload };
      if (!upload?.url) throw new Error("The server did not return an S3 upload URL");
      const uploadResponse = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file, redirect: "error" });
      if (!uploadResponse.ok) throw new Error(`S3 upload failed: ${uploadResponse.status}`);
      const uploaded = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}/uploaded`), { method: "POST" });
      if (!uploaded.ok) throw new Error("The document was uploaded but its status could not be updated");
      const text = extension === "docx" ? (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value : await file.text();
      if (!text.trim()) throw new Error("No readable text was found in this document");
      const ingested = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}/ingest`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!ingested.ok) throw new Error("The document was uploaded but could not be indexed");
      const data = await ingested.json() as { document: Document };
      setDocuments((current) => [data.document, ...current.filter((item) => item.documentId !== data.document.documentId)]);
      setPendingFile(null);
      toast.success("Document uploaded and indexed", { id: toastId });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed", { id: toastId }); }
    finally { setUploading(false); }
  };

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || !API) return;
    setSearching(true);
    try {
      const response = await fetch(endpoint(`/knowledge-base/search?query=${encodeURIComponent(query)}&topK=6`), { method: "POST" });
      if (!response.ok) throw new Error("Search is unavailable right now");
      setResults((await response.json() as { results: SearchResult[] }).results || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Search failed"); }
    finally { setSearching(false); }
  };

  const removeDocument = async (document: Document) => {
    if (!API || !window.confirm(`Delete "${document.title}"? This cannot be undone.`)) return;
    try {
      const response = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}`), { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete this document");
      setDocuments((current) => current.filter((item) => item.documentId !== document.documentId));
      setSelectedDocument((current) => current?.documentId === document.documentId ? null : current);
      toast.success("Document deleted");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Delete failed"); }
  };

  const openDocument = async (document: Document) => {
    setSelectedDocument(document);
    setChunks([]);
    if (!API || document.status !== "ready") return;
    setLoadingDetails(true);
    try {
      const response = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}/chunks`));
      if (!response.ok) throw new Error("Could not load document preview");
      const data = await response.json() as { chunks: { text?: string }[] };
      setChunks(data.chunks.map((chunk) => chunk.text || "").filter(Boolean));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load document preview"); }
    finally { setLoadingDetails(false); }
  };

  const surface = darkMode ? "bg-slate-950 text-slate-100" : "bg-[#f7faff] text-slate-900";
  const card = darkMode ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";

  return <main className={`min-h-screen transition-colors ${surface}`}>
    <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px", fontWeight: 500 } }} />
    <header className={`border-b ${darkMode ? "border-slate-800 bg-slate-950/85" : "border-blue-100 bg-white/85"} sticky top-0 z-20 backdrop-blur-xl`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30"><FiBookOpen /></div><span className="text-lg font-bold">Lumen<span className="text-blue-500">base</span></span></div>
        <div className="flex items-center gap-2"><Link href="/chat" className={`hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold sm:flex ${darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-blue-50"}`}><FiZap className="text-blue-500" /> Ask AI</Link><button onClick={() => setDarkMode((value) => !value)} className={`rounded-xl p-2.5 ${darkMode ? "bg-slate-800 text-amber-300" : "bg-blue-50 text-blue-700"}`} aria-label="Toggle dark mode">{darkMode ? <FiSun /> : <FiMoon />}</button><button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700"><FiPlus /> Add document</button></div>
      </div>
    </header>
    <input ref={inputRef} type="file" className="hidden" accept=".txt,.md,.docx" onChange={onFileChange} />
    <div className="mx-auto max-w-6xl px-5 py-9">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm font-bold uppercase tracking-widest text-blue-500">Knowledge base</p><h1 className="text-3xl font-bold tracking-tight">Your team&apos;s documents, in one place.</h1><p className={`mt-2 text-sm ${muted}`}>Upload documents, then search the knowledge your team has collected.</p></div><div className={`rounded-xl border px-4 py-2 text-center ${card}`}><p className="text-lg font-bold">{readyCount}</p><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Ready to search</p></div></div>
      <form onSubmit={search} className="relative mb-6"><FiSearch className={`absolute left-4 top-1/2 -translate-y-1/2 ${muted}`} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your documents..." className={`w-full rounded-2xl border py-3.5 pl-11 pr-28 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${card}`} /><button disabled={searching} className="absolute right-2 top-2 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{searching ? "Searching" : "Search"}</button></form>
      {results.length > 0 && <div className={`mb-6 rounded-2xl border p-5 ${card}`}><p className={`mb-3 text-sm font-bold ${muted}`}>Search results for “{query}”</p><div className="space-y-2">{results.map((result, index) => <div key={`${result.doc_id}-${index}`} className={`rounded-xl p-3 ${darkMode ? "bg-slate-800" : "bg-blue-50"}`}><div className="mb-1 flex justify-between gap-4"><span className="font-semibold text-blue-500">{result.document?.title || "Document"}</span><span className={`text-xs ${muted}`}>{Math.round(result.score * 100)}% match</span></div><p className={`line-clamp-2 text-sm ${muted}`}>{result.text}</p></div>)}</div></div>}
      <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`mb-8 rounded-2xl border-2 border-dashed p-5 transition ${dragging ? "border-blue-500 bg-blue-500/10" : darkMode ? "border-slate-700 bg-slate-900" : "border-blue-200 bg-white"}`}>
        {pendingFile ? <div className="flex flex-wrap items-center gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-600"><FiFileText /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{pendingFile.name}</p><p className={`text-sm ${muted}`}>{(pendingFile.size / 1024).toFixed(1)} KB · ready to upload</p></div><button onClick={() => setPendingFile(null)} disabled={uploading} className={`rounded-xl px-3 py-2 text-sm font-semibold ${muted}`}>Remove</button><button onClick={uploadPendingFile} disabled={uploading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{uploading ? <FiLoader className="animate-spin" /> : <FiUpload />} {uploading ? "Uploading" : "Upload document"}</button></div> : <div className="flex flex-wrap items-center gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-xl text-blue-600"><FiUpload /></div><div className="flex-1"><p className="font-semibold">Choose a document to upload</p><p className={`text-sm ${muted}`}>TXT, Markdown, and DOCX files are supported.</p></div><button onClick={() => inputRef.current?.click()} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50">Browse files</button></div>}
      </div>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">All folders & documents</h2><button className={`flex items-center gap-1 text-sm ${muted}`}>Newest <FiChevronDown /></button></div>
      <div className={`overflow-hidden rounded-2xl border ${card}`}><div className={`flex items-center gap-3 border-b p-4 ${darkMode ? "border-slate-800" : "border-slate-100"}`}><FiFolder className="text-lg text-blue-500" /><span className="font-semibold">Knowledge base</span><span className={`ml-auto text-xs ${muted}`}>{documents.length} documents</span></div>{loading ? <div className="grid place-items-center py-16 text-blue-500"><FiLoader className="animate-spin text-2xl" /></div> : documents.length === 0 ? <div className={`py-14 text-center ${muted}`}><FiFileText className="mx-auto mb-3 text-3xl text-blue-400" /><p className="font-semibold">No documents yet</p><p className="mt-1 text-sm">Select a file above, then confirm with Upload document.</p></div> : documents.map((document) => <div key={document.documentId} role="button" tabIndex={0} onClick={() => openDocument(document)} onKeyDown={(event) => event.key === "Enter" && openDocument(document)} className={`group flex cursor-pointer items-center gap-3 border-b p-4 last:border-0 ${darkMode ? "border-slate-800 hover:bg-slate-800/70" : "border-slate-100 hover:bg-blue-50/50"}`}><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600"><FiFileText /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{document.title}</p><p className={`mt-0.5 text-xs ${muted}`}>{document.originalFilename} · {dateLabel(document.createdAt)} · {document.storedChunks || 0} chunks</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClasses(document.status, darkMode)}`}>{document.status}</span><button onClick={(event) => { event.stopPropagation(); removeDocument(document); }} className="rounded-lg p-2 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label={`Delete ${document.title}`}><FiTrash2 /></button></div>)}</div>
    </div>
    {selectedDocument && <><button onClick={() => setSelectedDocument(null)} className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[1px]" aria-label="Close document details" /><aside className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l p-6 shadow-2xl ${darkMode ? "border-slate-800 bg-slate-950" : "border-blue-100 bg-white"}`}><div className="mb-7 flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-xl text-blue-600"><FiFileText /></div><button onClick={() => setSelectedDocument(null)} className={`rounded-xl p-2 ${darkMode ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-blue-50"}`} aria-label="Close document details"><FiX /></button></div><h2 className="break-words text-xl font-bold leading-7">{selectedDocument.title}</h2><p className={`mt-1 text-sm ${muted}`}>{selectedDocument.originalFilename}</p><div className={`my-6 grid grid-cols-2 gap-3 border-y py-5 ${darkMode ? "border-slate-800" : "border-slate-100"}`}><div><p className="text-lg font-bold">{selectedDocument.storedChunks || 0}</p><p className={`text-xs ${muted}`}>Indexed chunks</p></div><div><p className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClasses(selectedDocument.status, darkMode)}`}>{selectedDocument.status}</p><p className={`mt-1 text-xs ${muted}`}>Document status</p></div></div><div className="min-h-0 flex-1 overflow-y-auto"><p className={`mb-3 text-xs font-bold uppercase tracking-wider ${muted}`}>Indexed content</p>{loadingDetails ? <div className="grid place-items-center py-10 text-blue-500"><FiLoader className="animate-spin text-xl" /></div> : chunks.length ? <div className="space-y-3">{chunks.slice(0, 5).map((chunk, index) => <div key={index} className={`rounded-xl p-4 text-sm leading-6 ${darkMode ? "bg-slate-900 text-slate-300" : "bg-blue-50 text-slate-600"}`}><p className="mb-2 text-xs font-bold text-blue-500">Chunk {index + 1}</p>{chunk}</div>)}</div> : <p className={`rounded-xl p-4 text-sm ${darkMode ? "bg-slate-900" : "bg-slate-50"} ${muted}`}>{selectedDocument.status === "ready" ? "No chunk preview is available yet." : "This document will have a preview once indexing is complete."}</p>}</div><button onClick={() => removeDocument(selectedDocument)} className="mt-6 flex items-center gap-2 text-sm font-semibold text-rose-600"><FiTrash2 /> Delete document</button></aside></>}
  </main>;
}
