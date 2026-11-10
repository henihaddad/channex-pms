"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert, Button, Card, Field, Select } from "@/components/ui";
import { createApiKeyAction, type CreateKeyState } from "./api-keys.actions";

const LEVELS = ["full", "read_only", "messages", "prices"] as const;

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
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
}: {
  title: string;
  hint: ReactNode;
  text: string;
  testId: string;
}) {
  const t = useTranslations("apiKeys");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <div className="text-sm text-muted">{hint}</div>
        </div>
        <CopyButton text={text} label={t("copy")} done={t("copied")} />
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
 * Settings → API & AI (spec 04 §4.7a): create a key (shown once), then the four ways to connect,
 * filled with that key when there is one. Persona: the host who runs the business through Claude.
 */
export function ApiAccess({ baseUrl, children }: { baseUrl: string; children: ReactNode }) {
  const t = useTranslations("apiKeys");
  const [state, action, pending] = useActionState<CreateKeyState, FormData>(createApiKeyAction, {});
  const key = state.secret ?? "<key>";
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
            <Select label={t("access")} name="access" defaultValue="full">
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
            <Button type="submit" disabled={pending}>
              {t("submit")}
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
              <CopyButton text={state.secret} label={t("copy")} done={t("copied")} />
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
            testId="connect-claude-code"
            title={t("claudeCode")}
            hint={t("claudeCodeHint")}
            text={`claude mcp add --transport http otabridge ${mcp} --header "Authorization: Bearer ${key}"`}
          />
          <Snippet
            testId="connect-desktop"
            title={t("desktop")}
            hint={t("desktopHint")}
            text={desktop}
          />
          <Snippet
            testId="connect-claude-ai"
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
            title={t("rest")}
            hint={t("restHint", { url: `${baseUrl}/api/v1/openapi.json` })}
            text={`curl -H "Authorization: Bearer ${key}" ${baseUrl}/api/v1/today`}
          />
        </div>
      </Card>
    </>
  );
}
