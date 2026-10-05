"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast, { Toaster } from "react-hot-toast";
import * as mammoth from "mammoth";
import { FiBookOpen, FiCheck, FiChevronDown, FiDownload, FiFileText, FiFolder, FiGitBranch, FiLoader, FiPlus, FiSearch, FiTrash2, FiUpload, FiX, FiZap } from "react-icons/fi";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import ThemeToggle from "@/components/ThemeToggle";

type Status = "uploaded" | "processing" | "ready" | "failed" | string;
type Folder = { folderId: string; name: string; ownerId?: string; createdAt?: string };
type Document = { documentId: string; title: string; originalFilename: string; status: Status; storedChunks?: number; createdAt?: string; folderId?: string };
type SearchResult = { doc_id: string; text: string; score: number; document?: Document | null };
type S3Upload = { url: string; method: "PUT"; headers: Record<string, string> };

const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";
const endpoint = (path: string) => `${API}${path}`;
const ownerId = process.env.NEXT_PUBLIC_KNOWLEDGE_BASE_OWNER_ID ?? "default-owner";
const dateLabel = (date?: string) => date ? new Date(date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "Recently added";
const statusClasses = (status: Status, dark: boolean) => status === "ready" ? dark ? "bg-emerald-950 text-emerald-300" : "bg-emerald-50 text-emerald-700" : status === "failed" ? dark ? "bg-rose-950 text-rose-300" : "bg-rose-50 text-rose-700" : dark ? "bg-amber-950 text-amber-300" : "bg-amber-50 text-amber-700";

export default function Home() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const darkMode = useSelector((state: RootState) => state.theme.mode === "dark");
  const readyCount = useMemo(() => documents.filter((document) => document.status === "ready").length, [documents]);
  const activeFolder = folders.find((folder) => folder.folderId === activeFolderId);
  const visibleDocuments = activeFolderId ? documents.filter((document) => document.folderId === activeFolderId) : documents.filter((document) => !document.folderId);

  const loadKnowledgeBase = async () => {
    if (!API) { setLoading(false); return; }
    try {
      const [documentsResponse, foldersResponse] = await Promise.all([
        fetch(endpoint(`/knowledge-base/documents?ownerId=${encodeURIComponent(ownerId)}`)),
        fetch(endpoint(`/knowledge-base/folders?ownerId=${encodeURIComponent(ownerId)}`)),
      ]);
      if (!documentsResponse.ok) throw new Error("Could not load your documents");
      setDocuments(await documentsResponse.json() as Document[]);
      // Folder listing was added alongside folder creation. Keep documents usable if an older API is deployed.
      if (foldersResponse.ok) setFolders(await foldersResponse.json() as Folder[]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not load knowledge base"); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadKnowledgeBase(); }, []);

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (!["txt", "md", "docx"].includes(file.name.split(".").pop()?.toLowerCase() || "")) return toast.error("Choose a TXT, Markdown, or DOCX file.");
    setPendingFile(file);
  };
  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => { chooseFile(event.target.files?.[0]); event.target.value = ""; };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); };

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name || !API) return;
    setCreating(true);
    try {
      const response = await fetch(endpoint("/knowledge-base/folders"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ownerId }) });
      if (!response.ok) throw new Error("Could not create the folder");
      const folder = await response.json() as Folder;
      setFolders((current) => [folder, ...current]);
      setActiveFolderId(folder.folderId);
      setNewFolderName(""); setCreatingFolder(false);
      toast.success("Folder created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create folder"); }
    finally { setCreating(false); }
  };

  const uploadPendingFile = async () => {
    const file = pendingFile;
    if (!file || !API) return toast.error(API ? "Select a file first." : "Add NEXT_PUBLIC_API_URL to connect the knowledge-base API.");
    const toastId = toast.loading(`Uploading ${file.name}…`); setUploading(true);
    try {
      const uploadPath = activeFolderId ? `/knowledge-base/folders/${activeFolderId}/documents/upload-url` : "/knowledge-base/documents/upload-url";
      const createResponse = await fetch(endpoint(uploadPath), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", ownerId, title: file.name }) });
      if (!createResponse.ok) throw new Error("Could not prepare the upload");
      const { document, upload } = await createResponse.json() as { document: Document; upload: S3Upload };
      const uploadResponse = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: file, redirect: "error" });
      if (!uploadResponse.ok) throw new Error(`Source upload failed (${uploadResponse.status})`);
      if (!(await fetch(endpoint(`/knowledge-base/documents/${document.documentId}/uploaded`), { method: "POST" })).ok) throw new Error("The upload could not be confirmed");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const text = extension === "docx" ? (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value : await file.text();
      if (!text.trim()) throw new Error("No readable text was found in this document");
      const indexed = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}/ingest`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (!indexed.ok) throw new Error("The document was uploaded but could not be indexed");
      const data = await indexed.json() as { document: Document };
      setDocuments((current) => [data.document, ...current.filter((item) => item.documentId !== data.document.documentId)]);
      setPendingFile(null); toast.success("Document uploaded and indexed", { id: toastId });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Upload failed", { id: toastId }); }
    finally { setUploading(false); }
  };

  const search = async (event: FormEvent) => {
    event.preventDefault(); if (!query.trim() || !API) return;
    setSearching(true);
    try { const response = await fetch(endpoint(`/knowledge-base/search?query=${encodeURIComponent(query)}&topK=6`), { method: "POST" }); if (!response.ok) throw new Error("Search is unavailable right now"); setResults((await response.json() as { results: SearchResult[] }).results || []); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Search failed"); }
    finally { setSearching(false); }
  };
  const removeDocument = async (document: Document) => {
    if (!API || !window.confirm(`Delete “${document.title}”? This cannot be undone.`)) return;
    try { const response = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}`), { method: "DELETE" }); if (!response.ok) throw new Error("Could not delete this document"); setDocuments((current) => current.filter((item) => item.documentId !== document.documentId)); setSelectedDocument(null); toast.success("Document deleted"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Delete failed"); }
  };
  const openDocument = async (document: Document) => {
    setSelectedDocument(document); setChunks([]); if (!API || document.status !== "ready") return;
    setLoadingDetails(true);
    try { const response = await fetch(endpoint(`/knowledge-base/documents/${document.documentId}/chunks`)); if (!response.ok) throw new Error("Could not load document preview"); const data = await response.json() as { chunks: { text?: string }[] }; setChunks(data.chunks.map((chunk) => chunk.text || "").filter(Boolean)); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not load document preview"); }
    finally { setLoadingDetails(false); }
  };
  const downloadSource = async () => {
    if (!selectedDocument || !API) return;
    try { const response = await fetch(endpoint(`/knowledge-base/documents/${selectedDocument.documentId}/download-url`)); if (!response.ok) throw new Error("Could not retrieve the source document"); const { url } = await response.json() as { url: string }; window.open(url, "_blank", "noopener,noreferrer"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not open the document"); }
  };

  const surface = darkMode ? "bg-slate-950 text-slate-100" : "bg-[#f7faff] text-slate-900";
  const card = darkMode ? "border-slate-800 bg-slate-900" : "border-blue-100 bg-white";
  const muted = darkMode ? "text-slate-400" : "text-slate-500";
  return <main className={`min-h-screen transition-colors ${surface}`}>
    <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px", fontWeight: 500 } }} />
    <header className={`sticky top-0 z-20 border-b backdrop-blur-xl ${darkMode ? "border-slate-800 bg-slate-950/85" : "border-blue-100 bg-white/85"}`}><div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-5 sm:py-4"><Link href="/" aria-label="Lumenbase home" className="flex shrink-0 items-center gap-2 sm:gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 sm:h-10 sm:w-10"><FiBookOpen /></span><span className="text-base font-bold sm:text-lg">Lumen<span className="text-blue-500">base</span></span></Link><nav aria-label="Main navigation" className={`flex items-center gap-0.5 rounded-xl border p-1 sm:gap-1 ${darkMode ? "border-slate-800 bg-slate-900/70" : "border-blue-100 bg-blue-50/60"}`}><Link href="/" aria-label="Knowledge base" title="Knowledge base" aria-current="page" className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-blue-600 sm:px-3 ${darkMode ? "bg-slate-800" : "bg-white shadow-sm"}`}><FiBookOpen /><span className="hidden md:inline">Knowledge base</span></Link><Link href="/chat" aria-label="Ask AI" title="Ask AI" className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold ${darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-white"}`}><FiZap className="text-blue-500" /><span className="hidden md:inline">Ask AI</span></Link><Link href="/workflows" aria-label="Workflows" title="Workflows" className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold ${darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-white"}`}><FiGitBranch className="text-blue-500" /><span className="hidden md:inline">Workflows</span></Link></nav><div className="flex shrink-0 items-center gap-1.5 sm:gap-2"><ThemeToggle /><button onClick={() => inputRef.current?.click()} aria-label="Add document" title="Add document" className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-700 sm:w-auto sm:px-4"><FiPlus /><span className="hidden sm:inline">Add document</span></button></div></div></header>
    <input ref={inputRef} type="file" className="hidden" accept=".txt,.md,.docx" onChange={onFileChange} />
    <div className="mx-auto max-w-6xl px-5 py-9"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm font-bold uppercase tracking-widest text-blue-500">Knowledge base</p><h1 className="text-3xl font-bold tracking-tight">Your team&apos;s documents, in one place.</h1><p className={`mt-2 text-sm ${muted}`}>Organize sources into folders, then search every indexed insight.</p></div><div className={`rounded-xl border px-4 py-2 text-center ${card}`}><p className="text-lg font-bold">{readyCount}</p><p className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Ready to search</p></div></div>
      <form onSubmit={search} className="relative mb-6"><FiSearch className={`absolute left-4 top-1/2 -translate-y-1/2 ${muted}`} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your documents…" className={`w-full rounded-2xl border py-3.5 pl-11 pr-28 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${card}`} /><button disabled={searching} className="absolute right-2 top-2 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{searching ? "Searching" : "Search"}</button></form>
      {results.length > 0 && <div className={`mb-6 rounded-2xl border p-5 ${card}`}><p className={`mb-3 text-sm font-bold ${muted}`}>Search results for “{query}”</p><div className="space-y-2">{results.map((result, index) => <button type="button" onClick={() => result.document && openDocument(result.document)} key={`${result.doc_id}-${index}`} className={`w-full rounded-xl p-3 text-left ${darkMode ? "bg-slate-800 hover:bg-slate-700" : "bg-blue-50 hover:bg-blue-100"}`}><div className="mb-1 flex justify-between gap-4"><span className="font-semibold text-blue-500">{result.document?.title || "Document"}</span><span className={`text-xs ${muted}`}>{Math.round(result.score * 100)}% match</span></div><p className={`line-clamp-2 text-sm ${muted}`}>{result.text}</p></button>)}</div></div>}
      <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto]"><div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} className={`rounded-2xl border-2 border-dashed p-5 transition ${dragging ? "border-blue-500 bg-blue-500/10" : darkMode ? "border-slate-700 bg-slate-900" : "border-blue-200 bg-white"}`}>{pendingFile ? <div className="flex flex-wrap items-center gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-600"><FiFileText /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{pendingFile.name}</p><p className={`text-sm ${muted}`}>Uploading to {activeFolder?.name || "Knowledge base"}</p></div><button onClick={() => setPendingFile(null)} disabled={uploading} className={`rounded-xl px-3 py-2 text-sm font-semibold ${muted}`}>Remove</button><button onClick={uploadPendingFile} disabled={uploading} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">{uploading ? <FiLoader className="animate-spin" /> : <FiUpload />}{uploading ? "Uploading" : "Upload"}</button></div> : <div className="flex flex-wrap items-center gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-xl text-blue-600"><FiUpload /></div><div className="flex-1"><p className="font-semibold">Add knowledge to {activeFolder?.name || "your library"}</p><p className={`text-sm ${muted}`}>Drop a TXT, Markdown, or DOCX file here.</p></div><button onClick={() => inputRef.current?.click()} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold text-blue-600 hover:bg-blue-50">Browse files</button></div>}</div><button onClick={() => setCreatingFolder(true)} className={`flex items-center justify-center gap-2 rounded-2xl border px-5 py-4 text-sm font-bold ${darkMode ? "border-slate-700 bg-slate-900 text-blue-300 hover:bg-slate-800" : "border-blue-200 bg-white text-blue-600 hover:bg-blue-50"}`}><FiFolder /> New folder</button></div>
      <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-3"><button onClick={() => setActiveFolderId(null)} className={`rounded-lg px-2 py-1 text-lg font-bold ${!activeFolderId ? "text-blue-600" : muted}`}>All files</button>{activeFolder && <><FiChevronDown className="rotate-90 text-blue-400" /><span className="font-semibold">{activeFolder.name}</span></>}</div><button className={`flex items-center gap-1 text-sm ${muted}`}>Newest <FiChevronDown /></button></div>
      <div className="mb-5 flex gap-3 overflow-x-auto pb-2"><button onClick={() => setActiveFolderId(null)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${!activeFolderId ? "border-blue-500 bg-blue-600 text-white" : card}`}><FiBookOpen /> Library <span className="opacity-70">{documents.filter((item) => !item.folderId).length}</span></button>{folders.map((folder) => <button key={folder.folderId} onClick={() => setActiveFolderId(folder.folderId)} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${activeFolderId === folder.folderId ? "border-blue-500 bg-blue-600 text-white" : card}`}><FiFolder /> {folder.name} <span className="opacity-70">{documents.filter((item) => item.folderId === folder.folderId).length}</span></button>)}</div>
      <div className={`overflow-hidden rounded-2xl border ${card}`}><div className={`flex items-center gap-3 border-b p-4 ${darkMode ? "border-slate-800" : "border-slate-100"}`}><FiFolder className="text-lg text-blue-500" /><span className="font-semibold">{activeFolder?.name || "Library"}</span><span className={`ml-auto text-xs ${muted}`}>{visibleDocuments.length} documents</span></div>{loading ? <div className="grid place-items-center py-16 text-blue-500"><FiLoader className="animate-spin text-2xl" /></div> : visibleDocuments.length === 0 ? <div className={`py-14 text-center ${muted}`}><FiFileText className="mx-auto mb-3 text-3xl text-blue-400" /><p className="font-semibold">Nothing here yet</p><p className="mt-1 text-sm">Upload a document to start building this collection.</p></div> : visibleDocuments.map((document) => <div key={document.documentId} role="button" tabIndex={0} onClick={() => openDocument(document)} onKeyDown={(event) => event.key === "Enter" && openDocument(document)} className={`group flex cursor-pointer items-center gap-3 border-b p-4 last:border-0 ${darkMode ? "border-slate-800 hover:bg-slate-800/70" : "border-slate-100 hover:bg-blue-50/50"}`}><div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600"><FiFileText /></div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{document.title}</p><p className={`mt-0.5 text-xs ${muted}`}>{document.originalFilename} · {dateLabel(document.createdAt)} · {document.storedChunks || 0} chunks</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClasses(document.status, darkMode)}`}>{document.status}</span><button onClick={(event) => { event.stopPropagation(); removeDocument(document); }} className="rounded-lg p-2 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100" aria-label={`Delete ${document.title}`}><FiTrash2 /></button></div>)}</div>
    </div>
    {creatingFolder && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/35 p-5 backdrop-blur-sm"><form onSubmit={createFolder} className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${darkMode ? "border-slate-700 bg-slate-900" : "border-blue-100 bg-white"}`}><div className="mb-5 flex items-start justify-between"><div><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600"><FiFolder /></div><h2 className="text-lg font-bold">Create a folder</h2><p className={`mt-1 text-sm ${muted}`}>Keep related documents together.</p></div><button type="button" onClick={() => setCreatingFolder(false)} className={`rounded-lg p-2 ${muted}`}><FiX /></button></div><input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="e.g. Product research" className={`w-full rounded-xl border px-3.5 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 ${card}`} /><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreatingFolder(false)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${muted}`}>Cancel</button><button disabled={creating || !newFolderName.trim()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{creating ? <FiLoader className="animate-spin" /> : <FiCheck />} Create folder</button></div></form></div>}
    {selectedDocument && <><button onClick={() => setSelectedDocument(null)} className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[1px]" aria-label="Close document details" /><aside className={`fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l p-6 shadow-2xl ${darkMode ? "border-slate-800 bg-slate-950" : "border-blue-100 bg-white"}`}><div className="mb-7 flex items-start justify-between"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-xl text-blue-600"><FiFileText /></div><button onClick={() => setSelectedDocument(null)} className={`rounded-xl p-2 ${muted}`}><FiX /></button></div><h2 className="break-words text-xl font-bold leading-7">{selectedDocument.title}</h2><p className={`mt-1 text-sm ${muted}`}>{selectedDocument.originalFilename}</p><div className={`my-6 grid grid-cols-2 gap-3 border-y py-5 ${darkMode ? "border-slate-800" : "border-slate-100"}`}><div><p className="text-lg font-bold">{selectedDocument.storedChunks || 0}</p><p className={`text-xs ${muted}`}>Indexed chunks</p></div><div><p className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClasses(selectedDocument.status, darkMode)}`}>{selectedDocument.status}</p><p className={`mt-1 text-xs ${muted}`}>Document status</p></div></div><button onClick={downloadSource} className={`mb-5 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${darkMode ? "border-slate-700 text-blue-300 hover:bg-slate-900" : "border-blue-200 text-blue-600 hover:bg-blue-50"}`}><FiDownload /> Open original document</button><div className="min-h-0 flex-1 overflow-y-auto"><p className={`mb-3 text-xs font-bold uppercase tracking-wider ${muted}`}>Indexed content</p>{loadingDetails ? <div className="grid place-items-center py-10 text-blue-500"><FiLoader className="animate-spin text-xl" /></div> : chunks.length ? <div className="space-y-3">{chunks.slice(0, 5).map((chunk, index) => <div key={index} className={`rounded-xl p-4 text-sm leading-6 ${darkMode ? "bg-slate-900 text-slate-300" : "bg-blue-50 text-slate-600"}`}><p className="mb-2 text-xs font-bold text-blue-500">Chunk {index + 1}</p>{chunk}</div>)}</div> : <p className={`rounded-xl p-4 text-sm ${darkMode ? "bg-slate-900" : "bg-slate-50"} ${muted}`}>{selectedDocument.status === "ready" ? "No chunk preview is available yet." : "This document will have a preview once indexing is complete."}</p>}</div><button onClick={() => removeDocument(selectedDocument)} className="mt-6 flex items-center gap-2 text-sm font-semibold text-rose-600"><FiTrash2 /> Delete document</button></aside></>}
  </main>;
}
