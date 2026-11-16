// Vendor credit shown at the bottom of the sidebar and the sign-in page
export default function PoweredBy({ className = '' }) {
  return (
    <p className={`powered-by ${className}`.trim()}>
      Powered by <strong>DataCircles Technology</strong>
    </p>
  );
}
