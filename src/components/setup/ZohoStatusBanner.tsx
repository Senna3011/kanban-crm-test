'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

export default function ZohoStatusBanner() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const error = searchParams.get('error');
  const email = searchParams.get('email');

  useEffect(() => {
    if (status === 'zoho_connected') {
      toast.success(
        email
          ? `Zoho account connected: ${email}`
          : 'Zoho account connected successfully!',
        { duration: 6000 }
      );
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete('status');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.toString());
    }
    if (error) {
      toast.error(`Zoho connection failed: ${error}`, { duration: 6000 });
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [status, error, email]);

  return null;
}
