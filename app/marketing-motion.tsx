'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Content is visible in HTML. Animation enhances it without becoming a visibility gate.
export default function MarketingMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = matchMedia('(min-width: 1001px)');
    const animations = new Set<Animation>();
    let observer: IntersectionObserver | undefined;
    let frame = 0;
    const animate = (node: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
      if (!node.animate) return;
      const animation = node.animate(keyframes, options);
      animations.add(animation);
      animation.onfinish = () => animations.delete(animation);
    };
    const update = () => {
      frame = 0;
      element.style.setProperty('--drift', Math.min(Math.max(scrollY, 0) * .055, 32) + 'px');
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const reset = () => {
      observer?.disconnect();
      animations.forEach(animation => animation.cancel());
      animations.clear();
      window.removeEventListener('scroll', scroll);
      cancelAnimationFrame(frame);
      frame = 0;
      element.style.setProperty('--drift', '0px');
    };
    const configure = () => {
      reset();
      if (reduced.matches) return;
      element.querySelectorAll('[data-hero]').forEach((node, index) => animate(node,
        [{ opacity: .25, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 850, delay: index * 85, easing: 'cubic-bezier(.2,.7,.2,1)' }));
      const art = element.querySelector('[data-hero-art]');
      if (art) animate(art, [{ opacity: .6, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 1200, easing: 'ease-out' });
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(entries => {
          entries.filter(entry => entry.isIntersecting).forEach((entry, index) => {
            animate(entry.target, [{ opacity: .25, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 750, delay: Math.min(index * 70, 140), easing: 'cubic-bezier(.2,.7,.2,1)' });
            observer?.unobserve(entry.target);
          });
        }, { threshold: .08 });
        element.querySelectorAll('[data-reveal]').forEach(node => observer?.observe(node));
      }
      if (desktop.matches) { window.addEventListener('scroll', scroll, { passive: true }); update(); }
    };
    configure();
    reduced.addEventListener('change', configure);
    desktop.addEventListener('change', configure);
    return () => { reset(); reduced.removeEventListener('change', configure); desktop.removeEventListener('change', configure); };
  }, [pathname]);

  return <div ref={root} className="marketing">{children}</div>;
}
