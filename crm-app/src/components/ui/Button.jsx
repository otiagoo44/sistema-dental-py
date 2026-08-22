import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

const variants = {
  primary: 'bg-mint text-white shadow-sm hover:bg-blue-700',
  secondary: 'border border-slate-200 bg-white text-cream hover:border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-cream',
  danger: 'border border-red-200 bg-white text-danger hover:bg-red-50',
};

export default function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', disabled, ...props }) {
  const sizes = size === 'sm' ? 'min-h-9 px-3 py-2 text-xs' : 'min-h-11 px-4 py-2.5 text-sm';
  return (
    <motion.button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${sizes} ${variants[variant] || variants.primary} ${className}`}
      disabled={disabled || loading}
      whileTap={disabled || loading ? undefined : { scale: 0.98 }}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </motion.button>
  );
}
