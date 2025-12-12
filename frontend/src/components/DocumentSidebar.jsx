import React, { useState, useEffect, useRef } from 'react';
import { X, Maximize2, Minimize2, Search, FileText, Code } from 'lucide-react';
import Mark from 'mark.js';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export default function DocumentSidebar({ isOpen, onClose, content, highlight, filename }) {
    const [viewMode, setViewMode] = useState('preview'); // 'preview' or 'source'
    const contentRef = useRef(null);
    const [isExpanded, setIsExpanded] = useState(false);

    const isHtmlDoc = content && (content.trim().toLowerCase().startsWith('<!doctype') || 
                      content.trim().toLowerCase().startsWith('<html'));

    const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Robust Regex Generation for "Sequence of Words"
    const getFlexibleRegex = (term) => {
        if (!term || term.length < 2) return null;

        // 1. Split by non-word characters (including |) to get meaningful words
        // We use a broad definition of "word" to include alphanumeric chars.
        // Filter out short words if necessary, but keeping them is safer for exactness.
        const words = term.split(/[^a-zA-Z0-9_]+/).filter(w => w.length > 0);

        if (words.length === 0) return null;

        // 2. Escape each word
        const escapedWords = words.map(escapeRegExp);

        // 3. Join words with a pattern that matches "junk"
        // Junk = any sequence of non-word characters (whitespace, punctuation, markdown chars, pipes)
        // We use [\W_] to match non-alphanumeric characters.
        // We allow for a reasonable amount of junk between words (e.g. up to 100 chars) to avoid matching across the whole doc.
        // But simpler is just [\W_]+ which matches one or more non-word chars.
        // To be safe against "VSTAT" matching "VSTAT" without junk, we use * if we want optional junk, 
        // but usually words are separated by something.
        // However, "A=Active" -> "A", "Active". Separator is "=".
        const separator = '[\\W_]+'; 
        
        const pattern = escapedWords.join(separator);

        try {
            return new RegExp(pattern, 'gi');
        } catch (e) { return null; }
    };

    // Effect for Highlighting
    useEffect(() => {
        if (isOpen && contentRef.current && highlight && !isHtmlDoc) {
            const instance = new Mark(contentRef.current);
            instance.unmark();

            // Strategy 1: Exact Match (Best for simple cases)
            instance.mark(highlight, {
                element: "mark",
                className: "bg-yellow-200 text-gray-900 px-0.5 rounded",
                separateWordSearch: false,
                acrossElements: true,
                done: (total) => {
                    if (total > 0) {
                        scrollToHighlight();
                        return;
                    }

                    // Strategy 2: Flexible Regex (Sequence of Words)
                    // This handles the case where search term has | separators but content doesn't (Preview mode)
                    // or content has markdown chars but search term doesn't.
                    const regex = getFlexibleRegex(highlight);
                    if (regex) {
                        instance.markRegExp(regex, {
                            element: "mark",
                            className: "bg-yellow-200 text-gray-900 px-0.5 rounded",
                            acrossElements: true,
                            done: (totalRegex) => {
                                if (totalRegex > 0) {
                                    scrollToHighlight();
                                } else {
                                    // Strategy 3: Fallback to simple "Preview Regex" if the sequence is too strict
                                    // (e.g. if words are merged or split differently)
                                    const simpleRegex = getPreviewRegex(highlight);
                                    if (simpleRegex) {
                                        instance.markRegExp(simpleRegex, {
                                            element: "mark",
                                            className: "bg-yellow-200 text-gray-900 px-0.5 rounded",
                                            acrossElements: true,
                                            done: () => scrollToHighlight()
                                        });
                                    }
                                }
                            }
                        });
                    }
                }
            });
        }
    }, [viewMode, highlight, content, isOpen]);

    const scrollToHighlight = () => {
        setTimeout(() => {
            const mark = contentRef.current?.querySelector('mark');
            if (mark) {
                mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const renderContent = () => {
        if (!content) return <div className="text-slate-400 text-center mt-10 font-medium">No content loaded</div>;

        if (viewMode === 'preview') {
            if (isHtmlDoc) {
                return (
                    <iframe 
                        title="Document Preview"
                        srcDoc={content}
                        className="w-full h-full border-none bg-white"
                        sandbox="allow-scripts allow-same-origin" 
                    />
                );
            }

            // Convert markdown to HTML if it looks like markdown, or just display HTML
            // Assuming content might be markdown or plain text
            const htmlContent = marked.parse(content);
            const sanitized = DOMPurify.sanitize(htmlContent);
            return (
                <div 
                    className="prose prose-sm prose-slate max-w-none text-slate-800"
                    dangerouslySetInnerHTML={{ __html: sanitized }} 
                />
            );
        } else {
            return (
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                    {content}
                </pre>
            );
        }
    };

    return (
        <>
            {/* Backdrop for mobile or when needed */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-20 transition-opacity" 
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <div 
                className={`fixed right-0 top-0 bottom-0 bg-white/95 backdrop-blur-xl shadow-2xl transform transition-transform duration-300 ease-out z-30 flex flex-col border-l border-slate-200 
                ${isOpen ? 'translate-x-0' : 'translate-x-full'} 
                ${isExpanded ? 'w-[90vw] md:w-[800px]' : 'w-[90vw] md:w-[500px]'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex-none">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
                            <FileText className="w-4 h-4 flex-none" />
                        </div>
                        <h3 className="font-bold text-slate-800 truncate text-sm" title={filename}>
                            {filename || 'Document Preview'}
                        </h3>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title={isExpanded ? "Collapse width" : "Expand width"}
                        >
                            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 bg-white flex-none">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button
                            onClick={() => setViewMode('preview')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <FileText size={12} /> Preview
                        </button>
                        <button
                            onClick={() => setViewMode('source')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'source' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Code size={12} /> Source
                        </button>
                    </div>
                    {highlight && (
                        <div className="ml-auto flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200 max-w-[200px] shadow-sm">
                            <Search size={12} className="flex-none" />
                            <span className="truncate font-bold" title={highlight}>{highlight}</span>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                <div className={`flex-1 overflow-y-auto bg-white relative scroll-smooth ${isHtmlDoc && viewMode === 'preview' ? 'p-0' : 'p-6'}`} ref={contentRef}>
                    {renderContent()}
                </div>
            </div>
        </>
    );
}
