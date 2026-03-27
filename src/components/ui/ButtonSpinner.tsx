interface ButtonSpinnerProps {
  className?: string;
}

export function ButtonSpinner({ className = 'h-4 w-4' }: ButtonSpinnerProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <style>{`
        .ring{animation:ripple 1.2s cubic-bezier(0.52,.6,.25,.99) infinite}
        .ring2{animation-delay:.4s}
        .ring3{animation-delay:.8s}
        @keyframes ripple{0%{transform:translate(12px,12px) scale(0);opacity:1}100%{transform:translate(0,0) scale(1);opacity:0}}
      `}</style>
      <path className="ring" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,20a9,9,0,1,1,9-9A9,9,0,0,1,12,21Z" transform="translate(12, 12) scale(0)" />
      <path className="ring ring2" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,20a9,9,0,1,1,9-9A9,9,0,0,1,12,21Z" transform="translate(12, 12) scale(0)" />
      <path className="ring ring3" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,20a9,9,0,1,1,9-9A9,9,0,0,1,12,21Z" transform="translate(12, 12) scale(0)" />
    </svg>
  );
}
