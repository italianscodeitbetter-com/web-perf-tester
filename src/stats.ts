/** Linear interpolation percentile on sorted values, p in [0, 100]. */
export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const index = (p / 100) * (values.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower]!;
  const weight = index - lower;
  return values[lower]! * (1 - weight) + values[upper]! * weight;
}
