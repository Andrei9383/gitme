import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { appRouter } from "../../../server/src/routers/index";
import type { RouterClient } from "@orpc/server";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: () => {
            queryClient.invalidateQueries();
          },
        },
      });
    },
  }),
});

const baseUrl = (import.meta as any)?.env?.VITE_SERVER_URL ?? "http://localhost:3002";

export const link = new RPCLink({
  url: `${baseUrl}/rpc`,
});

export const client: RouterClient<typeof appRouter> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
