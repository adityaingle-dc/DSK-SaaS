// Vendor credit shown at the bottom of the sidebar and the sign-in page
export default function PoweredBy({ className = '' }) {
  return (
    <p className={`powered-by ${className}`.trim()}>
      Powered by{' '}
      <a href="https://portal.datacircles.in/" target="_blank" rel="noopener noreferrer">DataCircles Technology</a>
    </p>
  );
}
