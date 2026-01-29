"use client";

import React, { useState } from "react";
import * as mammoth from 'mammoth';
import { uploadDataApi } from "@/lib/uploadDataApi";
import toast, { Toaster } from 'react-hot-toast';
import { 
  FiUpload, 
  FiFile, 
  FiCheck, 
  FiX, 
  FiMessageSquare,
  FiMoon,
  FiSun,
  FiEye,
  FiLoader
} from 'react-icons/fi';
import Link from 'next/link';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);

  function chunkText(text: string, minSize: number = 500, maxSize: number = 800, overlap: number = 125): string[] {
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 0);
    
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      const potentialChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      
      if (potentialChunk.length <= maxSize) {
        currentChunk = potentialChunk;
      } 
      else if (currentChunk.length >= minSize) {
        chunks.push(currentChunk);
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + para;
      }
      else if (para.length > maxSize) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
        let sentenceChunk = '';
        
        for (const sentence of sentences) {
          const potentialSentenceChunk = sentenceChunk ? sentenceChunk + ' ' + sentence : sentence;
          
          if (potentialSentenceChunk.length <= maxSize) {
            sentenceChunk = potentialSentenceChunk;
          } else {
            if (sentenceChunk.length >= minSize) {
              chunks.push(sentenceChunk);
              const overlapText = sentenceChunk.slice(-overlap);
              sentenceChunk = overlapText + ' ' + sentence;
            } else {
              sentenceChunk = potentialSentenceChunk;
            }
          }
        }
        
        currentChunk = sentenceChunk;
      }
      else {
        currentChunk = potentialChunk;
      }
    }
    
    if (currentChunk.trim() && (currentChunk.length >= minSize || chunks.length === 0)) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
      const validTypes = ['pdf', 'docx', 'doc', 'txt'];
      
      if (!validTypes.includes(fileType || '')) {
        toast.error('Invalid file type. Please select PDF, DOCX, or TXT files.');
        return;
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (selectedFile.size > maxSize) {
        toast.error('File size exceeds 10MB limit.');
        return;
      }

      setFile(selectedFile);
      setExtractedText('');
      setChunks([]);
      toast.success(`File "${selectedFile.name}" selected successfully!`);
    }
  };

  const extractTextFromPDF = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = e.target?.result;
          if (!result || typeof result === 'string') {
            throw new Error('Invalid file data');
          }
          
          const typedArray = new Uint8Array(result);
          const pdfjsLib = (window as any)['pdfjs-dist/build/pdf'];
          
          if (!pdfjsLib) {
            throw new Error('PDF.js library not loaded');
          }
          
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
          let fullText = '';
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
          }
          
          resolve(fullText);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const extractTextFromWord = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result;
          if (!arrayBuffer || typeof arrayBuffer === 'string') {
            throw new Error('Invalid file data');
          }
          
          const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer as ArrayBuffer });
          resolve(result.value);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  const extractTextFromTxt = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to read text file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  const processAndUpload = async () => {
    if (!file) {
      toast.error('Please select a file first');
      return;
    }

    const toastId = toast.loading('Extracting text...');

    try {
      setLoading(true);
      let text = '';
      const fileType = file.name.split('.').pop()?.toLowerCase();

      if (fileType === 'pdf') {
        text = await extractTextFromPDF(file);
      } else if (fileType === 'docx' || fileType === 'doc') {
        text = await extractTextFromWord(file);
      } else if (fileType === 'txt') {
        text = await extractTextFromTxt(file);
      } else {
        throw new Error('Unsupported file type. Please use PDF, DOCX, or TXT files.');
      }

      if (!text.trim()) {
        throw new Error('No text content found in the file');
      }

      setExtractedText(text);

      toast.loading('Chunking text...', { id: toastId });

      const textChunks = chunkText(text);
      setChunks(textChunks);

      setLoading(false);

      toast.loading('Uploading chunks...', { id: toastId });

      setUploading(true);
      await uploadDataApi(`${process.env.NEXT_PUBLIC_API_URL}/ragStore`, textChunks);
      setUploading(false);

      toast.success(`Successfully processed and uploaded ${textChunks.length} chunks!`, {
        id: toastId,
        duration: 3000,
      });
       setFile(null);
    } catch (err) {
      setLoading(false);
      setUploading(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to process and upload file';
      toast.error(errorMessage, { id: toastId });
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50'
    } p-4 sm:p-8`}>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: darkMode ? '#1f2937' : '#fff',
            color: darkMode ? '#f3f4f6' : '#1f2937',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      {/* Header */}
      <div className="max-w-4xl mx-auto mb-6 flex justify-between items-center">
        <Link 
          href="/chat"
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all duration-300 ${
            darkMode
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-white hover:bg-gray-50 text-gray-800 shadow-md hover:shadow-lg'
          }`}
        >
          <FiMessageSquare className="text-lg" />
          <span>Go to Chat</span>
        </Link>

        <button
          onClick={toggleDarkMode}
          className={`p-3 rounded-lg transition-all duration-300 ${
            darkMode
              ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400'
              : 'bg-white hover:bg-gray-50 text-gray-800 shadow-md hover:shadow-lg'
          }`}
          aria-label="Toggle dark mode"
        >
          {darkMode ? <FiSun className="text-xl" /> : <FiMoon className="text-xl" />}
        </button>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className={`rounded-2xl shadow-2xl p-6 sm:p-8 transition-colors duration-300 ${
          darkMode ? 'bg-gray-800' : 'bg-white'
        }`}>
          {/* Title */}
          <div className="mb-8">
            <h1 className={`text-3xl sm:text-4xl font-bold mb-2 ${
              darkMode ? 'text-white' : 'text-gray-800'
            }`}>
              Document Uploader for RAG Agent
            </h1>
            <p className={`text-sm sm:text-base ${
              darkMode ? 'text-gray-400' : 'text-gray-600'
            }`}>
              Extract, chunk, and upload text from your documents for AI processing in your RAG agent.
            </p>
          </div>
          
          <div className="space-y-6">
            {/* File Upload */}
            <div>
              <label className={`block text-sm font-medium mb-3 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Select File (PDF, DOCX, TXT)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                  disabled={loading || uploading}
                />
                <label
                  htmlFor="file-upload"
                  className={`flex items-center justify-center gap-3 w-full p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 ${
                    darkMode
                      ? 'border-gray-600 hover:border-indigo-500 bg-gray-700 hover:bg-gray-600'
                      : 'border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-gray-100'
                  } ${loading || uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <FiUpload className={`text-2xl ${
                    darkMode ? 'text-indigo-400' : 'text-indigo-600'
                  }`} />
                  <span className={`font-medium ${
                    darkMode ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {file ? 'Change File' : 'Click to upload or drag and drop'}
                  </span>
                </label>
              </div>
            </div>

            {/* File Info */}
            {file && (
              <div className={`rounded-xl p-4 border transition-colors duration-300 ${
                darkMode
                  ? 'bg-gray-700 border-gray-600'
                  : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200'
              }`}>
                <div className="flex items-start gap-3">
                  <FiFile className={`text-2xl mt-1 ${
                    darkMode ? 'text-indigo-400' : 'text-indigo-600'
                  }`} />
                  <div className="flex-1">
                    <p className={`font-semibold mb-1 ${
                      darkMode ? 'text-white' : 'text-gray-800'
                    }`}>
                      {file.name}
                    </p>
                    <p className={`text-sm ${
                      darkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Size: {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setExtractedText('');
                      setChunks([]);
                      toast.success('File removed');
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode
                        ? 'hover:bg-gray-600 text-gray-400 hover:text-white'
                        : 'hover:bg-white text-gray-600 hover:text-gray-800'
                    }`}
                    disabled={loading || uploading}
                  >
                    <FiX className="text-xl" />
                  </button>
                </div>
              </div>
            )}

            {/* Action Button */}
            <button
              onClick={processAndUpload}
              disabled={!file || loading || uploading}
              className={`flex items-center justify-center gap-2 py-4 px-6 rounded-xl font-semibold transition-all duration-300 w-full ${
                !file || loading || uploading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : darkMode
                  ? 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/50'
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg hover:shadow-indigo-500/50'
              } text-white`}
            >
              {loading ? (
                <>
                  <FiLoader className="animate-spin text-xl" />
                  <span>Processing...</span>
                </>
              ) : uploading ? (
                <>
                  <FiLoader className="animate-spin text-xl" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <FiUpload className="text-xl" />
                  <span>Process and Upload</span>
                </>
              )}
            </button>

            {/* Success Message */}
            {chunks.length > 0 && (
              <div className={`rounded-xl left-5 bottom-5 absolute w-[250px] p-4 border transition-colors duration-300 ${
                darkMode
                  ? 'bg-green-900/20 border-green-800'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className={`font-semibold text-sm ${
                        darkMode ? 'text-green-400' : 'text-green-700'
                      }`}>
                        Created {chunks.length} chunks
                      </p>
                      <p className={`text-sm ${
                        darkMode ? 'text-green-500' : 'text-green-600'
                      }`}>
                        Total characters: {extractedText.length.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowModal(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      darkMode
                        ? 'bg-green-800 hover:bg-green-700 text-green-200'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    <FiEye />
                    <span>View</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className={`rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col transition-colors duration-300 ${
            darkMode ? 'bg-gray-800' : 'bg-white'
          }`}>
            {/* Modal Header */}
            <div className={`p-6 border-b flex justify-between items-center ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <h2 className={`text-2xl font-bold ${
                darkMode ? 'text-white' : 'text-gray-800'
              }`}>
                Extracted Data & Chunks
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'hover:bg-gray-700 text-gray-400 hover:text-white'
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }`}
              >
                <FiX className="text-2xl" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Extracted Text Preview */}
              <div>
                <h3 className={`text-lg font-semibold mb-3 flex items-center gap-2 ${
                  darkMode ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  <FiFile className="text-xl" />
                  Extracted Text Preview
                </h3>
                <div className={`rounded-xl p-4 max-h-48 overflow-y-auto transition-colors duration-300 ${
                  darkMode ? 'bg-gray-700' : 'bg-gray-50'
                }`}>
                  <p className={`text-sm whitespace-pre-wrap ${
                    darkMode ? 'text-gray-300' : 'text-gray-600'
                  }`}>
                    {extractedText.substring(0, 500)}
                    {extractedText.length > 500 && '...'}
                  </p>
                </div>
                <p className={`text-xs mt-2 ${
                  darkMode ? 'text-gray-500' : 'text-gray-500'
                }`}>
                  Total characters: {extractedText.length.toLocaleString()}
                </p>
              </div>

              {/* Chunks */}
              <div>
                <h3 className={`text-lg font-semibold mb-3 flex items-center gap-2 ${
                  darkMode ? 'text-gray-200' : 'text-gray-700'
                }`}>
                  <FiCheck className="text-xl" />
                  Chunks ({chunks.length})
                </h3>
                <div className="space-y-3">
                  {chunks.map((chunk, index) => (
                    <div 
                      key={index} 
                      className={`rounded-xl p-4 border transition-colors duration-300 ${
                        darkMode
                          ? 'bg-gray-700 border-gray-600'
                          : 'bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className={`text-sm font-semibold ${
                          darkMode ? 'text-indigo-400' : 'text-indigo-700'
                        }`}>
                          Chunk {index + 1}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-md ${
                          darkMode ? 'bg-gray-600 text-gray-300' : 'bg-white text-gray-600'
                        }`}>
                          {chunk.length} chars
                        </span>
                      </div>
                      <p className={`text-sm whitespace-pre-wrap ${
                        darkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {chunk}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`p-6 border-t ${
              darkMode ? 'border-gray-700' : 'border-gray-200'
            }`}>
              <button
                onClick={() => setShowModal(false)}
                className={`w-full py-3 px-4 rounded-xl font-semibold transition-colors ${
                  darkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                }`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    </div>
  );
}