/**
 * "Back" inside a screen that has pages of its own (a list, then a form,
 * then a picker). A component that is showing such an inner page registers
 * what Back should do; the header's Back and the phone's back gesture use the
 * latest one, and only when none is left do they leave the screen.
 *
 * Components register in the order a person goes deeper, so the last one in
 * the list is the page on top.
 */
import { useEffect, useRef } from 'react';

interface Entry {
  id: object;
  call: () => void;
}

let stack: Entry[] = [];

/** Runs the top inner Back. Returns false when there is none, so the app leaves the screen. */
export function runInnerBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.call();
  return true;
}

export const innerBackDepth = () => stack.length;
export const resetInnerBack = () => {
  stack = [];
};

/** Pass what Back should do while an inner page is showing, or null while the screen's first page is showing. */
export function useInnerBack(handler: (() => void) | null) {
  const id = useRef({}).current;
  const fn = useRef(handler);
  fn.current = handler;
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    stack.push({ id, call: () => fn.current?.() });
    return () => {
      stack = stack.filter((e) => e.id !== id);
    };
  }, [active, id]);
}
