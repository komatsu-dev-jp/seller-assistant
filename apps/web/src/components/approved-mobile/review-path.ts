/** Export postprocessing can prefix literals before the browser executes them. */
export function reviewPath(path: string, basePath: string): string {
  if (!basePath || path.startsWith(`${basePath}/`)) return path;
  return `${basePath}${path}`;
}
