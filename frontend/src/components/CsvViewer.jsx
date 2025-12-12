import React, { useEffect, useRef } from 'react';
import { TabulatorFull as Tabulator } from 'tabulator-tables';
import 'tabulator-tables/dist/css/tabulator.min.css';
import { parseCSV } from '../utils/csvParser';

const CsvViewer = ({ content, onViewDocument }) => {
    const tableRef = useRef(null);
    const tabulatorRef = useRef(null);

    useEffect(() => {
        if (!tableRef.current || !content) return;
        
        const { columns, data } = parseCSV(content);
        if (columns.length === 0) return;

        const tabulatorCols = columns.map(col => {
            let colDef = {
                title: col,
                field: col,
                headerFilter: true,
                editor: 'input',
            };

            if (col === 'Target Source') {
                colDef.formatter = (cell) => {
                    const value = cell.getValue();
                    if (!value) return "";
                    return `<div class="flex items-center justify-between w-full">
                                <span class="truncate mr-2 text-xs font-medium text-slate-700 flex-1" title="${value}">${value}</span>
                                <button class="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-md text-xs font-bold view-doc-btn flex-none transition-colors border border-indigo-100">View</button>
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
                        onViewDocument(filename, context);
                    }
                };
            } else if (col === 'Potential Matches') {
                 colDef.formatter = (cell) => {
                    const value = cell.getValue();
                    if (!value) return "";
                    try {
                        let matches = [];
                        if (value.trim().startsWith('[')) {
                            matches = JSON.parse(value.replace(/;/g, ','));
                        } else {
                            matches = [value];
                        }
                        
                        if (!Array.isArray(matches) || matches.length === 0) return "";

                        return `<div class="flex flex-col gap-1.5">
                            ${matches.map((match) => {
                                const display = match.length > 30 ? match.substring(0, 27) + '...' : match;
                                return `<button class="text-left text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1.5 rounded-md truncate w-full potential-match-btn font-medium transition-colors" data-match="${match.replace(/"/g, '&quot;')}">${display}</button>`;
                            }).join('')}
                        </div>`;
                    } catch (e) {
                        return `<span class="text-xs text-slate-500 truncate" title="${value}">${value}</span>`;
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
                        onViewDocument(filename, context);
                    }
                };
            }

            return colDef;
        });

        tabulatorRef.current = new Tabulator(tableRef.current, {
            data: data,
            columns: tabulatorCols,
            layout: "fitDataFill",
            height: "100%",
            movableColumns: true,
            resizableRows: true,
             rowFormatter: function(row) {
                if (row.getPosition() % 2 === 0) {
                    row.getElement().style.background = '#f8fafc';
                }
            },
        });

        return () => {
            tabulatorRef.current?.destroy();
        };
    }, [content, onViewDocument]);

    return <div ref={tableRef} className="w-full h-full"></div>;
};

export default CsvViewer;
