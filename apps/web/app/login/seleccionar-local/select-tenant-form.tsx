"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { selectTenant, type LoginState } from "../actions";

const initialState: LoginState = { error: null };

export function SelectTenantForm({
  tenants,
}: {
  tenants: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState(
    selectTenant,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {tenants.map((tenant) => (
        <Button
          className="w-full justify-start"
          disabled={pending}
          key={tenant.id}
          name="tenantId"
          type="submit"
          value={tenant.id}
          variant="outline"
        >
          {tenant.name}
        </Button>
      ))}
    </form>
  );
}
