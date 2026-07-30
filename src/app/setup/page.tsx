'use client';

import { useState } from 'react';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import { Toaster } from 'react-hot-toast';

export default function SetupPage() {
  const [step, setStep] = useState(1);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <Toaster />
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl">
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>1</div>
          <div className="h-0.5 flex-1 bg-gray-200" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200'}`}>2</div>
        </div>

        {step === 1 && <CompanyInfoForm onNext={() => setStep(2)} />}
        {step === 2 && <EmailConfigForm />}
      </div>
    </div>
  );
}
