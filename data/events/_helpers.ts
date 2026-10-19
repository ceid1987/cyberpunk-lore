// Small helpers shared by the per-era event files.

/** Build a Cyberpunk Wiki URL from a page title, e.g. w("Saburo Arasaka"). Optional #section. */
export function w(title: string, section?: string): string {
  const slug = encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":").replace(/%2C/g, ",").replace(/%27/g, "'").replace(/%28/g, "(").replace(/%29/g, ")");
  return `https://cyberpunk.fandom.com/wiki/${slug}${section ? "#" + section.replace(/ /g, "_") : ""}`;
}
