import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy - Kanban CRM',
  description: 'Privacy Policy for Kanban CRM by Jet Digital Pro',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 md:p-12">
          <div className="mb-8">
            <Link href="/login" className="text-primary-600 hover:text-primary-700 text-sm">
              &larr; Back to login
            </Link>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mb-8">Last updated: August 3, 2026</p>

          <div className="prose prose-gray max-w-none space-y-6 text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">1. Introduction</h2>
              <p>
                Jet Digital Pro (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the Kanban CRM application.
                This Privacy Policy explains how we collect, use, and protect your information
                when you use our service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">2. Data We Collect</h2>
              <p>We collect the following types of data:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li><strong>Account Information:</strong> Email address and authentication credentials used to access the CRM.</li>
                <li><strong>CRM Data:</strong> Contact names, email addresses, phone numbers, company information, deal details, and notes that you enter into the system.</li>
                <li><strong>Email Data:</strong> Emails processed through the CRM, including sender, recipient, subject, and body content.</li>
                <li><strong>Usage Data:</strong> Basic interaction logs such as login timestamps and feature usage.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">3. Email Processing</h2>
              <p>
                When you connect an email account, the CRM processes incoming and outgoing emails
                to associate them with contacts and deals. Email content is stored securely and is
                only accessible to authenticated users within your organization.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">4. AI Classification</h2>
              <p>
                Our system uses artificial intelligence to automatically classify and score leads.
                This processing is automated and does not involve human review of your individual
                data unless required for support or troubleshooting purposes. AI classification
                results are stored as part of your CRM data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">5. Data Retention</h2>
              <p>
                We retain your data for as long as your account is active. If you delete your
                account, we will remove your data within 30 days, except where retention is
                required by law. Database backups are retained for up to 7 days.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">6. Cookies</h2>
              <p>
                We use session cookies for authentication purposes only. These cookies are
                essential for the service to function and do not track you across other websites.
                We do not use advertising or analytics cookies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">7. Data Security</h2>
              <p>
                We implement industry-standard security measures including encrypted connections
                (HTTPS), hashed passwords, and regular database backups. Access to your data is
                restricted to authenticated users within your organization.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">8. Third-Party Services</h2>
              <p>
                We do not sell or share your data with third parties for marketing purposes.
                Data may be processed by infrastructure providers (hosting, email delivery)
                solely to operate the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">9. Your Rights</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Access the data we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Export your data in a portable format</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-3">10. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or your data, contact us at:
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
