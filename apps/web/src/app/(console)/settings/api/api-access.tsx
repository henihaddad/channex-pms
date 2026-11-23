"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert, announce, Button, Card, Field, Select } from "@/components/ui";
import { createApiKeyAction, type CreateKeyState } from "./api-keys.actions";

const LEVELS = ["full", "read_only", "messages", "prices"] as const;

function CopyButton({
  text,
  label,
  done,
  announced,
  disabled,
  describedBy,
}: {
  text: string;
  label: string;
  done: string;
  announced: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          announce(announced);
          if (timer.current) window.clearTimeout(timer.current);
          // the label goes back after two seconds, so a second copy reads as a second copy
          timer.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt(label, text);
        }
      }}
    >
      {copied ? done : label}
    </Button>
  );
}

/** A block of copyable text: a command, a config file, a URL. */
function Snippet({
  title,
  hint,
  text,
  testId,
  needsKey = false,
}: {
  title: string;
  hint: ReactNode;
  text: string;
  testId: string;
  /** The text carries a key placeholder: nothing worth copying until a key exists. */
  needsKey?: boolean;
}) {
  const t = useTranslations("apiKeys");
  const hintId = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <div className="text-sm text-muted">{hint}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <CopyButton
            text={text}
            label={t("copy")}
            done={t("copied")}
            announced={t("copiedAnnounce", { what: title })}
            disabled={needsKey}
            describedBy={needsKey ? hintId : undefined}
          />
          {needsKey ? (
            <span id={hintId} className="text-xs text-muted">
              {t("createKeyFirst")}
            </span>
          ) : null}
        </div>
      </div>
      <pre
        data-testid={testId}
        className="scrollbar overflow-x-auto rounded-control border border-border bg-background p-3 font-mono text-xs whitespace-pre text-foreground"
      >
        {text}
      </pre>
    </div>
  );
}

/**
 * Settings → Connect Claude & API (spec 04 §4.7a/b): create a key (shown once), then the ways to connect.
 * claude.ai first: paste the server URL and sign in, no key. Claude Code, Claude Desktop and
 * scripts use a key, filled in when there is one; the key-in-URL form stays as a fallback.
 * Persona: the host who runs the business through Claude.
 */
export function ApiAccess({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const t = useTranslations("apiKeys");
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  const key = state.secret ?? "YOUR_KEY";
  const mcp = `${baseUrl}/api/mcp`;
  const desktop = JSON.stringify(
    {
      mcpServers: {
        otabridge: {
          command: "npx",
          args: ["-y", "mcp-remote", mcp, "--header", "Authorization:${OTAB_AUTH}"],
          env: { OTAB_AUTH: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );
  return (
    <>
      <Card title={t("create")} description={t("createHint")}>
        <form action={action} className="flex flex-col gap-4">
          {state.error ? (
            <Alert>{state.error === "access" ? t("errorAccess") : t("errorName")}</Alert>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label={t("name")}
              name="name"
              required
              placeholder="Claude"
              defaultValue="Claude"
              description={t("nameHint")}
            />
            <Select label={t("access")} name="access" defaultValue="read_only">
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`level.${l}`)}
                </option>
              ))}
            </Select>
          </div>
          <ul className="grid gap-2 text-sm text-muted md:grid-cols-2">
            {LEVELS.map((l) => (
              <li key={l}>
                <span className="font-semibold text-foreground">{t(`level.${l}`)}</span>
                {" — "}
                {t(`levelHint.${l}`)}
              </li>
            ))}
          </ul>
          <div>
            <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
              {pending ? t("submitting") : t("submit")}
            </Button>
          </div>
        </form>
        {state.secret ? (
          <div className="mt-4 flex flex-col gap-3">
            <Alert tone="warning" title={t("created", { name: state.name ?? "" })}>
              {t("shownOnce")}
            </Alert>
            <div className="flex flex-wrap items-center gap-3">
              <code
                data-testid="api-key-secret"
                className="rounded-control border border-border bg-background px-3 py-2 font-mono text-sm break-all"
              >
                {state.secret}
              </code>
              <CopyButton
                text={state.secret}
                label={t("copy")}
                done={t("copied")}
                announced={t("copiedAnnounce", { what: t("keyWord") })}
              />
            </div>
          </div>
        ) : null}
      </Card>
      {children}
      <Card
        title={t("connect")}
        description={state.secret ? t("connectWithKey") : t("connectPlaceholder")}
      >
        <div className="flex flex-col gap-6">
          <Snippet
            testId="connect-claude-ai-oauth"
            title={t("claudeAiOAuth")}
            hint={t("claudeAiOAuthHint")}
            text={mcp}
          />
          <Snippet
            testId="connect-claude-code"
            needsKey={!state.secret}
            title={t("claudeCode")}
            hint={t("claudeCodeHint")}
            text={`claude mcp add --transport http otabridge ${mcp} --header "Authorization: Bearer ${key}"`}
          />
          <Snippet
            testId="connect-desktop"
            needsKey={!state.secret}
            title={t("desktop")}
            hint={t("desktopHint")}
            text={desktop}
          />
          <Snippet
            testId="connect-claude-ai"
            needsKey={!state.secret}
            title={t("claudeAi")}
            hint={
              <>
                {t("claudeAiHint")}{" "}
                <span className="font-semibold text-danger">{t("claudeAiWarning")}</span>
              </>
            }
            text={`${mcp}/${key}`}
          />
          <Snippet
            testId="connect-curl"
            needsKey={!state.secret}
            title={t("rest")}
            hint={t("restHint", { url: `${baseUrl}/api/v1/openapi.json` })}
            text={`curl -H "Authorization: Bearer ${key}" ${baseUrl}/api/v1/today`}
          />
        </div>
      </Card>
    </>
  );
}
