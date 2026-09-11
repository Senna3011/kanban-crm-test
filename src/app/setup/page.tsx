'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import CompanyInfoForm from '@/components/setup/CompanyInfoForm';
import EmailConfigForm from '@/components/setup/EmailConfigForm';
import { Toaster } from 'react-hot-toast';

export default function SetupPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-primary-200 border-t-primary-600 rounded-full" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/login');
    return null;
  }

  const role = (session?.user as any)?.role || 'member';
  if (role !== 'admin') {
    router.push('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
      <Toaster />
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-2xl">
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
