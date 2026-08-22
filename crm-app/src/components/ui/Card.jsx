export default function Card({ children, className = '', as: Component = 'section' }) {
  return <Component className={`rounded-2xl border border-slate-200 bg-panel/95 shadow-glow backdrop-blur-sm ${className}`}>{children}</Component>;
}
