import React from 'react';
import { motion as motionEl } from 'framer-motion';

interface ScrollRevealProps {
  children: React.ReactNode;
  /** Stagger index — delays this element's reveal by `index * 0.12s`, for sequencing a list/grid of siblings. */
  index?: number;
  className?: string;
}

/**
 * CerebroOS scroll-reveal (design system §5): fade + 28px rise, 0.8s
 * cubic-bezier(0.22,1,0.36,1), 0.12s stagger. Triggers once when the element enters the
 * viewport. Use to wrap hero/section content on the marketing page — not app-shell screens,
 * which should render immediately.
 */
function ScrollReveal({ children, index = 0, className }: ScrollRevealProps) {
  return (
    <motionEl.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: (index % 3) * 0.12 }}
    >
      {children}
    </motionEl.div>
  );
}

export default ScrollReveal;
