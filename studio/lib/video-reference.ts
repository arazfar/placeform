export function videoReferences(firstFrame: unknown, lastFrame?: unknown) {
  const valid = (v: unknown): v is string =>
    typeof v === 'string' && /^file[-_][\w-]{1,180}$/.test(v);
  if (!valid(firstFrame) || (lastFrame !== undefined && !valid(lastFrame)))
    return null;
  return [
    { file_id: firstFrame, role: 'first_frame' },
    ...(valid(lastFrame) ? [{ file_id: lastFrame, role: 'last_frame' }] : []),
  ];
}
