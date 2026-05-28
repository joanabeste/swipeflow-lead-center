import { describe, it, expect } from "vitest";
import { buildDuplicateClusters, pickSurvivor, type LeadForCluster } from "../duplicate-clusters";

function lead(partial: Partial<LeadForCluster> & { id: string }): LeadForCluster {
  return {
    company_name: null,
    website: null,
    city: null,
    crm_status_id: null,
    lifecycle_stage: null,
    created_at: "2026-01-01T00:00:00Z",
    activity: 0,
    ...partial,
  };
}

describe("buildDuplicateClusters", () => {
  it("gruppiert Leads mit gleicher Domain (auch über Subdomain)", () => {
    const clusters = buildDuplicateClusters([
      lead({ id: "a", company_name: "Acme GmbH", website: "https://acme.de" }),
      lead({ id: "b", company_name: "Acme", website: "https://karriere.acme.de" }),
      lead({ id: "c", company_name: "Andere AG", website: "https://andere.de" }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((l) => l.id).sort()).toEqual(["a", "b"]);
  });

  it("gruppiert über exakt gleichen Namen ohne widersprechende Stadt", () => {
    const clusters = buildDuplicateClusters([
      lead({ id: "a", company_name: "Müller & Co", city: "Köln" }),
      lead({ id: "b", company_name: "Mueller & Co", city: "Köln" }),
    ]);
    expect(clusters).toHaveLength(1);
  });

  it("trennt gleichen Namen bei widersprechenden Domains", () => {
    const clusters = buildDuplicateClusters([
      lead({ id: "a", company_name: "Schmidt GmbH", website: "https://schmidt-koeln.de" }),
      lead({ id: "b", company_name: "Schmidt GmbH", website: "https://schmidt-berlin.de" }),
    ]);
    expect(clusters).toHaveLength(0);
  });

  it("gibt nur Cluster mit >= 2 Leads zurück", () => {
    const clusters = buildDuplicateClusters([
      lead({ id: "a", company_name: "Einzeln GmbH", website: "https://einzeln.de" }),
    ]);
    expect(clusters).toHaveLength(0);
  });
});

describe("pickSurvivor", () => {
  it("bevorzugt den Lead mit der meisten Aktivität", () => {
    const survivor = pickSurvivor([
      lead({ id: "a", activity: 1 }),
      lead({ id: "b", activity: 5 }),
    ]);
    expect(survivor.id).toBe("b");
  });

  it("nutzt bei Gleichstand den weiteren Lifecycle-Stage", () => {
    const survivor = pickSurvivor([
      lead({ id: "a", activity: 2, lifecycle_stage: "lead" }),
      lead({ id: "b", activity: 2, lifecycle_stage: "customer" }),
    ]);
    expect(survivor.id).toBe("b");
  });

  it("fällt zuletzt auf das älteste created_at zurück", () => {
    const survivor = pickSurvivor([
      lead({ id: "a", created_at: "2026-03-01T00:00:00Z" }),
      lead({ id: "b", created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(survivor.id).toBe("b");
  });
});
