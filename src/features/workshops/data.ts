// Seed data for the Domain Ownership Workshop.
// Extracted verbatim from the design handoff (Domain Ownership Workshop.dc.html).
// People, domains, role model, draft answers and advisory notes are seed content.

import type {
  Advisory,
  Company,
  Domain,
  DomainField,
  MatrixRow,
  ParkItem,
  RoleMeaning,
  Stage,
  Suggestion,
  TagStyle,
  WaveKey,
  WaveMeta,
} from "./types";

export const PEOPLE: string[] = [
  "Patrick Stiller",
  "Mike Spencer",
  "Kerri Voiss",
  "Matt Francis",
  "Matt Pennaz",
  "Matt Talarico",
  "Eudias Tata",
  "Robert LaMontagne",
  "Michael Kenney",
  "Dawn Kreuz",
  "Brenda Lins",
  "Robin Virginia",
  "Dominique Mathers",
  "Sara Wahlberg",
  "Jim Cecere",
  "Bradley Grove",
  "Stuart Langley",
  "Steve Nahrup",
  "Alex Wallenfelsz",
  "Erik Levy",
  "Jared Kemper",
  "Phil Kelly",
  "Lori Dunn",
  "Jeff Cook",
  "Matt Finch",
  "Crytal Nichols",
  "Mandy Rolph",
  "Kirsten Olson",
  "Michelle Allshouse",
  "Michelle Mathison",
  "Rachel Schrader",
  "Cole Cwynar",
  "Brannon Pitman",
  "Kelly Chapman",
  "Matt Buttler",
  "Jim Perron",
  "Kevin Casey",
  "Omari Amsterdam",
  "Jaret Clarke",
  "Jason Shiro",
  "Lorrie Connely",
  "Diana Allsides",
  "Chad Sacre",
  "Dave Kampa",
  "Elana Kampfer",
  "Mark Miller",
  "Dan Oakely",
  "Matt Sandhoffner",
  "Lee Prochnow",
  "David Stamper",
  "LeeAnne Lankes",
  "Christina Hanna",
  "Joe Pottoff",
  "Josh Beals",
  "John Lee",
  "Robert Johnson",
  "Ryan Mozzetti",
  "Joe Huff",
  "Bryan King",
  "Omar Shukri",
];
export const SENS_OPTS: string[] = ["", "Public", "Internal", "Confidential", "Restricted"];
export const WAVE_META: Record<WaveKey, WaveMeta> = {
  "1": { label: "First wave", sub: "Name candidates today", color: "#1b5e9e" },
  "2": { label: "Second wave", sub: "Sequence only", color: "#446084" },
  "3": { label: "Third wave", sub: "Sensitive, later phases", color: "#9fb0c2" },
  F: { label: "Foundation", sub: "Cross-cutting, platform-held", color: "#8a9099" },
};
export const WAVE_ORDER: WaveKey[] = ["1", "2", "3", "F"];
export const WAVE_NOTES: Record<string, string> = {
  sales: "steward now · build in wave 2",
  finance: "isolation rules + security owner now",
};
export const STAGES: Stage[] = [
  { n: "01", name: "What today decides", min: 10, kind: "brief" },
  { n: "02", name: "The role model", min: 15, kind: "decide" },
  { n: "03", name: "Order of precedence", min: 15, kind: "decide" },
  { n: "04", name: "The roster", min: 30, kind: "capture" },
  { n: "05", name: "What each domain means", min: 25, kind: "capture" },
  { n: "06", name: "What a name signs up for", min: 10, kind: "brief" },
  { n: "07", name: "Parking lot", min: 5, kind: "capture" },
  { n: "08", name: "Read-back and export", min: 10, kind: "readback" },
];
export const KIND_COLORS: Record<string, string> = {
  brief: "#446084",
  decide: "#14314f",
  capture: "#1b5e9e",
  readback: "#1e7b4d",
};
export const DOM_FIELDS: DomainField[] = [
  { k: "source", label: "Authoritative source of record", type: "text", req: true },
  { k: "conformed", label: "Enterprise-conformed vs company-specific", type: "text" },
  { k: "sensitivity", label: "Sensitivity classification", type: "sens", req: true },
  { k: "certified", label: "What counts as certified here", type: "text" },
];
export const DEEP_QS: string[] = [
  "Business outcome targeted",
  "Domains + company scope involved",
  "Source systems + identifiers",
  "What gets standardized",
  "What integrates across domains and companies",
  "What stays local or company-specific",
  "Gold grain and semantic-model audience",
  "Security + classification controls",
  "Purview metadata required",
  "Legacy asset to retire or replace",
  "Risks and open questions blocking delivery",
  "How success is measured",
];
export const DOMAINS: Domain[] = [
  {
    key: "product",
    name: "Product",
    wave: "1",
    tag: "Fabric MVP · Phase 1",
    opmodel:
      "Coordination with partial unification: shared item definitions, product hierarchy, formula-facing IDs, M3 schema normalization.",
    sources:
      "M3 On-Prem · M3 Cloud · Optiva (formula linkage) · MES (batch and product traceability)",
    ident: "Item Number / MMITNO · company and division code · formula IDs",
    defq: "Distributor vs manufacturer view, plus M3 6-character names, on-prem vs cloud schema differences, hierarchy definitions, and product status interpretation.",
    deep: true,
  },
  {
    key: "customer",
    name: "Customer",
    wave: "1",
    tag: "High-value shared domain",
    opmodel:
      "Coordination: M3 and Salesforce identifiers, account hierarchy, stewardship, privacy classification.",
    sources: "M3 OCUSMA · Salesforce via DBAmp · Price Supports as needed",
    ident: "Customer Number / OKCUNO · Salesforce account IDs · company and division scope",
    defq: "Distributor vs manufacturer view, plus duplicate customers, open Salesforce integration details, and cross-company visibility.",
    deep: true,
  },
  {
    key: "company",
    name: "Company scope",
    wave: "1",
    tag: "Authority, not a build domain",
    opmodel:
      "Diversification plus isolation. Financial isolation is non-negotiable: no operating company sees another company\u2019s numbers. Enforced through separate workspaces and capacities, not in-model RLS.",
    sources: "Policy domain, enforced by the Architecture Board and Security across all workspaces",
    ident: "Company and division code on every conformed dimension",
    defq: "Who holds the isolation-policy pen, and what the enforcement mechanism is (separate workspaces and capacities vs in-model RLS).",
    ownerLabel: "Owner authority (CIO level)",
    noSteward: true,
    deep: false,
  },
  {
    key: "sales",
    name: "Sales",
    wave: "1",
    tag: "Steward now · full build wave 2",
    opmodel:
      "Coordination on conformed measures. Worst metric-collision domain: two BI models share 68 measure names computed from different sources (cost, rebate, margin).",
    sources: "M3 OOHEAD/OOLINE · Salesforce · IPC_PowerData · DiverData legacy warehouse",
    ident:
      "Order + line · customer number · item number · company and division · invoice and date keys",
    defq: "Revenue-recognition view vs sales-team view, plus cost, rebate, and margin (margin = sales less cost less price support), legacy DiverData and PowerData transforms, and report parity.",
    deep: true,
  },
  {
    key: "finance",
    name: "Finance",
    wave: "1",
    tag: "Isolation rules + security owner now · full rollout later",
    opmodel:
      "Local by company plus a controlled enterprise aggregate. RLS and security controls are mandatory; cross-company detail requires explicit approval.",
    sources:
      "M3 financial tables · existing finance reports · Gold enterprise aggregate (after security review)",
    ident: "Company and division · account · period · cost and profit center",
    defq: "GAAP vs internal profitability, plus cross-company drill-through risk and semantic-model sharing constraints.",
    extra: [
      {
        k: "secowner",
        label: "Security owner (signs off the access posture)",
        type: "name",
        req: true,
      },
    ],
    deep: true,
  },
  {
    key: "manufacturing",
    name: "Manufacturing",
    wave: "2",
    tag: "Two companies only · no distribution-side MES",
    opmodel:
      "Differentiated by company. Full Batch ID traceability where MES runs; a lighter shared pattern at the molding business; no manufacturing domain on the distribution side.",
    sources: "MES · ANV · OATES · FactoryTalk Batch · M3 On-Prem · MPD SHAR (molding)",
    ident:
      "Batch ID (universal cross-system key) · work and manufacturing order · item · warehouse",
    defq: "Batch ID formatting standard, plus handling for the 1-2% of MES to M3 syncs that fail, and the no-MES rule on the distribution side.",
    deep: false,
  },
  {
    key: "quality",
    name: "Quality",
    wave: "3",
    tag: "Critical for traceability",
    opmodel: "Later phase, but traceability-critical: NCRs, QC testing, compliance evidence.",
    sources: "ETQ · MES QC · OATES · ANV · M3 references · SPC (molding)",
    ident: "NCR and QC test keys joined through Batch ID",
    defq: "The ETQ integration pattern and the OATES/ANV source-of-record split.",
    deep: false,
  },
  {
    key: "rnd",
    name: "R&D / Formulation",
    wave: "3",
    tag: "Sensitive · protect",
    opmodel: "Latest phase; formula confidentiality dominates every design choice.",
    sources: "Optiva · M3 · MES · X-Rite/DataColor · Sphera IA",
    ident: "Formula IDs · raw-material codes · product specs",
    defq: "The formula confidentiality limit (who may see composition vs formula-ID-only linkage), the Optiva to M3 Cloud scope, and the manual Salesforce to R&D hand-off.",
    deep: false,
  },
  {
    key: "shared",
    name: "Shared conformed dimensions",
    wave: "F",
    tag: "Cross-cutting foundation",
    opmodel:
      "Owned by the platform and data team with steward validation. One definition per dimension; conflicts escalate to the Architecture Board.",
    sources: "Gold layer, built from each domain\u2019s approved source of record",
    ident:
      "Product · Customer · Company · Date · Warehouse · Sales Rep · Domain · Source System · Classification",
    defq: "Guard rails: over-conformance, leaking company-specific detail, duplicate definitions.",
    deep: false,
  },
];
export const SUGGEST_WAVES: Record<string, WaveKey> = {
  product: "1",
  customer: "1",
  company: "1",
  sales: "1",
  finance: "1",
  manufacturing: "2",
  quality: "3",
  rnd: "3",
  shared: "F",
};
export const MX_GROUP_ORDER: string[] = [
  "customer",
  "sales",
  "product",
  "finance",
  "quality",
  "manufacturing",
  "rnd",
  "company",
  "shared",
];
export const MX_ORDER: Record<string, string> = {
  customer: "1",
  sales: "2",
  product: "3",
  finance: "4",
  quality: "5",
  manufacturing: "6",
  rnd: "7",
  company: "+",
  shared: "+",
};
export const COMPANIES: Record<string, Company> = {
  "IP Corp": {
    color: "#0e2338",
    tip: "Parent / holding company. M3 On-Prem. Enterprise scope: rows here cover all operating companies.",
  },
  Interplastic: {
    color: "#1b5e9e",
    tip: "CONO 100 · M3 On-Prem · has MES. Polyester and vinyl ester resin manufacturing. Manufacturing and Batch ID traceability apply here.",
  },
  "HK Research": {
    color: "#446084",
    tip: "CONO 200 · M3 On-Prem · has MES. Gel coat manufacturing. Shares customer-service teams and tools with Interplastic.",
  },
  NAC: {
    color: "#75828f",
    tip: "M3 Cloud · no MES, distribution only. Hard rule: NAC cannot see Interplastic financials. No NAC row belongs under Manufacturing.",
  },
  "Molding Products": {
    color: "#9fb0c2",
    tip: "M3 Cloud · no full MES (uses its own lighter shared pattern). SMC/BMC manufacturing. Cannot see Interplastic financials.",
  },
};
export const CURRENT_MATRIX: MatrixRow[] = [
  {
    dom: "customer",
    co: "IP Corp",
    sme: "Crytal Nichols",
    steward: "Mandy Rolph",
    owner: "Kirsten Olson",
    ba: "Sara Wahlberg",
  },
  {
    dom: "customer",
    co: "NAC",
    sme: "",
    steward: "Michelle Allshouse",
    owner: "Michelle Mathison",
    ba: "",
  },
  {
    dom: "sales",
    co: "HK Research",
    sme: "Matt Buttler",
    steward: "Jim Perron",
    owner: "Kevin Casey",
    ba: "Omari Amsterdam",
  },
  {
    dom: "sales",
    co: "",
    sme: "Jaret Clarke",
    steward: "Jason Shiro",
    owner: "Erik Levy",
    ba: "Lorrie Connely",
  },
  {
    dom: "product",
    co: "Interplastic",
    sme: "Rachel Schrader",
    steward: "Cole Cwynar",
    owner: "Brannon Pitman",
    ba: "Kelly Chapman",
  },
  {
    dom: "product",
    co: "Molding Products",
    sme: "",
    steward: "Crytal Nichols",
    owner: "Matt Finch",
    ba: "",
  },
  {
    dom: "finance",
    co: "",
    sme: "Diana Allsides",
    steward: "Chad Sacre",
    owner: "Dave Kampa",
    ba: "Elana Kampfer",
  },
  { dom: "finance", co: "", sme: "", steward: "Mark Miller", owner: "Phil Kelly", ba: "" },
  {
    dom: "quality",
    co: "",
    sme: "Dan Oakely",
    steward: "Matt Sandhoffner",
    owner: "Lee Prochnow",
    ba: "Matt Talarico",
  },
  { dom: "quality", co: "", sme: "David Stamper", steward: "LeeAnne Lankes", owner: "", ba: "" },
  {
    dom: "manufacturing",
    co: "",
    sme: "Christina Hanna",
    steward: "Joe Pottoff / Josh Beals",
    owner: "Robert LaMontagne",
    ba: "John Lee",
  },
  {
    dom: "manufacturing",
    co: "",
    sme: "Robert Johnson",
    steward: "Ryan Mozzetti",
    owner: "Joe Huff",
    ba: "Matt Talarico",
  },
  { dom: "rnd", co: "", sme: "Bryan King", steward: "", owner: "Jim Cecere", ba: "Omar Shukri" },
  { dom: "company", co: "IP Corp", sme: "", steward: "", owner: "", ba: "" },
  { dom: "shared", co: "IP Corp", sme: "", steward: "", owner: "", ba: "" },
];
export const SUGGEST: Record<string, Suggestion> = {
  "d.product.source": {
    v: "M3 On-Prem item master (MMITNO) as source of record; M3 Cloud + Optiva as enrichment for formula-facing IDs",
    why: "Matches the Product domain brief\u2019s source list and the M3-first reality.",
    src: "03_Domain_Documentation/Product",
  },
  "d.product.conformed": {
    v: "Enterprise: item ID, hierarchy, product group and class, status. Company-specific: costing attributes, local warehouse detail",
    why: "Coordination with partial unification, from the operating-model decision.",
    src: "02_Operating_Model_Decision_Record",
  },
  "d.product.sensitivity": {
    v: "Internal",
    why: "Internal by default; formula-linked attributes escalate to Confidential.",
    src: "06_Purview_Governance_Charter",
  },
  "d.product.certified": {
    v: "Owner-approved hierarchy + documented grain + passing DQ checks on MMITNO uniqueness + lineage visible",
    why: "Applies the charter\u2019s certification bar to this domain.",
    src: "06_Purview_Governance_Charter",
  },
  "d.product.defcall": {
    v: "Model distributor vs manufacturer as a role attribute on the conformed product dimension so both views coexist; the owner approves this as their first decision.",
    why: "Keeps both business perspectives without forking the dimension.",
    src: "DQ-019",
  },
  "d.customer.source": {
    v: "M3 OCUSMA as source of record; Salesforce accounts mapped via DBAmp; duplicates resolve toward OKCUNO",
    why: "M3 is the source of truth today; Salesforce integration details remain open.",
    src: "03_Domain_Documentation/Customer",
  },
  "d.customer.conformed": {
    v: "Enterprise: customer ID, account hierarchy, ship-to, bill-to, and sold-to. Company-specific: credit terms, local pricing",
    why: "Coordination treatment from the operating-model decision.",
    src: "02_Operating_Model_Decision_Record",
  },
  "d.customer.sensitivity": {
    v: "Confidential",
    why: "The customer master carries privacy-classified data.",
    src: "06_Purview_Governance_Charter",
  },
  "d.customer.certified": {
    v: "Deduped customer dimension with documented hierarchy, privacy classification reviewed, lineage visible",
    why: "The charter\u2019s certification bar applied to the known duplicate-customer risk.",
    src: "06_Purview_Governance_Charter",
  },
  "d.customer.defcall": {
    v: "Distributor vs manufacturer carried as a customer-role attribute; dedupe policy owned by the steward; the owner approves.",
    why: "Same dual-definition pattern as Product. Resolve once, apply twice.",
    src: "DQ-019",
  },
  "d.company.source": {
    v: "Isolation enforced through separate workspaces and capacities (per-company capacity plus a small enterprise layer aggregating Gold only)",
    why: "Matches the current enforcement mechanism on record; in-model RLS is not the mechanism today.",
    src: "financial-isolation clarification 2026-05-18",
  },
  "d.company.conformed": {
    v: "Company and division code present on every conformed dimension; no cross-company financial detail anywhere",
    why: "The one attribute that must conform everywhere.",
    src: "02_Operating_Model_Decision_Record",
  },
  "d.company.sensitivity": {
    v: "Restricted",
    why: "Cross-company financial visibility is the highest-risk surface in the program.",
    src: "06_Purview_Governance_Charter",
  },
  "d.company.certified": {
    v: "Enforcement pair on record: Architecture Board + Security co-approve any cross-company dataset",
    why: "Mirrors the role-model row where cross-company approval is jointly accountable.",
    src: "07_Data_Owner_and_Steward_RACI",
  },
  "d.company.defcall": {
    v: "Approve: separate workspaces and capacities are the enforcement mechanism; revisit only if workspaces ever consolidate.",
    why: "Currently audited models have zero RLS roles, acceptable only while workspaces stay per-entity.",
    src: "financial-isolation clarification 2026-05-18",
  },
  "d.sales.source": {
    v: "M3 OOHEAD/OOLINE as transactional source of record; DiverData and PowerData transforms documented, then retired",
    why: "Names the end state and the retirement path in one line.",
    src: "03_Domain_Documentation/Sales",
  },
  "d.sales.conformed": {
    v: "Enterprise: conformed measures (net sales; margin = sales less cost less price support). Company-specific: rebate programs, local pricing logic",
    why: "The 68 shared measure names collide today; conformance is the whole point.",
    src: "cross-model overlap analysis",
  },
  "d.sales.sensitivity": {
    v: "Confidential",
    why: "Sales detail is commercially sensitive but not Restricted-tier.",
    src: "06_Purview_Governance_Charter",
  },
  "d.sales.certified": {
    v: "One certified sales model per company replacing the colliding measure names, with owner-signed measure definitions",
    why: "Directly answers the metric-collision problem.",
    src: "cross-model overlap analysis",
  },
  "d.sales.defcall": {
    v: "Publish revenue-recognition and sales-team views as separately named measure groups; the owner approves which is the certified default.",
    why: "Keeps both truths visible instead of silently picking one.",
    src: "DQ-019",
  },
  "d.finance.secowner": {
    v: "Michael Kenney (Sr. Manager, IT Operations, internal security and AD owner)",
    why: "Named as the security and AD owner this domain\u2019s access posture depends on; his team is the roadmap long pole for access control.",
    src: "DQ-071 · 2026-07-01 strategic planning",
  },
  "d.finance.source": {
    v: "M3 financial tables per company; enterprise aggregate only from Gold after security review",
    why: "Local-by-company treatment with a controlled aggregate.",
    src: "02_Operating_Model_Decision_Record",
  },
  "d.finance.conformed": {
    v: "Nothing crosses companies at detail grain; the enterprise aggregate carries only pre-approved Gold measures",
    why: "The isolation rule restated as a conformance rule.",
    src: "02_Operating_Model_Decision_Record",
  },
  "d.finance.sensitivity": {
    v: "Restricted",
    why: "Highest classification in the program.",
    src: "06_Purview_Governance_Charter",
  },
  "d.finance.certified": {
    v: "Isolation posture reviewed + no cross-company drill-through + security-owner sign-off",
    why: "Certification here is a security event, not just a quality event.",
    src: "06_Purview_Governance_Charter",
  },
  "d.finance.defcall": {
    v: "GAAP as the certified default; internal-profitability views published but clearly labeled non-GAAP. The owner approves.",
    why: "Resolves the dual definition without suppressing the internal view.",
    src: "DQ-019",
  },
  "d.manufacturing.source": {
    v: "MES as source of record for batch execution where it runs; M3 for orders; the molding business uses its shared-drive pattern; the distribution side is out of scope",
    why: "Differentiated-by-company treatment.",
    src: "02_Operating_Model_Decision_Record",
  },
  "d.manufacturing.conformed": {
    v: "Enterprise: Batch ID as the universal key, item, warehouse. Company-specific: line and equipment detail",
    why: "Batch ID is the program\u2019s universal cross-system key.",
    src: "system doctrine",
  },
  "d.manufacturing.sensitivity": {
    v: "Internal",
    why: "Operational data; escalates where quality or compliance context attaches.",
    src: "06_Purview_Governance_Charter",
  },
  "d.manufacturing.certified": {
    v: "Batch ID lineage from MES to M3 documented, including handling for the known 1-2% sync failures",
    why: "Certifiable traceability must own its failure mode.",
    src: "03_Domain_Documentation/Manufacturing",
  },
  "d.manufacturing.defcall": {
    v: "Adopt a Batch ID formatting standard and a documented reconciliation path for MES to M3 sync failures.",
    why: "The two blockers named in the domain brief.",
    src: "03_Domain_Documentation/Manufacturing",
  },
  "d.quality.source": {
    v: "ETQ for NCR and compliance; MES QC for in-process results; the OATES/ANV split documented before build",
    why: "The source-of-record split the brief flags.",
    src: "03_Domain_Documentation/Quality",
  },
  "d.quality.conformed": {
    v: "Enterprise: NCR and QC linkage through Batch ID. Company-specific: local test methods",
    why: "Traceability-first conformance.",
    src: "03_Domain_Documentation/Quality",
  },
  "d.quality.sensitivity": {
    v: "Confidential",
    why: "Quality context is sensitive (compliance, customer exposure).",
    src: "06_Purview_Governance_Charter",
  },
  "d.quality.certified": {
    v: "QC lineage joined through Batch ID with the ETQ integration pattern decided and documented",
    why: "Certification depends on the integration decision.",
    src: "03_Domain_Documentation/Quality",
  },
  "d.quality.defcall": {
    v: "Decide the ETQ integration pattern and the OATES/ANV source-of-record split before any build.",
    why: "Both are named blockers in the brief.",
    src: "03_Domain_Documentation/Quality",
  },
  "d.rnd.source": {
    v: "Optiva as the formula source of record; M3 Cloud linkage scoped separately",
    why: "The brief\u2019s source hierarchy.",
    src: "03_Domain_Documentation/R&D",
  },
  "d.rnd.conformed": {
    v: "Enterprise: formula-facing IDs only. Composition never conforms; it stays behind the confidentiality limit",
    why: "Formula confidentiality dominates every design choice here.",
    src: "03_Domain_Documentation/R&D",
  },
  "d.rnd.sensitivity": {
    v: "Restricted",
    why: "Formulas are the company\u2019s crown jewels.",
    src: "06_Purview_Governance_Charter",
  },
  "d.rnd.certified": {
    v: "Certified only with formula-confidentiality controls verified and the composition vs ID split tested",
    why: "Security review comes before certification here.",
    src: "06_Purview_Governance_Charter",
  },
  "d.rnd.defcall": {
    v: "Define who may see composition vs formula-ID-only linkage; document the manual Salesforce to R&D hand-off for later automation.",
    why: "The two open scoping calls in the brief.",
    src: "03_Domain_Documentation/R&D",
  },
  "d.shared.source": {
    v: "Gold conformed dimensions built from each domain\u2019s approved source of record, one definition per dimension",
    why: "The anti-duplicate rule.",
    src: "03_Domain_Documentation/Shared",
  },
  "d.shared.conformed": {
    v: "Product, Customer, Company, Date, Warehouse, Sales Rep, Domain, Source System, Classification",
    why: "The named conformed set.",
    src: "03_Domain_Documentation/Shared",
  },
  "d.shared.sensitivity": {
    v: "Internal",
    why: "Dimensions carry structure, not sensitive facts, but never company-specific financial detail.",
    src: "06_Purview_Governance_Charter",
  },
  "d.shared.certified": {
    v: "Certified when every consuming domain signs the shared definition; no duplicate dimension definitions anywhere",
    why: "Conformance is a signature, not an assumption.",
    src: "03_Domain_Documentation/Shared",
  },
  "d.shared.defcall": {
    v: "Watch list: over-conformance, leaking company-specific detail, duplicate definitions. Conflicts escalate to the Architecture Board.",
    why: "The brief\u2019s named risks, owned explicitly.",
    src: "03_Domain_Documentation/Shared",
  },
  "deep.product.0": {
    v: "One certified product dimension the Fabric MVP, Sales, Manufacturing, and Quality all consume.",
  },
  "deep.product.1": {
    v: "Product domain, all four operating companies; formula linkage touches R&D scope.",
  },
  "deep.product.2": {
    v: "M3 On-Prem and Cloud (MMITNO), Optiva formula IDs, MES product and batch references.",
  },
  "deep.product.3": {
    v: "Item identity, hierarchy, product group and class, status interpretation.",
  },
  "deep.product.4": {
    v: "Item definitions and hierarchy conform across companies; formula-facing IDs bridge to R&D.",
  },
  "deep.product.5": {
    v: "Costing attributes, local warehouse data, company-specific merchandising.",
  },
  "deep.product.6": {
    v: "Gold product dimension at item grain; audience = every certified domain model.",
  },
  "deep.product.7": {
    v: "Internal by default; Confidential where formula-linked; no composition data.",
  },
  "deep.product.8": {
    v: "Owner, steward, source, scope, sensitivity, lifecycle, lineage: the full charter set.",
  },
  "deep.product.9": { v: "Legacy per-model product tables in the two overlapping BI models." },
  "deep.product.10": {
    v: "M3 6-character names; on-prem vs cloud schema drift; hierarchy ownership; product-status semantics.",
  },
  "deep.product.11": {
    v: "Every certified model consumes the shared dimension; zero duplicate product definitions.",
  },
  "deep.customer.0": {
    v: "One deduped customer dimension serving Sales reporting and account-hierarchy analytics.",
  },
  "deep.customer.1": {
    v: "Customer domain; enterprise conformance with per-company visibility rules.",
  },
  "deep.customer.2": { v: "M3 OCUSMA (OKCUNO), Salesforce account IDs via DBAmp, Price Supports." },
  "deep.customer.3": {
    v: "Customer identity, account hierarchy, ship-to, bill-to, and sold-to roles.",
  },
  "deep.customer.4": {
    v: "Customer identity conforms enterprise-wide; Salesforce mapping standardizes.",
  },
  "deep.customer.5": { v: "Credit terms, local pricing, company-specific service arrangements." },
  "deep.customer.6": {
    v: "Gold customer dimension at customer grain; audience = Sales and commercial models.",
  },
  "deep.customer.7": { v: "Confidential; privacy classification applies to the master." },
  "deep.customer.8": { v: "Full charter set plus privacy classification review." },
  "deep.customer.9": {
    v: "Per-model customer lookups in legacy reports; duplicate customer records.",
  },
  "deep.customer.10": {
    v: "Salesforce integration details open; duplicate policy; cross-company visibility.",
  },
  "deep.customer.11": {
    v: "Duplicate rate measured and falling; one hierarchy consumed everywhere.",
  },
  "deep.sales.0": {
    v: "Kill the metric collisions: one certified sales model per company with signed measure definitions.",
  },
  "deep.sales.1": { v: "Sales domain per company; conformed measures at the enterprise layer." },
  "deep.sales.2": { v: "M3 OOHEAD/OOLINE, Salesforce, IPC_PowerData, DiverData legacy." },
  "deep.sales.3": {
    v: "Measure definitions: net sales, cost, rebate, margin (sales less cost less price support).",
  },
  "deep.sales.4": {
    v: "Conformed measures plus shared dimensions; RevRec and sales-team views as named groups.",
  },
  "deep.sales.5": {
    v: "Rebate programs, local pricing logic, company-specific incentive structures.",
  },
  "deep.sales.6": { v: "Gold fact at order-line grain; audience = commercial teams per company." },
  "deep.sales.7": { v: "Confidential; no cross-company aggregation of financial detail." },
  "deep.sales.8": { v: "Full charter set plus measure-definition sign-off evidence." },
  "deep.sales.9": {
    v: "DiverData daily truncate-and-reload transforms; the two colliding BI models.",
  },
  "deep.sales.10": {
    v: "Legacy transform archaeology; report parity risk; currency and price logic.",
  },
  "deep.sales.11": {
    v: "68 colliding measure names reduced to one signed definition each; report parity verified.",
  },
  "deep.finance.0": {
    v: "Documented isolation rules now; certified per-company finance models later.",
  },
  "deep.finance.1": { v: "Finance per company; enterprise aggregate only at Gold, pre-approved." },
  "deep.finance.2": {
    v: "M3 financial tables; company and division, account, period, cost and profit center.",
  },
  "deep.finance.3": { v: "Chart and account mapping per company; aggregate measure definitions." },
  "deep.finance.4": {
    v: "Only the approved Gold aggregate crosses companies; nothing at detail grain.",
  },
  "deep.finance.5": { v: "Everything at detail grain stays local by company." },
  "deep.finance.6": {
    v: "Per-company finance models; a thin enterprise aggregate for the executive layer.",
  },
  "deep.finance.7": {
    v: "Restricted; workspace and capacity isolation enforced; drill-through blocked.",
  },
  "deep.finance.8": { v: "Full charter set plus security-owner sign-off recorded." },
  "deep.finance.9": { v: "Manual cross-company spreadsheet aggregation." },
  "deep.finance.10": {
    v: "Cross-company drill-through; semantic-model sharing constraints; GAAP vs internal.",
  },
  "deep.finance.11": {
    v: "Zero isolation violations; the security owner signs the posture annually.",
  },
};
export const MATRIX_ADVISORY: Record<string, Advisory[]> = {
  customer: [
    {
      t: "M3 OCUSMA (OKCUNO) is the customer source of record; Salesforce accounts map via DBAmp. Known risks: duplicate customers, open integration details, cross-company visibility.",
      src: "Customer domain brief",
    },
    {
      t: "Sara Wahlberg is the price-support and sales-finance analyst in the knowledge base. Strong BA fit as captured.",
      src: "stakeholder map",
    },
  ],
  sales: [
    {
      t: "Worst metric-collision domain: two BI models share 68 measure names computed from different sources (cost, rebate, margin). The certified model needs owner-signed measure definitions.",
      src: "cross-model overlap analysis",
    },
    {
      t: "The second row has no company captured. Confirm which company it covers. Kerri Voiss (reporting history) and Matt Francis (NAC-side model) hold the institutional knowledge if a seat needs a candidate.",
      src: "stakeholder map · role model",
    },
  ],
  product: [
    {
      t: "Customer runs first; Product comes right behind it because it anchors the Fabric MVP and feeds Sales, Manufacturing, and Quality. The captured matrix has Product third; reconcile on the precedence stage.",
      src: "Purview governance charter",
    },
    {
      t: "Only Interplastic and Molding Products rows captured, and HK Research and NAC sell products too. Decide whether those companies need seats or ride with an existing row.",
      src: "company structure",
    },
    {
      t: "Reconcile this roster against the separately authored Product Master Data Source Map so two competing artifacts do not reach the ELT.",
      src: "DQ-021",
    },
  ],
  finance: [
    {
      t: "Financial isolation is non-negotiable and enforced through separate workspaces and capacities. Certification here is a security event: it needs a security-owner sign-off, not just a quality check.",
      src: "operating-model decision · data-segregation requirements",
    },
    {
      t: "The knowledge base names Michael Kenney (Sr. Manager, IT Operations) as the internal security and AD owner this domain\u2019s access posture depends on. Consider a Security Owner seat.",
      src: "DQ-071",
    },
    {
      t: "No company captured on either Finance row. Finance is local by company by design, so each row should carry one.",
      src: "operating-model decision",
    },
  ],
  quality: [
    {
      t: "ETQ holds NCRs and compliance; MES QC holds in-process results; the OATES/ANV source-of-record split must be documented before any build. Everything joins through Batch ID.",
      src: "Quality domain brief",
    },
  ],
  manufacturing: [
    {
      t: "MES runs at Interplastic and HK Research ONLY. NAC has no manufacturing domain; Molding Products uses its own lighter pattern. Company cells on these rows should reflect that rule.",
      src: "system doctrine",
    },
    {
      t: "The role model pairs the Manufacturing steward with MES and OT expertise. Matt Pennaz is the MES and M3 integration SME; Robert LaMontagne is the OT contact (12+ years, led the MES modernization).",
      src: "role model · stakeholder map",
    },
    {
      t: "Known failure mode to own: 1-2% of MES to M3 syncs fail. Batch ID formatting plus a reconciliation path is this domain\u2019s first definition decision.",
      src: "Manufacturing domain brief",
    },
  ],
  rnd: [
    {
      t: "Formula confidentiality dominates: composition never conforms; only formula-facing IDs cross the line. Optiva is the formula source of record.",
      src: "R&D domain brief",
    },
    {
      t: 'Jim Cecere matches the knowledge base\u2019s candidate owner (Corporate VP, R&D). "Omar Shukri" is not confirmed in current contact records; verify identity and role.',
      src: "stakeholder map",
    },
  ],
  company: [
    {
      t: "Missing from the captured matrix: a seat for the company-scope isolation authority. This is a policy owner, not a build domain. The knowledge base points at CIO level, with the Architecture Board and Security as the enforcement pair.",
      src: "role model · operating-model decision",
    },
  ],
  shared: [
    {
      t: "Missing from the captured matrix: shared conformed dimensions (Product, Customer, Company, Date, Warehouse, Sales Rep, and more). Platform-held with steward validation; watch for over-conformance and duplicate definitions. Eudias Tata built the existing dimension procs.",
      src: "shared-dimensions brief · stakeholder map",
    },
  ],
};
export const GLOSSARY = [
  {
    term: "Source of record",
    body: "The authoritative source of a specific data point. M3 is the official source for item masters; Salesforce via DBAmp for customer account details. Approving it is the owner\u2019s call, on the steward\u2019s recommendation.",
  },
  {
    term: "Lineage",
    body: "The visible path data takes from its original source, through Bronze, Silver, and Gold transformations, to its final appearance in a report. Certification requires it to be fully mapped.",
  },
  {
    term: "DQ rules",
    body: "The specific standards and logic used to measure whether data is clean, complete, and usable. When a check fails, the steward is the first responder who triages the issue.",
  },
  {
    term: "Domain",
    body: "A logical grouping of data sharing one business context, like Product, Customer, or Sales. Each domain gets one owner, one or more stewards, and one set of certified definitions.",
  },
  {
    term: "Metadata",
    body: "Data about data: tags, sensitivity levels, descriptions, lifecycle status, managed in Microsoft Purview. The steward maintains it; the owner is accountable for it.",
  },
  {
    term: "Certified asset",
    body: "The seal of trust: owner and steward named, definition and grain documented, sources and refresh documented, security reviewed, DQ checks passing, lineage visible, limitations explicit. Refinement is not the finish line. Certification is.",
  },
  {
    term: "Medallion layers",
    body: "Bronze is raw and source-faithful. Silver is cleansed and conformed, where the steward\u2019s logic lives. Gold is dimensional, business-facing models. Trust increases at every step.",
  },
];
export const SEAT_CARDS = [
  {
    abbr: "O",
    title: "Data Owner",
    sub: "Strategic accountability",
    body: "Senior business leader accountable for a domain. Approves business definitions, prioritizes domain work, approves certification, owns access posture and exceptions.",
  },
  {
    abbr: "S",
    title: "Data Steward",
    sub: "Operational responsibility",
    body: "Subject-matter expert responsible for day-to-day quality. Maintains the glossary, metadata, and DQ rules; triages issues; readies assets for certification; escalates definition conflicts.",
  },
  {
    abbr: "SME",
    title: "SME",
    sub: "Source-system depth",
    body: 'Deepest hands-on knowledge of the data where it lives. First stop for "what does this field actually mean" and consulted on every definition and DQ rule.',
  },
  {
    abbr: "BA",
    title: "Business Analyst",
    sub: "The bridge",
    body: "Connects process to data: documents definitions, requirements, and report needs; carries the glossary legwork the steward signs off on.",
  },
];
export const RACI_ROLES: string[] = [
  "Owner",
  "Steward",
  "Platform",
  "BI lead",
  "Arch board",
  "Security",
];
export const RACI: string[][] = [
  ["Define domain glossary", "A", "R", "C", "C", "C", "C"],
  ["Approve source of record", "A", "R", "C", "C", "C", "C"],
  ["Build Bronze ingestion", "C", "C", "R/A", "I", "I", "C"],
  ["Build Silver conformance", "A", "R", "R", "C", "C", "C"],
  ["Build Gold dimensional model", "A", "R", "R", "R", "C", "C"],
  ["Certify semantic model", "A", "R", "C", "R", "C", "C"],
  ["Approve cross-company dataset", "C", "C", "C", "C", "A", "A"],
  ["Resolve data-quality issue", "A", "R", "R", "C", "I", "C"],
  ["Update Purview asset metadata", "A", "R", "C", "C", "I", "C"],
  ["Retire legacy report", "A", "R", "C", "R", "I", "C"],
];
export const TAG_STYLE: Record<string, TagStyle> = {
  A: { bg: "#14314f", color: "#ffffff", border: "#14314f" },
  R: { bg: "rgba(27,94,158,0.12)", color: "#1b5e9e", border: "rgba(27,94,158,0.35)" },
  C: { bg: "#ffffff", color: "#5a6169", border: "#d5d9de" },
  I: { bg: "#f0f2f4", color: "#8a9099", border: "#f0f2f4" },
};
export const FRAME_ITEMS = [
  {
    k: "frame.slate",
    t: "A first-wave shortlist",
    s: "Named owner and steward candidates for the first-wave domains, ready for executive validation as a pros and cons recommendation.",
  },
  {
    k: "frame.defs",
    t: "Definition calls assigned",
    s: "Each domain\u2019s dual-definition decision assigned to its owner as their first approval item.",
  },
  {
    k: "frame.order",
    t: "An agreed order of precedence",
    s: "Which domains are first, second, third, and foundation.",
  },
  {
    k: "frame.handoff",
    t: "A single write-up owner",
    s: "One person turns this export into the recommendation that goes upstream.",
  },
];
export const TENSION_OPTS = [
  {
    v: "steward-now",
    t: "Name a Sales steward now; the Sales owner rides with the Customer owner",
    s: "Recommended: reconciles the phasing tension without a full first-wave Sales build.",
  },
  {
    v: "hold",
    t: "Hold Sales entirely to wave two",
    s: "Follows the charter phasing strictly; leaves the executive ask partially unanswered.",
  },
  {
    v: "full",
    t: "Pull the full Sales domain into the first wave",
    s: "Answers the executive ask completely; heaviest first-wave load.",
  },
];
export const PARK_SEEDS: Omit<ParkItem, "id">[] = [
  {
    text: "Reconcile this roster against the independently authored Product Master Data Source Map so two competing artifacts do not reach the ELT",
    type: "a",
    who: "Steve Nahrup",
    src: "DQ-021",
  },
  {
    text: "Salesforce integration details for the Customer domain remain open. Confirm the mapping approach with the integration SME",
    type: "q",
    who: "Matt Francis",
    src: "Customer domain brief",
  },
  {
    text: "The OATES/ANV relationship and source-of-record split must be documented before the Quality build",
    type: "q",
    who: "",
    src: "Quality domain brief",
  },
  {
    text: "The steward-naming deadline is public (end of July). The shortlist must reach the ELT in time to hold it",
    type: "r",
    who: "Patrick Stiller",
    src: "ELT 2026-05-18",
  },
];
export const GROUND_RULES = [
  {
    k: "Financial isolation",
    v: "Non-negotiable: no operating company sees another company\u2019s numbers. Enforced through separate workspaces and capacities. Any cross-company dataset needs Architecture Board and Security approval.",
  },
  {
    k: "Where MES runs",
    v: "MES runs at Interplastic and HK Research only. NAC is distribution-only; no NAC row belongs under Manufacturing. Molding Products uses its own lighter pattern.",
  },
  {
    k: "Batch ID",
    v: "The universal cross-system key. Manufacturing, Quality, and traceability all join through it. Its formatting standard is a first-wave decision.",
  },
  {
    k: "Naming discipline",
    v: 'FactoryTalk Batch is the current batch system. "BatchWorks" and "PlantPAx" do not exist here; if they appear in a definition, it is wrong.',
  },
];
export const MEDALLION = [
  {
    name: "Bronze",
    color: "#9a6b4f",
    body: "Raw, source-faithful ingestion. No business logic; the platform team owns this layer end to end.",
  },
  {
    name: "Silver",
    color: "#75828f",
    body: "Cleansing and conformance: the steward\u2019s layer. Identity conflicts like distributor vs manufacturer get resolved here, by the rule the owner approves.",
  },
  {
    name: "Gold",
    color: "#b0761a",
    body: "Dimensional, business-facing models. Reporting perspectives (revenue-recognition vs sales-team view) are resolved here, then certified.",
  },
];
export const PILLARS = [
  {
    n: "1",
    k: "Glossary & metadata",
    v: "Maintain the business dictionary in Purview; every asset gets a clear description and the right business terms.",
  },
  {
    n: "2",
    k: "Data-quality oversight",
    v: "Monitor the rules that define clean data; first responder when a check fails, working with the platform team on root cause.",
  },
  {
    n: "3",
    k: "Certification readiness",
    v: "Validate that proposed models cover business needs; reconcile out loud, do not design from scratch. Prepare the evidence before anything gets the certified seal.",
  },
  {
    n: "4",
    k: "Bridge-building",
    v: "Translate between technical teams and domain users so everyone speaks the same language, including on dual definitions like distributor vs manufacturer.",
  },
  {
    n: "5",
    k: "Lineage & source validation",
    v: "Know exactly where data comes from; verify the source of record and keep the path to every report visible.",
  },
];
export const META_CARDS = [
  { k: "Identity", v: "Domain · Business owner (named) · Data steward (named) · Source system" },
  {
    k: "Scope & class",
    v: "Company scope (Enterprise or per-company) · Sensitivity (Public / Internal / Confidential / Restricted) · Criticality",
  },
  {
    k: "Trust",
    v: "Lifecycle (Draft / Reviewed / Certified / Deprecated) · Trust status · Source-of-record status · Lineage",
  },
];
export const CERT_CHIPS: string[] = [
  "Owner + steward named",
  "Definition + intended use documented",
  "Grain + filters documented",
  "Sources + refresh documented",
  "Security + classification reviewed",
  "DQ checks documented and passing",
  "Lineage visible",
  "Limitations explicit",
];
export const ROLE_MEANING: Record<string, RoleMeaning> = {
  owner: {
    title: "Data Owner · strategic accountability",
    body: "You approve business definitions, prioritize domain work, approve certification, and own the access posture and its exceptions for your domain.",
  },
  steward: {
    title: "Data Steward · operational responsibility",
    body: "You maintain the glossary, metadata, and DQ rules; triage issues; ready assets for certification; and escalate definition conflicts.",
  },
  sme: {
    title: "SME · source-system depth",
    body: "You are the first call for what a field actually means where it lives, and you are consulted on every definition and DQ rule in your domain.",
  },
  ba: {
    title: "Business Analyst · the bridge",
    body: "You document definitions, requirements, and report needs, and carry the glossary legwork the steward signs off on.",
  },
  sec: {
    title: "Security owner · access posture",
    body: "You sign off the access posture for financial isolation and review any cross-company dataset before it exists.",
  },
};
export const OWNER_DUTIES: string[] = [
  "Approve the business definitions for your domain, starting with the definition decision above",
  "Prioritize domain work and speak for the domain upstream",
  "Approve certification; nothing ships certified without you",
  "Own the access posture and its exceptions",
];
export const PILLARS_SHORT: string[] = [
  "Glossary and metadata: keep the business dictionary current in Purview",
  "Data-quality oversight: first responder when a check fails",
  "Certification readiness: prepare the evidence before the seal",
  "Bridge-building: keep technical teams and domain users speaking the same language",
  "Lineage and source validation: verify the source of record, keep the path visible",
];
export const PREP_STAGE_NOTES = [
  {
    goal: "The room accepts how today works: we brought a proposal, they amend it. Four seats, one outcome.",
    landed:
      "Outcomes checklist read aloud and checked; glossary terms settled before any debate starts.",
    watch: "Role definitions can eat the hour. Point at the seat cards, then move.",
  },
  {
    goal: "A verdict on every role-model row. Flags are fine; each one becomes an open item in the export.",
    landed: "All ten rows show Agreed or a flag with a note.",
    watch:
      "The cross-company dataset row is where isolation questions surface. Park them, do not solve them here.",
  },
  {
    goal: "One sequence, decided. Customer runs first, then Product; the captured matrix already has Customer first.",
    landed:
      "Waves match the room\u2019s call, the order is marked agreed, and the Sales tension has a picked resolution.",
    watch:
      "The executive ask wants Sales visible up front. The steward-now option reconciles it without a full build.",
  },
  {
    goal: "Every first-wave domain shows at least one row with both an owner and a steward candidate.",
    landed:
      "Named badges on all five first-wave groups; seats added for Company scope and Shared dimensions.",
    watch:
      "The second Sales row has no company. Finance rows need one each. NAC never appears under Manufacturing.",
  },
  {
    goal: "Source of record, conformance, sensitivity, and the certification bar per domain; each definition call assigned.",
    landed:
      "Required fields filled for the first wave; every definition decision assigned to its owner.",
    watch:
      "Guidance carries a draft for every field. Read it out, amend it, apply it. Do not type from silence.",
  },
  {
    goal: "Candidates hear the day job before the shortlist goes upstream.",
    landed: "Acknowledgment checks for every first-wave owner and steward candidate.",
    watch: "If nobody stands behind a domain, record that. It is a finding, not a failure.",
  },
  {
    goal: "Sweep the room. Everything raised but not settled gets an owner.",
    landed: "Every parked item carries an owner.",
    watch: "Four known items are pre-seeded. Read them back so nobody thinks they were dropped.",
  },
  {
    goal: "Read the summary aloud, export the results, name the single write-up owner.",
    landed: "Markdown downloaded; write-up owner named on the outcomes checklist.",
    watch:
      "Do not leave the room without the export. Handouts build each person\u2019s take-away from it.",
  },
];
export const DECISION_CARDS = [
  {
    n: "1",
    title: "One sequence",
    body: "Captured order vs charter order. The room picks one and the export carries it; nothing stays ambiguous.",
  },
  {
    n: "2",
    title: "The Sales tension",
    body: "Steward now, hold to wave two, or pull the full domain forward. One of the three gets picked out loud.",
  },
  {
    n: "3",
    title: "Isolation enforcement",
    body: "Separate workspaces and capacities as the mechanism, approved with a named security owner on the Finance domain.",
  },
];
export const PEOPLE_CARDS = [
  {
    name: "Patrick Stiller",
    why: "Carries the steward-naming deadline. It is public: end of July.",
  },
  {
    name: "Michael Kenney",
    why: "Sr. Manager, IT Operations. Internal security and AD owner; the Finance access posture depends on his team.",
  },
  {
    name: "Steve Nahrup",
    why: "Owns the reconcile against the Product Master Data Source Map (DQ-021) so two artifacts do not reach the ELT.",
  },
  {
    name: "Matt Pennaz",
    why: "MES and M3 integration SME. The role model pairs the Manufacturing steward with this expertise.",
  },
  {
    name: "Robert LaMontagne",
    why: "OT contact, 12+ years, led the MES modernization. Captured as a Manufacturing owner candidate.",
  },
  {
    name: "Jim Cecere",
    why: "Corporate VP, R&D. Matches the knowledge base\u2019s candidate owner for the formulation domain.",
  },
  { name: "Kerri Voiss", why: "Holds the Sales reporting history if a seat needs a candidate." },
  {
    name: "Matt Francis",
    why: "NAC-side model knowledge; also carries the open Salesforce integration question.",
  },
];
export const RISK_CARDS = [
  {
    claim: '"We already have a matrix."',
    counter:
      "Correct, and it is loaded as captured. Today amends it; nothing starts from a blank page.",
    src: "ADR-0009",
  },
  {
    claim: "Two competing artifacts reach the ELT",
    counter:
      "Reconcile this roster against the Product Master Data Source Map before anything goes upstream.",
    src: "DQ-021",
  },
  {
    claim: "68 measure names collide across two BI models",
    counter:
      "The fix is a certified Sales model with owner-signed definitions. Name it, do not solve it live.",
    src: "cross-model overlap analysis",
  },
  {
    claim: "1-2% of MES to M3 syncs fail",
    counter:
      "Batch ID formatting plus a reconciliation path is Manufacturing\u2019s first definition decision.",
    src: "Manufacturing domain brief",
  },
  {
    claim: "Cross-company visibility questions",
    counter:
      "Isolation is enforced through separate workspaces and capacities; any cross-company dataset needs Architecture Board and Security approval.",
    src: "operating-model decision",
  },
  {
    claim: '"Omar Shukri" is not in current contact records',
    counter: "Verify identity and role before the R&D row goes upstream.",
    src: "stakeholder map",
  },
];
export const PREFILL_ITEMS = [
  { k: "prep.guide", t: "Guidance drafts reviewed end to end (fields, waves, parking lot)" },
  { k: "prep.matrix", t: "Captured matrix checked against the latest spreadsheet" },
  { k: "prep.projector", t: "Projector check: Workshop view readable from the back row" },
  { k: "prep.timer", t: "Timer reset; guidance toggle set the way you want to open" },
  { k: "prep.park", t: "Parking lot seeded with the four known items" },
  { k: "prep.handout", t: "Handouts view spot-checked with one name" },
];
export const SEQ_CAPTURED: string[] = [
  "Customer",
  "Sales",
  "Product",
  "Finance",
  "Quality",
  "Manufacturing",
  "R&D",
];
export const SEQ_CHARTER: string[] = [
  "Customer",
  "Product (anchors the Fabric MVP)",
  "Finance isolation rules documented",
  "Sales conformed measures",
  "Manufacturing after Product",
];
export const PRESENT_TITLES: string[] = [
  "One roster, two hours",
  "Why we are in this room",
  "What a domain is",
  "The four seats",
  "Bronze, Silver, Gold",
  "One key: Batch ID",
  "Five companies, one rule",
  "Certified, then capture",
];
export const PRESENT_STATS = [
  {
    big: "68",
    label:
      "measure names two BI models share, computed from different sources (cost, rebate, margin)",
    src: "cross-model overlap analysis",
  },
  {
    big: "1-2%",
    label: "of MES to M3 batch syncs fail today, with no owned reconciliation path",
    src: "Manufacturing domain brief",
  },
  {
    big: "2",
    label: "competing product master data artifacts on course to reach the ELT",
    src: "DQ-021",
  },
  {
    big: "15",
    label: "roster rows captured as candidates, none confirmed yet",
    src: "working matrix",
  },
];
export const PRESENT_SEATS = [
  {
    abbr: "O",
    title: "Data Owner",
    body: "Senior business leader. Approves definitions and certification, prioritizes the work, owns access decisions.",
    ex: "Signs the one margin definition both BI models must use.",
  },
  {
    abbr: "S",
    title: "Data Steward",
    body: "Subject-matter expert running day-to-day quality: glossary, metadata, DQ rules, certification readiness.",
    ex: "Triages the duplicate-customer check before it reaches a report.",
  },
  {
    abbr: "SME",
    title: "SME",
    body: "Deepest source-system knowledge. First call on what a field actually means where it lives.",
    ex: "Answers what an M3 product status of 20 really means.",
  },
  {
    abbr: "BA",
    title: "Business Analyst",
    body: "The bridge between process and data: definitions, requirements, and report needs, written down.",
    ex: "Drafts the glossary entry the steward signs off.",
  },
];
export const MEDALLION_FLOW = [
  {
    name: "Bronze",
    color: "#9a6b4f",
    k: "Raw, source-faithful",
    v: "M3 lands untouched. MMITNO exactly as the source holds it. Platform team territory.",
  },
  {
    name: "Silver",
    color: "#75828f",
    k: "Cleansed, conformed",
    v: "The steward\u2019s layer. Distributor vs manufacturer gets resolved here, by the rule the owner approves.",
  },
  {
    name: "Gold",
    color: "#b0761a",
    k: "Certified, business-facing",
    v: "One product dimension every certified model consumes. This is the only layer reports touch.",
  },
];
export const BATCH_CHAIN = [
  { sys: "FactoryTalk Batch", t: "A gel coat batch runs at HK Research" },
  { sys: "MES", t: "Execution and QC results attach to the Batch ID" },
  { sys: "M3", t: "The same key lands on the order, inventory, and shipment" },
  { sys: "ETQ", t: "A complaint or NCR joins back on the same key" },
];
export const COMPANY_CARDS = [
  {
    name: "IP Corp",
    color: "#0e2338",
    line: "Parent. Enterprise scope; rows here cover all operating companies.",
  },
  {
    name: "Interplastic",
    color: "#1b5e9e",
    line: "CONO 100 · M3 On-Prem · MES runs here. Resin manufacturing.",
  },
  {
    name: "HK Research",
    color: "#446084",
    line: "CONO 200 · M3 On-Prem · MES runs here. Gel coats.",
  },
  { name: "NAC", color: "#75828f", line: "M3 Cloud · distribution only, no MES." },
  {
    name: "Molding Products",
    color: "#9fb0c2",
    line: "M3 Cloud · lighter shared pattern, no full MES.",
  },
];
