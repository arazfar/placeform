export type VideoCatalog = {
  model: {
    id: string;
    pricing: { resolution: string; per_second: string; currency: string }[];
  } | null;
  agreement: { accepted: boolean; version: string } | null;
  checkedAt: string;
};

export function videoReadiness(catalog: VideoCatalog | null) {
  if (!catalog) return 'Check the video connection before generating.';
  if (!catalog.model) return 'MiniMax H3 is unavailable for this account.';
  const price = catalog.model.pricing.find((p) => p.resolution === '768p');
  if (
    !price ||
    !price.per_second.trim() ||
    !Number.isFinite(Number(price.per_second)) ||
    Number(price.per_second) < 0 ||
    !price.currency
  )
    return 'A valid live video price is unavailable. Refresh the connection.';
  if (!catalog.agreement)
    return 'Video terms status could not be checked. Refresh the connection.';
  if (catalog.agreement.accepted !== true)
    return 'Accept the Video Service Terms in AIand, then refresh the connection.';
  return null;
}
