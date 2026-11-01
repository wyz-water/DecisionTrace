import { useEffect, useState } from "react";

/**
 * One page of a paginated list endpoint.
 *
 * `baseUrl` carries every filter (project, status, ...) but never
 * `limit`/`offset`; changing it resets to the first page.
 * `refreshKey` re-fetches the current page without losing position, which
 * is what a confirm/reject should do — jumping the user back to page 1
 * after every review is the fastest way to make the queue unusable.
 *
 * Every list endpoint returns the same envelope:
 *   { items, total, limit, offset, has_more }
 */

function emptyPage(limit) {
  return {
    items: [],
    total: 0,
    limit,
    offset: 0,
    has_more: false,
    // The URL this slice belongs to. Keeping it on the data (instead of
    // clearing state when filters change) means a project switch never
    // renders one frame of the previous project's rows.
    url: null,
  };
}

/**
 * Where should this page actually start?
 *
 * A write can shorten the list while the user is standing on the last
 * page (confirm the only pending candidate, for example). Rather than
 * showing an empty slice under a working pager, fall back to the new last
 * page. Returning the same offset means "this page is fine".
 */
function correctedOffset(data, offset, limit) {
  if (data.total === 0) {
    return 0;
  }

  if (data.items.length === 0 && offset > 0) {
    return Math.floor((data.total - 1) / limit) * limit;
  }

  return offset;
}

export default function usePagedList(baseUrl, limit, refreshKey = 0) {
  // Offset lives with the URL it belongs to, so a filter change can never
  // pair page 3 with a brand-new query.
  const [cursor, setCursor] = useState({ url: baseUrl, offset: 0 });

  if (cursor.url !== baseUrl) {
    setCursor({ url: baseUrl, offset: 0 });
  }

  const offset = cursor.url === baseUrl ? cursor.offset : 0;

  const [page, setPage] = useState(() => emptyPage(limit));
  const [loading, setLoading] = useState(Boolean(baseUrl));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!baseUrl) {
      return undefined;
    }

    let cancelled = false;
    const joiner = baseUrl.includes("?") ? "&" : "?";

    async function load() {
      setLoading(true);

      try {
        const response = await fetch(
          `${baseUrl}${joiner}limit=${limit}&offset=${offset}`
        );

        if (!response.ok) {
          throw new Error("Failed to load this page");
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        const nextOffset = correctedOffset(data, offset, limit);

        if (nextOffset !== offset) {
          // Triggers this effect again with the corrected offset; the
          // stale slice is never committed to state.
          setCursor({ url: baseUrl, offset: nextOffset });
          return;
        }

        setPage({ ...data, url: baseUrl });
        setError("");
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, limit, offset, refreshKey]);

  function setOffset(next) {
    setCursor({ url: baseUrl, offset: Math.max(0, next) });
  }

  const visible = page.url === baseUrl ? page : emptyPage(limit);

  return {
    items: visible.items,
    total: visible.total,
    limit,
    offset,
    hasMore: visible.has_more,
    loading: baseUrl ? loading : false,
    error,
    setOffset,
  };
}
