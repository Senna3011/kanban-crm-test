import Link from 'next/link';

export const metadata = {
  title: 'Support - Kanban CRM',
  description: 'Get help with Kanban CRM',
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="mb-8">
            <Link href="/dashboard" className="text-primary-600 hover:text-primary-700 text-sm">
              &larr; Back to dashboard
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Support</h1>
          <p className="text-gray-600 mb-8">
            Need help with Kanban CRM? We&apos;re here to assist you.
          </p>

          <div className="space-y-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Email Support</h2>
              <p className="text-gray-600 mb-4">
                For any questions, issues, or feature requests, reach out to our support team.
              </p>
              <a
                href="mailto:info@jetdigitalpro.com"
                className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Contact Support
              </a>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Company</h2>
              <p className="text-gray-600">
                <strong>Jet Digital Pro</strong><br />
                <a href="https://jetdigitalpro.com" className="text-primary-600 hover:text-primary-700" target="_blank" rel="noopener noreferrer">
                  jetdigitalpro.com
                </a>
              </p>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Common Questions</h2>
              <div className="space-y-4 text-gray-600">
                <div>
                  <p className="font-medium text-gray-900">How do I connect my email?</p>
                  <p className="text-sm">Go to Settings in the dashboard and enter your IMAP/SMTP credentials.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">How does lead scoring work?</p>
                  <p className="text-sm">Our AI automatically classifies leads based on engagement signals and email content.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Can I export my data?</p>
                  <p className="text-sm">Yes, contact support and we will provide a data export for your account.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 flex gap-4 text-sm">
            <Link href="/privacy" className="text-gray-500 hover:text-primary-600">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-gray-500 hover:text-primary-600">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
