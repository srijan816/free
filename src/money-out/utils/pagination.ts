export function getPagination(page = 1, perPage = 20) {
  const safePage = Math.max(1, page);
  const safePerPage = Math.max(1, Math.min(perPage, 100));

  return {
    page: safePage,
    perPage: safePerPage
  };
}

export function buildPaginationMeta(total: number, page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return {
    total,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: page < totalPages,
    has_prev: page > 1
  };
}
