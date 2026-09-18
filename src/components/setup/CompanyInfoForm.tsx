'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateCompanyInfo } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

interface Props {
  onNext?: () => void;
  initial?: { name?: string; products?: string; logoUrl?: string; customPrompt?: string; knowledgeBase?: string };
  readOnly?: boolean;
}

export default function CompanyInfoForm({ onNext, initial, readOnly = false }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || '');
  const [products, setProducts] = useState(initial?.products || '');
  const [customPrompt, setCustomPrompt] = useState(initial?.customPrompt || '');
  const [knowledgeBase, setKnowledgeBase] = useState(initial?.knowledgeBase || '');
  const [loading, setLoading] = useState(false);
  const [importingFile, setImportingFile] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB.');
      return;
    }

    setImportingFile(true);
    try {
      const text = await file.text();
      setKnowledgeBase((prev) => (prev ? `${prev}\n\n--- [File: ${file.name}] ---\n${text}` : text));
      toast.success(`Knowledge base file "${file.name}" imported successfully!`);
    } catch {
      toast.error('Failed to read file contents.');
    } finally {
      setImportingFile(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!name.trim()) {
      toast.error('Company name is required.');
      return;
    }
    setLoading(true);
    try {
      await updateCompanyInfo({
        name: name.trim(),
        logoUrl: logoUrl.trim(),
        customPrompt: customPrompt.trim(),
        knowledgeBase: knowledgeBase.trim(),
        companyInfo: JSON.stringify({
          name: name.trim(),
          products: products.trim(),
          customPrompt: customPrompt.trim(),
          knowledgeBase: knowledgeBase.trim(),
        }),
      });
      toast.success('Company profile & AI knowledge base saved.');
      onNext?.();
      window.location.reload();
    } catch (error: any) {
      toast.error(error?.message || 'Could not save company information.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {readOnly && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
          <span>🔒</span>
          <span>View-only Mode: Only <strong>Administrators</strong> can modify company profile and AI prompts.</span>
        </div>
      )}
      <div>
        <h2 className="text-xl font-semibold">Company Profile & AI Knowledge Base</h2>
        <p className="text-gray-500 mt-1">Configure brand identity, products, custom AI reply rules, and knowledge base files.</p>
      </div>

      <div className="flex items-start gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-600 to-indigo-700 text-white font-bold flex items-center justify-center text-lg shrink-0 overflow-hidden shadow-xs border border-slate-200">
          {logoUrl ? (
            <img src={logoUrl} alt="Company Logo" className="w-full h-full object-cover" onError={(e) => { (e.target as any).style.display = 'none'; }} />
          ) : (
            <span>{(name || 'CR').substring(0, 2).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <label className="block text-xs font-semibold text-slate-700">Company Logo</label>
          {!readOnly && (
            <div>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer shadow-2xs transition">
                <span>📁</span>
                <span>Upload Logo File</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error('Image size must be less than 2MB.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setLogoUrl(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  className="ml-2 text-xs text-red-600 hover:underline font-medium"
                >
                  Remove Logo
                </button>
              )}
            </div>
          )}
          <p className="text-[11px] text-slate-400">Supported formats: PNG, JPG, SVG, WebP up to 2MB.</p>
        </div>
      </div>

      <Input
        id="company-name"
        label="Company / Workspace Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g., Jet Digital Pro"
        disabled={readOnly}
        required
      />

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Products & Services Context</label>
        <textarea
          id="company-products"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-28 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed text-sm"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          placeholder="Describe your core services, target clients, pricing model (used by AI for classification & drafting)..."
          disabled={readOnly}
        />
      </div>

      {/* Custom AI Reply Prompt Instructions */}
      <div className="space-y-1 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider">
            🤖 Custom AI Reply Rules & Prompt Guidelines
          </label>
        </div>
        <textarea
          id="ai-prompt"
          className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 bg-white text-xs sm:text-sm text-slate-800 disabled:bg-gray-100"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="e.g., Always offer a 15-min discovery call link (calendly.com/our-link). Keep tone confident and concise. Never discuss discounts..."
          disabled={readOnly}
        />
        <p className="text-[11px] text-indigo-700 mt-1">
          These instructions will be directly injected into the AI email reply prompt.
        </p>
      </div>

      {/* Knowledge Base Import Section */}
      <div className="space-y-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <div className="flex items-center justify-between">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            📚 Knowledge Base Context / FAQ
          </label>
          {!readOnly && (
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-300 rounded-lg cursor-pointer shadow-2xs transition">
              <span>📄</span>
              <span>{importingFile ? 'Reading...' : 'Import .TXT / Markdown File'}</span>
              <input
                type="file"
                accept=".txt,.md,.csv,.json"
                className="hidden"
                disabled={importingFile}
                onChange={handleFileUpload}
              />
            </label>
          )}
        </div>
        <textarea
          id="knowledge-base"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-32 bg-white text-xs sm:text-sm text-slate-800 disabled:bg-gray-100 font-mono"
          value={knowledgeBase}
          onChange={(e) => setKnowledgeBase(e.target.value)}
          placeholder="Paste service pricing tiers, company FAQs, case studies, or import text/markdown files..."
          disabled={readOnly}
        />
        <p className="text-[11px] text-slate-400">
          AI references this knowledge base when generating contextual email responses and follow-ups.
        </p>
      </div>

      {!readOnly && (
        <Button type="submit" loading={loading} className="w-full sm:w-auto">
          {onNext ? 'Continue →' : 'Save Company Profile & AI Settings'}
        </Button>
      )}
    </form>
  );
}
