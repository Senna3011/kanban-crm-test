'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateCompanyInfo } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

interface Props {
  onNext?: () => void;
  initial?: { name?: string; products?: string; logoUrl?: string };
  readOnly?: boolean;
}

export default function CompanyInfoForm({ onNext, initial, readOnly = false }: Props) {
  const [name, setName] = useState(initial?.name || '');
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl || '');
  const [products, setProducts] = useState(initial?.products || '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    if (!name.trim() || !products.trim()) {
      toast.error('Company name and products/services are required.');
      return;
    }
    setLoading(true);
    try {
      await updateCompanyInfo({
        name: name.trim(),
        logoUrl: logoUrl.trim(),
        companyInfo: JSON.stringify({ name: name.trim(), products: products.trim() }),
      });
      toast.success('Company information saved.');
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
          <span>View-only Mode: Only <strong>Administrators</strong> can modify company profile and branding.</span>
        </div>
      )}
      <div>
        <h2 className="text-xl font-semibold">Company Profile & Branding</h2>
        <p className="text-gray-500 mt-1">Customize your organization identity, brand logo, and business context.</p>
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-32 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed text-sm"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          placeholder="Describe your core services, target clients, pricing model (used by AI for classification & drafting)..."
          disabled={readOnly}
          required
        />
      </div>
      {!readOnly && (
        <Button type="submit" loading={loading}>
          {onNext ? 'Continue →' : 'Save Company Profile'}
        </Button>
      )}
    </form>
  );
}
