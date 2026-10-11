import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AccountScope, PortfolioAllocations } from "@/lib/types";
import { getPortfolioAllocations } from "@/adapters";
import { QueryKeys } from "@/lib/query-keys";
import { withFlatAssetClasses } from "@/lib/flat-asset-classes";

interface UsePortfolioAllocationsOptions {
  keepPreviousData?: boolean;
  /** Show each asset class as one flat row (no sub-types). Display only: targets keep the tree. */
  flatAssetClasses?: boolean;
}

export function usePortfolioAllocations(
  accountFilter: AccountScope,
  options: UsePortfolioAllocationsOptions = {},
) {
  const isEnabled = accountFilter.type !== "account" || accountFilter.accountId.trim().length > 0;

  const {
    data: allocations,
    isLoading,
    isError,
    error,
  } = useQuery<PortfolioAllocations, Error>({
    queryKey: [QueryKeys.PORTFOLIO_ALLOCATIONS, accountFilter],
    queryFn: () => getPortfolioAllocations(accountFilter),
    enabled: isEnabled,
    placeholderData: options.keepPreviousData ? keepPreviousData : undefined,
    select: options.flatAssetClasses ? withFlatAssetClasses : undefined,
  });

  return { allocations, isLoading, isError, error };
}
