import { Loader2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

const variants = {
  primary: 'button-primary',
  secondary: 'button-secondary',
  ghost: 'border border-transparent text-textSoft hover:border-slate-200 hover:bg-hover hover:text-cream disabled:text-slate-500',
  danger: 'button-danger',
};

export default function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', disabled, ...props }) {
  const reduceMotion = useReducedMotion();
  const sizes = size === 'sm' ? 'min-h-10 px-3 py-2 text-sm' : 'min-h-11 px-4 py-2.5 text-sm';
  return (
    <motion.button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition duration-200 disabled:pointer-events-none disabled:cursor-not-allowed ${sizes} ${variants[variant] || variants.primary} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      whileTap={disabled || loading || reduceMotion ? undefined : { scale: 0.98 }}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </motion.button>
  );
}
