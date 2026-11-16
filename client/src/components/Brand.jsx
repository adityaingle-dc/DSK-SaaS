// DSKRISHNA wordmark (images in public/brand). variant "white" is for dark backgrounds.
export default function Brand({ variant = 'color', height = 22, caption = 'Valuation desk' }) {
  return (
    <span className="brand-lockup">
      <img
        className="brand-logo"
        src={variant === 'white' ? '/brand/logo-white.png' : '/brand/logo.png'}
        alt="DSKRISHNA"
        height={height}
        width={Math.round(height * 8.11)}
        decoding="async"
      />
      {caption && <small>{caption}</small>}
    </span>
  );
}
