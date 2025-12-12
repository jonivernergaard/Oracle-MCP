import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';
import * as XLSX from 'xlsx';
import { Database, Play, AlertCircle, Loader2, FileText, Settings, Check, Brain, CheckCircle2, Search, Zap, ArrowRight, FileSearch, Sparkles, Lightbulb, PartyPopper, Lock } from 'lucide-react';
import DocumentSidebar from './components/DocumentSidebar';
import DetailsModal from './components/DetailsModal';
import CsvViewer from './components/CsvViewer';
import { parseCSV } from './utils/csvParser';

const ProgressVisualizer = ({ logs, totalTokens, agentDetailedState, onViewDocument }) => {
    const [state, setState] = useState({
        converting: { status: 'waiting', label: 'Ingesting Documents' },
        analyzing: { status: 'waiting', label: 'Analyzing Structure' },
        processing: { status: 'waiting', label: 'AI Agent Migration' }
    });
    
    const [agentState, setAgentState] = useState({
        iteration: 0,
        maxIterations: 5,
        action: 'Initializing...',
        thoughts: '',
        files: 0
    });

    const [showDetails, setShowDetails] = useState(null);
    const [liveCsvContent, setLiveCsvContent] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (showDetails === 'csv') {
            axios.get('/api/csv_content')
                .then(res => setLiveCsvContent(res.data.content))
                .catch(err => setLiveCsvContent("Error loading CSV content: " + err.message));
        } else {
            setLiveCsvContent(null);
        }
    }, [showDetails]);

    useEffect(() => {
        const newState = {
            converting: { status: 'waiting', label: 'Ingesting Documents' },
            analyzing: { status: 'waiting', label: 'Analyzing Structure' },
            processing: { status: 'waiting', label: 'AI Agent Migration' }
        };
        
        let newAgentState = { ...agentState };
        
        logs.forEach(log => {
            if (log.includes('Converting documents')) newState.converting.status = 'active';
            if (log.includes('Converted')) newState.converting.status = 'completed';
            
            if (log.includes('Analyzing content')) newState.analyzing.status = 'active';
            if (log.includes('Content fits') || log.includes('Content too large')) newState.analyzing.status = 'completed';
            
            if (log.includes('Calling LLM') || log.includes('Starting iterative agent')) newState.processing.status = 'active';
            
            if (log.includes('Iteration')) {
                const match = log.match(/Iteration (\d+)\/(\d+)/);
                if (match) {
                    newAgentState.iteration = parseInt(match[1]);
                    newAgentState.maxIterations = parseInt(match[2]);
                }
            }
            
            if (log.includes('Agent selecting')) newAgentState.action = 'Scanning documentation for matches...';
            if (log.includes('Updating mapping')) newAgentState.action = 'Refining mapping with new context...';
            if (log.includes('Agent thoughts:')) newAgentState.thoughts = log.replace('Agent thoughts:', '').trim();
            if (log.includes('Selected') && log.includes('files')) {
                 const match = log.match(/Selected (\d+) files/);
                 if (match) newAgentState.files = parseInt(match[1]);
            }

            if (log.includes('process completed') || log.includes('Response saved')) newState.processing.status = 'completed';
        });

        setState(newState);
        setAgentState(newAgentState);
        
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const StepIcon = ({ status, icon: Icon }) => {
        if (status === 'completed') return <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shadow-sm ring-4 ring-white"><CheckCircle2 className="w-6 h-6" /></div>;
        if (status === 'active') return <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center animate-pulse ring-4 ring-indigo-50"><Loader2 className="w-6 h-6 animate-spin" /></div>;
        return <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center ring-4 ring-white"><Icon className="w-5 h-5" /></div>;
    };

    return (
        <div className="w-full max-w-5xl mx-auto animate-fade-in">
            {/* Steps Row */}
            <div className="flex items-center justify-between mb-10 relative px-10">
                <div className="absolute left-0 top-5 w-full h-0.5 bg-slate-200 -z-10"></div>
                
                {Object.entries(state).map(([key, step], idx) => (
                    <div key={key} className="flex flex-col items-center bg-slate-50 px-6 z-10">
                        <StepIcon status={step.status} icon={idx === 0 ? FileText : idx === 1 ? Search : Brain} />
                        <span className={`mt-3 text-sm font-semibold tracking-wide ${step.status === 'active' ? 'text-indigo-600' : step.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {step.label}
                        </span>
                    </div>
                ))}
            </div>

            {/* Agent Active View */}
            {state.processing.status === 'active' && (
                <div className="bg-white border border-indigo-100 rounded-2xl shadow-xl shadow-indigo-500/10 overflow-hidden transition-all duration-500">
                    <div className="bg-gradient-to-r from-indigo-50 to-white border-b border-indigo-100 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20">
                                <Brain className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 text-lg">Migration Agent Active</h3>
                                <p className="text-sm text-indigo-600 font-medium">Iteration {agentState.iteration} of {agentState.maxIterations}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-indigo-700 bg-indigo-100/50 px-4 py-1.5 rounded-full border border-indigo-100">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {agentState.action}
                        </div>
                    </div>
                    
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 p-2 bg-purple-100 text-purple-600 rounded-lg">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Agent Reasoning</h4>
                                    <p className="text-slate-600 mt-2 leading-relaxed italic text-lg font-light">
                                        "{agentDetailedState?.thoughts || agentState.thoughts || "Analyzing requirements..."}"
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <FileSearch className="w-4 h-4" />
                                Context Retrieval
                            </h4>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">Files Selected</span>
                                    <span className="font-bold text-slate-900 text-lg">{agentState.files}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-600">Total Tokens</span>
                                    <span className="font-bold text-slate-900 text-lg">{totalTokens.toLocaleString()}</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2 mt-2 overflow-hidden">
                                    <div 
                                        className="bg-indigo-600 h-full rounded-full transition-all duration-500 ease-out" 
                                        style={{ width: `${(agentState.iteration / agentState.maxIterations) * 100}%` }}
                                    ></div>
                                </div>
                                <div className="text-right text-xs text-slate-400">
                                    Overall Progress
                                </div>

                                {agentDetailedState && (
                                    <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-2 gap-3">
                                        <button 
                                            onClick={() => setShowDetails('search')}
                                            className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all group"
                                        >
                                            <span className="text-xs text-slate-500 group-hover:text-indigo-600">Search Matches</span>
                                            <span className="font-bold text-indigo-600 text-xl">{agentDetailedState.search_results?.length || 0}</span>
                                        </button>
                                        <button 
                                            onClick={() => setShowDetails('csv')}
                                            className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 transition-all group"
                                        >
                                            <span className="text-xs text-slate-500 group-hover:text-indigo-600">CSV Snapshot</span>
                                            <span className="font-bold text-indigo-600 text-xl">View</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showDetails === 'search' && agentDetailedState && (
                <DetailsModal 
                    title={`Search Results (${agentDetailedState.search_results?.length || 0})`}
                    content={
                        <div className="absolute inset-0 overflow-auto p-0">
                            {Array.isArray(agentDetailedState.search_results) && agentDetailedState.search_results.length > 0 ? (
                                <div className="divide-y divide-slate-100">
                                    {agentDetailedState.search_results.map((result, idx) => (
                                        <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex gap-3">
                                                <span className="text-xs font-bold text-slate-400 shrink-0 w-6 pt-0.5">{idx + 1}.</span>
                                                <pre className="text-xs text-slate-600 font-mono whitespace-pre-wrap break-words flex-1">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-400">
                                    <p>No search results found.</p>
                                    <p className="text-xs mt-2 opacity-70">Raw data: {JSON.stringify(agentDetailedState.search_results)}</p>
                                </div>
                            )}
                        </div>
                    }
                    onClose={() => setShowDetails(null)}
                />
            )}

            {showDetails === 'csv' && (
                <DetailsModal 
                    title="Current CSV Content (from disk)"
                    wide={true}
                    content={(() => {
                        const raw = liveCsvContent || agentDetailedState?.csv_content;
                        if (!raw) return "Loading...";
                        if (raw.startsWith("Error")) return raw;
                        
                        return <CsvViewer content={raw} onViewDocument={onViewDocument} />;
                    })()}
                    onClose={() => setShowDetails(null)}
                />
            )}

            {/* Log Stream (Collapsed/Subtle) */}
            <div className="mt-8 border-t border-slate-100 pt-6">
                <div 
                    ref={scrollRef}
                    className="h-32 overflow-y-auto font-mono text-xs text-slate-400 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-200 px-2"
                >
                    {logs.map((log, i) => (
                        <div key={i} className="truncate hover:text-slate-600 transition-colors flex gap-3">
                            <span className="opacity-40 shrink-0">[{new Date().toLocaleTimeString()}]</span>
                            <span>{log}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

function App() {
    // Ensure XLSX is available for Tabulator
    useEffect(() => {
        window.XLSX = XLSX;
    }, []);

    const [csvPath, setCsvPath] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [riddleAnswer, setRiddleAnswer] = useState('');
    const [riddleError, setRiddleError] = useState(false);
    const [showHint, setShowHint] = useState(false);
    const [isShaking, setIsShaking] = useState(false);
    const [docsPath, setDocsPath] = useState('');
    const [maxIterations, setMaxIterations] = useState(3);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [finalData, setFinalData] = useState(null);
    const [iterationResults, setIterationResults] = useState([]);
    const [selectedIteration, setSelectedIteration] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarContent, setSidebarContent] = useState('');
    const [sidebarHighlight, setSidebarHighlight] = useState('');
    const [sidebarFilename, setSidebarFilename] = useState('');
    const [showColumnMenu, setShowColumnMenu] = useState(false);
    const [progress, setProgress] = useState([]);
    const [totalTokens, setTotalTokens] = useState(0);
    const [agentDetailedState, setAgentDetailedState] = useState(null);
    const [provider, setProvider] = useState('google');
    const [modelName, setModelName] = useState('gemini-3-pro-preview');
    const [availableCsvs, setAvailableCsvs] = useState([]);
    const [availableFolders, setAvailableFolders] = useState([]);
    const progressEndRef = useRef(null);
    
    const tableRef = useRef(null);
    const tabulatorInstance = useRef(null);
    const csvInputRef = useRef(null);
    const docsInputRef = useRef(null);
    const [visibleCols, setVisibleCols] = useState({});

    useEffect(() => {
        const loadFiles = () => {
            fetch('/api/list/csv')
                .then(res => res.json())
                .then(data => setAvailableCsvs(data.files || []))
                .catch(err => console.error("Failed to load CSVs", err));

            fetch('/api/list/folders')
                .then(res => res.json())
                .then(data => setAvailableFolders(data.folders || []))
                .catch(err => console.error("Failed to load folders", err));
        };
        loadFiles();
    }, []);

    const handleCsvUpload = async (e) => {
        if (!e.target.files?.[0]) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/upload/csv', {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                const data = await res.json();
                setCsvPath(data.filename);
                fetch('/api/list/csv').then(r=>r.json()).then(d=>setAvailableCsvs(d.files || []));
            }
        } catch (err) {
            console.error("Upload failed", err);
        }
    };

    const handleDocsUpload = async (e) => {
        if (!e.target.files?.length) return;
        const files = Array.from(e.target.files);
        
        setLoading(true);
        setError(null);

        const BATCH_SIZE = 50;
        const totalBatches = Math.ceil(files.length / BATCH_SIZE);

        try {
            for (let i = 0; i < totalBatches; i++) {
                const start = i * BATCH_SIZE;
                const end = Math.min(start + BATCH_SIZE, files.length);
                const batch = files.slice(start, end);
                
                const formData = new FormData();
                batch.forEach(file => {
                    formData.append('files', file, file.webkitRelativePath || file.name);
                });

                console.log(`Uploading batch ${i+1}/${totalBatches}`);
                const res = await fetch('/api/upload/docs', {
                    method: 'POST',
                    body: formData
                });
                
                if (!res.ok) {
                    throw new Error(`Batch ${i+1} failed: ${res.statusText}`);
                }
            }

            fetch('/api/list/folders').then(r=>r.json()).then(d=>setAvailableFolders(d.folders || []));
            
            if (files[0]?.webkitRelativePath) {
                const folderName = files[0].webkitRelativePath.split('/')[0];
                setDocsPath(`files/${folderName}`);
            }

        } catch (err) {
            console.error("Upload failed", err);
            setError("Upload failed: " + err.message);
        } finally {
            setLoading(false);
            if (docsInputRef.current) docsInputRef.current.value = '';
        }
    };

    const handleViewDocument = (filename, context = "") => {
        if (!filename.match(/\.[a-zA-Z0-9]{2,4}$/) && filename.length > 20) {
            alert("Invalid filename format from LLM: '" + filename + "'.\n\nPlease re-run the migration with the updated prompt to ensure correct 'filename:context' format.");
            return;
        }
        
        axios.get(`/api/document?filename=${encodeURIComponent(filename)}&docs_path=${encodeURIComponent(docsPath)}`)
            .then(res => {
                setSidebarContent(res.data.content);
                setSidebarHighlight(context);
                setSidebarFilename(filename);
                setSidebarOpen(true);
            })
            .catch(err => {
                alert("Could not load document: " + (err.response?.data?.detail || err.message));
            });
    };

    const handleRun = async () => {
        setLoading(true);
        setError(null);
        setProgress([]);
        setTotalTokens(0);
        setAgentDetailedState(null);
        setData(null);
        setFinalData(null);
        setIterationResults([]);
        setSelectedIteration(null);

        try {
            const response = await fetch('/api/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    csv_path: csvPath,
                    docs_path: docsPath,
                    max_iterations: parseInt(maxIterations),
                    provider: provider,
                    model_name: modelName
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // Keep the last incomplete chunk

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6);
                        try {
                            const event = JSON.parse(jsonStr);
                            if (event.type === 'progress') {
                                setProgress(prev => [...prev, event.message]);
                            } else if (event.type === 'usage') {
                                setTotalTokens(prev => prev + event.tokens);
                            } else if (event.type === 'agent_state') {
                                setAgentDetailedState(event.data);
                            } else if (event.type === 'iteration_complete') {
                                setIterationResults(prev => {
                                    const newResults = [...prev, { iteration: event.iteration, content: event.csv_content }];
                                    return newResults.sort((a, b) => a.iteration - b.iteration);
                                });
                            } else if (event.type === 'result') {
                                setData(event.data);
                                setFinalData(event.data);
                            } else if (event.type === 'error') {
                                setError(event.message);
                            }
                        } catch (e) {
                            console.error('Error parsing SSE:', e);
                        }
                    }
                }
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleIterationSelect = (iteration) => {
        setSelectedIteration(iteration);
        if (iteration === null) {
            if (finalData) setData(finalData);
        } else {
            const result = iterationResults.find(r => r.iteration === iteration);
            if (result && finalData) {
                const parsed = parseCSV(result.content);
                setData({
                    source: finalData.source,
                    target: parsed
                });
            }
        }
    };

    // Auto-scroll progress
    useEffect(() => {
        progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [progress]);

    // Initialize visible columns when data changes
    useEffect(() => {
        if (!data) return;
        let initialVisible = {};
        data.source.columns.forEach(col => initialVisible[`source_${col}`] = true);
        data.target.columns.forEach(col => initialVisible[`target_${col}`] = true);
        setVisibleCols(initialVisible);
    }, [data]);

    // Build Tabulator table
    useEffect(() => {
        if (!data || !tableRef.current) return;

        const sourceCols = data.source.columns.map(col => ({
            title: col,
            field: `source_${col}`,
            headerFilter: true,
            editor: 'input',
            width: 180,
            visible: visibleCols[`source_${col}`] !== false,
            formatter: (cell) => {
                const value = cell.getValue();
                return `<span class='text-blue-700 cursor-pointer font-semibold hover:bg-blue-50 px-1 rounded' data-doc='${col}' data-value='${value}'>${value}</span>`;
            },
            cellClick: (e, cell) => {
                const value = cell.getValue();
                if (value && typeof value === 'string' && value.match(/\.txt|\.md|\.html/i)) {
                    axios.get(`/api/document?filename=${encodeURIComponent(value)}`)
                        .then(res => {
                            setSidebarContent(res.data.content);
                            setSidebarHighlight(cell.getValue());
                            setSidebarFilename(value);
                            setSidebarOpen(true);
                        })
                        .catch(() => {
                            setSidebarContent('Document not found.');
                            setSidebarHighlight('');
                            setSidebarFilename(value);
                            setSidebarOpen(true);
                        });
                }
            }
        }));

        const targetCols = data.target.columns.map(col => {
            let colDef = {
                title: col,
                field: `target_${col}`,
                headerFilter: true,
                editor: 'input',
                width: 180,
                visible: visibleCols[`target_${col}`] !== false,
            };

            if (col === 'Target Source') {
                colDef.formatter = (cell) => {
                    const value = cell.getValue();
                    if (!value) return "";
                    return `<div class="flex items-center justify-between w-full">
                                <span class="truncate mr-2 text-xs flex-1" title="${value}">${value}</span>
                                <button class="bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded text-xs font-bold view-doc-btn flex-none">View</button>
                            </div>`;
                };
                colDef.cellClick = (e, cell) => {
                    if (e.target.classList.contains('view-doc-btn')) {
                        e.stopPropagation();
                        const value = cell.getValue();
                        if (!value) return;
                        
                        let filename = "";
                        let context = "";
                        const firstColonIndex = value.indexOf(':');
                        if (firstColonIndex !== -1) {
                            filename = value.substring(0, firstColonIndex).trim();
                            context = value.substring(firstColonIndex + 1).trim();
                        } else {
                            filename = value;
                        }

                        if (!filename.match(/\.[a-zA-Z0-9]{2,4}$/) && filename.length > 20) {
                            alert("Invalid filename format from LLM: '" + filename + "'.\n\nPlease re-run the migration with the updated prompt to ensure correct 'filename:context' format.");
                            return;
                        }
                        
                        handleViewDocument(filename, context);
                    }
                };
            }

            if (col === 'Potential Matches') {
                colDef.formatter = (cell) => {
                    const value = cell.getValue();
                    if (!value) return "";
                    try {
                        let matches = [];
                        const trimmed = value.trim();
                        
                        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                            // Manual parsing to handle potential backslashes and non-standard JSON format
                            const content = trimmed.slice(1, -1);
                            if (content.length > 0) {
                                if (content.includes('";"')) {
                                    matches = content.split('";"').map(m => m.replace(/^"|"$/g, ''));
                                } else if (content.includes('","')) {
                                    matches = content.split('","').map(m => m.replace(/^"|"$/g, ''));
                                } else {
                                    matches = [content.replace(/^"|"$/g, '')];
                                }
                            }
                        } else {
                            matches = [value];
                        }
                        
                        if (!Array.isArray(matches) || matches.length === 0) return "";

                        return `<div class="flex flex-col gap-1">
                            ${matches.map((match, idx) => {
                                const display = match.length > 30 ? match.substring(0, 27) + '...' : match;
                                const safeMatch = match.replace(/"/g, '&quot;');
                                return `<button class="text-left text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded truncate w-full potential-match-btn" data-match="${safeMatch}">${display}</button>`;
                            }).join('')}
                        </div>`;
                    } catch (e) {
                        console.error("Error parsing matches:", e);
                        return `<span class="text-xs text-gray-500 truncate" title="${value}">${value}</span>`;
                    }
                };
                colDef.cellClick = (e, cell) => {
                    if (e.target.classList.contains('potential-match-btn')) {
                        e.stopPropagation();
                        const value = e.target.getAttribute('data-match');
                        if (!value) return;
                        
                        let filename = "";
                        let context = "";
                        const firstColonIndex = value.indexOf(':');
                        if (firstColonIndex !== -1) {
                            filename = value.substring(0, firstColonIndex).trim();
                            context = value.substring(firstColonIndex + 1).trim();
                        } else {
                            filename = value;
                        }
                        
                        handleViewDocument(filename, context);
                    }
                };
            }
            return colDef;
        });

        const gapCol = {
            title: '',
            field: '__gap__',
            width: 30,
            headerSort: false,
            formatter: () => '',
            cssClass: 'bg-gray-100',
            frozen: true
        };

        const columns = [...sourceCols, gapCol, ...targetCols];

        const rows = data.source.data.map((row, idx) => {
            const targetRow = data.target.data[idx] || {};
            const obj = {};
            data.source.columns.forEach(col => obj[`source_${col}`] = row[col]);
            data.target.columns.forEach(col => obj[`target_${col}`] = targetRow[col]);
            obj['__gap__'] = '';
            return obj;
        });

        if (tabulatorInstance.current) {
            tabulatorInstance.current.destroy();
        }

        tabulatorInstance.current = new Tabulator(tableRef.current, {
            data: rows,
            columns: columns,
            layout: 'fitDataFill',
            movableColumns: true,
            resizableRows: true,
            pagination: false,
            height: '100%',
            rowFormatter: function(row) {
                if (row.getPosition() % 2 === 0) {
                    row.getElement().style.background = '#f8fafc';
                }
            },
        });

        return () => {
            if (tabulatorInstance.current) {
                tabulatorInstance.current.destroy();
                tabulatorInstance.current = null;
            }
        };
    }, [data, visibleCols, docsPath]);

    const handleExportCSV = () => {
        if (tabulatorInstance.current) tabulatorInstance.current.download('csv', 'migration_results.csv');
    };
    const handleExportXLSX = () => {
        if (tabulatorInstance.current) tabulatorInstance.current.download('xlsx', 'migration_results.xlsx', {sheetName:'Results'});
    };

    const toggleColumn = (colKey) => {
        setVisibleCols(prev => ({
            ...prev,
            [colKey]: !prev[colKey]
        }));
    };

    const handleRiddleSubmit = (e) => {
        e.preventDefault();
        // Hardcoded password for demo purposes
        if (riddleAnswer === 'Migration2025!') {
            setIsAuthenticated(true);
        } else {
            setRiddleError(true);
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-20">
                    <div className="absolute top-10 left-10 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
                    <div className="absolute top-10 right-10 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
                    <div className="absolute -bottom-8 left-20 w-64 h-64 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
                </div>

                <div className={`bg-white/95 backdrop-blur-xl p-8 rounded-2xl shadow-2xl max-w-md w-full relative z-10 border border-white/20 ${isShaking ? 'animate-shake' : ''}`}>
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-600/20">
                            <Lock className="w-8 h-8 text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900">System Access</h2>
                        <p className="text-slate-500 mt-2 text-sm">Please enter your authorization key to proceed.</p>
                    </div>

                    <form onSubmit={handleRiddleSubmit} className="space-y-6">
                        <div className="relative">
                            <input
                                type="password"
                                value={riddleAnswer}
                                onChange={(e) => {
                                    setRiddleAnswer(e.target.value);
                                    setRiddleError(false);
                                }}
                                placeholder="Enter password..."
                                className={`w-full px-5 py-3 rounded-lg border ${riddleError ? 'border-red-300 focus:border-red-400 bg-red-50' : 'border-slate-200 focus:border-indigo-500 bg-white'} focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-sm placeholder:text-slate-400`}
                                autoFocus
                            />
                        </div>

                        {riddleError && (
                            <div className="flex items-center gap-2 text-red-600 text-sm animate-fadeIn bg-red-50 p-3 rounded-lg border border-red-100">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span className="font-medium">Invalid credentials provided.</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-all shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 active:scale-95 flex items-center justify-center gap-2"
                        >
                            <span>Authenticate</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>
                    
                    <div className="mt-6 text-center">
                        <p className="text-xs text-slate-400">
                            Protected System • Authorized Personnel Only
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-800 flex-none h-18 flex items-center px-8 shadow-lg z-20">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-900/50 ring-1 ring-white/10">
                        <Database className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">Migration Visualizer</h1>
                        <p className="text-xs text-slate-400 font-medium">AI-Powered Data Transformation</p>
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    <div className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                        System Online
                    </div>
                </div>
            </header>

            <main className="flex-1 flex flex-col p-0 m-0 w-full h-full overflow-hidden relative">
                {/* Background Pattern */}
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
                
                {/* Configuration Panel */}
                <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 p-8 flex flex-col md:flex-row md:items-end gap-8 shadow-sm z-10 relative">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Target CSV schema Path</label>
                            <div className="flex gap-2 group">
                                <div className="relative flex-1">
                                    <select 
                                        value={csvPath} 
                                        onChange={(e) => setCsvPath(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium group-hover:bg-white appearance-none"
                                    >
                                        <option value="" disabled>Select CSV...</option>
                                        {availableCsvs.map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                    <div className="absolute left-3 top-2.5 text-slate-400 group-hover:text-indigo-500 transition-colors">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    ref={csvInputRef}
                                    accept=".csv"
                                    className="hidden"
                                    onChange={handleCsvUpload}
                                />
                                <button
                                    onClick={() => csvInputRef.current?.click()}
                                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-900 transition-colors whitespace-nowrap"
                                    title="Upload CSV"
                                >
                                    Upload
                                </button>
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Source DB Documents</label>
                            <div className="flex gap-2 group">
                                <div className="relative flex-1">
                                    <select 
                                        value={docsPath} 
                                        onChange={(e) => setDocsPath(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium group-hover:bg-white appearance-none"
                                    >
                                        <option value="" disabled>Select Folder...</option>
                                        {availableFolders.map(f => {
                                            const fullPath = f.replace(/\\/g, '/');
                                            return <option key={f} value={fullPath}>{f}</option>;
                                        })}
                                    </select>
                                    <div className="absolute left-3 top-2.5 text-slate-400 group-hover:text-indigo-500 transition-colors">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                </div>
                                <input
                                    type="file"
                                    ref={docsInputRef}
                                    webkitdirectory=""
                                    directory=""
                                    multiple
                                    className="hidden"
                                    onChange={handleDocsUpload}
                                />
                                <button
                                    onClick={() => docsInputRef.current?.click()}
                                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-200 hover:text-slate-900 transition-colors whitespace-nowrap"
                                    title="Upload Folder"
                                >
                                    Upload Folder
                                </button>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Max Iterations</label>
                            <div className="relative group">
                                <input 
                                    type="number" 
                                    value={maxIterations} 
                                    onChange={(e) => setMaxIterations(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium group-hover:bg-white"
                                    placeholder="3"
                                    min="1"
                                    max="20"
                                />
                                <div className="absolute left-3 top-2.5 text-slate-400 group-hover:text-indigo-500 transition-colors">
                                    <Settings className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Provider</label>
                            <div className="relative group">
                                <select 
                                    value={provider} 
                                    onChange={(e) => {
                                        setProvider(e.target.value);
                                        if (e.target.value === 'google') setModelName('gemini-3-pro-preview');
                                        else if (e.target.value === 'grok') setModelName('grok-4-1-fast-reasoning');
                                    }}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all appearance-none text-sm font-medium group-hover:bg-white"
                                >
                                    <option value="google">Google</option>
                                    <option value="grok">Grok (xAI)</option>
                                </select>
                                <div className="absolute left-3 top-2.5 text-slate-400 group-hover:text-indigo-500 transition-colors">
                                    <Zap className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Model</label>
                            <div className="relative group">
                                <input 
                                    type="text" 
                                    value={modelName} 
                                    onChange={(e) => setModelName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-medium group-hover:bg-white"
                                />
                                <div className="absolute left-3 top-2.5 text-slate-400 group-hover:text-indigo-500 transition-colors">
                                    <Brain className="w-5 h-5" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 md:ml-auto min-w-[200px]">
                        <button
                            onClick={handleRun}
                            disabled={loading}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed transition-all font-bold shadow-lg shadow-indigo-500/30 active:scale-95 ring-1 ring-white/20"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                            {loading ? 'Processing...' : 'Start Migration'}
                        </button>
                    </div>
                </div>
                
                {loading && (
                    <div className="px-8 pt-8 pb-4 overflow-y-auto">
                        <ProgressVisualizer 
                            logs={progress} 
                            totalTokens={totalTokens} 
                            agentDetailedState={agentDetailedState} 
                            onViewDocument={handleViewDocument}
                        />
                    </div>
                )}

                {error && (
                    <div className="px-8 pt-8">
                        <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-700 shadow-sm">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <h3 className="font-semibold">Error</h3>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Results */}
                {data && (
                    <div className="flex-1 flex flex-col p-8 w-full h-full overflow-hidden animate-fade-in">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 shrink-0">
                            <div className="flex items-center gap-4">
                                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                                    Migration Results
                                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200">
                                        {data.source.data.length} records
                                    </span>
                                </h2>
                                {iterationResults.length > 0 && (
                                    <div className="flex items-center gap-3 ml-4 border-l border-slate-200 pl-4">
                                        <span className="text-sm text-slate-500 font-medium">Iteration History:</span>
                                        <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
                                            <button
                                                onClick={() => handleIterationSelect(null)}
                                                className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${selectedIteration === null ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                                            >
                                                Final
                                            </button>
                                            {iterationResults.map((res) => (
                                                <button
                                                    key={res.iteration}
                                                    onClick={() => handleIterationSelect(res.iteration)}
                                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${selectedIteration === res.iteration ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}
                                                >
                                                    {res.iteration}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex gap-3 relative">
                                <div className="relative">
                                    <button 
                                        onClick={() => setShowColumnMenu(!showColumnMenu)}
                                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                                    >
                                        <Settings className="w-4 h-4" />
                                        Columns
                                    </button>
                                    {showColumnMenu && (
                                        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-[400px] overflow-y-auto p-3 animate-fade-in">
                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1 mb-2">Source Columns</div>
                                            {data.source.columns.map(col => (
                                                <button
                                                    key={`source_${col}`}
                                                    onClick={() => toggleColumn(`source_${col}`)}
                                                    className="flex items-center w-full px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                                                >
                                                    <div className={`w-4 h-4 mr-3 rounded border flex items-center justify-center transition-colors ${visibleCols[`source_${col}`] !== false ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                                                        {visibleCols[`source_${col}`] !== false && <Check className="w-3 h-3" />}
                                                    </div>
                                                    <span className="truncate">{col}</span>
                                                </button>
                                            ))}
                                            <div className="border-t border-slate-100 my-3"></div>
                                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1 mb-2">Target Columns</div>
                                            {data.target.columns.map(col => (
                                                <button
                                                    key={`target_${col}`}
                                                    onClick={() => toggleColumn(`target_${col}`)}
                                                    className="flex items-center w-full px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                                                >
                                                    <div className={`w-4 h-4 mr-3 rounded border flex items-center justify-center transition-colors ${visibleCols[`target_${col}`] !== false ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300'}`}>
                                                        {visibleCols[`target_${col}`] !== false && <Check className="w-3 h-3" />}
                                                    </div>
                                                    <span className="truncate">{col}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {showColumnMenu && (
                                    <div className="fixed inset-0 z-40" onClick={() => setShowColumnMenu(false)}></div>
                                )}
                                <button onClick={handleExportCSV} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                                    Export CSV
                                </button>
                                <button onClick={handleExportXLSX} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                                    Export Excel
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden w-full h-full relative ring-1 ring-black/5">
                            <div ref={tableRef} className="w-full h-full"></div>
                        </div>
                    </div>
                )}
                <DocumentSidebar 
                    isOpen={sidebarOpen} 
                    onClose={() => setSidebarOpen(false)} 
                    content={sidebarContent} 
                    highlight={sidebarHighlight} 
                    filename={sidebarFilename}
                />
            </main>
            <footer className="bg-white border-t border-slate-200 py-3 px-6 text-center text-xs text-slate-400 shrink-0 z-20">
                <span className="font-medium text-slate-500">AI Migration Tool</span> • Built by Jakub Jagiełka
            </footer>
        </div>
    );
}

export default App;
