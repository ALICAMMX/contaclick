import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDespacho } from "./despacho.functions";
import { useAuth } from "@/lib/auth";

export function useDespacho() {
  const { user } = useAuth();
  const fn = useServerFn(getMyDespacho);
  const q = useQuery({
    enabled: !!user,
    queryKey: ["my-despacho", user?.id],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  return {
    despacho: q.data?.despacho ?? null,
    isLoading: q.isLoading,
    refetch: q.refetch,
  };
}
