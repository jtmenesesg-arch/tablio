"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInWithPassword, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function FieldLabel({
  children,
  htmlFor,
}: {
  children: string;
  htmlFor: string;
}) {
  return (
    <label className="block space-y-2 text-small font-bold" htmlFor={htmlFor}>
      <span>{children}</span>
    </label>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <div className="space-y-2">
        <FieldLabel htmlFor="email">Correo</FieldLabel>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div className="space-y-2">
        <FieldLabel htmlFor="password">Contraseña</FieldLabel>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
