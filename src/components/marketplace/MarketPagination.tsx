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
        {hasMore ? (
          <>
            Showing the first <strong>{shown}</strong> matching assets
          </>
        ) : (
          <>
            Showing <strong>{total}</strong> matching {total === 1 ? "asset" : "assets"}
          </>
        )}
      </p>
      {hasMore && (
        <button type="button" onClick={onLoadMore} disabled={isLoading}>
          {isLoading ? "Loading…" : "Load More"}
        </button>
      )}
    </div>
  );
}
