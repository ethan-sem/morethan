import { validateCompanyRoleKnowledgeBase } from "../domain/companyRoleKnowledgeBase.js";

const INDEX_PATH = "data/career-copilot/company-role-pool-index.json";
const DIRECTION_IDS = new Set(["product-manager", "product-operations", "marketing-growth", "software-engineering", "data-business-analysis", "finance-accounting"]);

export class CompanyRolePoolLoadError extends Error {
  /** @param {string} code @param {unknown} [cause] */
  constructor(code, cause) {
    super(code, { cause });
    this.name = "CompanyRolePoolLoadError";
    this.code = code;
  }
}

/** @param {string} directionId @param {{fetcher?: typeof fetch, baseUrl?: string}} [options] */
export async function loadCompanyRolePoolByDirection(directionId, options = {}) {
  if (!DIRECTION_IDS.has(directionId)) throw new CompanyRolePoolLoadError("DIRECTION_UNSUPPORTED");
  const fetcher = options.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new CompanyRolePoolLoadError("STATIC_FETCH_UNAVAILABLE");
  const baseUrl = options.baseUrl ?? document.baseURI;
  const indexUrl = new URL(INDEX_PATH, baseUrl);
  /** @type {RequestInit} */
  const requestPolicy = { method: "GET", cache: "no-cache", credentials: "same-origin", redirect: "error", referrerPolicy: "no-referrer" };
  const index = await readJson(fetcher, indexUrl, requestPolicy, "INDEX_LOAD_FAILED");
  const entry = validateIndexEntry(index, directionId);
  const sliceUrl = new URL(`${entry.file}?v=${encodeURIComponent(index.datasetVersion)}`, indexUrl);
  const pool = await readJson(fetcher, sliceUrl, { ...requestPolicy, cache: "force-cache" }, "SLICE_LOAD_FAILED");
  const validation = validateCompanyRoleKnowledgeBase(pool);
  if (!validation.valid || pool.datasetVersion !== index.datasetVersion || pool.roleFamilies.length !== 1 || pool.roleFamilies[0]?.id !== directionId) {
    throw new CompanyRolePoolLoadError("SLICE_INVALID");
  }
  return pool;
}

/** @param {typeof fetch} fetcher @param {URL} url @param {RequestInit} init @param {string} code */
async function readJson(fetcher, url, init, code) {
  let response;
  try { response = await fetcher(url, init); } catch (error) { throw new CompanyRolePoolLoadError(code, error); }
  if (!response?.ok) throw new CompanyRolePoolLoadError(code);
  try { return await response.json(); } catch (error) { throw new CompanyRolePoolLoadError(code, error); }
}

/** @param {any} index @param {string} directionId */
function validateIndexEntry(index, directionId) {
  const entry = index?.directions?.[directionId];
  if (index?.schemaVersion !== "1.0.0" || typeof index.datasetVersion !== "string" || !entry || entry.file !== `./by-direction/${directionId}.json`) {
    throw new CompanyRolePoolLoadError("INDEX_INVALID");
  }
  return entry;
}
