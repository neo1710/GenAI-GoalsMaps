import React from 'react';
import * as XLSX from 'xlsx';
import { FaFileExcel } from 'react-icons/fa';


interface MultiTableExporterProps {
  tableRefs: (HTMLTableElement | null)[];
  contextContent?: string;
  className?: string;
  buttonTitle?: string;
}


const MultiTableExporter: React.FC<MultiTableExporterProps> = ({
  tableRefs,
  contextContent = '',
  className = '',
  buttonTitle = 'Export all tables as Excel'
}) => {


  // Function to extract a relevant title from the bot response content
  const extractRelevantTitle = (content: string): string => {
    if (!content || content.trim().length === 0) {
      return 'Multiple Tables';
    }


    // Clean the content
    const cleanContent = content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\|.*?\|/g, '') // Remove table content
      .replace(/#{1,6}\s*/g, '') // Remove markdown headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
      .replace(/\*(.*?)\*/g, '$1') // Remove italic formatting
      .replace(/\[(.*?)\]/g, '') // Remove citation references
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();


    // Look for meaningful phrases or sentences
    const sentences = cleanContent
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && s.length < 100);


    if (sentences.length > 0) {
      const firstSentence = sentences[0];


      // Look for key phrases that might indicate what the table is about
      const keyPhrases = [
        /(?:table|data|statistics|results|analysis|comparison|overview|summary|report|breakdown|metrics|performance|trends|figures|information) (?:of|about|for|on|showing|regarding) ([\w\s]+)/i,
        /(?:here (?:is|are)|this (?:table|shows)|the following) ([\w\s]+)/i,
        /([\w\s]+) (?:table|data|statistics|results|analysis|comparison|metrics)/i,
        /(?:showing|displaying|presenting) ([\w\s]+)/i
      ];


      for (const pattern of keyPhrases) {
        const match = firstSentence.match(pattern);
        if (match && match[1]) {
          return match[1].trim().substring(0, 50);
        }
      }


      // If no specific pattern, use the first meaningful sentence but limit length
      if (firstSentence.length > 5) {
        return firstSentence.length > 50
          ? firstSentence.substring(0, 50).trim() + '...'
          : firstSentence;
      }
    }


    // Look for the first few meaningful words
    const words = cleanContent.split(/\s+/).filter(word =>
      word.length > 2 &&
      !/^(the|and|or|but|for|with|from|to|of|in|on|at|by|is|are|was|were|has|have|had|will|would|could|should|this|that|these|those)$/i.test(word)
    );


    if (words.length > 0) {
      const titleWords = words.slice(0, 6).join(' ');
      return titleWords.length > 50
        ? titleWords.substring(0, 50).trim() + '...'
        : titleWords;
    }


    // Fallback
    return 'Multiple Tables';
  };


  // Function to generate a safe filename
  const generateFileName = (title: string): string => {
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .toLowerCase()
      .substring(0, 30); // Limit length


    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return `${sanitizedTitle}_${timestamp}.xlsx`;
  };


  // Function to extract table data from a single table
  const extractTableData = (tableRef: HTMLTableElement) => {
    const rows = Array.from(tableRef.querySelectorAll('tr'));
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('td, th'));
      return cells.map(cell => {
        // Get text content and clean it up
        let text = cell.textContent || '';


        // Remove citation markers
        text = text.replace(/\[\[CITATION:\d+\]\]/g, '');
        text = text.replace(/‖CITATION‖\d+‖/g, '');


        // Remove HTML tags that might appear as text (like <br>, <br/>, etc.)
        text = text.replace(/<br\s*\/?>/gi, '\n');
        text = text.replace(/<\/?[^>]+(>|$)/g, '');


        // Decode HTML entities
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");


        // Clean up whitespace
        text = text.trim();
        // Replace multiple spaces with single space
        text = text.replace(/\s{2,}/g, ' ');


        // Convert to number if it looks like a number
        if (/^\d+\.?\d*$/.test(text) && text !== '') {
          return parseFloat(text);
        }


        return text;
      });
    });
  };


  // Function to extract all tables and export as Excel with multiple sheets
  const handleMultiTableExcelDownload = () => {
    // Filter out null refs
    const validTableRefs = tableRefs.filter((ref): ref is HTMLTableElement => ref !== null);


    if (validTableRefs.length === 0) {
      return;
    }


    try {
      // Create workbook
      const wb = XLSX.utils.book_new();


      // Extract title for filename
      const mainTitle = extractRelevantTitle(contextContent);


      // Process each table
      validTableRefs.forEach((tableRef, index) => {
        const tableData = extractTableData(tableRef);


        if (tableData.length === 0) {
          return;
        }


        // Create worksheet
        const ws = XLSX.utils.aoa_to_sheet(tableData);


        // Auto-size columns
        const colWidths = tableData[0]?.map((_, colIndex) => {
          const maxLength = Math.max(
            ...tableData.map(row => {
              const cellValue = row[colIndex];
              return cellValue ? cellValue.toString().length : 0;
            })
          );
          return { wch: Math.min(Math.max(maxLength + 2, 10), 50) }; // Min 10, max 50 chars
        }) || [];


        ws['!cols'] = colWidths;


        // Style the header row if it exists
        if (tableData.length > 0 && ws['!ref']) {
          const range = XLSX.utils.decode_range(ws['!ref']);


          // Apply header styling to first row
          for (let col = range.s.c; col <= range.e.c; col++) {
            const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
            if (headerCell) {
              headerCell.s = {
                font: { bold: true },
                fill: { fgColor: { rgb: 'F3F4F6' } },
                alignment: { horizontal: 'center' }
              };
            }
          }
        }


        // Generate sheet name - use "Table 1", "Table 2", etc. or a portion of the title
        const sheetName = validTableRefs.length === 1
          ? (mainTitle.length > 31 ? mainTitle.substring(0, 31) : mainTitle)
          : `Table ${index + 1}`;


        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });


      // Generate filename
      const filename = generateFileName(mainTitle);


      // Download the file
      XLSX.writeFile(wb, filename);


    } catch (error) {
      // Silent fail - error already logged by XLSX library if needed
    }
  };


  // Only render if we have multiple tables
  if (tableRefs.filter(ref => ref !== null).length < 2) {
    return null;
  }


  return (
    <button
      onClick={handleMultiTableExcelDownload}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600 rounded-md shadow-sm hover:shadow-md transition-all duration-200 ${className}`}
      title={buttonTitle}
    >
      <FaFileExcel className="w-3 h-3" />
      Export All Tables ({tableRefs.filter(ref => ref !== null).length})
    </button>
  );
};


export default MultiTableExporter;