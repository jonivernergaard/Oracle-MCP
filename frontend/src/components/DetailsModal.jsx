import React from 'react';
import { X } from 'lucide-react';

const DetailsModal = ({ title, content, onClose, wide }) => (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-fade-in" onClick={onClose}>
        <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'w-[95vw] h-[95vh] max-w-none' : 'max-w-3xl h-[80vh]'} flex flex-col overflow-hidden ring-1 ring-black/5`} onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex justify-between items-center flex-none bg-slate-50/50">
                <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
                <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 overflow-hidden bg-white relative">
                {typeof content === 'string' ? (
                    <div className="absolute inset-0 p-6 overflow-auto font-mono text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{content}</div>
                ) : (
                    content
                )}
            </div>
        </div>
    </div>
);

export default DetailsModal;
