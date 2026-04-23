export default function LandingPageNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-gray-400">404</p>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">Diese Seite ist nicht mehr verfügbar</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-500">
        Der Link wurde möglicherweise entfernt oder ist abgelaufen. Bitte wenden Sie sich an Ihren
        Ansprechpartner, um einen neuen Link zu erhalten.
      </p>
    </div>
  );
}
