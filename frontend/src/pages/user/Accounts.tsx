import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, ConfirmModal, EmptyState, Modal, PageHeader, PageSpinner, Spinner } from "../../components/ui";
import { api, errMsg } from "../../lib/api";
import { accountLabel, daysLeft, fmtDate } from "../../lib/format";
import { useUserAuth } from "../../lib/session";
import { Account, Platform } from "../../lib/types";

const OAUTH_ERRORS: Record<string, string> = {
  denied: "Access was not granted. Connect again and allow all permissions.",
  state: "The connection link expired. Please try connecting again.",
  oauth: "Meta did not accept the connection. For Instagram use a Business or Creator account; for Facebook make sure you manage the Page.",
  taken: "That account is already connected to another user.",
  limit: "Your plan's account limit is reached. Upgrade your plan to connect more.",
  nopages: "No Facebook Pages were returned. Make sure you manage at least one Page and selected it during login.",
  storage: "Could not start the Page selection. Please try again in a moment.",
};

const PLATFORM_NAME: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook" };

interface FbPage {
  id: string;
  name: string;
}

export default function Accounts() {
  const qc = useQueryClient();
  const { reload } = useUserAuth();
  const [params, setParams] = useSearchParams();
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [toDisconnect, setToDisconnect] = useState<Account | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [pickError, setPickError] = useState("");

  const accounts = useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts").then((r) => r.data) });

  // Result of an OAuth round trip arrives as ?connected=1, ?error=<code> or ?fb_select=<id> (+ &platform=...)
  useEffect(() => {
    const connected = params.get("connected");
    const err = params.get("error");
    const sel = params.get("fb_select");
    if (!connected && !err && !sel) return;
    const who = PLATFORM_NAME[params.get("platform") === "facebook" ? "facebook" : "instagram"];
    if (sel) {
      setPickError("");
      setSelection(sel);
    } else if (connected) {
      setFlash({ kind: "success", text: `${who} account connected.` });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      void reload();
    } else if (err) {
      setFlash({ kind: "error", text: OAUTH_ERRORS[err] ?? `Could not connect ${who}. Please try again.` });
    }
    setParams({}, { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = useMutation({
    mutationFn: (platform: Platform) =>
      api.get<{ url: string }>(`/${platform === "facebook" ? "facebook" : "instagram"}/connect-url`).then((r) => r.data.url),
    onSuccess: (url) => window.location.assign(url),
    onError: (e) => setFlash({ kind: "error", text: errMsg(e) }),
  });

  const pages = useQuery({
    queryKey: ["fb-pages", selection],
    enabled: !!selection,
    retry: false,
    queryFn: () => api.get<FbPage[]>("/facebook/pages", { params: { selection } }).then((r) => r.data),
  });

  const pick = useMutation({
    mutationFn: (pageId: string) => api.post<Account>("/facebook/connect", { selection, page_id: pageId }),
    onSuccess: (r) => {
      setSelection(null);
      setFlash({ kind: "success", text: `Facebook Page "${r.data.username}" connected.` });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      void reload();
    },
    onError: (e) => setPickError(errMsg(e)),
  });

  const refresh = useMutation({
    mutationFn: (id: string) => api.post(`/accounts/${id}/refresh-token`),
    onSuccess: () => {
      setFlash({ kind: "success", text: "Token refreshed." });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (e) => setFlash({ kind: "error", text: errMsg(e) }),
  });

  const disconnect = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      setToDisconnect(null);
      setFlash({ kind: "success", text: "Account disconnected. Your keywords are kept." });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      void reload();
    },
    onError: (e) => {
      setToDisconnect(null);
      setFlash({ kind: "error", text: errMsg(e) });
    },
  });

  const busyPlatform = connect.isPending ? connect.variables : undefined;
  const connectButtons = (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => connect.mutate("instagram")} loading={busyPlatform === "instagram"} disabled={connect.isPending}>
        Connect Instagram
      </Button>
      <Button variant="secondary" onClick={() => connect.mutate("facebook")} loading={busyPlatform === "facebook"} disabled={connect.isPending}>
        Connect Facebook Page
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Connect an Instagram Business or Creator account, or a Facebook Page, to reply to comments automatically."
        action={accounts.data && accounts.data.length > 0 ? connectButtons : undefined}
      />
      {flash && <div className="mb-4"><Alert kind={flash.kind} onClose={() => setFlash(null)}>{flash.text}</Alert></div>}

      {accounts.isLoading && <PageSpinner />}
      {accounts.isError && <Alert kind="error">{errMsg(accounts.error)}</Alert>}
      {accounts.data && accounts.data.length === 0 && (
        <EmptyState
          title="No account connected yet"
          text="Connect Instagram or a Facebook Page to create keywords and send DMs."
          action={connectButtons}
        />
      )}

      {accounts.data && accounts.data.length > 0 && (
        <Card className="divide-y divide-line">
          {accounts.data.map((a) => {
            const left = daysLeft(a.token_expires_at);
            const isIg = a.platform === "instagram";
            return (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{accountLabel(a)}</p>
                    <Badge tone={isIg ? "ig" : "fb"}>{PLATFORM_NAME[a.platform]}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-mute">
                    {!a.is_active
                      ? "Disconnected"
                      : isIg
                        ? `Connection renews automatically. Current token valid until ${fmtDate(a.token_expires_at)}.`
                        : "Page connection does not expire."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!a.is_active ? <Badge>Disconnected</Badge> : isIg && left !== null && left <= 7 ? <Badge tone="warn">Token expiring</Badge> : <Badge tone="good">Connected</Badge>}
                  {a.is_active ? (
                    <>
                      {isIg && (
                        <Button size="sm" variant="secondary" onClick={() => refresh.mutate(a.id)} loading={refresh.isPending && refresh.variables === a.id}>
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh token
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setToDisconnect(a)}>
                        <Unplug className="h-3.5 w-3.5" aria-hidden /> Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => connect.mutate(a.platform)} loading={busyPlatform === a.platform} disabled={connect.isPending}>
                      Reconnect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Modal open={!!selection} onClose={() => !pick.isPending && setSelection(null)} title="Choose a Facebook Page">
        <div className="space-y-3">
          {pickError && <Alert kind="error">{pickError}</Alert>}
          {pages.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
          {pages.isError && <Alert kind="error">{errMsg(pages.error)}</Alert>}
          {pages.data && pages.data.length > 0 && <p className="text-sm text-ink-soft">Pick the Page you want to automate. You can connect more Pages afterwards.</p>}
          <ul className="divide-y divide-line rounded-lg border border-line">
            {(pages.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <Button size="sm" onClick={() => pick.mutate(p.id)} loading={pick.isPending && pick.variables === p.id} disabled={pick.isPending}>
                  Connect
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <ConfirmModal
        open={!!toDisconnect}
        title="Disconnect account?"
        message={`${toDisconnect ? accountLabel(toDisconnect) : ""} will stop receiving automated replies. Your keywords are kept, and you can reconnect at any time.`}
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={() => toDisconnect && disconnect.mutate(toDisconnect.id)}
        onCancel={() => setToDisconnect(null)}
      />
    </>
  );
}
