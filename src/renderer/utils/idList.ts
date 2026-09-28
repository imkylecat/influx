// Whether a list of IDs separated by commas or spaces has this exact ID.
export const idListIncludes = (list: string, id: string | null | undefined): boolean =>
  id != null && list.split(/[\s,]+/).includes(id);
