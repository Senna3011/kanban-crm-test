import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full text-center p-8">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-primary-600">404</h1>
          <div className="mt-4">
            <h2 className="text-2xl font-semibold text-gray-900">Page not found</h2>
            <p className="mt-2 text-gray-600">
              The page you are looking for does not exist or has been moved.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
