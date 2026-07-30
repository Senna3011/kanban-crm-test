'use client';

import { useState } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { updateCompanyInfo } from '@/server/actions/email-config';

interface Props {
  onNext: () => void;
}

export default function CompanyInfoForm({ onNext }: Props) {
  const [name, setName] = useState('');
  const [products, setProducts] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await updateCompanyInfo({
      name,
      companyInfo: JSON.stringify({ name, products }),
    });
    setLoading(false);
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold">Company Information</h2>
        <p className="text-gray-500 mt-1">Tell us about your business for AI personalization</p>
      </div>
      <Input
        label="Company Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jet Digital Pro"
        required
      />
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Products / Services</label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 h-32"
          value={products}
          onChange={(e) => setProducts(e.target.value)}
          placeholder="Describe what you sell, target audience, pricing model..."
          required
        />
      </div>
      <Button type="submit" loading={loading}>Continue →</Button>
    </form>
  );
}
