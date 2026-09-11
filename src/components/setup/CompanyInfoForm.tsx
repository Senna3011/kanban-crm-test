'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateCompanyInfo } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

interface Props {
  onNext?: () => void;
  initial?: { name?: string; products?: string };
  readOnly?: boolean;
}

export default function CompanyInfoForm({ onNext, initial, readOnly = false }: Props) {
  const [name, setName] = useState(initial?.name || '');
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
        companyInfo: JSON.stringify({ name: name.trim(), products: products.trim() }),
      });
      toast.success('Company information saved.');
      onNext?.();
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
          <span>Mode Hanya Lihat: Hanya <strong>Administrator</strong> yang dapat mengubah informasi perusahaan.</span>
        </div>
      )}
      <div>
        <h2 className="text-xl font-semibold">Company Information</h2>
        <p className="text-gray-500 mt-1">Tell us about your business for AI personalization.</p>
      </div>
      <Input
        id="company-name"
        label="Company Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jet Digital Pro"
        disabled={readOnly}
        required
      />
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Products / Services</label>
        <textarea
          id="company-products"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-32 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed text-sm"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          placeholder="Describe what you sell, target audience, pricing model..."
          disabled={readOnly}
          required
        />
      </div>
      {!readOnly && (
        <Button type="submit" loading={loading}>
          {onNext ? 'Continue →' : 'Save Company Information'}
        </Button>
      )}
    </form>
  );
}
