/** Resolve URLs for files in /public/data, respecting a non-root deploy base. */
export function dataUrl(file: string): string {
  return `${import.meta.env.BASE_URL}data/${file}`;
}
