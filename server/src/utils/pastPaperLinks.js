// Deterministic — no AI, no network call. Builds a direct link to a specific Cambridge past paper
// on PapaCambridge's raw file host, which only needs the numeric subject code + a one-letter
// session code + 2-digit year + variant (verified live against real papers before this was built).
// We never trust a URL/filename that shows up inside a source material document — those were found
// to be inconsistent or outright wrong across real samples — this always builds its own link from
// the plain subject/session/year/variant text instead.
const SESSION_CODE = { 'oct-nov': 'w', 'may-june': 's', 'feb-march': 'm' };
const SESSION_LABEL = { 'oct-nov': 'Oct/Nov', 'may-june': 'May/June', 'feb-march': 'Feb/March' };

export function buildPastPaperLink({ subjectCode, variant, session, year }) {
  const sessionCode = SESSION_CODE[session];
  if (
    !sessionCode ||
    !/^\d{4}$/.test(subjectCode) ||
    !/^\d{2}$/.test(variant) ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return null;
  }
  const yy = String(year % 100).padStart(2, '0');
  const base = `https://pastpapers.papacambridge.com/directories/CAIE/CAIE-pastpapers/upload/${subjectCode}_${sessionCode}${yy}`;
  return {
    url: `${base}_qp_${variant}.pdf`,
    markSchemeUrl: `${base}_ms_${variant}.pdf`,
    label: `${SESSION_LABEL[session]} ${year} · Paper ${variant}`,
  };
}
