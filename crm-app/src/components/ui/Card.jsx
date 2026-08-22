export default function Card({ children, className = '', as: Component = 'section' }) {
  return <Component className={`card-premium ui-dark-surface ${className}`}>{children}</Component>;
}
