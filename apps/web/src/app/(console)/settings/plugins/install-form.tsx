"use client";

import { useActionState } from "react";
import { installPluginAction } from "./plugins.actions";
import { Alert, Button, Field, Label } from "@/components/ui";

export function InstallForm({ labels }: { labels: Record<string, string> }) {
  const [state, action, pending] = useActionState(installPluginAction, {});
  return (
    <form action={action} className="space-y-2">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.secret ? (
        <Alert tone="success">
          <code data-testid="plugin-secret">
            {labels.secret!.replace("{secret}", state.secret)}
          </code>
        </Alert>
      ) : null}
      <Field
        label={labels.endpoint!}
        name="endpointUrl"
        type="url"
        placeholder="https://plugins.example/hook"
      />
      <div>
        <Label htmlFor="manifest">{labels.manifest!}</Label>
        <textarea
          id="manifest"
          name="manifest"
          rows={4}
          className="w-full rounded border border-line-strong p-2 font-mono text-xs"
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="install-plugin">
        {labels.install}
      </Button>
    </form>
  );
}
