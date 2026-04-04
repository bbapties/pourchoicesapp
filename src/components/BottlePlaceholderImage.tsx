export default function BottlePlaceholderImage({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center bg-gray-100 w-full h-full ${className}`}>
      <svg
        viewBox="0 0 40 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-1/2 h-3/5 opacity-25"
      >
        {/* Bottle neck */}
        <rect x="14" y="2" width="12" height="18" rx="3" fill="#9ca3af" />
        {/* Bottle shoulder */}
        <path d="M10 20 Q8 32 8 38 L8 70 Q8 76 14 76 L26 76 Q32 76 32 70 L32 38 Q32 32 30 20 Z" fill="#9ca3af" />
        {/* Highlight */}
        <rect x="11" y="38" width="3" height="24" rx="1.5" fill="white" opacity="0.4" />
        {/* Label area */}
        <rect x="10" y="44" width="20" height="18" rx="2" fill="white" opacity="0.3" />
      </svg>
      <span className="text-gray-400 text-center leading-tight" style={{ fontSize: '0.55rem' }}>
        Image<br />Coming Soon
      </span>
    </div>
  );
}
