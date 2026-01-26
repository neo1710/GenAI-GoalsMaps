"use client";

import React, { useState } from "react";
import * as mammoth from 'mammoth';
import { uploadDataApi } from "@/lib/uploadDataApi";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  function chunkText(text: string, minSize: number = 500, maxSize: number = 800, overlap: number = 125): string[] {
    // Clean up excessive whitespace but preserve paragraph structure
    const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    
    // Split by double newlines to get paragraphs
    const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 0);
    
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      const potentialChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      
      // If adding this paragraph keeps us within maxSize, add it
      if (potentialChunk.length <= maxSize) {
        currentChunk = potentialChunk;
      } 
      // If current chunk meets minSize, save it and start new chunk with overlap
      else if (currentChunk.length >= minSize) {
        chunks.push(currentChunk);
        
        // Create overlap from the end of previous chunk
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + '\n\n' + para;
      }
      // If single paragraph exceeds maxSize, split it by sentences
      else if (para.length > maxSize) {
        // If we have existing content, save it first
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        
        // Split long paragraph by sentences
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
      // Current chunk is too small and para is too big, just add para and continue
      else {
        currentChunk = potentialChunk;
      }
    }
    
    // Add the last chunk if it meets minimum size or is the only chunk
    if (currentChunk.trim() && (currentChunk.length >= minSize || chunks.length === 0)) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError('');
      setExtractedText('');
      setChunks([]);
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

  const processFile = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError('');

    try {
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

      setExtractedText(text);
      const textChunks = chunkText(text);
      setChunks(textChunks);
      setShowModal(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process file';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const uploadChunks=async (chunks: string[])=> {
    // Placeholder function to demonstrate where chunk upload logic would go
    // This could involve sending chunks to a backend or storing them in a database
    try {
      await uploadDataApi(`${process.env.NEXT_PUBLIC_API_URL}/ragStore`, chunks);
    } catch (error) {
      console.error("Error uploading chunks:", error);
    }


    console.log("Uploading chunks:", chunks);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Document Chunker</h1>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File (PDF, DOCX, TXT)
              </label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
            </div>

            {file && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Selected:</span> {file.name}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Size:</span> {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              onClick={processFile}
              disabled={!file || loading}
              className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Processing...' : 'Extract & Chunk Text'}
            </button>
            <button disabled={!chunks.length} className="p-5 bg-green-700 hover:bg-green-600 color-gray-300" onClick={() => uploadChunks(chunks)}>Upload Chunks</button>

            {chunks.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700">
                  ✓ Successfully created {chunks.length} chunks
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  View Chunks →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">Extracted Data & Chunks</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                  Extracted Text Preview
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {extractedText.substring(0, 500)}
                    {extractedText.length > 500 && '...'}
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Total characters: {extractedText.length}
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-3">
                  Chunks ({chunks.length})
                </h3>
                <div className="space-y-3">
                  {chunks.map((chunk, index) => (
                    <div key={index} className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-indigo-700">
                          Chunk {index + 1}
                        </span>
                        <span className="text-xs text-gray-500">
                          {chunk.length} chars
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {chunk}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => setShowModal(false)}
                className="w-full bg-gray-200 text-gray-800 py-2 px-4 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
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