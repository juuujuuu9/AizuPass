interface LoadingAnimationProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-12 w-12',
  md: 'h-20 w-20',
  lg: 'h-28 w-28',
} as const;

export function LoadingAnimation({ size = 'md', className = '' }: LoadingAnimationProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg
        className={sizes[size]}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        fill="var(--red-9, #e5484d)"
      >
        <style>{`
          .dot{animation:pulse .8s linear infinite;animation-delay:-.8s}
          .dot2{animation-delay:-.65s}
          .dot3{animation-delay:-.5s}
          @keyframes pulse{93.75%,100%{opacity:.2}}
        `}</style>
        <circle className="dot" cx="4" cy="12" r="3" />
        <circle className="dot dot2" cx="12" cy="12" r="3" />
        <circle className="dot dot3" cx="20" cy="12" r="3" />
      </svg>
    </div>
  );
}
