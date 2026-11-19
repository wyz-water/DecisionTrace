/**
 * Project-scoped display numbers for decisions and chains.
 *
 * Global database ids never show in the UI. Within one project:
 * - chains are numbered 1..N by their first decision's time,
 * - a chain node shows "#chain-node" (e.g. #1-2 = chain 1, its second
 *   decision),
 * - standalone decisions (no chain) are numbered 1..M by their own
 *   order.
 */
export function buildDecisionNumbers(decisions) {
  const list = decisions ?? [];

  const chainFirstTime = new Map();

  for (const decision of list) {
    if (decision.chain_id == null) {
      continue;
    }

    const time = decision.created_at ?? "";
    const current = chainFirstTime.get(decision.chain_id);

    if (current == null || time < current) {
      chainFirstTime.set(decision.chain_id, time);
    }
  }

  const chainLocal = new Map();

  [...chainFirstTime.keys()]
    .sort((first, second) =>
      chainFirstTime.get(first) < chainFirstTime.get(second) ? -1 : 1
    )
    .forEach((chainId, index) => chainLocal.set(chainId, index + 1));

  const chainNodes = new Map();

  for (const decision of list) {
    if (decision.chain_id == null) {
      continue;
    }

    if (!chainNodes.has(decision.chain_id)) {
      chainNodes.set(decision.chain_id, []);
    }

    chainNodes.get(decision.chain_id).push(decision);
  }

  for (const nodes of chainNodes.values()) {
    nodes.sort((first, second) =>
      (first.created_at ?? "") > (second.created_at ?? "") ? 1 : -1
    );
  }

  const standalone = list
    .filter((decision) => decision.chain_id == null)
    .sort((first, second) =>
      (first.created_at ?? "") > (second.created_at ?? "")
        ? 1
        : first.id - second.id
    );

  function decisionNumber(decision) {
    if (decision.chain_id == null) {
      const index = standalone.findIndex(
        (entry) => entry.id === decision.id
      );

      return "#" + (index + 1);
    }

    const local = chainLocal.get(decision.chain_id);
    const nodes = chainNodes.get(decision.chain_id) ?? [];
    const index = nodes.findIndex((entry) => entry.id === decision.id);

    return "#" + local + "-" + (index + 1);
  }

  function chainNumber(chainId) {
    return chainLocal.get(chainId) ?? null;
  }

  return { decisionNumber, chainNumber, chainLocal };
}
