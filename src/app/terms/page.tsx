import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service - Kanban CRM',
  description: 'Terms of Service for Kanban CRM by Jet Digital Pro',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="mb-8">
            <Link href="/login" className="text-primary-600 hover:text-primary-700 text-sm">
              &larr; Back to login
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: August 3, 2026</p>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Kanban CRM (&quot;the Service&quot;), operated by Jet Digital Pro
                (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), you agree to be bound by these Terms of Service.
                If you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Description of Service</h2>
              <p>
                Kanban CRM is a customer relationship management tool that provides:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Kanban-style deal pipeline management</li>
                <li>Contact and company management</li>
                <li>Email integration and tracking</li>
                <li>AI-powered lead classification and scoring</li>
                <li>Activity logging and reporting</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Acceptable Use</h2>
              <p>You agree to use the Service only for lawful business purposes. You must not:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Use the Service to send spam or unsolicited communications</li>
                <li>Attempt to gain unauthorized access to the system or other users&apos; data</li>
                <li>Upload malicious code, viruses, or harmful content</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                <li>Use the Service in violation of any applicable law or regulation</li>
                <li>Resell or redistribute access to the Service without authorization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. Your Data</h2>
              <p>
                You retain ownership of all data you enter into the Service. By using the Service,
                you grant us a limited license to process your data solely for the purpose of
                providing the Service. See our{' '}
                <Link href="/privacy" className="text-primary-600 hover:text-primary-700">
                  Privacy Policy
                </Link>{' '}
                for details on how we handle your data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Limitations of Liability</h2>
              <p>
                The Service is provided &quot;as is&quot; without warranties of any kind. We do not
                guarantee uninterrupted or error-free operation. To the maximum extent permitted
                by law, Jet Digital Pro shall not be liable for any indirect, incidental, special,
                or consequential damages arising from your use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Service Availability</h2>
              <p>
                We strive to maintain high availability but do not guarantee specific uptime.
                We may perform scheduled maintenance with reasonable advance notice. We are not
                liable for downtime caused by factors beyond our reasonable control.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Termination</h2>
              <p>
                We may suspend or terminate your access to the Service at any time for violation
                of these terms or for any other reason with reasonable notice. Upon termination,
                your right to use the Service ceases immediately. You may request export of your
                data within 30 days of termination.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Changes to Terms</h2>
              <p>
                We may update these terms from time to time. We will notify you of material
                changes by posting the updated terms on this page with a new &quot;Last updated&quot;
                date. Continued use of the Service after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Contact</h2>
              <p>
                For questions about these Terms, contact us at:
              </p>
              <p className="mt-2">
                <strong>Jet Digital Pro</strong><br />
                Email: <a href="mailto:info@jetdigitalpro.com" className="text-primary-600 hover:text-primary-700">info@jetdigitalpro.com</a><br />
                Website: <a href="https://jetdigitalpro.com" className="text-primary-600 hover:text-primary-700" target="_blank" rel="noopener noreferrer">jetdigitalpro.com</a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
