'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toggleEmailConfigActive } from '@/server/actions/email-config';
import toast from 'react-hot-toast';

export default function EmailConfigActiveToggle({
  configId,
  initialActive,
  readOnly = false,
}: {
  configId: string;
  initialActive: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    if (readOnly || isPending) return;
    const nextState = !active;
    setActive(nextState);
    setIsPending(true);
    try {
      await toggleEmailConfigActive(configId, nextState);
      toast.success(nextState ? 'Mailbox activated.' : 'Mailbox deactivated (disabled).');
      router.refresh();
    } catch (err: any) {
      setActive(!nextState);
      toast.error(err.message || 'Failed to update mailbox status');
    } finally {
      setIsPending(false);
    }
  }

  if (readOnly) {
    return (
      <span
        className={`px-2.5 py-1 text-xs font-medium rounded-full ${
          active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
        }`}
      >
        {active ? 'Active' : 'Inactive'}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
        active
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-2xs'
          : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
      }`}
      title={active ? 'Click to turn OFF / deactivate mailbox' : 'Click to turn ON / activate mailbox'}
    >
      <span
        className={`w-2 h-2 rounded-full transition-colors ${
          active ? 'bg-emerald-500' : 'bg-slate-400'
        }`}
      />
      <span>{active ? 'Active (ON)' : 'Inactive (OFF)'}</span>
      {isPending && <span className="animate-spin text-[10px]">⏳</span>}
    </button>
  );
}
