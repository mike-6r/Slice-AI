export function MarketPagination({
  shown,
  total,
  onLoadMore,
  hasMore,
  isLoading,
}: {
  shown: number;
  total: number;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
}) {
  return (
    <div className="market-pagination">
      <p>
        Showing <strong>{shown}</strong> of <strong>{total}</strong> matching assets
      </p>
      {hasMore && (
        <button type="button" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? "Loading…" : "Load More"}
        </button>
      )}
    </div>
  );
}
