// src/hooks/useScrollLock.js
import { useEffect } from 'react';

/**
 * Freezes background scrolling while an overlay is open.
 *
 * Hiding the scrollbar reflows the page by its width, which is a visible jump
 * and a real layout-shift event — so the width is measured first and replaced
 * with equivalent padding. `--scrollbar-gap` is consumed by `body.scroll-locked`
 * in base.css.
 */
export default function useScrollLock(locked) {
  useEffect(() => {
    if (!locked) return undefined;

    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;

    body.style.setProperty('--scrollbar-gap', `${gap}px`);
    body.classList.add('scroll-locked');

    return () => {
      body.classList.remove('scroll-locked');
      body.style.removeProperty('--scrollbar-gap');
    };
  }, [locked]);
}
