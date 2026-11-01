import { useEffect, useRef } from "react";

import { VIEW_GROUPS } from "../views";

/**
 * Sidebar — refactoring-ui constraint brief
 *
 * RANKING: navigation is not an action. It gets no fill, no accent
 * surface and no shadow; it sits one step below body ink when idle and
 * uses ink plus a rail plus weight when active, so the current section
 * reads at a glance without competing with the page's own primary button
 * (§2.8: one primary per screen — that button lives in the content area).
 *
 * TOKENS: values already in App.css.
 *   idle text #475467, active text #172033, group label #8b92a1,
 *   hover surface #eef1f6, active surface #ffffff, rail #315ca8,
 *   borders #e4e7ec / #e6e8ef, alert #b42318 on #fff1f0.
 *
 * ACCESSIBILITY: real anchors, so middle-click, back/forward and screen
 * readers all work; the current one carries aria-current="page". Groups
 * are role="group" with an accessible name, so the structure survives
 * when the visible labels are hidden on narrow screens. Focus is a
 * 3:1 :focus-visible ring, never a color change alone.
 *
 * COUNTS: only two sections can demand work — unreviewed candidates and
 * consistency issues. A number that never changes is noise, so the other
 * sections get none. The count is text, not just a colored dot (§5.7).
 *
 * NARROW SCREENS: the rail becomes a horizontally scrolling strip. A
 * deep link to the last section would otherwise open with that section
 * scrolled out of sight, so the active item brings itself into view.
 * block:"nearest" keeps it from scrolling the page itself.
 */

function countsFor(view, counts) {
  const value = counts?.[view.id] ?? 0;
  return Number.isFinite(value) ? value : 0;
}

export default function Sidebar({ active, counts = {} }) {
  const activeLink = useRef(null);

  useEffect(() => {
    activeLink.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  return (
    <nav className="sidebar" aria-label="Sections">
      {VIEW_GROUPS.map((group) => (
        <div
          className="sidebar-group"
          key={group.label}
          role="group"
          aria-label={group.label}
        >
          <p className="sidebar-label">{group.label}</p>

          <ul className="sidebar-list">
            {group.views.map((view) => {
              const count = countsFor(view, counts);
              const isActive = view.id === active;

              return (
                <li key={view.id}>
                  <a
                    ref={isActive ? activeLink : undefined}
                    className={
                      isActive ? "sidebar-link is-active" : "sidebar-link"
                    }
                    href={`#${view.id}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span>{view.label}</span>

                    {count > 0 && (
                      <span
                        className={
                          view.id === "consistency"
                            ? "sidebar-count is-alert"
                            : "sidebar-count"
                        }
                      >
                        {count}
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
