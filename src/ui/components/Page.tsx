import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavBar } from './NavBar';
import { LargeTitle } from './LargeTitle';

/** Screen scaffold: sticky nav bar + collapsing large title. Scrolls inside `.app-content`. */
export function Page({ title, leading, trailing, children, largeTitle = true }: {
  title: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  largeTitle?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(!largeTitle);

  useEffect(() => {
    if (!largeTitle) return;
    const scroller = ref.current?.closest('.app-content');
    if (!scroller) return;
    const onScroll = () => setCollapsed(scroller.scrollTop > 36);
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [largeTitle]);

  return (
    <section className="screen" ref={ref}>
      <NavBar title={title} collapsed={collapsed} leading={leading} trailing={trailing} />
      <div className="screen-body">
        {largeTitle && <LargeTitle>{title}</LargeTitle>}
        {children}
      </div>
    </section>
  );
}
