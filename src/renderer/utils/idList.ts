export const idListIncludes = (list: string, id: string | null | undefined): boolean =>
  id != null && list.split(/[\s,]+/).includes(id);
